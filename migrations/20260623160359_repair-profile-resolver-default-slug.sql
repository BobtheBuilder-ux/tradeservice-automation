CREATE OR REPLACE FUNCTION "public"."resolve_current_portal_user"()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_normalized text;
  v_email_verified boolean := false;
  v_profile jsonb := '{}'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_display_name text;
  v_company_name text;
  v_slug text;
  v_slug_retry integer := 0;
  v_tenant "public"."tenants"%ROWTYPE;
  v_tenant_user "public"."tenant_users"%ROWTYPE;
  v_owner_claim "public"."tenant_owner_claims"%ROWTYPE;
  v_created_new_tenant boolean := false;
  v_claimed_existing_tenant boolean := false;
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

  v_email_normalized := lower(trim(v_email));

  SELECT toc.*
  INTO v_owner_claim
  FROM "public"."tenant_owner_claims" toc
  JOIN "public"."tenants" t ON t."id" = toc."tenant_id"
  WHERE toc."email_normalized" = v_email_normalized
    AND toc."status" = 'pending'
    AND t."status" <> 'archived'
  ORDER BY toc."created_at" DESC, toc."id" DESC
  LIMIT 1;

  IF v_owner_claim."id" IS NOT NULL THEN
    SELECT *
    INTO v_tenant
    FROM "public"."tenants"
    WHERE "id" = v_owner_claim."tenant_id";

    UPDATE "public"."tenant_users"
    SET
      "status" = 'disabled',
      "updated_at" = now()
    WHERE "user_id" = v_user_id
      AND "tenant_id" <> v_tenant."id"
      AND "status" = 'active';

    INSERT INTO "public"."tenant_users" (
      "tenant_id",
      "user_id",
      "role",
      "status"
    )
    VALUES (
      v_tenant."id",
      v_user_id,
      COALESCE(v_owner_claim."role", 'owner'),
      'active'
    )
    ON CONFLICT ("tenant_id", "user_id") DO UPDATE
      SET "role" = EXCLUDED."role",
          "status" = 'active',
          "updated_at" = now()
    RETURNING * INTO v_tenant_user;

    UPDATE "public"."tenant_owner_claims"
    SET
      "status" = 'claimed',
      "claimed_by_user_id" = v_user_id,
      "claimed_at" = now(),
      "metadata" = COALESCE("metadata", '{}'::jsonb)
        || jsonb_build_object('claimedByEmail', v_email, 'source', 'resolve_current_portal_user'),
      "updated_at" = now()
    WHERE "id" = v_owner_claim."id";

    IF v_tenant."status" = 'onboarding' THEN
      UPDATE "public"."tenants"
      SET
        "status" = 'active',
        "updated_at" = now(),
        "metadata" = COALESCE("metadata", '{}'::jsonb)
          || jsonb_build_object('claimedOwnerEmail', v_email, 'claimedOwnerUserId', v_user_id)
      WHERE "id" = v_tenant."id"
      RETURNING * INTO v_tenant;
    END IF;

    IF to_regclass('public.tenant_onboarding_progress') IS NOT NULL THEN
      INSERT INTO "public"."tenant_onboarding_progress" (
        "tenant_id",
        "current_step",
        "completed_steps",
        "answers",
        "actor_mode",
        "actor_user_id",
        "is_complete",
        "completed_at",
        "metadata"
      )
      VALUES (
        v_tenant."id",
        'review',
        '["company","agent","phone","email","booking","knowledge","leads","review"]'::jsonb,
        '{}'::jsonb,
        'super_admin_assisted',
        v_user_id,
        true,
        now(),
        jsonb_build_object('source', 'tenant_owner_claim')
      )
      ON CONFLICT ("tenant_id") DO UPDATE
        SET "is_complete" = true,
            "completed_at" = COALESCE("public"."tenant_onboarding_progress"."completed_at", now()),
            "current_step" = 'review',
            "actor_user_id" = v_user_id,
            "metadata" = COALESCE("public"."tenant_onboarding_progress"."metadata", '{}'::jsonb)
              || jsonb_build_object('source', 'tenant_owner_claim'),
            "updated_at" = now();
    END IF;

    IF to_regclass('public.tenant_billing_profiles') IS NOT NULL THEN
      INSERT INTO "public"."tenant_billing_profiles" ("tenant_id")
      VALUES (v_tenant."id")
      ON CONFLICT ("tenant_id") DO NOTHING;
    END IF;

    v_claimed_existing_tenant := true;
  ELSE
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

      LOOP
        v_slug := "public"."unique_tenant_slug"(
          CASE
            WHEN v_slug_retry = 0 THEN v_company_name
            ELSE v_company_name || ' ' || v_slug_retry::text
          END,
          v_user_id
        );

        BEGIN
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

          EXIT;
        EXCEPTION WHEN unique_violation THEN
          v_slug_retry := v_slug_retry + 1;
          IF v_slug_retry > 20 THEN
            RAISE;
          END IF;
        END;
      END LOOP;

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
    'claimedExistingTenant', v_claimed_existing_tenant,
    'redirectTo', CASE
      WHEN v_claimed_existing_tenant THEN '/admin-dashboard'
      WHEN v_tenant."status" = 'onboarding' THEN '/onboarding'
      ELSE '/admin-dashboard'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."resolve_current_portal_user"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resolve_current_portal_user"() TO authenticated;
