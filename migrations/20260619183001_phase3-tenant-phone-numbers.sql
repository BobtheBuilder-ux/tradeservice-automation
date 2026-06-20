CREATE TABLE IF NOT EXISTS "public"."tenant_phone_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "provider" varchar(80) DEFAULT 'twilio' NOT NULL,
  "phone_number" varchar(32) NOT NULL,
  "provider_phone_number_id" varchar(255),
  "voice_enabled" boolean DEFAULT false NOT NULL,
  "sms_enabled" boolean DEFAULT false NOT NULL,
  "whatsapp_status" varchar(40) DEFAULT 'not_configured' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_phone_numbers_provider_check" CHECK ("provider" IN ('twilio', 'elevenlabs', 'sip')),
  CONSTRAINT "tenant_phone_numbers_whatsapp_status_check" CHECK ("whatsapp_status" IN ('not_configured', 'pending', 'active', 'suspended')),
  CONSTRAINT "tenant_phone_numbers_status_check" CHECK ("status" IN ('active', 'pending', 'released', 'suspended')),
  CONSTRAINT "tenant_phone_numbers_phone_number_not_blank" CHECK (length(trim("phone_number")) > 0),
  CONSTRAINT "tenant_phone_numbers_e164ish_check" CHECK ("phone_number" ~ '^\\+[1-9][0-9]{7,14}$')
);

CREATE INDEX IF NOT EXISTS "idx_tenant_phone_numbers_tenant_id"
  ON "public"."tenant_phone_numbers" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_tenant_phone_numbers_phone_number"
  ON "public"."tenant_phone_numbers" ("phone_number");

CREATE INDEX IF NOT EXISTS "idx_tenant_phone_numbers_status"
  ON "public"."tenant_phone_numbers" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_phone_numbers_active_unique"
  ON "public"."tenant_phone_numbers" ("phone_number")
  WHERE "status" = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_phone_numbers_one_primary_active"
  ON "public"."tenant_phone_numbers" ("tenant_id")
  WHERE "is_primary" = true AND "status" = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_agents_primary_phone_number_id_tenant_phone_numbers_id_fk'
  ) THEN
    ALTER TABLE "public"."tenant_agents"
      ADD CONSTRAINT "tenant_agents_primary_phone_number_id_tenant_phone_numbers_id_fk"
      FOREIGN KEY ("primary_phone_number_id") REFERENCES "public"."tenant_phone_numbers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."validate_tenant_agent_phone_number"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_phone_tenant_id uuid;
BEGIN
  IF NEW.primary_phone_number_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_phone_tenant_id
  FROM "public"."tenant_phone_numbers"
  WHERE id = NEW.primary_phone_number_id;

  IF v_phone_tenant_id IS NULL THEN
    RAISE EXCEPTION 'primary_phone_number_id does not reference a tenant phone number';
  END IF;

  IF v_phone_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'primary_phone_number_id must belong to the same tenant as the agent';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_tenant_agent_phone_number_trigger" ON "public"."tenant_agents";
CREATE TRIGGER "validate_tenant_agent_phone_number_trigger"
  BEFORE INSERT OR UPDATE OF "tenant_id", "primary_phone_number_id"
  ON "public"."tenant_agents"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_agent_phone_number"();

CREATE OR REPLACE FUNCTION "public"."normalize_tenant_phone_primary"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'active' THEN
    UPDATE "public"."tenant_phone_numbers"
    SET is_primary = false, updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "normalize_tenant_phone_primary_trigger" ON "public"."tenant_phone_numbers";
CREATE TRIGGER "normalize_tenant_phone_primary_trigger"
  BEFORE INSERT OR UPDATE OF "tenant_id", "is_primary", "status"
  ON "public"."tenant_phone_numbers"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."normalize_tenant_phone_primary"();

CREATE OR REPLACE FUNCTION "public"."resolve_tenant_by_phone_number"(p_phone_number text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT tenant_id
  FROM "public"."tenant_phone_numbers"
  WHERE status = 'active'
    AND phone_number = CASE
      WHEN p_phone_number IS NULL OR trim(p_phone_number) = '' THEN NULL
      WHEN left(trim(p_phone_number), 1) = '+' THEN trim(p_phone_number)
      ELSE '+' || regexp_replace(trim(p_phone_number), '[^0-9]', '', 'g')
    END
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION "public"."get_tenant_primary_phone_number"(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  provider varchar,
  phone_number varchar,
  provider_phone_number_id varchar,
  voice_enabled boolean,
  sms_enabled boolean,
  whatsapp_status varchar,
  is_primary boolean,
  status varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    tpn.id,
    tpn.tenant_id,
    tpn.provider,
    tpn.phone_number,
    tpn.provider_phone_number_id,
    tpn.voice_enabled,
    tpn.sms_enabled,
    tpn.whatsapp_status,
    tpn.is_primary,
    tpn.status
  FROM "public"."tenant_phone_numbers" tpn
  WHERE tpn.tenant_id = p_tenant_id
    AND tpn.status = 'active'
  ORDER BY tpn.is_primary DESC, tpn.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION "public"."resolve_tenant_by_phone_number"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resolve_tenant_by_phone_number"(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION "public"."get_tenant_primary_phone_number"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_tenant_primary_phone_number"(uuid) TO anon, authenticated;
