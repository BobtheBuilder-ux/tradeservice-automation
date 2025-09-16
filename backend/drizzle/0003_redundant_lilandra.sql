ALTER TABLE "agents" ADD COLUMN "reset_token" varchar(255);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "reset_token_expires" timestamp with time zone;