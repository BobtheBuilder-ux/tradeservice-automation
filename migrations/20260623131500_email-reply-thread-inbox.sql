CREATE TABLE IF NOT EXISTS "public"."email_reply_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  "lead_id" uuid REFERENCES "public"."leads"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "public"."lead_conversations"("id") ON DELETE SET NULL,
  "assigned_tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE SET NULL,
  "last_inbound_message_id" uuid REFERENCES "public"."lead_conversation_messages"("id") ON DELETE SET NULL,
  "last_outbound_message_id" uuid REFERENCES "public"."lead_conversation_messages"("id") ON DELETE SET NULL,
  "last_email_queue_id" uuid REFERENCES "public"."email_queue"("id") ON DELETE SET NULL,
  "from_email" varchar(255) NOT NULL,
  "to_email" varchar(255) NOT NULL,
  "subject" varchar(500),
  "provider_thread_id" varchar(500),
  "provider_message_id" varchar(500),
  "message_id_header" text,
  "references_header" text,
  "status" varchar(40) NOT NULL DEFAULT 'pending',
  "response_status" varchar(40) NOT NULL DEFAULT 'needs_response',
  "response_mode" varchar(40) NOT NULL DEFAULT 'ai_auto',
  "priority" varchar(40) NOT NULL DEFAULT 'normal',
  "last_received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_responded_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "response_error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_reply_threads_status_check"
    CHECK ("status" IN ('pending', 'responded', 'failed', 'ignored', 'closed')),
  CONSTRAINT "email_reply_threads_response_status_check"
    CHECK ("response_status" IN ('needs_response', 'responding', 'responded', 'failed', 'ignored', 'manual_review')),
  CONSTRAINT "email_reply_threads_response_mode_check"
    CHECK ("response_mode" IN ('ai_auto', 'human', 'none')),
  CONSTRAINT "email_reply_threads_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT "email_reply_threads_from_email_format_check"
    CHECK ("from_email" ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  CONSTRAINT "email_reply_threads_to_email_format_check"
    CHECK ("to_email" ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

CREATE INDEX IF NOT EXISTS "idx_email_reply_threads_tenant_status"
  ON "public"."email_reply_threads" ("tenant_id", "status", "last_received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_email_reply_threads_tenant_response_status"
  ON "public"."email_reply_threads" ("tenant_id", "response_status", "last_received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_email_reply_threads_lead"
  ON "public"."email_reply_threads" ("tenant_id", "lead_id", "last_received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_email_reply_threads_agent"
  ON "public"."email_reply_threads" ("tenant_id", "assigned_tenant_agent_id", "last_received_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_reply_threads_provider_message_unique"
  ON "public"."email_reply_threads" ("tenant_id", "provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_reply_threads_header_message_unique"
  ON "public"."email_reply_threads" ("tenant_id", "message_id_header")
  WHERE "message_id_header" IS NOT NULL;
