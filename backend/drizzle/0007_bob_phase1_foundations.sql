CREATE TABLE IF NOT EXISTS "lead_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "channel" varchar(50) DEFAULT 'email' NOT NULL,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "opted_out" boolean DEFAULT false NOT NULL,
  "last_inbound_at" timestamp with time zone,
  "last_outbound_at" timestamp with time zone,
  "next_action" varchar(100),
  "next_action_at" timestamp with time zone,
  "last_summary" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "lead_conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "direction" varchar(20) NOT NULL,
  "channel" varchar(50) DEFAULT 'email' NOT NULL,
  "message_type" varchar(50) DEFAULT 'email' NOT NULL,
  "subject" varchar(500),
  "body_text" text,
  "body_html" text,
  "provider_message_id" varchar(255),
  "status" varchar(50) DEFAULT 'logged' NOT NULL,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "error_message" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_conversation_messages_conversation_id_lead_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."lead_conversations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lead_conversation_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "bob_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "conversation_id" uuid,
  "action_type" varchar(100) NOT NULL,
  "channel" varchar(50) DEFAULT 'email' NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "reason" text,
  "payload" jsonb,
  "result" jsonb,
  "scheduled_for" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bob_actions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "bob_actions_conversation_id_lead_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."lead_conversations"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_lead_conversations_lead_id" ON "lead_conversations" USING btree ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_channel" ON "lead_conversations" USING btree ("channel");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_status" ON "lead_conversations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_next_action_at" ON "lead_conversations" USING btree ("next_action_at");

CREATE INDEX IF NOT EXISTS "idx_lead_messages_conversation_id" ON "lead_conversation_messages" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_lead_messages_lead_id" ON "lead_conversation_messages" USING btree ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_lead_messages_channel" ON "lead_conversation_messages" USING btree ("channel");
CREATE INDEX IF NOT EXISTS "idx_lead_messages_created_at" ON "lead_conversation_messages" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "idx_bob_actions_lead_id" ON "bob_actions" USING btree ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_status" ON "bob_actions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_action_type" ON "bob_actions" USING btree ("action_type");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_scheduled_for" ON "bob_actions" USING btree ("scheduled_for");
