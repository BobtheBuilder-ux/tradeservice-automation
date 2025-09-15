-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.process_orphaned_new_leads();

-- Create the corrected function
CREATE OR REPLACE FUNCTION public.process_orphaned_new_leads()
RETURNS TABLE (
  processed_lead_id UUID,
  lead_email TEXT,
  lead_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id as processed_lead_id,
    l.email as lead_email,
    l.status as lead_status
  FROM public.leads l
  WHERE l.status = 'new'
  AND l.processing_status IS NULL
  AND l.created_at < NOW() - INTERVAL '5 minutes'
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION public.process_orphaned_new_leads() IS 'Processes leads with "new" status that do not have active workflows';