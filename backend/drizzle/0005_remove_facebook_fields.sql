-- Remove Facebook fields from leads table
-- Migration: 0005_remove_facebook_fields
-- Purpose: Remove all Facebook-related fields since switching to HubSpot direct integration

-- Drop Facebook-related indexes first
DROP INDEX IF EXISTS "idx_leads_facebook_lead_id";

-- Drop unique constraint
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_facebook_lead_id_unique";

-- Remove Facebook-related columns
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_lead_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_page_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_form_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_ad_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_adgroup_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_campaign_id";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_form_name";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_ad_name";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_campaign_name";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "facebook_raw_data";

-- Update default source from facebook_lead_ads to hubspot_crm
ALTER TABLE "leads" ALTER COLUMN "source" SET DEFAULT 'hubspot_crm';

-- Update existing records that have facebook_lead_ads as source
UPDATE "leads" SET "source" = 'hubspot_crm' WHERE "source" = 'facebook_lead_ads';