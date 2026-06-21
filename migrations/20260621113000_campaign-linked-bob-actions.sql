ALTER TABLE public.bob_actions
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_lead_id uuid REFERENCES public.campaign_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bob_actions_tenant_campaign_idx
  ON public.bob_actions (tenant_id, campaign_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_bob_action_campaign_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_campaign_tenant uuid;
  v_campaign_lead_tenant uuid;
  v_campaign_lead_campaign uuid;
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT tenant_id INTO v_campaign_tenant FROM public.campaigns WHERE id = NEW.campaign_id;
    IF v_campaign_tenant IS NULL OR v_campaign_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'campaign_id must belong to the same tenant as the Bob action';
    END IF;
  END IF;
  IF NEW.campaign_lead_id IS NOT NULL THEN
    SELECT tenant_id, campaign_id INTO v_campaign_lead_tenant, v_campaign_lead_campaign
      FROM public.campaign_leads WHERE id = NEW.campaign_lead_id;
    IF v_campaign_lead_tenant IS NULL OR v_campaign_lead_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'campaign_lead_id must belong to the same tenant as the Bob action';
    END IF;
    IF NEW.campaign_id IS NOT NULL AND v_campaign_lead_campaign <> NEW.campaign_id THEN
      RAISE EXCEPTION 'campaign_lead_id must belong to campaign_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bob_actions_validate_campaign_context ON public.bob_actions;
CREATE TRIGGER bob_actions_validate_campaign_context
BEFORE INSERT OR UPDATE OF campaign_id, campaign_lead_id, tenant_id ON public.bob_actions
FOR EACH ROW EXECUTE FUNCTION public.validate_bob_action_campaign_context();
