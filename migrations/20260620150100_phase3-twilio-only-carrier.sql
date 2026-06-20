ALTER TABLE "public"."tenant_phone_numbers"
  DROP CONSTRAINT IF EXISTS "tenant_phone_numbers_provider_check";

ALTER TABLE "public"."tenant_phone_numbers"
  ADD CONSTRAINT "tenant_phone_numbers_provider_check"
  CHECK ("provider" = 'twilio');
