-- Fix missing monitoring stats function
CREATE OR REPLACE FUNCTION get_new_lead_monitoring_stats()
RETURNS TABLE (
  total_new_leads BIGINT,
  new_leads_with_workflows BIGINT,
  new_leads_without_workflows BIGINT,
  oldest_unprocessed_lead TIMESTAMPTZ,
  newest_unprocessed_lead TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE l.status = 'new') as total_new_leads,
    COUNT(*) FILTER (WHERE l.status = 'new' AND w.id IS NOT NULL) as new_leads_with_workflows,
    COUNT(*) FILTER (WHERE l.status = 'new' AND w.id IS NULL) as new_leads_without_workflows,
    MIN(l.created_at) FILTER (WHERE l.status = 'new' AND w.id IS NULL) as oldest_unprocessed_lead,
    MAX(l.created_at) FILTER (WHERE l.status = 'new' AND w.id IS NULL) as newest_unprocessed_lead
  FROM leads l
  LEFT JOIN workflow_automation w ON l.id = w.lead_id 
    AND w.workflow_type = 'initial_engagement'
    AND w.status IN ('pending', 'processing');
END;
$$ LANGUAGE plpgsql;

-- Also create the process orphaned leads function if missing
CREATE OR REPLACE FUNCTION process_orphaned_new_leads(batch_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  lead_id UUID,
  email TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  workflows_created INTEGER
) AS $$
DECLARE
  lead_record RECORD;
  workflow_count INTEGER;
BEGIN
  FOR lead_record IN
    SELECT l.id, l.email, l.status, l.created_at, l.tracking_id
    FROM leads l
    LEFT JOIN workflow_automation w ON l.id = w.lead_id 
      AND w.workflow_type = 'initial_engagement'
      AND w.status IN ('pending', 'processing')
    WHERE l.status = 'new' AND w.id IS NULL
    ORDER BY l.created_at ASC
    LIMIT batch_limit
  LOOP
    -- Create initial workflow steps for this lead
    PERFORM create_initial_workflow_steps(lead_record.id);
    
    -- Count workflows created
    SELECT COUNT(*) INTO workflow_count
    FROM workflow_automation
    WHERE lead_id = lead_record.id
    AND workflow_type = 'initial_engagement';
    
    -- Log the automation trigger
    INSERT INTO lead_processing_logs (lead_id, tracking_id, event_type, event_data, success)
    VALUES (
      lead_record.id,
      lead_record.tracking_id,
      'workflow_automation_triggered',
      jsonb_build_object(
        'trigger_type', 'orphaned_new_lead_processed',
        'lead_status', lead_record.status,
        'automation_steps_created', workflow_count
      ),
      true
    );
    
    -- Return the processed lead info
    lead_id := lead_record.id;
    email := lead_record.email;
    status := lead_record.status;
    created_at := lead_record.created_at;
    workflows_created := workflow_count;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;