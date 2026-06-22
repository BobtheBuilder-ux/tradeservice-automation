DROP POLICY IF EXISTS "business_niches_select" ON "public"."business_niches";
CREATE POLICY "business_niches_select"
  ON "public"."business_niches"
  FOR SELECT
  TO authenticated
  USING (
    "status" = 'active'
    OR "public"."current_user_is_platform_admin"()
  );
