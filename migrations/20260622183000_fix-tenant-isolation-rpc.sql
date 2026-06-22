-- Critical tenant-isolation fix.
--
-- Previous versions of resolve_current_portal_user attached every authenticated
-- user to the fixed default tenant. That made separate registrations share the
-- first tenant's onboarding/settings data. This migration changes the resolver
-- to:
--   1. return an existing tenant membership when one exists;
--   2. create a fresh tenant for a first-time authenticated user;
--   3. repair already-misassigned users by moving extra users from the default
--      tenant into fresh isolated onboarding tenants.

CREATE OR REPLACE FUNCTION "public"."tenant_slug_base"(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' from regexp_replace(lower(COALESCE(p_value, 'workspace')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'workspace'
  );
$$;

CREATE OR REPLACE FUNCTION "public"."unique_tenant_slug"(p_base text, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_base text := left("public"."tenant_slug_base"(p_base), 72);
  v_suffix text := left(replace(p_user_id::text, '-', ''), 10);
  v_slug text;
  v_counter integer := 0;
BEGIN
  LOOP
    v_slug := left(
      CASE
        WHEN v_counter = 0 THEN v_base || '-' || v_suffix
        ELSE v_base || '-' || v_suffix || '-' || v_counter::text
      END,
      120
    );

    IF NOT EXISTS (
      SELECT 1
      FROM "public"."tenants" t
      WHERE t."slug" = v_slug
    ) THEN
      RETURN v_slug;
    END IF;

    v_counter := v_counter + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION "public"."tenant_slug_base"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."unique_tenant_slug"(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."resolve_current_portal_user"()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_verified boolean := false;
  v_profile jsonb := '{}'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_display_name text;
  v_company_name text;
  v_slug text;
  v_tenant "public"."tenants"%ROWTYPE;
  v_tenant_user "public"."tenant_users"%ROWTYPE;
  v_created_new_tenant boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT
    users.email,
    COALESCE(users.email_verified, false),
    COALESCE(users.profile, '{}'::jsonb),
    COALESCE(users.metadata, '{}'::jsonb)
  INTO v_email, v_email_verified, v_profile, v_metadata
  FROM "auth"."users" users
  WHERE users.id = v_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user was not found' USING ERRCODE = '28000';
  END IF;

  SELECT tu.*
  INTO v_tenant_user
  FROM "public"."tenant_users" tu
  JOIN "public"."tenants" t ON t."id" = tu."tenant_id"
  WHERE tu."user_id" = v_user_id
    AND tu."status" = 'active'
    AND t."status" <> 'archived'
  ORDER BY tu."created_at" ASC, tu."id" ASC
  LIMIT 1;

  IF v_tenant_user."id" IS NOT NULL THEN
    SELECT *
    INTO v_tenant
    FROM "public"."tenants"
    WHERE "id" = v_tenant_user."tenant_id";
  ELSE
    v_display_name := COALESCE(
      NULLIF(v_profile->>'name', ''),
      NULLIF(v_profile->>'full_name', ''),
      NULLIF(v_metadata->>'name', ''),
      NULLIF(v_metadata->>'full_name', ''),
      split_part(v_email, '@', 1),
      'Admin'
    );

    v_company_name := COALESCE(
      NULLIF(v_metadata->>'company_name', ''),
      NULLIF(v_metadata->>'companyName', ''),
      NULLIF(v_metadata->>'organization', ''),
      v_display_name || ' Workspace'
    );
    v_slug := "public"."unique_tenant_slug"(v_company_name, v_user_id);

    INSERT INTO "public"."tenants" (
      "name",
      "slug",
      "status",
      "default_timezone",
      "metadata"
    )
    VALUES (
      v_company_name,
      v_slug,
      'onboarding',
      COALESCE(NULLIF(v_metadata->>'default_timezone', ''), 'America/Toronto'),
      jsonb_build_object(
        'source', 'resolve_current_portal_user',
        'createdForUserId', v_user_id,
        'createdForEmail', v_email
      )
    )
    RETURNING * INTO v_tenant;

    INSERT INTO "public"."tenant_users" (
      "tenant_id",
      "user_id",
      "role",
      "status"
    )
    VALUES (
      v_tenant."id",
      v_user_id,
      'owner',
      'active'
    )
    RETURNING * INTO v_tenant_user;

    v_created_new_tenant := true;

    IF to_regclass('public.tenant_onboarding_progress') IS NOT NULL THEN
      INSERT INTO "public"."tenant_onboarding_progress" (
        "tenant_id",
        "current_step",
        "completed_steps",
        "answers",
        "actor_mode",
        "actor_user_id",
        "is_complete",
        "metadata"
      )
      VALUES (
        v_tenant."id",
        'company',
        '[]'::jsonb,
        '{}'::jsonb,
        'tenant_self_service',
        v_user_id,
        false,
        '{"source":"resolve_current_portal_user"}'::jsonb
      )
      ON CONFLICT ("tenant_id") DO NOTHING;
    END IF;

    IF to_regclass('public.tenant_billing_profiles') IS NOT NULL THEN
      INSERT INTO "public"."tenant_billing_profiles" ("tenant_id")
      VALUES (v_tenant."id")
      ON CONFLICT ("tenant_id") DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_user_id,
    'authUserId', v_user_id,
    'tenantId', v_tenant."id",
    'tenant', jsonb_build_object(
      'id', v_tenant."id",
      'name', v_tenant."name",
      'slug', v_tenant."slug",
      'status', v_tenant."status",
      'defaultTimezone', v_tenant."default_timezone",
      'businessNiche', v_tenant."business_niche"
    ),
    'tenantRole', v_tenant_user."role",
    'tenantUserId', v_tenant_user."id",
    'email', v_email,
    'name', COALESCE(
      NULLIF(v_profile->>'name', ''),
      NULLIF(v_profile->>'full_name', ''),
      NULLIF(v_metadata->>'name', ''),
      NULLIF(v_metadata->>'full_name', ''),
      v_email
    ),
    'role', 'admin',
    'emailVerified', v_email_verified,
    'createdNewTenant', v_created_new_tenant,
    'redirectTo', CASE
      WHEN v_tenant."status" = 'onboarding' THEN '/onboarding'
      ELSE '/admin-dashboard'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."resolve_current_portal_user"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resolve_current_portal_user"() TO authenticated;

DO $$
DECLARE
  v_default_tenant_id uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_keep_tenant_user_id uuid;
  v_row record;
  v_email text;
  v_profile jsonb;
  v_metadata jsonb;
  v_name text;
  v_slug text;
  v_new_tenant_id uuid;
BEGIN
  SELECT tu."id"
  INTO v_keep_tenant_user_id
  FROM "public"."tenant_users" tu
  WHERE tu."tenant_id" = v_default_tenant_id
    AND tu."status" = 'active'
  ORDER BY tu."created_at" ASC, tu."id" ASC
  LIMIT 1;

  FOR v_row IN
    SELECT tu.*
    FROM "public"."tenant_users" tu
    WHERE tu."tenant_id" = v_default_tenant_id
      AND tu."status" = 'active'
      AND tu."id" IS DISTINCT FROM v_keep_tenant_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."tenant_users" existing_membership
        WHERE existing_membership."user_id" = tu."user_id"
          AND existing_membership."tenant_id" <> v_default_tenant_id
          AND existing_membership."status" = 'active'
      )
    ORDER BY tu."created_at" ASC, tu."id" ASC
  LOOP
    SELECT
      users."email",
      COALESCE(users."profile", '{}'::jsonb),
      COALESCE(users."metadata", '{}'::jsonb)
    INTO v_email, v_profile, v_metadata
    FROM "auth"."users" users
    WHERE users."id" = v_row."user_id";

    v_name := COALESCE(
      NULLIF(v_metadata->>'company_name', ''),
      NULLIF(v_metadata->>'companyName', ''),
      NULLIF(v_metadata->>'organization', ''),
      NULLIF(v_profile->>'name', ''),
      NULLIF(v_profile->>'full_name', ''),
      split_part(v_email, '@', 1) || ' Workspace',
      'New Workspace'
    );
    v_slug := "public"."unique_tenant_slug"(v_name, v_row."user_id");

    INSERT INTO "public"."tenants" (
      "name",
      "slug",
      "status",
      "default_timezone",
      "metadata"
    )
    VALUES (
      v_name,
      v_slug,
      'onboarding',
      'America/Toronto',
      jsonb_build_object(
        'source', 'tenant_isolation_repair',
        'repairedFromTenantId', v_default_tenant_id,
        'repairedTenantUserId', v_row."id"
      )
    )
    RETURNING "id" INTO v_new_tenant_id;

    UPDATE "public"."tenant_users"
    SET
      "tenant_id" = v_new_tenant_id,
      "role" = 'owner',
      "status" = 'active',
      "updated_at" = now()
    WHERE "id" = v_row."id";

    IF to_regclass('public.tenant_onboarding_progress') IS NOT NULL THEN
      INSERT INTO "public"."tenant_onboarding_progress" (
        "tenant_id",
        "current_step",
        "completed_steps",
        "answers",
        "actor_mode",
        "actor_user_id",
        "is_complete",
        "metadata"
      )
      VALUES (
        v_new_tenant_id,
        'company',
        '[]'::jsonb,
        '{}'::jsonb,
        'tenant_self_service',
        v_row."user_id",
        false,
        jsonb_build_object('source', 'tenant_isolation_repair')
      )
      ON CONFLICT ("tenant_id") DO NOTHING;
    END IF;

    IF to_regclass('public.tenant_billing_profiles') IS NOT NULL THEN
      INSERT INTO "public"."tenant_billing_profiles" ("tenant_id")
      VALUES (v_new_tenant_id)
      ON CONFLICT ("tenant_id") DO NOTHING;
    END IF;
  END LOOP;
END $$;
