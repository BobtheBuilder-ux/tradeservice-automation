CREATE OR REPLACE FUNCTION "public"."user_belongs_to_tenant"(p_tenant_id uuid)
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
  );
$$;

REVOKE ALL ON FUNCTION "public"."user_belongs_to_tenant"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."user_belongs_to_tenant"(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS "public"."tenant_knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "tenant_agent_id" uuid REFERENCES "public"."tenant_agents"("id") ON DELETE set null,
  "title" varchar(255) NOT NULL,
  "source_type" varchar(40) NOT NULL,
  "source_url" text,
  "body_text" text,
  "storage_url" text,
  "storage_key" text,
  "mime_type" varchar(160),
  "file_size" bigint,
  "elevenlabs_document_id" varchar(255),
  "status" varchar(40) DEFAULT 'uploaded' NOT NULL,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_knowledge_documents_title_not_blank" CHECK (length(trim("title")) > 0),
  CONSTRAINT "tenant_knowledge_documents_source_type_check" CHECK ("source_type" IN ('file', 'url', 'text')),
  CONSTRAINT "tenant_knowledge_documents_status_check" CHECK ("status" IN ('uploaded', 'processing', 'ready', 'failed')),
  CONSTRAINT "tenant_knowledge_documents_file_size_check" CHECK ("file_size" IS NULL OR "file_size" >= 0),
  CONSTRAINT "tenant_knowledge_documents_source_payload_check" CHECK (
    ("source_type" = 'file' AND "storage_key" IS NOT NULL)
    OR ("source_type" = 'url' AND "source_url" IS NOT NULL)
    OR ("source_type" = 'text' AND "body_text" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_documents_tenant_id"
  ON "public"."tenant_knowledge_documents" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_documents_agent_id"
  ON "public"."tenant_knowledge_documents" ("tenant_agent_id");

CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_documents_status"
  ON "public"."tenant_knowledge_documents" ("status");

CREATE INDEX IF NOT EXISTS "idx_tenant_knowledge_documents_source_type"
  ON "public"."tenant_knowledge_documents" ("source_type");

CREATE OR REPLACE FUNCTION "public"."validate_tenant_knowledge_document_agent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_agent_tenant_id uuid;
BEGIN
  IF NEW.tenant_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_agent_tenant_id
  FROM "public"."tenant_agents"
  WHERE id = NEW.tenant_agent_id;

  IF v_agent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_agent_id does not reference a tenant agent';
  END IF;

  IF v_agent_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_agent_id must belong to the same tenant as the knowledge document';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "validate_tenant_knowledge_document_agent_trigger"
  ON "public"."tenant_knowledge_documents";

CREATE TRIGGER "validate_tenant_knowledge_document_agent_trigger"
  BEFORE INSERT OR UPDATE OF "tenant_id", "tenant_agent_id"
  ON "public"."tenant_knowledge_documents"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."validate_tenant_knowledge_document_agent"();

DROP TRIGGER IF EXISTS "tenant_knowledge_documents_updated_at"
  ON "public"."tenant_knowledge_documents";

CREATE TRIGGER "tenant_knowledge_documents_updated_at"
  BEFORE UPDATE ON "public"."tenant_knowledge_documents"
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE "public"."tenant_knowledge_documents" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_knowledge_documents_select" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_select"
  ON "public"."tenant_knowledge_documents"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "tenant_knowledge_documents_insert" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_insert"
  ON "public"."tenant_knowledge_documents"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "tenant_knowledge_documents_update" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_update"
  ON "public"."tenant_knowledge_documents"
  FOR UPDATE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"))
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id"));

DROP POLICY IF EXISTS "tenant_knowledge_documents_delete" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_delete"
  ON "public"."tenant_knowledge_documents"
  FOR DELETE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."tenant_knowledge_documents" TO authenticated;
