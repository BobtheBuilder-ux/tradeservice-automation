-- Repair bulk email access to use the project's tenant membership helper.
-- User JWTs do not reliably include tenant_id, so policies must resolve the
-- tenant through tenant_users/auth.uid() like the rest of the app.

DROP POLICY IF EXISTS "tenant_bulk_email_campaigns_tenant_isolation"
  ON "public"."tenant_bulk_email_campaigns";
DROP POLICY IF EXISTS "tenant_bulk_email_recipients_tenant_isolation"
  ON "public"."tenant_bulk_email_recipients";

CREATE POLICY "tenant_bulk_email_campaigns_tenant_isolation"
  ON "public"."tenant_bulk_email_campaigns"
  FOR ALL
  TO authenticated
  USING ("public"."current_user_is_active_tenant_member"("tenant_id"))
  WITH CHECK ("public"."current_user_is_active_tenant_member"("tenant_id"));

CREATE POLICY "tenant_bulk_email_recipients_tenant_isolation"
  ON "public"."tenant_bulk_email_recipients"
  FOR ALL
  TO authenticated
  USING ("public"."current_user_is_active_tenant_member"("tenant_id"))
  WITH CHECK ("public"."current_user_is_active_tenant_member"("tenant_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."tenant_bulk_email_campaigns" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."tenant_bulk_email_recipients" TO authenticated;
