ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_provider_lead_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_page_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_form_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_campaign_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_campaign_name" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_adset_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_adset_name" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_ad_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_ad_name" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "messenger_provider_id" varchar(255);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_source_label" varchar(160);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "meta_raw_attribution" jsonb DEFAULT '{}'::jsonb NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_email_or_phone_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE "public"."leads"
      DROP CONSTRAINT "leads_email_or_phone_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_contact_or_meta_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_contact_or_meta_check"
      CHECK (
        NULLIF(trim(coalesce("email", '')), '') IS NOT NULL
        OR NULLIF(trim(coalesce("phone", '')), '') IS NOT NULL
        OR NULLIF(trim(coalesce("messenger_provider_id", '')), '') IS NOT NULL
        OR NULLIF(trim(coalesce("meta_provider_lead_id", '')), '') IS NOT NULL
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."tenant_meta_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "meta_integration_id" uuid REFERENCES "public"."tenant_meta_integrations"("id") ON DELETE set null,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE set null,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE set null,
  "message_id" uuid REFERENCES "public"."lead_conversation_messages"("id") ON DELETE set null,
  "provider" varchar(40) DEFAULT 'meta' NOT NULL,
  "source_channel" varchar(40) NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "provider_event_id" varchar(255) NOT NULL,
  "page_id" varchar(255),
  "form_id" varchar(255),
  "provider_lead_id" varchar(255),
  "provider_message_id" varchar(255),
  "status" varchar(40) DEFAULT 'received' NOT NULL,
  "processed_at" timestamptz,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_meta_provider_events_provider_check" CHECK ("provider" = 'meta'),
  CONSTRAINT "tenant_meta_provider_events_source_channel_check" CHECK ("source_channel" IN ('lead_form', 'messenger')),
  CONSTRAINT "tenant_meta_provider_events_status_check" CHECK ("status" IN ('received', 'processed', 'duplicate', 'ignored', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_meta_provider_events_unique"
  ON "public"."tenant_meta_provider_events" ("provider", "event_type", "provider_event_id");

CREATE INDEX IF NOT EXISTS "idx_tenant_meta_provider_events_tenant"
  ON "public"."tenant_meta_provider_events" ("tenant_id", "source_channel", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_tenant_meta_provider_events_lead"
  ON "public"."tenant_meta_provider_events" ("tenant_id", "lead_id", "created_at" DESC)
  WHERE "lead_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_tenant_meta_provider_lead"
  ON "public"."leads" ("tenant_id", "meta_provider_lead_id")
  WHERE "meta_provider_lead_id" IS NOT NULL AND trim("meta_provider_lead_id") <> '';

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_meta_page_form"
  ON "public"."leads" ("tenant_id", "meta_page_id", "meta_form_id")
  WHERE "meta_page_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_messenger_provider"
  ON "public"."leads" ("tenant_id", "messenger_provider_id")
  WHERE "messenger_provider_id" IS NOT NULL AND trim("messenger_provider_id") <> '';

DROP TRIGGER IF EXISTS "tenant_meta_provider_events_updated_at" ON "public"."tenant_meta_provider_events";
CREATE TRIGGER "tenant_meta_provider_events_updated_at"
  BEFORE UPDATE ON "public"."tenant_meta_provider_events"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."tenant_meta_provider_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_meta_provider_events_select" ON "public"."tenant_meta_provider_events";
CREATE POLICY "tenant_meta_provider_events_select"
  ON "public"."tenant_meta_provider_events"
  FOR SELECT TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

REVOKE ALL ON "public"."tenant_meta_provider_events" FROM anon, authenticated;
GRANT SELECT ON "public"."tenant_meta_provider_events" TO authenticated;
