ALTER TABLE "public"."leads"
  ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "lead_import_batch_id" uuid;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "call_consent" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "sms_consent" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "whatsapp_consent" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "email_consent" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "do_not_contact" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "opted_out_at" timestamp with time zone;
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "opt_out_channel" varchar(40);
ALTER TABLE "public"."leads" ADD COLUMN IF NOT EXISTS "opt_out_reason" text;

CREATE TABLE IF NOT EXISTS "public"."lead_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "created_by_user_id" uuid,
  "file_name" varchar(255),
  "status" varchar(40) DEFAULT 'processing' NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "inserted_rows" integer DEFAULT 0 NOT NULL,
  "duplicate_rows" integer DEFAULT 0 NOT NULL,
  "skipped_rows" integer DEFAULT 0 NOT NULL,
  "error_rows" integer DEFAULT 0 NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_import_batches_status_check"
    CHECK ("status" IN ('processing', 'completed', 'failed')),
  CONSTRAINT "lead_import_batches_counts_check"
    CHECK (
      "total_rows" >= 0
      AND "valid_rows" >= 0
      AND "inserted_rows" >= 0
      AND "duplicate_rows" >= 0
      AND "skipped_rows" >= 0
      AND "error_rows" >= 0
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_import_batch_id_fk'
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_lead_import_batch_id_fk"
      FOREIGN KEY ("lead_import_batch_id") REFERENCES "public"."lead_import_batches"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_email_or_phone_check'
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_email_or_phone_check"
      CHECK (
        NULLIF(trim(coalesce("email", '')), '') IS NOT NULL
        OR NULLIF(trim(coalesce("phone", '')), '') IS NOT NULL
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_opt_out_channel_check'
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_opt_out_channel_check"
      CHECK (
        "opt_out_channel" IS NULL
        OR "opt_out_channel" IN ('call', 'sms', 'whatsapp', 'email', 'all')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_lead_import_batches_tenant_id"
  ON "public"."lead_import_batches" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_lead_import_batches_status"
  ON "public"."lead_import_batches" ("status");

CREATE INDEX IF NOT EXISTS "idx_leads_import_batch_id"
  ON "public"."leads" ("lead_import_batch_id");

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_lower_email"
  ON "public"."leads" ("tenant_id", lower(trim("email")))
  WHERE "email" IS NOT NULL AND trim("email") <> '';

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_phone_digits"
  ON "public"."leads" ("tenant_id", regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'))
  WHERE "phone" IS NOT NULL AND regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') <> '';

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_do_not_contact"
  ON "public"."leads" ("tenant_id", "do_not_contact");

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_opted_out_at"
  ON "public"."leads" ("tenant_id", "opted_out_at");

DROP TRIGGER IF EXISTS "lead_import_batches_updated_at"
  ON "public"."lead_import_batches";

CREATE TRIGGER "lead_import_batches_updated_at"
  BEFORE UPDATE ON "public"."lead_import_batches"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."lead_import_batches" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_import_batches_select" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_select"
  ON "public"."lead_import_batches"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "lead_import_batches_insert" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_insert"
  ON "public"."lead_import_batches"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "lead_import_batches_update" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_update"
  ON "public"."lead_import_batches"
  FOR UPDATE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"))
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id"));

GRANT SELECT, INSERT, UPDATE ON "public"."lead_import_batches" TO authenticated;
