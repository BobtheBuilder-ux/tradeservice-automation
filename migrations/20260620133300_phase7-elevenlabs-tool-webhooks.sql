CREATE TABLE IF NOT EXISTS "public"."elevenlabs_tool_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE restrict,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE set null,
  "tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "tool_name" varchar(120) NOT NULL,
  "request_id" varchar(255),
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE set null,
  "external_conversation_id" varchar(255),
  "status" varchar(40) DEFAULT 'started' NOT NULL,
  "request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "elevenlabs_tool_audit_logs_tool_name_not_blank"
    CHECK (length(trim("tool_name")) > 0),
  CONSTRAINT "elevenlabs_tool_audit_logs_status_check"
    CHECK ("status" IN ('started', 'success', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_tenant_id"
  ON "public"."elevenlabs_tool_audit_logs" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_lead_id"
  ON "public"."elevenlabs_tool_audit_logs" ("lead_id");

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_agent_id"
  ON "public"."elevenlabs_tool_audit_logs" ("tenant_agent_id");

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_tool_name"
  ON "public"."elevenlabs_tool_audit_logs" ("tool_name");

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_created_at"
  ON "public"."elevenlabs_tool_audit_logs" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_elevenlabs_tool_audit_logs_status"
  ON "public"."elevenlabs_tool_audit_logs" ("status");

CREATE OR REPLACE FUNCTION "public"."validate_elevenlabs_tool_audit_log_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lead_tenant_id uuid;
  v_agent_tenant_id uuid;
BEGIN
  IF NEW."lead_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_lead_tenant_id
    FROM "public"."leads"
    WHERE "id" = NEW."lead_id";

    IF v_lead_tenant_id IS NULL THEN
      RAISE EXCEPTION 'lead_id does not reference a lead';
    END IF;

    IF v_lead_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'lead_id must belong to the same tenant as the audit log';
    END IF;
  END IF;

  IF NEW."tenant_agent_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_agent_tenant_id
    FROM "public"."tenant_agents"
    WHERE "id" = NEW."tenant_agent_id";

    IF v_agent_tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_agent_id does not reference a tenant agent';
    END IF;

    IF v_agent_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'tenant_agent_id must belong to the same tenant as the audit log';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_elevenlabs_tool_audit_log_tenant_trigger"
  ON "public"."elevenlabs_tool_audit_logs";

CREATE TRIGGER "validate_elevenlabs_tool_audit_log_tenant_trigger"
  BEFORE INSERT OR UPDATE OF "tenant_id", "lead_id", "tenant_agent_id"
  ON "public"."elevenlabs_tool_audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_elevenlabs_tool_audit_log_tenant"();

ALTER TABLE "public"."elevenlabs_tool_audit_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "elevenlabs_tool_audit_logs_select"
  ON "public"."elevenlabs_tool_audit_logs";
CREATE POLICY "elevenlabs_tool_audit_logs_select"
  ON "public"."elevenlabs_tool_audit_logs"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "elevenlabs_tool_audit_logs_insert"
  ON "public"."elevenlabs_tool_audit_logs";
CREATE POLICY "elevenlabs_tool_audit_logs_insert"
  ON "public"."elevenlabs_tool_audit_logs"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT SELECT ON "public"."elevenlabs_tool_audit_logs" TO authenticated;
GRANT INSERT ON "public"."elevenlabs_tool_audit_logs" TO anon, authenticated;
