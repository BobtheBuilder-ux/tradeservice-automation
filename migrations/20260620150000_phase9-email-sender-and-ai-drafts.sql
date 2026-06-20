ALTER TABLE public.tenant_email_identities
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verification_method varchar(80),
  ADD COLUMN IF NOT EXISTS verification_error text;

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS sender_identity_id uuid REFERENCES public.tenant_email_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_display_name varchar(160),
  ADD COLUMN IF NOT EXISTS reply_to_email varchar(255),
  ADD COLUMN IF NOT EXISTS sender_resolution varchar(40),
  ADD COLUMN IF NOT EXISTS delivery_provider varchar(80),
  ADD COLUMN IF NOT EXISTS provider_message_id varchar(255),
  ADD COLUMN IF NOT EXISTS generated_by varchar(80),
  ADD COLUMN IF NOT EXISTS generation_model varchar(160),
  ADD COLUMN IF NOT EXISTS generation_status varchar(40),
  ADD COLUMN IF NOT EXISTS generation_error text,
  ADD COLUMN IF NOT EXISTS generated_at timestamp with time zone;

ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_sender_resolution_check;
ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_sender_resolution_check
  CHECK (sender_resolution IS NULL OR sender_resolution IN ('tenant_verified', 'platform_fallback'));

ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_generation_status_check;
ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_generation_status_check
  CHECK (generation_status IS NULL OR generation_status IN ('pending', 'generated', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_tenant_email_identities_verified
  ON public.tenant_email_identities (tenant_id, status, verified_status);
CREATE INDEX IF NOT EXISTS idx_email_queue_tenant_delivery
  ON public.email_queue (tenant_id, created_at DESC);
