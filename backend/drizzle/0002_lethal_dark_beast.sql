ALTER TABLE "agents" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "verification_token" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_token" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_token_expires" timestamp with time zone;