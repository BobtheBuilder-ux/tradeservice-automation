ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "qualification_status" varchar(50) DEFAULT 'unqualified' NOT NULL,
  ADD COLUMN IF NOT EXISTS "qualification_score" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "lead_stage" varchar(50) DEFAULT 'new_inquiry' NOT NULL,
  ADD COLUMN IF NOT EXISTS "scheduling_state" varchar(50) DEFAULT 'not_started' NOT NULL,
  ADD COLUMN IF NOT EXISTS "preferred_contact_channel" varchar(50) DEFAULT 'email' NOT NULL,
  ADD COLUMN IF NOT EXISTS "preferred_meeting_window" varchar(255),
  ADD COLUMN IF NOT EXISTS "service_interest" varchar(255),
  ADD COLUMN IF NOT EXISTS "timeline" varchar(100),
  ADD COLUMN IF NOT EXISTS "budget_range" varchar(100),
  ADD COLUMN IF NOT EXISTS "location_summary" varchar(255),
  ADD COLUMN IF NOT EXISTS "qualification_notes" text,
  ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "next_contact_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_qualified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "automation_paused" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "requires_human_review" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "escalation_reason" text;

ALTER TABLE "lead_conversations"
  ADD COLUMN IF NOT EXISTS "conversation_status" varchar(50) DEFAULT 'active_nurture' NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_intent" varchar(100),
  ADD COLUMN IF NOT EXISTS "last_intent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "human_review_required" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_leads_qualification_status" ON "leads" USING btree ("qualification_status");
CREATE INDEX IF NOT EXISTS "idx_leads_lead_stage" ON "leads" USING btree ("lead_stage");
CREATE INDEX IF NOT EXISTS "idx_leads_scheduling_state" ON "leads" USING btree ("scheduling_state");
CREATE INDEX IF NOT EXISTS "idx_leads_next_contact_at" ON "leads" USING btree ("next_contact_at");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_conversation_status" ON "lead_conversations" USING btree ("conversation_status");
