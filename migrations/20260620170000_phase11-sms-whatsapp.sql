ALTER TABLE public.lead_conversation_messages
  ADD COLUMN IF NOT EXISTS provider_status varchar(80),
  ADD COLUMN IF NOT EXISTS provider_error_code varchar(80),
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.lead_conversation_messages(id) ON DELETE set null,
  ADD COLUMN IF NOT EXISTS fallback_channel varchar(20),
  ADD COLUMN IF NOT EXISTS fallback_message_id uuid REFERENCES public.lead_conversation_messages(id) ON DELETE set null,
  ADD COLUMN IF NOT EXISTS ai_model varchar(160),
  ADD COLUMN IF NOT EXISTS ai_response_id varchar(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_conversation_messages_fallback_channel_check'
  ) THEN
    ALTER TABLE public.lead_conversation_messages
      ADD CONSTRAINT lead_conversation_messages_fallback_channel_check
      CHECK (fallback_channel IS NULL OR fallback_channel IN ('sms', 'whatsapp'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_conversation_messages_tenant_provider_message
  ON public.lead_conversation_messages (tenant_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_conversation_messages_tenant_channel_created
  ON public.lead_conversation_messages (tenant_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_conversation_messages_fallback_pending
  ON public.lead_conversation_messages (tenant_id, status, fallback_channel)
  WHERE channel = 'sms' AND fallback_channel IS NULL;
