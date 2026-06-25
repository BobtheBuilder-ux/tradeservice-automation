CREATE TABLE IF NOT EXISTS "public"."tenant_messaging_brain_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  "provider" varchar(40) NOT NULL DEFAULT 'openai',
  "model" varchar(160),
  "status" varchar(40) NOT NULL DEFAULT 'active',
  "fallback_behavior" varchar(60) NOT NULL DEFAULT 'human_review',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_messaging_brain_configs_provider_check"
    CHECK ("provider" IN ('openai')),
  CONSTRAINT "tenant_messaging_brain_configs_status_check"
    CHECK ("status" IN ('active', 'paused', 'disabled')),
  CONSTRAINT "tenant_messaging_brain_configs_fallback_check"
    CHECK ("fallback_behavior" IN ('human_review', 'deterministic_ack', 'retry')),
  CONSTRAINT "tenant_messaging_brain_configs_metadata_object_check"
    CHECK (jsonb_typeof("metadata") = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_messaging_brain_configs_tenant_provider"
  ON "public"."tenant_messaging_brain_configs" ("tenant_id", "provider");

INSERT INTO "public"."tenant_messaging_brain_configs" ("tenant_id", "provider", "model", "status", "fallback_behavior", "metadata")
SELECT
  tenants."id",
  'openai',
  NULL,
  'active',
  'human_review',
  jsonb_build_object('source', 'phase26-default')
FROM "public"."tenants" tenants
ON CONFLICT ("tenant_id", "provider") DO NOTHING;

CREATE TABLE IF NOT EXISTS "public"."openai_messaging_brain_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE SET NULL,
  "message_id" uuid REFERENCES "public"."lead_conversation_messages"("id") ON DELETE SET NULL,
  "tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE SET NULL,
  "source_channel" varchar(40) NOT NULL,
  "source" varchar(80) NOT NULL DEFAULT 'function',
  "status" varchar(40) NOT NULL DEFAULT 'success',
  "model" varchar(160),
  "provider_response_id" varchar(255),
  "detected_intent" varchar(80),
  "recommended_outcome" varchar(80),
  "recommended_action" varchar(100),
  "needs_human_review" boolean NOT NULL DEFAULT false,
  "request_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "response_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "duration_ms" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "openai_messaging_brain_audit_source_channel_check"
    CHECK ("source_channel" IN ('sms', 'whatsapp', 'messenger', 'email', 'lead_form', 'system')),
  CONSTRAINT "openai_messaging_brain_audit_status_check"
    CHECK ("status" IN ('success', 'failed', 'fallback', 'blocked')),
  CONSTRAINT "openai_messaging_brain_audit_request_object_check"
    CHECK (jsonb_typeof("request_payload") = 'object'),
  CONSTRAINT "openai_messaging_brain_audit_response_object_check"
    CHECK (jsonb_typeof("response_payload") = 'object')
);

CREATE INDEX IF NOT EXISTS "idx_openai_messaging_brain_audit_tenant_created"
  ON "public"."openai_messaging_brain_audit_logs" ("tenant_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_openai_messaging_brain_audit_tenant_lead_created"
  ON "public"."openai_messaging_brain_audit_logs" ("tenant_id", "lead_id", "created_at" DESC)
  WHERE "lead_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_openai_messaging_brain_audit_tenant_channel_intent"
  ON "public"."openai_messaging_brain_audit_logs" ("tenant_id", "source_channel", "detected_intent", "created_at" DESC);

CREATE OR REPLACE FUNCTION "public"."validate_openai_messaging_brain_audit_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_related_tenant_id uuid;
BEGIN
  IF NEW."lead_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id
    FROM "public"."leads"
    WHERE "id" = NEW."lead_id";

    IF v_related_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Messaging brain audit lead was not found';
    END IF;

    IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Messaging brain audit tenant_id must match lead tenant_id';
    END IF;
  END IF;

  IF NEW."conversation_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id
    FROM "public"."lead_conversations"
    WHERE "id" = NEW."conversation_id";

    IF v_related_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Messaging brain audit conversation was not found';
    END IF;

    IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Messaging brain audit tenant_id must match conversation tenant_id';
    END IF;
  END IF;

  IF NEW."message_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id
    FROM "public"."lead_conversation_messages"
    WHERE "id" = NEW."message_id";

    IF v_related_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Messaging brain audit message was not found';
    END IF;

    IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Messaging brain audit tenant_id must match message tenant_id';
    END IF;
  END IF;

  IF NEW."tenant_agent_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id
    FROM "public"."tenant_agents"
    WHERE "id" = NEW."tenant_agent_id";

    IF v_related_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Messaging brain audit tenant agent was not found';
    END IF;

    IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Messaging brain audit tenant_id must match tenant agent tenant_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "openai_messaging_brain_audit_validate_tenant" ON "public"."openai_messaging_brain_audit_logs";
CREATE TRIGGER "openai_messaging_brain_audit_validate_tenant"
BEFORE INSERT OR UPDATE OF "tenant_id", "lead_id", "conversation_id", "message_id", "tenant_agent_id"
ON "public"."openai_messaging_brain_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "public"."validate_openai_messaging_brain_audit_tenant"();

ALTER TABLE "public"."tenant_messaging_brain_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."openai_messaging_brain_audit_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_messaging_brain_configs_tenant_members_select" ON "public"."tenant_messaging_brain_configs";
CREATE POLICY "tenant_messaging_brain_configs_tenant_members_select"
ON "public"."tenant_messaging_brain_configs"
FOR SELECT TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "tenant_messaging_brain_configs_tenant_admin_update" ON "public"."tenant_messaging_brain_configs";
CREATE POLICY "tenant_messaging_brain_configs_tenant_admin_update"
ON "public"."tenant_messaging_brain_configs"
FOR UPDATE TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
)
WITH CHECK (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "openai_messaging_brain_audit_tenant_members_select" ON "public"."openai_messaging_brain_audit_logs";
CREATE POLICY "openai_messaging_brain_audit_tenant_members_select"
ON "public"."openai_messaging_brain_audit_logs"
FOR SELECT TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "openai_messaging_brain_audit_runtime_insert" ON "public"."openai_messaging_brain_audit_logs";
CREATE POLICY "openai_messaging_brain_audit_runtime_insert"
ON "public"."openai_messaging_brain_audit_logs"
FOR INSERT TO anon, authenticated
WITH CHECK (true);

GRANT SELECT, UPDATE ON "public"."tenant_messaging_brain_configs" TO authenticated;
GRANT INSERT ON "public"."tenant_messaging_brain_configs" TO anon, authenticated;
GRANT SELECT ON "public"."openai_messaging_brain_audit_logs" TO authenticated;
GRANT INSERT ON "public"."openai_messaging_brain_audit_logs" TO anon, authenticated;
REVOKE DELETE ON "public"."tenant_messaging_brain_configs" FROM anon, authenticated;
REVOKE UPDATE, DELETE ON "public"."openai_messaging_brain_audit_logs" FROM anon, authenticated;
