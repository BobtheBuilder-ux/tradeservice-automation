CREATE OR REPLACE FUNCTION "public"."validate_voice_call_session_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_related_tenant_id uuid;
  v_check_all boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_check_all := true;
  ELSE
    v_check_all := NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id";
  END IF;

  IF NEW."lead_id" IS NOT NULL
    AND (v_check_all OR NEW."lead_id" IS DISTINCT FROM OLD."lead_id") THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."leads" WHERE "id" = NEW."lead_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'lead_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."conversation_id" IS NOT NULL
    AND (v_check_all OR NEW."conversation_id" IS DISTINCT FROM OLD."conversation_id") THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."lead_conversations" WHERE "id" = NEW."conversation_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'conversation_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."bob_action_id" IS NOT NULL
    AND (v_check_all OR NEW."bob_action_id" IS DISTINCT FROM OLD."bob_action_id") THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."bob_actions" WHERE "id" = NEW."bob_action_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'bob_action_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."tenant_agent_id" IS NOT NULL
    AND (v_check_all OR NEW."tenant_agent_id" IS DISTINCT FROM OLD."tenant_agent_id") THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."tenant_agents" WHERE "id" = NEW."tenant_agent_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'tenant_agent_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  IF NEW."tenant_phone_number_id" IS NOT NULL
    AND (v_check_all OR NEW."tenant_phone_number_id" IS DISTINCT FROM OLD."tenant_phone_number_id") THEN
    SELECT "tenant_id" INTO v_related_tenant_id FROM "public"."tenant_phone_numbers" WHERE "id" = NEW."tenant_phone_number_id";
    IF v_related_tenant_id IS NULL OR v_related_tenant_id <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'tenant_phone_number_id must belong to the same tenant as the voice call session';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
