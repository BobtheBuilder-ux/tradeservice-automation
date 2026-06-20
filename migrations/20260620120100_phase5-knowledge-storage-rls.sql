ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_select" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket = 'tenant-knowledge'
    AND EXISTS (
      SELECT 1
      FROM "public"."tenant_users" tu
      WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
        AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
        AND tu."status" = 'active'
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
    AND EXISTS (
      SELECT 1
      FROM "public"."tenant_users" tu
      WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
        AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
        AND tu."status" = 'active'
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
    AND EXISTS (
      SELECT 1
      FROM "public"."tenant_users" tu
      WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
        AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
        AND tu."status" = 'active'
    )
  )
  WITH CHECK (
    bucket = 'tenant-knowledge'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND EXISTS (
      SELECT 1
      FROM "public"."tenant_users" tu
      WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
        AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
        AND tu."status" = 'active'
    )
  );

DROP POLICY IF EXISTS "storage_objects_tenant_knowledge_delete" ON storage.objects;
CREATE POLICY "storage_objects_tenant_knowledge_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket = 'tenant-knowledge'
    AND EXISTS (
      SELECT 1
      FROM "public"."tenant_users" tu
      WHERE tu."tenant_id"::text = (storage.foldername(key))[1]
        AND tu."user_id"::text = (SELECT auth.jwt() ->> 'sub')
        AND tu."status" = 'active'
        AND tu."role" IN ('owner', 'admin')
    )
  );

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
