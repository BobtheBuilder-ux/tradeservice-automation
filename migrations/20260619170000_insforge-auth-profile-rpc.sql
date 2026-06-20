CREATE OR REPLACE FUNCTION "public"."resolve_current_portal_user"()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "public", "auth"
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_verified boolean := false;
  v_profile jsonb := '{}'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_tenant "public"."tenants"%ROWTYPE;
  v_tenant_user "public"."tenant_users"%ROWTYPE;
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

  INSERT INTO "public"."tenants" (
    "id",
    "name",
    "slug",
    "status",
    "default_timezone",
    "metadata"
  )
  VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'Default Tenant',
    'default',
    'active',
    'America/Toronto',
    '{"source":"auth_profile_rpc"}'::jsonb
  )
  ON CONFLICT ("id") DO UPDATE
    SET "status" = 'active',
        "updated_at" = now()
  RETURNING * INTO v_tenant;

  INSERT INTO "public"."tenant_users" (
    "tenant_id",
    "user_id",
    "role",
    "status"
  )
  VALUES (
    v_tenant.id,
    v_user_id,
    'admin',
    'active'
  )
  ON CONFLICT ("tenant_id", "user_id") DO UPDATE
    SET "role" = 'admin',
        "status" = 'active',
        "updated_at" = now()
  RETURNING * INTO v_tenant_user;

  INSERT INTO "public"."tenant_agents" (
    "tenant_id",
    "created_by_user_id",
    "display_name",
    "template_key",
    "status",
    "metadata"
  )
  SELECT
    v_tenant.id,
    v_user_id,
    'Bob',
    'bob-default',
    'testing',
    '{"source":"auth_profile_rpc"}'::jsonb
  WHERE to_regclass('public.tenant_agents') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."tenant_agents" existing_agent
      WHERE existing_agent."tenant_id" = v_tenant.id
        AND existing_agent."template_key" = 'bob-default'
        AND existing_agent."status" <> 'archived'
    );

  RETURN jsonb_build_object(
    'id', v_user_id,
    'authUserId', v_user_id,
    'tenantId', v_tenant.id,
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'name', v_tenant.name,
      'slug', v_tenant.slug,
      'status', v_tenant.status,
      'defaultTimezone', v_tenant.default_timezone
    ),
    'tenantRole', v_tenant_user.role,
    'tenantUserId', v_tenant_user.id,
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
    'redirectTo', '/admin-dashboard'
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."resolve_current_portal_user"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resolve_current_portal_user"() TO authenticated;
