CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
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
--> statement-breakpoint
CREATE TABLE "meeting_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"agent_id" uuid,
	"calendly_event_id" varchar(255),
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_calendly_event_id_unique" UNIQUE("calendly_event_id")
);
--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reminders" ADD CONSTRAINT "meeting_reminders_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_queue_lead_id" ON "email_queue" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_email_queue_status" ON "email_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_email_queue_scheduled_for" ON "email_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_email_queue_email_type" ON "email_queue" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX "idx_meeting_reminders_meeting_id" ON "meeting_reminders" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_reminders_scheduled_for" ON "meeting_reminders" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_meeting_reminders_status" ON "meeting_reminders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_meetings_lead_id" ON "meetings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_agent_id" ON "meetings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_calendly_event_id" ON "meetings" USING btree ("calendly_event_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_start_time" ON "meetings" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_meetings_status" ON "meetings" USING btree ("status");