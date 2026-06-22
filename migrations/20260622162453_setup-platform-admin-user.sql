CREATE TABLE IF NOT EXISTS "public"."platform_admin_users" (
  "user_id" uuid PRIMARY KEY REFERENCES "auth"."users"("id") ON DELETE cascade,
  "role" varchar(40) DEFAULT 'super_admin' NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_admin_users_role_check" CHECK ("role" IN ('super_admin', 'support_admin')),
  CONSTRAINT "platform_admin_users_status_check" CHECK ("status" IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS "idx_platform_admin_users_status"
  ON "public"."platform_admin_users" ("status", "role");

DROP TRIGGER IF EXISTS "platform_admin_users_updated_at" ON "public"."platform_admin_users";
CREATE TRIGGER "platform_admin_users_updated_at"
  BEFORE UPDATE ON "public"."platform_admin_users"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

INSERT INTO "public"."platform_admin_users" (
  "user_id",
  "role",
  "status",
  "notes",
  "metadata",
  "created_by_user_id"
)
SELECT
  users."id",
  'super_admin',
  'active',
  'Initial super admin seeded from existing active tenant admin.',
  jsonb_build_object('source', 'setup-platform-admin-user', 'seededByEmail', users."email"),
  users."id"
FROM "auth"."users" users
WHERE lower(users."email") = lower('miraclechukwudi@gmail.com')
ON CONFLICT ("user_id") DO UPDATE
  SET "role" = 'super_admin',
      "status" = 'active',
      "notes" = COALESCE("platform_admin_users"."notes", 'Initial super admin seeded from existing active tenant admin.'),
      "metadata" = COALESCE("platform_admin_users"."metadata", '{}'::jsonb)
        || jsonb_build_object('source', 'setup-platform-admin-user', 'seededByEmail', EXCLUDED."metadata"->>'seededByEmail'),
      "updated_at" = now();

CREATE OR REPLACE FUNCTION "public"."current_user_is_platform_admin"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."platform_admin_users" pau
    WHERE pau."user_id" = auth.uid()
      AND pau."status" = 'active'
      AND pau."role" IN ('super_admin', 'support_admin')
  );
$$;

REVOKE ALL ON FUNCTION "public"."current_user_is_platform_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_is_platform_admin"() TO authenticated;

CREATE OR REPLACE FUNCTION "public"."current_platform_admin_profile"()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'isPlatformAdmin', true,
        'role', pau."role",
        'status', pau."status",
        'userId', pau."user_id"
      )
      FROM "public"."platform_admin_users" pau
      WHERE pau."user_id" = auth.uid()
        AND pau."status" = 'active'
      LIMIT 1
    ),
    jsonb_build_object('isPlatformAdmin', false)
  );
$$;

REVOKE ALL ON FUNCTION "public"."current_platform_admin_profile"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_platform_admin_profile"() TO authenticated;

ALTER TABLE "public"."platform_admin_users" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_users_select" ON "public"."platform_admin_users";
CREATE POLICY "platform_admin_users_select"
  ON "public"."platform_admin_users"
  FOR SELECT
  TO authenticated
  USING ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "platform_admin_users_insert" ON "public"."platform_admin_users";
CREATE POLICY "platform_admin_users_insert"
  ON "public"."platform_admin_users"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "platform_admin_users_update" ON "public"."platform_admin_users";
CREATE POLICY "platform_admin_users_update"
  ON "public"."platform_admin_users"
  FOR UPDATE
  TO authenticated
  USING ("public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."current_user_is_platform_admin"());

GRANT SELECT, INSERT, UPDATE ON "public"."platform_admin_users" TO authenticated;
