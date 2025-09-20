CREATE TABLE "agent_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"feedback_type" varchar(50) DEFAULT 'general' NOT NULL,
	"subject" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(50) DEFAULT 'submitted' NOT NULL,
	"admin_response" text,
	"admin_responded_by" uuid,
	"admin_responded_at" timestamp with time zone,
	"is_read" boolean DEFAULT false NOT NULL,
	"tags" jsonb,
	"attachments" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_admin_responded_by_agents_id_fk" FOREIGN KEY ("admin_responded_by") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_agent_id" ON "agent_feedback" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_lead_id" ON "agent_feedback" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_status" ON "agent_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_created_at" ON "agent_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_priority" ON "agent_feedback" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_agent_lead" ON "agent_feedback" USING btree ("agent_id","lead_id");--> statement-breakpoint
CREATE INDEX "idx_agent_feedback_type_status" ON "agent_feedback" USING btree ("feedback_type","status");