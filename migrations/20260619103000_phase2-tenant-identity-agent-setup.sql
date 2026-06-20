CREATE TABLE IF NOT EXISTS "tenant_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "created_by_user_id" uuid,
  "display_name" varchar(160) DEFAULT 'Bob' NOT NULL,
  "template_key" varchar(120) DEFAULT 'bob-default' NOT NULL,
  "elevenlabs_agent_id" varchar(255),
  "voice_id" varchar(255),
  "prompt_version" varchar(80) DEFAULT 'v1' NOT NULL,
  "primary_phone_number_id" uuid,
  "primary_email_identity_id" uuid,
  "booking_integration_id" uuid,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_agents_status_check" CHECK ("status" IN ('draft', 'testing', 'live', 'paused', 'archived')),
  CONSTRAINT "tenant_agents_display_name_not_blank" CHECK (length(trim("display_name")) > 0)
);

CREATE TABLE IF NOT EXISTS "tenant_email_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "from_name" varchar(160) NOT NULL,
  "from_email" varchar(255) NOT NULL,
  "reply_to_email" varchar(255),
  "provider" varchar(80) DEFAULT 'platform' NOT NULL,
  "verified_status" varchar(40) DEFAULT 'unverified' NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_email_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_email_identities_provider_check" CHECK ("provider" IN ('platform', 'resend', 'sendgrid', 'smtp')),
  CONSTRAINT "tenant_email_identities_verified_status_check" CHECK ("verified_status" IN ('unverified', 'pending', 'verified', 'failed')),
  CONSTRAINT "tenant_email_identities_status_check" CHECK ("status" IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS "tenant_booking_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider" varchar(80) DEFAULT 'manual' NOT NULL,
  "status" varchar(40) DEFAULT 'disconnected' NOT NULL,
  "booking_url" text,
  "event_type_id" varchar(255),
  "external_account_id" varchar(255),
  "encrypted_tokens" jsonb,
  "default_meeting_type" varchar(80) DEFAULT 'phone' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_booking_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_booking_integrations_provider_check" CHECK ("provider" IN ('calendly', 'google_calendar', 'zoom', 'manual')),
  CONSTRAINT "tenant_booking_integrations_status_check" CHECK ("status" IN ('disconnected', 'connected', 'needs_attention')),
  CONSTRAINT "tenant_booking_integrations_meeting_type_check" CHECK ("default_meeting_type" IN ('zoom', 'google_meet', 'phone', 'in_person'))
);

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_tenant_agent_id" uuid;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL THEN
    ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "agent_id" uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_assigned_tenant_agent_id_tenant_agents_id_fk'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_assigned_tenant_agent_id_tenant_agents_id_fk"
      FOREIGN KEY ("assigned_tenant_agent_id") REFERENCES "public"."tenant_agents"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_agent_id_tenant_agents_id_fk'
    ) THEN
    ALTER TABLE "campaigns"
      ADD CONSTRAINT "campaigns_agent_id_tenant_agents_id_fk"
      FOREIGN KEY ("agent_id") REFERENCES "public"."tenant_agents"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_agents_default_template"
  ON "tenant_agents" ("tenant_id", "template_key")
  WHERE "template_key" = 'bob-default' AND "status" <> 'archived';

CREATE INDEX IF NOT EXISTS "idx_tenant_agents_tenant_id" ON "tenant_agents" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_agents_status" ON "tenant_agents" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_tenant_email_identities_tenant_id" ON "tenant_email_identities" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_booking_integrations_tenant_id" ON "tenant_booking_integrations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_leads_assigned_tenant_agent_id" ON "leads" USING btree ("assigned_tenant_agent_id");

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "idx_campaigns_agent_id" ON "campaigns" USING btree ("agent_id");
  END IF;
END $$;
