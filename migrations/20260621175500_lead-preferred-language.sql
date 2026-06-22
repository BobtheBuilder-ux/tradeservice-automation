ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS preferred_language text;

COMMENT ON COLUMN public.leads.preferred_language IS
  'Lead communication language preference captured by the AI agent during intro and used for future calls, SMS, WhatsApp, and email follow-ups.';
