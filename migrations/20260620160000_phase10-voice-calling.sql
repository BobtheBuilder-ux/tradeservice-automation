CREATE TABLE IF NOT EXISTS "public"."voice_call_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE restrict,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE set null,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE set null,
  "bob_action_id" uuid REFERENCES "public"."bob_actions"("id") ON DELETE set null,
  "tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "tenant_phone_number_id" uuid REFERENCES "public"."tenant_phone_numbers"("id") ON DELETE set null,
  "twilio_call_sid" varchar(255),
  "twilio_stream_sid" varchar(255),
  "direction" varchar(40) DEFAULT 'outbound' NOT NULL,
  "status" varchar(40) DEFAULT 'queued' NOT NULL,
  "context_token_hash" varchar(128) NOT NULL,
  "context_expires_at" timestamptz NOT NULL,
  "media_bridge_url" text,
  "elevenlabs_agent_id" varchar(255),
  "elevenlabs_conversation_id" varchar(255),
  "stream_started_at" timestamptz,
  "stream_stopped_at" timestamptz,
  "call_started_at" timestamptz,
  "answered_at" timestamptz,
  "ended_at" timestamptz,
  "duration_seconds" integer,
  "outcome" varchar(80),
  "summary" text,
  "transcript" text,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "voice_call_sessions_direction_check"
    CHECK ("direction" IN ('outbound', 'inbound')),
  CONSTRAINT "voice_call_sessions_status_check"
    CHECK ("status" IN ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'canceled', 'no_answer', 'busy')),
  CONSTRAINT "voice_call_sessions_duration_check"
    CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_voice_call_sessions_call_sid_unique"
  ON "public"."voice_call_sessions" ("twilio_call_sid")
  WHERE "twilio_call_sid" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_voice_call_sessions_context_hash_unique"
  ON "public"."voice_call_sessions" ("context_token_hash");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_tenant_id"
  ON "public"."voice_call_sessions" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_lead_id"
  ON "public"."voice_call_sessions" ("lead_id");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_conversation_id"
  ON "public"."voice_call_sessions" ("conversation_id");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_action_id"
  ON "public"."voice_call_sessions" ("bob_action_id");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_status"
  ON "public"."voice_call_sessions" ("status");

CREATE INDEX IF NOT EXISTS "idx_voice_call_sessions_stream_sid"
  ON "public"."voice_call_sessions" ("twilio_stream_sid")
  WHERE "twilio_stream_sid" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."validate_voice_call_session_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_related_tenant_id uuid;
BEGIN
  IF NEW."lead_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."leads" WHERE "id" = NEW."lead_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'lead_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."conversation_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."lead_conversations" WHERE "id" = NEW."conversation_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'conversation_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."bob_action_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."bob_actions" WHERE "id" = NEW."bob_action_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'bob_action_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."tenant_agent_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."tenant_agents" WHERE "id" = NEW."tenant_agent_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'tenant_agent_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."tenant_phone_number_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."tenant_phone_numbers" WHERE "id" = NEW."tenant_phone_number_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'tenant_phone_number_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_voice_call_session_tenant_trigger"
  ON "public"."voice_call_sessions";

CREATE TRIGGER "validate_voice_call_session_tenant_trigger"
  BEFORE INSERT OR UPDATE OF "tenant_id", "lead_id", "conversation_id", "bob_action_id", "tenant_agent_id", "tenant_phone_number_id"
  ON "public"."voice_call_sessions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_voice_call_session_tenant"();

DROP TRIGGER IF EXISTS "voice_call_sessions_updated_at"
  ON "public"."voice_call_sessions";

CREATE TRIGGER "voice_call_sessions_updated_at"
  BEFORE UPDATE ON "public"."voice_call_sessions"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."voice_call_sessions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_call_sessions_select"
  ON "public"."voice_call_sessions";
CREATE POLICY "voice_call_sessions_select"
  ON "public"."voice_call_sessions"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "voice_call_sessions_runtime_select"
  ON "public"."voice_call_sessions";
CREATE POLICY "voice_call_sessions_runtime_select"
  ON "public"."voice_call_sessions"
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "voice_call_sessions_runtime_insert"
  ON "public"."voice_call_sessions";
CREATE POLICY "voice_call_sessions_runtime_insert"
  ON "public"."voice_call_sessions"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "voice_call_sessions_runtime_update"
  ON "public"."voice_call_sessions";
CREATE POLICY "voice_call_sessions_runtime_update"
  ON "public"."voice_call_sessions"
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON "public"."voice_call_sessions" TO anon, authenticated;
GRANT INSERT, UPDATE ON "public"."voice_call_sessions" TO anon, authenticated;
