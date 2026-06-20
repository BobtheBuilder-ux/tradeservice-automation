CREATE TABLE IF NOT EXISTS "public"."campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "name" varchar(255) NOT NULL,
  "objective" varchar(80) DEFAULT 'OUTCOME_LEADS' NOT NULL,
  "status" varchar(40) DEFAULT 'PAUSED' NOT NULL,
  "channel_sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "retry_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stop_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaigns_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'ARCHIVED')),
  CONSTRAINT "campaigns_name_not_blank" CHECK (length(trim("name")) > 0)
);

CREATE TABLE IF NOT EXISTS "public"."campaign_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "public"."campaigns"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "public"."leads"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "status" varchar(40) DEFAULT 'queued' NOT NULL,
  "current_step" varchar(120),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_leads_unique" UNIQUE ("campaign_id", "lead_id"),
  CONSTRAINT "campaign_leads_status_check" CHECK ("status" IN ('queued', 'running', 'paused', 'completed', 'failed', 'stopped'))
);

CREATE INDEX IF NOT EXISTS "idx_campaigns_tenant_id" ON "public"."campaigns" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "public"."campaigns" ("status");
CREATE INDEX IF NOT EXISTS "idx_campaign_leads_tenant_id" ON "public"."campaign_leads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_leads_campaign_id" ON "public"."campaign_leads" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_leads_lead_id" ON "public"."campaign_leads" ("lead_id");
