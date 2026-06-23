ALTER TABLE "public"."tenants"
  ADD COLUMN IF NOT EXISTS "city" varchar(120),
  ADD COLUMN IF NOT EXISTS "country" varchar(120),
  ADD COLUMN IF NOT EXISTS "business_hours_start" time DEFAULT '10:00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "business_hours_end" time DEFAULT '17:00' NOT NULL;

ALTER TABLE "public"."tenants"
  DROP CONSTRAINT IF EXISTS "tenants_business_hours_order_check";

ALTER TABLE "public"."tenants"
  ADD CONSTRAINT "tenants_business_hours_order_check"
  CHECK ("business_hours_start" < "business_hours_end");
