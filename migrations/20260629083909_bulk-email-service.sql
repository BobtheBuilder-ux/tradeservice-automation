-- Migration: Create tables for manual bulk email sending with tenant isolation
CREATE TABLE IF NOT EXISTS "public"."tenant_bulk_email_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid,
  "name" varchar(255) NOT NULL,
  "subject" varchar(500) NOT NULL,
  "body_text" text NOT NULL,
  "body_html" text,
  "sender_identity_id" uuid REFERENCES "public"."tenant_email_identities"("id") ON DELETE SET NULL,
  "from_name" varchar(255),
  "from_email" varchar(255),
  "recipient_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_bulk_email_campaigns_status_check" 
    CHECK ("status" IN ('draft', 'queued', 'sending', 'paused', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS "public"."tenant_bulk_email_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "public"."tenant_bulk_email_campaigns"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "custom_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "provider_message_id" varchar(255),
  "error_message" text,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_bulk_email_recipients_status_check" 
    CHECK ("status" IN ('pending', 'sent', 'delivered', 'failed', 'bounced'))
);

-- Enable RLS
ALTER TABLE "public"."tenant_bulk_email_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_bulk_email_recipients" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "tenant_bulk_email_campaigns_tenant_isolation" ON "public"."tenant_bulk_email_campaigns";
DROP POLICY IF EXISTS "tenant_bulk_email_recipients_tenant_isolation" ON "public"."tenant_bulk_email_recipients";

-- Create RLS isolation policies
CREATE POLICY "tenant_bulk_email_campaigns_tenant_isolation" 
  ON "public"."tenant_bulk_email_campaigns"
  FOR ALL
  TO authenticated
  USING ("tenant_id" = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid)
  WITH CHECK ("tenant_id" = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid);

CREATE POLICY "tenant_bulk_email_recipients_tenant_isolation" 
  ON "public"."tenant_bulk_email_recipients"
  FOR ALL
  TO authenticated
  USING ("tenant_id" = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid)
  WITH CHECK ("tenant_id" = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_bulk_email_campaigns_tenant" ON "public"."tenant_bulk_email_campaigns" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_bulk_email_recipients_campaign" ON "public"."tenant_bulk_email_recipients" ("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "idx_bulk_email_recipients_provider_msg" ON "public"."tenant_bulk_email_recipients" ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;
