ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."platform_knowledge_documents"
  ADD COLUMN IF NOT EXISTS "error_message" text;

DROP POLICY IF EXISTS "storage_objects_platform_knowledge_select" ON storage.objects;
CREATE POLICY "storage_objects_platform_knowledge_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket = 'platform-knowledge'
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."platform_knowledge_documents" pkd
        JOIN "public"."tenant_users" tu ON tu."user_id" = auth.uid()
        JOIN "public"."tenants" t ON t."id" = tu."tenant_id"
        WHERE pkd."storage_key" = storage.objects.key
          AND pkd."status" <> 'archived'
          AND tu."status" = 'active'
          AND (
            pkd."scope" = 'global'
            OR (pkd."scope" = 'niche' AND pkd."niche_key" = t."business_niche")
            OR EXISTS (
              SELECT 1
              FROM "public"."tenant_knowledge_assignments" tka
              WHERE tka."tenant_id" = tu."tenant_id"
                AND tka."platform_knowledge_document_id" = pkd."id"
                AND tka."status" = 'active'
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "storage_objects_platform_knowledge_insert" ON storage.objects;
CREATE POLICY "storage_objects_platform_knowledge_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket = 'platform-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND "public"."current_user_is_platform_admin"()
  );

DROP POLICY IF EXISTS "storage_objects_platform_knowledge_update" ON storage.objects;
CREATE POLICY "storage_objects_platform_knowledge_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket = 'platform-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND "public"."current_user_is_platform_admin"()
  )
  WITH CHECK (
    bucket = 'platform-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND "public"."current_user_is_platform_admin"()
  );

DROP POLICY IF EXISTS "storage_objects_platform_knowledge_delete" ON storage.objects;
CREATE POLICY "storage_objects_platform_knowledge_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket = 'platform-knowledge'
    AND "public"."current_user_is_platform_admin"()
  );

DROP POLICY IF EXISTS "platform_knowledge_documents_select" ON "public"."platform_knowledge_documents";
CREATE POLICY "platform_knowledge_documents_select"
  ON "public"."platform_knowledge_documents"
  FOR SELECT
  TO authenticated
  USING (
    "public"."current_user_is_platform_admin"()
    OR (
      "status" <> 'archived'
      AND EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        JOIN "public"."tenants" t ON t."id" = tu."tenant_id"
        WHERE tu."user_id" = auth.uid()
          AND tu."status" = 'active'
          AND (
            "platform_knowledge_documents"."scope" = 'global'
            OR (
              "platform_knowledge_documents"."scope" = 'niche'
              AND "platform_knowledge_documents"."niche_key" = t."business_niche"
            )
            OR EXISTS (
              SELECT 1
              FROM "public"."tenant_knowledge_assignments" tka
              WHERE tka."tenant_id" = tu."tenant_id"
                AND tka."platform_knowledge_document_id" = "platform_knowledge_documents"."id"
                AND tka."status" = 'active'
            )
          )
      )
    )
  );

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
