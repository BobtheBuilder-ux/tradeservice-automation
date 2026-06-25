CREATE OR REPLACE FUNCTION "public"."ensure_tenant_messaging_brain_config"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO "public"."tenant_messaging_brain_configs" (
    "tenant_id",
    "provider",
    "model",
    "status",
    "fallback_behavior",
    "metadata"
  )
  VALUES (
    NEW."id",
    'openai',
    NULL,
    'active',
    'human_review',
    jsonb_build_object('source', 'tenant-insert-default')
  )
  ON CONFLICT ("tenant_id", "provider") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tenants_ensure_messaging_brain_config" ON "public"."tenants";
CREATE TRIGGER "tenants_ensure_messaging_brain_config"
AFTER INSERT ON "public"."tenants"
FOR EACH ROW EXECUTE FUNCTION "public"."ensure_tenant_messaging_brain_config"();

INSERT INTO "public"."tenant_messaging_brain_configs" (
  "tenant_id",
  "provider",
  "model",
  "status",
  "fallback_behavior",
  "metadata"
)
SELECT
  tenants."id",
  'openai',
  NULL,
  'active',
  'human_review',
  jsonb_build_object('source', 'phase26-default-repair')
FROM "public"."tenants" tenants
ON CONFLICT ("tenant_id", "provider") DO NOTHING;
