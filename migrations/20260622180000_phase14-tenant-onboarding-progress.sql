CREATE TABLE IF NOT EXISTS "public"."tenant_onboarding_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "current_step" varchar(80) DEFAULT 'company' NOT NULL,
  "completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_mode" varchar(80) DEFAULT 'tenant_self_service' NOT NULL,
  "actor_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "is_complete" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_onboarding_progress_tenant_unique" UNIQUE ("tenant_id"),
  CONSTRAINT "tenant_onboarding_progress_step_check" CHECK ("current_step" IN ('company', 'agent', 'phone', 'email', 'booking', 'knowledge', 'leads', 'review')),
  CONSTRAINT "tenant_onboarding_progress_actor_mode_check" CHECK ("actor_mode" IN ('tenant_self_service', 'super_admin_assisted')),
  CONSTRAINT "tenant_onboarding_progress_completed_steps_array_check" CHECK (jsonb_typeof("completed_steps") = 'array'),
  CONSTRAINT "tenant_onboarding_progress_answers_object_check" CHECK (jsonb_typeof("answers") = 'object'),
  CONSTRAINT "tenant_onboarding_progress_metadata_object_check" CHECK (jsonb_typeof("metadata") = 'object')
);

CREATE INDEX IF NOT EXISTS "idx_tenant_onboarding_progress_tenant" ON "public"."tenant_onboarding_progress" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_onboarding_progress_status" ON "public"."tenant_onboarding_progress" ("is_complete", "current_step");

DROP TRIGGER IF EXISTS "tenant_onboarding_progress_updated_at" ON "public"."tenant_onboarding_progress";
CREATE TRIGGER "tenant_onboarding_progress_updated_at"
  BEFORE UPDATE ON "public"."tenant_onboarding_progress"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."tenant_onboarding_progress" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_onboarding_progress_select" ON "public"."tenant_onboarding_progress";
CREATE POLICY "tenant_onboarding_progress_select"
  ON "public"."tenant_onboarding_progress"
  FOR SELECT
  TO authenticated
  USING (
    "public"."user_is_tenant_admin"("tenant_id")
    OR "public"."current_user_is_platform_admin"()
  );

DROP POLICY IF EXISTS "tenant_onboarding_progress_insert" ON "public"."tenant_onboarding_progress";
CREATE POLICY "tenant_onboarding_progress_insert"
  ON "public"."tenant_onboarding_progress"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    "public"."user_is_tenant_admin"("tenant_id")
    OR "public"."current_user_is_platform_admin"()
  );

DROP POLICY IF EXISTS "tenant_onboarding_progress_update" ON "public"."tenant_onboarding_progress";
CREATE POLICY "tenant_onboarding_progress_update"
  ON "public"."tenant_onboarding_progress"
  FOR UPDATE
  TO authenticated
  USING (
    "public"."user_is_tenant_admin"("tenant_id")
    OR "public"."current_user_is_platform_admin"()
  )
  WITH CHECK (
    "public"."user_is_tenant_admin"("tenant_id")
    OR "public"."current_user_is_platform_admin"()
  );

GRANT SELECT, INSERT, UPDATE ON "public"."tenant_onboarding_progress" TO authenticated;

INSERT INTO "public"."tenant_onboarding_progress" (
  "tenant_id",
  "current_step",
  "completed_steps",
  "answers",
  "actor_mode",
  "is_complete",
  "completed_at",
  "metadata"
)
SELECT
  t."id",
  'review',
  '["company","agent","phone","email","booking","knowledge","leads","review"]'::jsonb,
  '{}'::jsonb,
  'tenant_self_service',
  true,
  now(),
  '{"source":"phase14_existing_tenant_backfill"}'::jsonb
FROM "public"."tenants" t
WHERE t."status" = 'active'
ON CONFLICT ("tenant_id") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'super_admin_setup_onboarding_progress_fk'
      AND conrelid = 'public.super_admin_tenant_setup_sessions'::regclass
  ) THEN
    ALTER TABLE "public"."super_admin_tenant_setup_sessions"
      ADD CONSTRAINT "super_admin_setup_onboarding_progress_fk"
      FOREIGN KEY ("onboarding_progress_id")
      REFERENCES "public"."tenant_onboarding_progress"("id")
      ON DELETE set null;
  END IF;
END $$;
