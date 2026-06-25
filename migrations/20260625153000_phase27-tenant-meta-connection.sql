CREATE TABLE IF NOT EXISTS "public"."tenant_meta_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "connected_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "provider" varchar(40) DEFAULT 'meta' NOT NULL,
  "meta_user_id" varchar(255),
  "business_id" varchar(255),
  "page_id" varchar(255),
  "page_name" varchar(255),
  "ad_account_id" varchar(255),
  "ad_account_name" varchar(255),
  "granted_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
  "token_status" varchar(40) DEFAULT 'needs_reconnect' NOT NULL,
  "status" varchar(40) DEFAULT 'disconnected' NOT NULL,
  "setup_health" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "oauth_connected_at" timestamptz,
  "token_expires_at" timestamptz,
  "last_health_checked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_meta_integrations_provider_check" CHECK ("provider" = 'meta'),
  CONSTRAINT "tenant_meta_integrations_token_status_check" CHECK ("token_status" IN ('active', 'expired', 'revoked', 'needs_reconnect')),
  CONSTRAINT "tenant_meta_integrations_status_check" CHECK ("status" IN ('disconnected', 'connected', 'needs_attention', 'disabled'))
);

CREATE TABLE IF NOT EXISTS "public"."tenant_meta_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "meta_integration_id" uuid NOT NULL REFERENCES "public"."tenant_meta_integrations"("id") ON DELETE cascade,
  "provider" varchar(40) DEFAULT 'meta' NOT NULL,
  "encrypted_payload" text NOT NULL,
  "expires_at" timestamptz,
  "refresh_version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_meta_credentials_provider_check" CHECK ("provider" = 'meta'),
  CONSTRAINT "tenant_meta_credentials_integration_unique" UNIQUE ("meta_integration_id")
);

CREATE TABLE IF NOT EXISTS "public"."tenant_facebook_lead_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "meta_integration_id" uuid NOT NULL REFERENCES "public"."tenant_meta_integrations"("id") ON DELETE cascade,
  "page_id" varchar(255) NOT NULL,
  "form_id" varchar(255) NOT NULL,
  "form_name" varchar(255),
  "assigned_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "default_campaign_id" uuid REFERENCES "public"."campaigns"("id") ON DELETE set null,
  "source_label" varchar(160),
  "field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_facebook_lead_forms_status_check" CHECK ("status" IN ('active', 'paused', 'archived')),
  CONSTRAINT "tenant_facebook_lead_forms_unique" UNIQUE ("tenant_id", "form_id")
);

CREATE TABLE IF NOT EXISTS "public"."tenant_messenger_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "meta_integration_id" uuid NOT NULL REFERENCES "public"."tenant_meta_integrations"("id") ON DELETE cascade,
  "page_id" varchar(255) NOT NULL,
  "twilio_sender_id" varchar(255),
  "twilio_channel_id" varchar(255),
  "assigned_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "source_label" varchar(160),
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_messenger_channels_status_check" CHECK ("status" IN ('pending', 'active', 'needs_attention', 'disabled')),
  CONSTRAINT "tenant_messenger_channels_page_unique" UNIQUE ("tenant_id", "page_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_meta_integrations_tenant"
  ON "public"."tenant_meta_integrations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_meta_integrations_status"
  ON "public"."tenant_meta_integrations" ("tenant_id", "status", "token_status");
CREATE INDEX IF NOT EXISTS "idx_tenant_meta_credentials_tenant"
  ON "public"."tenant_meta_credentials" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_facebook_lead_forms_tenant"
  ON "public"."tenant_facebook_lead_forms" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tenant_facebook_lead_forms_page"
  ON "public"."tenant_facebook_lead_forms" ("tenant_id", "page_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_messenger_channels_tenant"
  ON "public"."tenant_messenger_channels" ("tenant_id", "status");

CREATE OR REPLACE FUNCTION "public"."validate_tenant_meta_related_rows"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_related_tenant_id uuid;
BEGIN
  IF TG_TABLE_NAME IN ('tenant_facebook_lead_forms', 'tenant_messenger_channels', 'tenant_meta_credentials') THEN
    SELECT tmi."tenant_id"
    INTO v_related_tenant_id
    FROM "public"."tenant_meta_integrations" tmi
    WHERE tmi."id" = NEW."meta_integration_id";

    IF v_related_tenant_id IS NULL OR v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Meta integration must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('tenant_facebook_lead_forms', 'tenant_messenger_channels')
    AND NEW."assigned_agent_id" IS NOT NULL THEN
    SELECT ta."tenant_id"
    INTO v_related_tenant_id
    FROM "public"."tenant_agents" ta
    WHERE ta."id" = NEW."assigned_agent_id";

    IF v_related_tenant_id IS NULL OR v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Assigned Meta intake agent must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'tenant_facebook_lead_forms'
    AND NEW."default_campaign_id" IS NOT NULL THEN
    SELECT c."tenant_id"
    INTO v_related_tenant_id
    FROM "public"."campaigns" c
    WHERE c."id" = NEW."default_campaign_id";

    IF v_related_tenant_id IS NULL OR v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Default Meta campaign must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_tenant_meta_credentials" ON "public"."tenant_meta_credentials";
CREATE TRIGGER "validate_tenant_meta_credentials"
  BEFORE INSERT OR UPDATE OF "tenant_id", "meta_integration_id"
  ON "public"."tenant_meta_credentials"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_meta_related_rows"();

DROP TRIGGER IF EXISTS "validate_tenant_facebook_lead_forms" ON "public"."tenant_facebook_lead_forms";
CREATE TRIGGER "validate_tenant_facebook_lead_forms"
  BEFORE INSERT OR UPDATE OF "tenant_id", "meta_integration_id", "assigned_agent_id", "default_campaign_id"
  ON "public"."tenant_facebook_lead_forms"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_meta_related_rows"();

DROP TRIGGER IF EXISTS "validate_tenant_messenger_channels" ON "public"."tenant_messenger_channels";
CREATE TRIGGER "validate_tenant_messenger_channels"
  BEFORE INSERT OR UPDATE OF "tenant_id", "meta_integration_id", "assigned_agent_id"
  ON "public"."tenant_messenger_channels"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_meta_related_rows"();

DROP TRIGGER IF EXISTS "tenant_meta_integrations_updated_at" ON "public"."tenant_meta_integrations";
CREATE TRIGGER "tenant_meta_integrations_updated_at"
  BEFORE UPDATE ON "public"."tenant_meta_integrations"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "tenant_meta_credentials_updated_at" ON "public"."tenant_meta_credentials";
CREATE TRIGGER "tenant_meta_credentials_updated_at"
  BEFORE UPDATE ON "public"."tenant_meta_credentials"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "tenant_facebook_lead_forms_updated_at" ON "public"."tenant_facebook_lead_forms";
CREATE TRIGGER "tenant_facebook_lead_forms_updated_at"
  BEFORE UPDATE ON "public"."tenant_facebook_lead_forms"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "tenant_messenger_channels_updated_at" ON "public"."tenant_messenger_channels";
CREATE TRIGGER "tenant_messenger_channels_updated_at"
  BEFORE UPDATE ON "public"."tenant_messenger_channels"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."tenant_meta_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_meta_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_facebook_lead_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_messenger_channels" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_meta_integrations_select" ON "public"."tenant_meta_integrations";
CREATE POLICY "tenant_meta_integrations_select"
  ON "public"."tenant_meta_integrations"
  FOR SELECT TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_meta_integrations_insert" ON "public"."tenant_meta_integrations";
CREATE POLICY "tenant_meta_integrations_insert"
  ON "public"."tenant_meta_integrations"
  FOR INSERT TO authenticated
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_meta_integrations_update" ON "public"."tenant_meta_integrations";
CREATE POLICY "tenant_meta_integrations_update"
  ON "public"."tenant_meta_integrations"
  FOR UPDATE TO authenticated
  USING ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_facebook_lead_forms_select" ON "public"."tenant_facebook_lead_forms";
CREATE POLICY "tenant_facebook_lead_forms_select"
  ON "public"."tenant_facebook_lead_forms"
  FOR SELECT TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_facebook_lead_forms_insert" ON "public"."tenant_facebook_lead_forms";
CREATE POLICY "tenant_facebook_lead_forms_insert"
  ON "public"."tenant_facebook_lead_forms"
  FOR INSERT TO authenticated
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_facebook_lead_forms_update" ON "public"."tenant_facebook_lead_forms";
CREATE POLICY "tenant_facebook_lead_forms_update"
  ON "public"."tenant_facebook_lead_forms"
  FOR UPDATE TO authenticated
  USING ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_messenger_channels_select" ON "public"."tenant_messenger_channels";
CREATE POLICY "tenant_messenger_channels_select"
  ON "public"."tenant_messenger_channels"
  FOR SELECT TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_messenger_channels_insert" ON "public"."tenant_messenger_channels";
CREATE POLICY "tenant_messenger_channels_insert"
  ON "public"."tenant_messenger_channels"
  FOR INSERT TO authenticated
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_messenger_channels_update" ON "public"."tenant_messenger_channels";
CREATE POLICY "tenant_messenger_channels_update"
  ON "public"."tenant_messenger_channels"
  FOR UPDATE TO authenticated
  USING ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."user_is_tenant_admin"("tenant_id") OR "public"."current_user_is_platform_admin"());

REVOKE ALL ON "public"."tenant_meta_credentials" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."tenant_meta_integrations" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."tenant_facebook_lead_forms" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."tenant_messenger_channels" TO authenticated;
