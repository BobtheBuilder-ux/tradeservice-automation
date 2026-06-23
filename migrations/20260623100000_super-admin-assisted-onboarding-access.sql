ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_select" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket = 'tenant-knowledge'
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
          AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
          AND tu."status" = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_insert" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket = 'tenant-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
          AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
          AND tu."status" = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_update" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket = 'tenant-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
          AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
          AND tu."status" = 'active'
      )
    )
  )
  WITH CHECK (
    bucket = 'tenant-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
          AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
          AND tu."status" = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_delete" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket = 'tenant-knowledge'
    AND (
      "public"."current_user_is_platform_admin"()
      OR EXISTS (
        SELECT 1
        FROM "public"."tenant_users" tu
        WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
          AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
          AND tu."status" = 'active'
          AND tu."role" IN ('owner', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "tenant_knowledge_documents_select" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_select"
  ON "public"."tenant_knowledge_documents"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_documents_insert" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_insert"
  ON "public"."tenant_knowledge_documents"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_documents_update" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_update"
  ON "public"."tenant_knowledge_documents"
  FOR UPDATE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "tenant_knowledge_documents_delete" ON "public"."tenant_knowledge_documents";
CREATE POLICY "tenant_knowledge_documents_delete"
  ON "public"."tenant_knowledge_documents"
  FOR DELETE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "lead_import_batches_select" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_select"
  ON "public"."lead_import_batches"
  FOR SELECT
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "lead_import_batches_insert" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_insert"
  ON "public"."lead_import_batches"
  FOR INSERT
  TO authenticated
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

DROP POLICY IF EXISTS "lead_import_batches_update" ON "public"."lead_import_batches";
CREATE POLICY "lead_import_batches_update"
  ON "public"."lead_import_batches"
  FOR UPDATE
  TO authenticated
  USING ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"())
  WITH CHECK ("public"."user_belongs_to_tenant"("tenant_id") OR "public"."current_user_is_platform_admin"());

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
