-- Repair stale tenant-agent references after removing the auto-created Bob default.
-- Completed historical call sessions are intentionally left as audit history.

UPDATE public.leads l
SET
  assigned_tenant_agent_id = NULL,
  updated_at = NOW()
WHERE assigned_tenant_agent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_agents a
    WHERE a.id = l.assigned_tenant_agent_id
      AND a.tenant_id = l.tenant_id
      AND a.status IN ('live', 'testing')
      AND a.elevenlabs_agent_id IS NOT NULL
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_leads'
      AND column_name = 'agent_id'
  ) THEN
    UPDATE public.campaign_leads cl
    SET
      agent_id = NULL,
      updated_at = NOW()
    WHERE agent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_agents a
        WHERE a.id = cl.agent_id
          AND a.tenant_id = cl.tenant_id
          AND a.status IN ('live', 'testing')
          AND a.elevenlabs_agent_id IS NOT NULL
      );
  END IF;
END $$;

UPDATE public.bob_actions action
SET
  payload = COALESCE(action.payload, '{}'::jsonb) - 'tenantAgentId' - 'tenant_agent_id',
  updated_at = NOW()
WHERE action.status IN ('pending', 'awaiting_call', 'paused')
  AND (
    (
      action.payload ? 'tenantAgentId'
      AND action.payload->>'tenantAgentId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_agents a
        WHERE a.id = (action.payload->>'tenantAgentId')::uuid
          AND a.tenant_id = action.tenant_id
          AND a.status IN ('live', 'testing')
          AND a.elevenlabs_agent_id IS NOT NULL
      )
    )
    OR (
      action.payload ? 'tenant_agent_id'
      AND action.payload->>'tenant_agent_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_agents a
        WHERE a.id = (action.payload->>'tenant_agent_id')::uuid
          AND a.tenant_id = action.tenant_id
          AND a.status IN ('live', 'testing')
          AND a.elevenlabs_agent_id IS NOT NULL
      )
    )
  );
