CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" varchar(50) UNIQUE,
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255),
  "first_name" varchar(100),
  "last_name" varchar(100),
  "full_name" varchar(255),
  "phone" varchar(50),
  "role" varchar(20) DEFAULT 'admin' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "email_verified" boolean DEFAULT true NOT NULL,
  "verification_token" varchar(255),
  "agent_token" varchar(255),
  "agent_token_expires" timestamp with time zone,
  "reset_token" text,
  "reset_token_expires" timestamp with time zone,
  "last_login" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "first_name" varchar(255),
  "last_name" varchar(255),
  "full_name" varchar(255),
  "phone" varchar(50),
  "company" varchar(255),
  "job_title" varchar(255),
  "website" varchar(500),
  "lead_source" varchar(255),
  "source" varchar(100) DEFAULT 'manual' NOT NULL,
  "status" varchar(50) DEFAULT 'new' NOT NULL,
  "custom_fields" jsonb,
  "hubspot_contact_id" varchar(255),
  "hubspot_sync_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "hubspot_last_sync" timestamp with time zone,
  "hubspot_error_message" text,
  "assigned_agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE set null,
  "last_updated_by" uuid REFERENCES "public"."agents"("id") ON DELETE set null,
  "agent_notes" text,
  "notes" text,
  "tags" jsonb,
  "follow_up_date" timestamp with time zone,
  "priority" varchar(20) DEFAULT 'medium' NOT NULL,
  "qualification_status" varchar(50) DEFAULT 'unqualified' NOT NULL,
  "qualification_score" integer DEFAULT 0 NOT NULL,
  "lead_stage" varchar(50) DEFAULT 'new_inquiry' NOT NULL,
  "scheduling_state" varchar(50) DEFAULT 'not_started' NOT NULL,
  "preferred_contact_channel" varchar(50) DEFAULT 'email' NOT NULL,
  "preferred_meeting_window" varchar(255),
  "service_interest" varchar(255),
  "timeline" varchar(100),
  "budget_range" varchar(100),
  "location_summary" varchar(255),
  "qualification_notes" text,
  "last_contacted_at" timestamp with time zone,
  "next_contact_at" timestamp with time zone,
  "last_qualified_at" timestamp with time zone,
  "automation_paused" boolean DEFAULT false NOT NULL,
  "requires_human_review" boolean DEFAULT false NOT NULL,
  "escalation_reason" text,
  "calendly_event_uri" text,
  "calendly_invitee_uri" text,
  "calendly_event_type" varchar(255),
  "calendly_questions" jsonb,
  "calendly_tracking_data" jsonb,
  "scheduled_at" timestamp with time zone,
  "meeting_end_time" timestamp with time zone,
  "meeting_location" text,
  "canceled_at" timestamp with time zone,
  "cancellation_reason" text,
  "rescheduled_at" timestamp with time zone,
  "previous_scheduled_at" timestamp with time zone,
  "no_show_at" timestamp with time zone,
  "last_calendly_update" timestamp with time zone,
  "processing_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "processing_attempts" integer DEFAULT 0 NOT NULL,
  "last_processing_attempt" timestamp with time zone,
  "processing_errors" jsonb,
  "tracking_id" varchar(255),
  "meeting_scheduled" boolean DEFAULT false NOT NULL,
  "last_meeting_reminder_sent" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE set null,
  "action" varchar(50) NOT NULL,
  "field_name" varchar(100),
  "old_value" text,
  "new_value" text,
  "notes" text,
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_processing_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "tracking_id" varchar(255),
  "event_type" varchar(100) NOT NULL,
  "event_data" jsonb,
  "success" boolean DEFAULT true NOT NULL,
  "error_message" text,
  "processing_time_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(50) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "webhook_id" varchar(255),
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE set null,
  "tracking_id" varchar(255),
  "raw_payload" jsonb NOT NULL,
  "processed_payload" jsonb,
  "processing_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "processing_attempts" integer DEFAULT 0 NOT NULL,
  "last_processing_attempt" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "system_config" (
  "key" varchar(255) PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "is_sensitive" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE set null,
  "calendly_event_id" varchar(255) UNIQUE,
  "meeting_type" varchar(100) DEFAULT 'consultation' NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
  "status" varchar(50) DEFAULT 'scheduled' NOT NULL,
  "meeting_url" text,
  "location" text,
  "attendee_email" varchar(255),
  "attendee_name" varchar(255),
  "attendee_phone" varchar(50),
  "reminder_sent" boolean DEFAULT false NOT NULL,
  "follow_up_sent" boolean DEFAULT false NOT NULL,
  "reminder_24h_sent" boolean DEFAULT false NOT NULL,
  "reminder_1h_sent" boolean DEFAULT false NOT NULL,
  "sms_24h_sent" boolean DEFAULT false NOT NULL,
  "sms_1h_sent" boolean DEFAULT false NOT NULL,
  "reminder_24h_sent_at" timestamp with time zone,
  "reminder_1h_sent_at" timestamp with time zone,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "meeting_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid REFERENCES "public"."meetings"("id") ON DELETE cascade,
  "reminder_type" varchar(50) NOT NULL,
  "delivery_method" varchar(20) DEFAULT 'email' NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "email_message_id" varchar(255),
  "sms_message_sid" varchar(255),
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflow_automation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "workflow_type" varchar(100) NOT NULL,
  "step_name" varchar(255) NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "executed_at" timestamp with time zone,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "max_retries" integer DEFAULT 3 NOT NULL,
  "error_message" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE set null,
  "to_email" varchar(255) NOT NULL,
  "from_email" varchar(255) NOT NULL,
  "subject" varchar(500) NOT NULL,
  "html_content" text NOT NULL,
  "text_content" text,
  "email_type" varchar(100) NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "scheduled_for" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "message_id" varchar(255),
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "max_retries" integer DEFAULT 3 NOT NULL,
  "metadata" jsonb,
  "tracking_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid REFERENCES "public"."agents"("id") ON DELETE cascade,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "feedback_type" varchar(50) DEFAULT 'general' NOT NULL,
  "subject" varchar(255) NOT NULL,
  "content" text NOT NULL,
  "priority" varchar(20) DEFAULT 'medium' NOT NULL,
  "status" varchar(50) DEFAULT 'submitted' NOT NULL,
  "admin_response" text,
  "admin_responded_by" uuid REFERENCES "public"."agents"("id") ON DELETE set null,
  "admin_responded_at" timestamp with time zone,
  "is_read" boolean DEFAULT false NOT NULL,
  "tags" jsonb,
  "attachments" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "channel" varchar(50) DEFAULT 'email' NOT NULL,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "conversation_status" varchar(50) DEFAULT 'active_nurture' NOT NULL,
  "opted_out" boolean DEFAULT false NOT NULL,
  "last_inbound_at" timestamp with time zone,
  "last_outbound_at" timestamp with time zone,
  "next_action" varchar(100),
  "next_action_at" timestamp with time zone,
  "last_intent" varchar(100),
  "last_intent_at" timestamp with time zone,
  "human_review_required" boolean DEFAULT false NOT NULL,
  "last_summary" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE cascade,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bob_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE set null,
  "action_type" varchar(100) NOT NULL,
  "channel" varchar(50) DEFAULT 'email' NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "reason" text,
  "payload" jsonb,
  "result" jsonb,
  "scheduled_for" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid UNIQUE REFERENCES "public"."agents"("id") ON DELETE cascade,
  "calendly_access_token" text,
  "zoom_access_token" text,
  "zoom_refresh_token" text,
  "connected_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_agents_email" ON "agents" ("email");
CREATE INDEX IF NOT EXISTS "idx_agents_role" ON "agents" ("role");
CREATE INDEX IF NOT EXISTS "idx_leads_email" ON "leads" ("email");
CREATE INDEX IF NOT EXISTS "idx_leads_status" ON "leads" ("status");
CREATE INDEX IF NOT EXISTS "idx_leads_created_at" ON "leads" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_leads_tracking_id" ON "leads" ("tracking_id");
CREATE INDEX IF NOT EXISTS "idx_leads_assigned_agent" ON "leads" ("assigned_agent_id");
CREATE INDEX IF NOT EXISTS "idx_lead_logs_tracking_id" ON "lead_processing_logs" ("tracking_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_source" ON "webhook_events" ("source");
CREATE INDEX IF NOT EXISTS "idx_meetings_start_time" ON "meetings" ("start_time");
CREATE INDEX IF NOT EXISTS "idx_meeting_reminders_scheduled_for" ON "meeting_reminders" ("scheduled_for");
CREATE INDEX IF NOT EXISTS "idx_workflow_status" ON "workflow_automation" ("status");
CREATE INDEX IF NOT EXISTS "idx_email_queue_status" ON "email_queue" ("status");
CREATE INDEX IF NOT EXISTS "idx_agent_feedback_status" ON "agent_feedback" ("status");
CREATE INDEX IF NOT EXISTS "idx_lead_conversations_lead_id" ON "lead_conversations" ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_lead_messages_conversation_id" ON "lead_conversation_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_status" ON "bob_actions" ("status");
CREATE INDEX IF NOT EXISTS "idx_bob_actions_scheduled_for" ON "bob_actions" ("scheduled_for");
