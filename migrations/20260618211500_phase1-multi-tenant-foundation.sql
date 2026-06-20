CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "industry" varchar(120),
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "default_timezone" varchar(100) DEFAULT 'America/Toronto' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
  CONSTRAINT "tenants_status_check" CHECK ("status" IN ('active', 'onboarding', 'suspended', 'archived'))
);

CREATE TABLE IF NOT EXISTS "tenant_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "legacy_agent_id" uuid,
  "role" varchar(40) DEFAULT 'operator' NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_users_legacy_agent_id_agents_id_fk" FOREIGN KEY ("legacy_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "tenant_users_tenant_user_unique" UNIQUE("tenant_id", "user_id"),
  CONSTRAINT "tenant_users_role_check" CHECK ("role" IN ('owner', 'admin', 'operator')),
  CONSTRAINT "tenant_users_status_check" CHECK ("status" IN ('invited', 'active', 'disabled'))
);

INSERT INTO "tenants" ("id", "name", "slug", "status", "default_timezone", "metadata")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Default Tenant',
  'default',
  'active',
  'America/Toronto',
  '{"source":"phase1_backfill"}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "lead_audit_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "lead_processing_logs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "workflow_automation" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "email_queue" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "meeting_reminders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "agent_feedback" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "agent_integrations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "lead_conversations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "lead_conversation_messages" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "bob_actions" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;

UPDATE "agents" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "leads" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "lead_audit_log" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "lead_processing_logs" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "webhook_events" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "workflow_automation" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "email_queue" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "meetings" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "meeting_reminders" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "agent_feedback" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "agent_integrations" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "lead_conversations" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "lead_conversation_messages" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;
UPDATE "bob_actions" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;

ALTER TABLE "agents" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "lead_audit_log" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "lead_processing_logs" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "webhook_events" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "workflow_automation" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "email_queue" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "meetings" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "meeting_reminders" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "agent_feedback" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "agent_integrations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "lead_conversations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "lead_conversation_messages" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "bob_actions" ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "lead_audit_log" ADD CONSTRAINT "lead_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "lead_processing_logs" ADD CONSTRAINT "lead_processing_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "workflow_automation" ADD CONSTRAINT "workflow_automation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "meeting_reminders" ADD CONSTRAINT "meeting_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "agent_integrations" ADD CONSTRAINT "agent_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "lead_conversations" ADD CONSTRAINT "lead_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "lead_conversation_messages" ADD CONSTRAINT "lead_conversation_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bob_actions" ADD CONSTRAINT "bob_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_tenant_users_user_id" ON "tenant_users" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_users_tenant_id" ON "tenant_users" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_users_legacy_agent_id" ON "tenant_users" USING btree ("legacy_agent_id");
CREATE INDEX IF NOT EXISTS "idx_agents_tenant_id" ON "agents" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_leads_tenant_id" ON "leads" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_lead_audit_log_tenant_id" ON "lead_audit_log" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_lead_processing_logs_tenant_id" ON "lead_processing_logs" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_tenant_id" ON "webhook_events" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_automation_tenant_id" ON "workflow_automation" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_email_queue_tenant_id" ON "email_queue" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_meetings_tenant_id" ON "meetings" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_reminders_tenant_id" ON "meeting_reminders" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agent_feedback_tenant_id" ON "agent_feedback" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agent_integrations_tenant_id" ON "agent_integrations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_tenant_id" ON "lead_conversations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_lead_messages_tenant_id" ON "lead_conversation_messages" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_tenant_id" ON "bob_actions" USING btree ("tenant_id");
