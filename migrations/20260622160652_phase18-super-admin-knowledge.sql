ALTER TABLE "public"."tenants"
  ADD COLUMN IF NOT EXISTS "business_niche" varchar(120);

CREATE OR REPLACE FUNCTION "public"."user_is_tenant_admin"(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."tenant_users" tu
    WHERE tu."tenant_id" = p_tenant_id
      AND tu."user_id" = auth.uid()
      AND tu."status" = 'active'
      AND tu."role" IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION "public"."user_is_tenant_admin"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."user_is_tenant_admin"(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."current_user_is_platform_admin"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."tenant_users" tu
    WHERE tu."user_id" = auth.uid()
      AND tu."status" = 'active'
      AND tu."role" IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION "public"."current_user_is_platform_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_is_platform_admin"() TO authenticated;

CREATE TABLE IF NOT EXISTS "public"."business_niches" (
  "key" varchar(120) PRIMARY KEY,
  "name" varchar(160) NOT NULL,
  "description" text,
  "default_playbook_notes" text,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "business_niches_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "business_niches_key_check" CHECK ("key" ~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$')
);

CREATE TABLE IF NOT EXISTS "public"."platform_knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" varchar(40) NOT NULL,
  "niche_key" varchar(120) REFERENCES "public"."business_niches"("key") ON DELETE restrict,
  "title" varchar(255) NOT NULL,
  "source_type" varchar(40) NOT NULL,
  "source_url" text,
  "body_text" text,
  "storage_url" text,
  "storage_key" text,
  "elevenlabs_document_id" varchar(255),
  "status" varchar(40) DEFAULT 'uploaded' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_knowledge_documents_scope_check" CHECK ("scope" IN ('global', 'niche')),
  CONSTRAINT "platform_knowledge_documents_source_type_check" CHECK ("source_type" IN ('file', 'url', 'text')),
  CONSTRAINT "platform_knowledge_documents_status_check" CHECK ("status" IN ('uploaded', 'processing', 'ready', 'failed', 'archived')),
  CONSTRAINT "platform_knowledge_documents_niche_scope_check" CHECK (
    ("scope" = 'global' AND "niche_key" IS NULL)
    OR ("scope" = 'niche' AND "niche_key" IS NOT NULL)
  ),
  CONSTRAINT "platform_knowledge_documents_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "public"."tenant_knowledge_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE cascade,
  "platform_knowledge_document_id" uuid NOT NULL REFERENCES "public"."platform_knowledge_documents"("id") ON DELETE cascade,
  "assignment_source" varchar(60) DEFAULT 'super_admin_override' NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "synced_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_knowledge_assignments_source_check" CHECK ("assignment_source" IN ('global_default', 'niche_default', 'super_admin_override')),
  CONSTRAINT "tenant_knowledge_assignments_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "tenant_knowledge_assignments_unique" UNIQUE ("tenant_id", "tenant_agent_id", "platform_knowledge_document_id")
);

CREATE TABLE IF NOT EXISTS "public"."super_admin_tenant_setup_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "super_admin_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE set null,
  "onboarding_progress_id" uuid,
  "current_step" varchar(80) DEFAULT 'company' NOT NULL,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "audit_summary" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "super_admin_tenant_setup_sessions_status_check" CHECK ("status" IN ('draft', 'in_progress', 'complete', 'cancelled')),
  CONSTRAINT "super_admin_tenant_setup_sessions_step_check" CHECK ("current_step" IN ('company', 'agent', 'phone', 'email', 'booking', 'knowledge', 'leads', 'review'))
);

CREATE INDEX IF NOT EXISTS "idx_tenants_business_niche" ON "public"."tenants" ("business_niche");
CREATE INDEX IF NOT EXISTS "idx_business_niches_status" ON "public"."business_niches" ("status");
CREATE INDEX IF NOT EXISTS "idx_platform_knowledge_scope_status" ON "public"."platform_knowledge_documents" ("scope", "status");
CREATE INDEX IF NOT EXISTS "idx_platform_knowledge_niche" ON "public"."platform_knowledge_documents" ("niche_key", "status");
CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_assignments_tenant" ON "public"."tenant_knowledge_assignments" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_assignments_agent" ON "public"."tenant_knowledge_assignments" ("tenant_agent_id", "status");
CREATE INDEX IF NOT EXISTS "idx_super_admin_setup_tenant" ON "public"."super_admin_tenant_setup_sessions" ("tenant_id", "status");

CREATE OR REPLACE FUNCTION "public"."validate_tenant_knowledge_assignment"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_agent_tenant_id uuid;
BEGIN
  IF NEW."tenant_agent_id" IS NOT NULL THEN
    SELECT ta."tenant_id"
    INTO v_agent_tenant_id
    FROM "public"."tenant_agents" ta
    WHERE ta."id" = NEW."tenant_agent_id";

    IF v_agent_tenant_id IS NULL OR v_agent_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Tenant knowledge assignment agent must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_tenant_knowledge_assignment" ON "public"."tenant_knowledge_assignments";
CREATE TRIGGER "validate_tenant_knowledge_assignment"
  BEFORE INSERT OR UPDATE ON "public"."tenant_knowledge_assignments"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_knowledge_assignment"();

DROP TRIGGER IF EXISTS "business_niches_updated_at" ON "public"."business_niches";
CREATE TRIGGER "business_niches_updated_at"
  BEFORE UPDATE ON "public"."business_niches"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "platform_knowledge_documents_updated_at" ON "public"."platform_knowledge_documents";
CREATE TRIGGER "platform_knowledge_documents_updated_at"
  BEFORE UPDATE ON "public"."platform_knowledge_documents"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "tenant_knowledge_assignments_updated_at" ON "public"."tenant_knowledge_assignments";
CREATE TRIGGER "tenant_knowledge_assignments_updated_at"
  BEFORE UPDATE ON "public"."tenant_knowledge_assignments"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

DROP TRIGGER IF EXISTS "super_admin_tenant_setup_sessions_updated_at" ON "public"."super_admin_tenant_setup_sessions";
CREATE TRIGGER "super_admin_tenant_setup_sessions_updated_at"
  BEFORE UPDATE ON "public"."super_admin_tenant_setup_sessions"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."business_niches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_knowledge_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."super_admin_tenant_setup_sessions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_niches_select" ON "public"."business_niches";
CREATE POLICY "business_niches_select"
  ON "public"."business_niches"
  FOR SELECT
  TO authenticated
  USING ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "business_niches_insert" ON "public"."business_niches";
CREATE POLICY "business_niches_insert"
  ON "public"."business_niches"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "business_niches_update" ON "public"."business_niches";
CREATE POLICY "business_niches_update"
  ON "public"."business_niches"
  FOR UPDATE
  TO authenticated
  USING ("public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "platform_knowledge_documents_select" ON "public"."platform_knowledge_documents";
CREATE POLICY "platform_knowledge_documents_select"
  ON "public"."platform_knowledge_documents"
  FOR SELECT
  TO authenticated
  USING ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "platform_knowledge_documents_insert" ON "public"."platform_knowledge_documents";
CREATE POLICY "platform_knowledge_documents_insert"
  ON "public"."platform_knowledge_documents"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "platform_knowledge_documents_update" ON "public"."platform_knowledge_documents";
CREATE POLICY "platform_knowledge_documents_update"
  ON "public"."platform_knowledge_documents"
  FOR UPDATE
  TO authenticated
  USING ("public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_assignments_select" ON "public"."tenant_knowledge_assignments";
CREATE POLICY "tenant_knowledge_assignments_select"
  ON "public"."tenant_knowledge_assignments"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_assignments_insert" ON "public"."tenant_knowledge_assignments";
CREATE POLICY "tenant_knowledge_assignments_insert"
  ON "public"."tenant_knowledge_assignments"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_assignments_update" ON "public"."tenant_knowledge_assignments";
CREATE POLICY "tenant_knowledge_assignments_update"
  ON "public"."tenant_knowledge_assignments"
  FOR UPDATE
  TO authenticated
  USING ("public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "super_admin_setup_sessions_select" ON "public"."super_admin_tenant_setup_sessions";
CREATE POLICY "super_admin_setup_sessions_select"
  ON "public"."super_admin_tenant_setup_sessions"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "super_admin_setup_sessions_insert" ON "public"."super_admin_tenant_setup_sessions";
CREATE POLICY "super_admin_setup_sessions_insert"
  ON "public"."super_admin_tenant_setup_sessions"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "super_admin_setup_sessions_update" ON "public"."super_admin_tenant_setup_sessions";
CREATE POLICY "super_admin_setup_sessions_update"
  ON "public"."super_admin_tenant_setup_sessions"
  FOR UPDATE
  TO authenticated
  USING ("public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."current_user_is_platform_admin"());

GRANT SELECT, INSERT, UPDATE ON "public"."business_niches" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."platform_knowledge_documents" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."tenant_knowledge_assignments" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "public"."super_admin_tenant_setup_sessions" TO authenticated;

INSERT INTO "public"."business_niches" ("key", "name", "description", "default_playbook_notes", "metadata")
VALUES
  ('insurance', 'Insurance', 'Life, health, retirement, and final-expense service businesses.', 'Qualify protection goals, household context, urgency, existing coverage, and booking readiness.', '{"source":"phase18_seed"}'::jsonb),
  ('plumbing', 'Plumbing', 'Residential and commercial plumbing service businesses.', 'Qualify issue type, urgency, property access, location, and appointment window.', '{"source":"phase18_seed"}'::jsonb),
  ('roofing', 'Roofing', 'Roof repair, replacement, inspection, and storm-damage businesses.', 'Qualify property type, damage signs, timeline, insurance involvement, and inspection availability.', '{"source":"phase18_seed"}'::jsonb),
  ('cleaning', 'Cleaning', 'Residential and commercial cleaning service businesses.', 'Qualify property size, frequency, access, scope, and preferred service window.', '{"source":"phase18_seed"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
