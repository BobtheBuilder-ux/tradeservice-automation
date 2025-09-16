CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"full_name" varchar(255),
	"phone" varchar(50),
	"role" varchar(20) DEFAULT 'agent' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_agent_id_unique" UNIQUE("agent_id"),
	CONSTRAINT "agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "lead_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"agent_id" uuid,
	"action" varchar(50) NOT NULL,
	"field_name" varchar(100),
	"old_value" text,
	"new_value" text,
	"notes" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_processing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"tracking_id" varchar(255),
	"event_type" varchar(100) NOT NULL,
	"event_data" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facebook_lead_id" varchar(255),
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"full_name" varchar(255),
	"phone" varchar(50),
	"source" varchar(100) DEFAULT 'facebook_lead_ads' NOT NULL,
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"facebook_page_id" varchar(255),
	"facebook_form_id" varchar(255),
	"facebook_ad_id" varchar(255),
	"facebook_adgroup_id" varchar(255),
	"facebook_campaign_id" varchar(255),
	"facebook_form_name" varchar(255),
	"facebook_ad_name" varchar(255),
	"facebook_campaign_name" varchar(255),
	"facebook_raw_data" jsonb,
	"custom_fields" jsonb,
	"hubspot_contact_id" varchar(255),
	"hubspot_sync_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"hubspot_last_sync" timestamp with time zone,
	"hubspot_error_message" text,
	"assigned_agent_id" uuid,
	"last_updated_by" uuid,
	"agent_notes" text,
	"follow_up_date" timestamp with time zone,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_facebook_lead_id_unique" UNIQUE("facebook_lead_id")
);
--> statement-breakpoint
CREATE TABLE "migration_locks" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(100),
	"migration_version" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "schema_versions" (
	"id" integer PRIMARY KEY NOT NULL,
	"version_number" varchar(50) NOT NULL,
	"migration_name" varchar(255) NOT NULL,
	"description" text,
	"checksum" varchar(64),
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" varchar(100) DEFAULT 'current_user',
	"execution_time_ms" integer,
	"rollback_sql" text,
	CONSTRAINT "schema_versions_version_number_unique" UNIQUE("version_number")
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(50) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"webhook_id" varchar(255),
	"lead_id" uuid,
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
--> statement-breakpoint
CREATE TABLE "workflow_automation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "lead_audit_log" ADD CONSTRAINT "lead_audit_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_audit_log" ADD CONSTRAINT "lead_audit_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_processing_logs" ADD CONSTRAINT "lead_processing_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_last_updated_by_agents_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_automation" ADD CONSTRAINT "workflow_automation_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_agent_id" ON "agents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agents_email" ON "agents" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_agents_active" ON "agents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_agents_role" ON "agents" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_audit_log_lead_id" ON "lead_audit_log" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_agent_id" ON "lead_audit_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created_at" ON "lead_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_action" ON "lead_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_lead_logs_lead_id" ON "lead_processing_logs" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_logs_tracking_id" ON "lead_processing_logs" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "idx_lead_logs_event_type" ON "lead_processing_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_lead_logs_created_at" ON "lead_processing_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_lead_logs_success" ON "lead_processing_logs" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_leads_facebook_lead_id" ON "leads" USING btree ("facebook_lead_id");--> statement-breakpoint
CREATE INDEX "idx_leads_email" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leads_created_at" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_processing_status" ON "leads" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_leads_scheduled_at" ON "leads" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_leads_tracking_id" ON "leads" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "idx_leads_assigned_agent" ON "leads" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "idx_leads_email_status" ON "leads" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "idx_leads_source_created_at" ON "leads" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_priority_status" ON "leads" USING btree ("priority","status");--> statement-breakpoint
CREATE INDEX "idx_schema_versions_version" ON "schema_versions" USING btree ("version_number");--> statement-breakpoint
CREATE INDEX "idx_schema_versions_applied_at" ON "schema_versions" USING btree ("applied_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_source" ON "webhook_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_event_type" ON "webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_lead_id" ON "webhook_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_tracking_id" ON "webhook_events" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_processing_status" ON "webhook_events" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_created_at" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_lead_id" ON "workflow_automation" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_scheduled_at" ON "workflow_automation" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_status" ON "workflow_automation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_type" ON "workflow_automation" USING btree ("workflow_type");