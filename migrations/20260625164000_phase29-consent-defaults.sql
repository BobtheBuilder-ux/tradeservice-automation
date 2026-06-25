ALTER TABLE "public"."leads"
  ALTER COLUMN "call_consent" SET DEFAULT true,
  ALTER COLUMN "sms_consent" SET DEFAULT true,
  ALTER COLUMN "whatsapp_consent" SET DEFAULT true,
  ALTER COLUMN "email_consent" SET DEFAULT true;
