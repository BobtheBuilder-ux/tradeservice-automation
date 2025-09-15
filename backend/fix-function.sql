-- Fix the process_orphaned_new_leads function with correct column references
CREATE OR REPLACE FUNCTION public.process_orphaned_new_leads()
RETURNS TABLE(
  processed_lead_id UUID,
  lead_status VARCHAR(50),
  lead_created_at TIMESTAMPTZ,
  workflows_created INTEGER
) AS $$
DECLARE
  lead_record RECORD;
  workflow_count INTEGER := 0;
BEGIN
  -- Loop through orphaned leads
  FOR lead_record IN
    SELECT id, status, created_at
    FROM public.leads
    WHERE status = 'new'
    AND processing_status IS NULL
    AND created_at < NOW() - INTERVAL '5 minutes'
    LIMIT 10
  LOOP
    -- Update the lead processing status
    UPDATE public.leads
    SET processing_status = 'processing',
        processing_attempts = COALESCE(processing_attempts, 0) + 1,
        last_processing_attempt = NOW()
    WHERE id = lead_record.id;
    
    -- Create workflow entry (simulated)
    workflow_count := workflow_count + 1;
    
    -- Return the processed lead info
    processed_lead_id := lead_record.id;
    lead_status := lead_record.status;
    lead_created_at := lead_record.created_at;
    workflows_created := workflow_count;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;