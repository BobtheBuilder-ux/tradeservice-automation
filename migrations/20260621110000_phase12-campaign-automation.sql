-- Phase 12: automatic tenant campaigns, queue state, and post-meeting context.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_number integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz;

ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stop_reason text;

CREATE TABLE IF NOT EXISTS public.meeting_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE cascade,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE cascade,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE cascade,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  source varchar(40) NOT NULL DEFAULT 'manual',
  summary text NOT NULL,
  follow_up_at timestamptz,
  follow_up_status varchar(40) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_contexts_source_check CHECK (source IN ('manual', 'zoom', 'google_meet', 'teams')),
  CONSTRAINT meeting_contexts_follow_up_status_check CHECK (follow_up_status IN ('pending', 'queued', 'completed', 'skipped', 'cancelled'))
);

CREATE OR REPLACE FUNCTION public.assign_campaign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.campaign_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));
    SELECT COALESCE(MAX(campaign_number), 0) + 1
      INTO NEW.campaign_number
      FROM public.campaigns
      WHERE tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_assign_campaign_number ON public.campaigns;
CREATE TRIGGER campaigns_assign_campaign_number
BEFORE INSERT ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.assign_campaign_number();

UPDATE public.campaigns c
SET campaign_number = numbered.campaign_number
FROM (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id)::integer AS campaign_number
  FROM public.campaigns
) numbered
WHERE c.id = numbered.id AND c.campaign_number IS NULL;

ALTER TABLE public.campaigns ALTER COLUMN campaign_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_tenant_campaign_number_key
  ON public.campaigns (tenant_id, campaign_number);
CREATE INDEX IF NOT EXISTS campaign_leads_due_actions_idx
  ON public.campaign_leads (tenant_id, status, next_action_at)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS meeting_contexts_tenant_lead_idx
  ON public.meeting_contexts (tenant_id, lead_id, created_at DESC);

ALTER TABLE public.meeting_contexts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.current_user_is_active_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
  );
$$;
CREATE POLICY meeting_contexts_tenant_members ON public.meeting_contexts
  FOR ALL TO authenticated
  USING (public.current_user_is_active_tenant_member(tenant_id))
  WITH CHECK (public.current_user_is_active_tenant_member(tenant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_contexts TO authenticated;
