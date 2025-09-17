ALTER TABLE "leads" DROP CONSTRAINT "leads_facebook_lead_id_unique";--> statement-breakpoint
DROP INDEX "idx_leads_facebook_lead_id";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "source" SET DEFAULT 'hubspot_crm';--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_lead_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_page_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_form_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_ad_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_adgroup_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_campaign_id";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_form_name";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_ad_name";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_campaign_name";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "facebook_raw_data";