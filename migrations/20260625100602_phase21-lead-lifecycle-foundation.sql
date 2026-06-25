CREATE OR REPLACE FUNCTION "public"."canonical_lead_stage"(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(nullif(trim(p_value), ''), 'new'))
    WHEN 'new_inquiry' THEN 'new'
    WHEN 'awaiting_information' THEN 'engaged'
    WHEN 'ready_to_book' THEN 'booking_offered'
    WHEN 'nurturing' THEN 'nurture'
    WHEN 'escalated' THEN 'contacted'
    WHEN 'interested' THEN 'engaged'
    WHEN 'not_interested' THEN 'not_interested_now'
    WHEN 'scheduled' THEN 'booked'
    WHEN 'new' THEN 'new'
    WHEN 'attempting_contact' THEN 'attempting_contact'
    WHEN 'contacted' THEN 'contacted'
    WHEN 'engaged' THEN 'engaged'
    WHEN 'qualified' THEN 'qualified'
    WHEN 'booking_offered' THEN 'booking_offered'
    WHEN 'booked' THEN 'booked'
    WHEN 'callback_scheduled' THEN 'callback_scheduled'
    WHEN 'nurture' THEN 'nurture'
    WHEN 'not_interested_now' THEN 'not_interested_now'
    WHEN 'unqualified' THEN 'unqualified'
    WHEN 'closed_won' THEN 'closed_won'
    WHEN 'closed_lost' THEN 'closed_lost'
    WHEN 'do_not_contact' THEN 'do_not_contact'
    ELSE 'new'
  END;
$$;

CREATE OR REPLACE FUNCTION "public"."canonical_scheduling_state"(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(nullif(trim(p_value), ''), 'not_started'))
    WHEN 'scheduled' THEN 'booked'
    WHEN 'booking_link_sent' THEN 'booking_offered'
    WHEN 'interested' THEN 'booking_requested'
    WHEN 'not_interested' THEN 'needs_follow_up'
    WHEN 'not_started' THEN 'not_started'
    WHEN 'callback_requested' THEN 'callback_requested'
    WHEN 'booking_requested' THEN 'booking_requested'
    WHEN 'booking_offered' THEN 'booking_offered'
    WHEN 'booked' THEN 'booked'
    WHEN 'reschedule_requested' THEN 'reschedule_requested'
    WHEN 'needs_follow_up' THEN 'needs_follow_up'
    ELSE 'not_started'
  END;
$$;

UPDATE "public"."leads"
SET
  "lead_stage" = CASE
    WHEN "do_not_contact" IS TRUE OR "opted_out_at" IS NOT NULL THEN 'do_not_contact'
    WHEN "meeting_scheduled" IS TRUE OR "status" IN ('booked', 'scheduled') THEN 'booked'
    ELSE "public"."canonical_lead_stage"("lead_stage")
  END,
  "scheduling_state" = CASE
    WHEN "meeting_scheduled" IS TRUE OR "status" IN ('booked', 'scheduled') THEN 'booked'
    ELSE "public"."canonical_scheduling_state"("scheduling_state")
  END,
  "updated_at" = now()
WHERE "lead_stage" IS DISTINCT FROM CASE
    WHEN "do_not_contact" IS TRUE OR "opted_out_at" IS NOT NULL THEN 'do_not_contact'
    WHEN "meeting_scheduled" IS TRUE OR "status" IN ('booked', 'scheduled') THEN 'booked'
    ELSE "public"."canonical_lead_stage"("lead_stage")
  END
  OR "scheduling_state" IS DISTINCT FROM CASE
    WHEN "meeting_scheduled" IS TRUE OR "status" IN ('booked', 'scheduled') THEN 'booked'
    ELSE "public"."canonical_scheduling_state"("scheduling_state")
  END;

ALTER TABLE "public"."leads"
  ALTER COLUMN "lead_stage" SET DEFAULT 'new',
  ALTER COLUMN "scheduling_state" SET DEFAULT 'not_started';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_lead_stage_phase21_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_lead_stage_phase21_check"
      CHECK ("lead_stage" IN (
        'new',
        'attempting_contact',
        'contacted',
        'engaged',
        'qualified',
        'booking_offered',
        'booked',
        'callback_scheduled',
        'nurture',
        'not_interested_now',
        'unqualified',
        'closed_won',
        'closed_lost',
        'do_not_contact'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_scheduling_state_phase21_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE "public"."leads"
      ADD CONSTRAINT "leads_scheduling_state_phase21_check"
      CHECK ("scheduling_state" IN (
        'not_started',
        'callback_requested',
        'booking_requested',
        'booking_offered',
        'booked',
        'reschedule_requested',
        'needs_follow_up'
      ));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."lead_lifecycle_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "public"."leads"("id") ON DELETE cascade,
  "source_action_id" uuid REFERENCES "public"."bob_actions"("id") ON DELETE set null,
  "source_channel" varchar(40) NOT NULL DEFAULT 'system',
  "previous_stage" varchar(50),
  "next_stage" varchar(50),
  "previous_scheduling_state" varchar(50),
  "next_scheduling_state" varchar(50),
  "outcome" varchar(60),
  "next_action_type" varchar(100),
  "next_action_channel" varchar(50),
  "next_action_at" timestamp with time zone,
  "reason" text,
  "blocked_reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_lifecycle_events_source_channel_check"
    CHECK ("source_channel" IN ('call', 'sms', 'whatsapp', 'email', 'messenger', 'manual', 'system')),
  CONSTRAINT "lead_lifecycle_events_stage_check"
    CHECK (
      ("previous_stage" IS NULL OR "previous_stage" IN ('new', 'attempting_contact', 'contacted', 'engaged', 'qualified', 'booking_offered', 'booked', 'callback_scheduled', 'nurture', 'not_interested_now', 'unqualified', 'closed_won', 'closed_lost', 'do_not_contact'))
      AND ("next_stage" IS NULL OR "next_stage" IN ('new', 'attempting_contact', 'contacted', 'engaged', 'qualified', 'booking_offered', 'booked', 'callback_scheduled', 'nurture', 'not_interested_now', 'unqualified', 'closed_won', 'closed_lost', 'do_not_contact'))
    ),
  CONSTRAINT "lead_lifecycle_events_scheduling_check"
    CHECK (
      ("previous_scheduling_state" IS NULL OR "previous_scheduling_state" IN ('not_started', 'callback_requested', 'booking_requested', 'booking_offered', 'booked', 'reschedule_requested', 'needs_follow_up'))
      AND ("next_scheduling_state" IS NULL OR "next_scheduling_state" IN ('not_started', 'callback_requested', 'booking_requested', 'booking_offered', 'booked', 'reschedule_requested', 'needs_follow_up'))
    ),
  CONSTRAINT "lead_lifecycle_events_outcome_check"
    CHECK (
      "outcome" IS NULL OR "outcome" IN (
        'answered',
        'no_answer',
        'busy',
        'voicemail_left',
        'callback_requested',
        'not_available',
        'channel_switch_requested',
        'not_interested_now',
        'not_interested_final',
        'wrong_number',
        'opted_out',
        'booked',
        'failed',
        'interrupted',
        'needs_human_review'
      )
    ),
  CONSTRAINT "lead_lifecycle_events_next_channel_check"
    CHECK ("next_action_channel" IS NULL OR "next_action_channel" IN ('call', 'voice', 'phone', 'sms', 'whatsapp', 'email', 'messenger', 'human', 'system'))
);

CREATE INDEX IF NOT EXISTS "idx_lead_lifecycle_events_tenant_lead_created"
  ON "public"."lead_lifecycle_events" ("tenant_id", "lead_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_lead_lifecycle_events_tenant_outcome"
  ON "public"."lead_lifecycle_events" ("tenant_id", "outcome", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_lead_lifecycle_events_source_action"
  ON "public"."lead_lifecycle_events" ("source_action_id")
  WHERE "source_action_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."validate_lead_lifecycle_event_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_related_tenant_id uuid;
BEGIN
  SELECT "tenant_id" INTO v_related_tenant_id
  FROM "public"."leads"
  WHERE "id" = NEW."lead_id";

  IF v_related_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Lifecycle event lead was not found';
  END IF;

  IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
    RAISE EXCEPTION 'Lifecycle event tenant_id must match lead tenant_id';
  END IF;

  IF NEW."source_action_id" IS NOT NULL THEN
    SELECT "tenant_id" INTO v_related_tenant_id
    FROM "public"."bob_actions"
    WHERE "id" = NEW."source_action_id";

    IF v_related_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Lifecycle event source action was not found';
    END IF;

    IF v_related_tenant_id IS DISTINCT FROM NEW."tenant_id" THEN
      RAISE EXCEPTION 'Lifecycle event tenant_id must match source action tenant_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "lead_lifecycle_events_validate_tenant" ON "public"."lead_lifecycle_events";
CREATE TRIGGER "lead_lifecycle_events_validate_tenant"
BEFORE INSERT OR UPDATE OF "tenant_id", "lead_id", "source_action_id"
ON "public"."lead_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION "public"."validate_lead_lifecycle_event_tenant"();

CREATE OR REPLACE FUNCTION "public"."prevent_lead_lifecycle_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_lifecycle_events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS "lead_lifecycle_events_prevent_update" ON "public"."lead_lifecycle_events";
CREATE TRIGGER "lead_lifecycle_events_prevent_update"
BEFORE UPDATE ON "public"."lead_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_lead_lifecycle_event_mutation"();

ALTER TABLE "public"."lead_lifecycle_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_lifecycle_events_tenant_members_select" ON "public"."lead_lifecycle_events";
CREATE POLICY "lead_lifecycle_events_tenant_members_select"
ON "public"."lead_lifecycle_events"
FOR SELECT TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "lead_lifecycle_events_tenant_members_insert" ON "public"."lead_lifecycle_events";
CREATE POLICY "lead_lifecycle_events_tenant_members_insert"
ON "public"."lead_lifecycle_events"
FOR INSERT TO anon, authenticated
WITH CHECK (true);

GRANT SELECT ON "public"."lead_lifecycle_events" TO authenticated;
GRANT INSERT ON "public"."lead_lifecycle_events" TO anon, authenticated;
REVOKE UPDATE, DELETE ON "public"."lead_lifecycle_events" FROM anon, authenticated;

INSERT INTO "public"."lead_lifecycle_events" (
  "tenant_id",
  "lead_id",
  "source_channel",
  "next_stage",
  "next_scheduling_state",
  "reason",
  "metadata"
)
SELECT
  "tenant_id",
  "id",
  'system',
  "lead_stage",
  "scheduling_state",
  'Phase 21 lifecycle baseline recorded from existing lead state.',
  jsonb_build_object('source', 'phase21_migration_baseline')
FROM "public"."leads"
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."lead_lifecycle_events" existing
  WHERE existing."tenant_id" = "leads"."tenant_id"
    AND existing."lead_id" = "leads"."id"
    AND existing."metadata"->>'source' = 'phase21_migration_baseline'
);
