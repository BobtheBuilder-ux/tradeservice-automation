DROP TRIGGER IF EXISTS "tenant_phone_numbers_updated_at" ON "public"."tenant_phone_numbers";
CREATE TRIGGER "tenant_phone_numbers_updated_at"
  BEFORE UPDATE ON "public"."tenant_phone_numbers"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();
