-- Phase 8 keeps provider credentials separate from browser-readable booking settings.
CREATE TABLE IF NOT EXISTS public.tenant_booking_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_integration_id uuid NOT NULL REFERENCES public.tenant_booking_integrations(id) ON DELETE CASCADE,
  provider varchar(80) NOT NULL,
  encrypted_payload text NOT NULL,
  expires_at timestamptz,
  refresh_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_booking_credentials_provider_check CHECK (provider = 'calendly'),
  CONSTRAINT tenant_booking_credentials_integration_unique UNIQUE (booking_integration_id)
);

ALTER TABLE public.tenant_booking_integrations
  ADD COLUMN IF NOT EXISTS oauth_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS oauth_error text,
  ADD COLUMN IF NOT EXISTS webhook_uri text;

CREATE INDEX IF NOT EXISTS idx_tenant_booking_credentials_tenant_id
  ON public.tenant_booking_credentials (tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_due_sms
  ON public.meeting_reminders (tenant_id, scheduled_for)
  WHERE status = 'pending' AND delivery_method = 'sms';

ALTER TABLE public.tenant_booking_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_booking_credentials FROM anon, authenticated;
