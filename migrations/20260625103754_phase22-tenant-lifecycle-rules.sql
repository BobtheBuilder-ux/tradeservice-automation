CREATE TABLE IF NOT EXISTS "public"."tenant_lifecycle_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
  "max_call_attempts" integer NOT NULL DEFAULT 3,
  "channel_order" text[] NOT NULL DEFAULT ARRAY['call', 'sms', 'whatsapp', 'email']::text[],
  "voicemail_allowed" boolean NOT NULL DEFAULT false,
  "no_answer_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'first', jsonb_build_object(
      'afterAttempt', 1,
      'actionType', 'send_sms',
      'channel', 'sms',
      'delayMinutes', 10,
      'requiresConsent', true,
      'reason', 'First no-answer: send a short SMS follow-up when SMS consent and tenant setup allow it.'
    ),
    'second', jsonb_build_object(
      'afterAttempt', 2,
      'actionType', 'queue_call_attempt',
      'channel', 'call',
      'delayBusinessDays', 1,
      'respectBusinessHours', true,
      'reason', 'Second no-answer: retry the call on the next business day inside tenant calling hours.'
    ),
    'third', jsonb_build_object(
      'afterAttempt', 3,
      'actionType', 'enter_nurture',
      'preferredChannels', ARRAY['email', 'whatsapp', 'sms'],
      'reason', 'Third no-answer: move to nurture and use the best remaining consented channel.'
    )
  ),
  "busy_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'actionType', 'schedule_callback',
    'defaultDelayMinutes', 60,
    'askForConvenientTime', true,
    'respectBusinessHours', true,
    'reason', 'Busy leads should be asked for a better time or scheduled for a conservative callback.'
  ),
  "not_available_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'actionType', 'schedule_callback',
    'askForConvenientTime', true,
    'askForPreferredChannel', true,
    'respectBusinessHours', true,
    'reason', 'Unavailable leads should be routed to their preferred consented channel or a callback time.'
  ),
  "voicemail_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'actionType', 'send_recap',
    'delayMinutes', 5,
    'preferredChannels', ARRAY['sms', 'email', 'whatsapp'],
    'requiresConsent', true,
    'reason', 'After voicemail, send a short recap through the best consented channel.'
  ),
  "nurture_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'notInterestedNowDelayDays', 30,
    'checkupCadenceDays', ARRAY[7, 14, 30],
    'maxCheckups', 3,
    'preferredChannels', ARRAY['email', 'whatsapp', 'sms'],
    'stopOnBooked', true,
    'stopOnClosed', true,
    'stopOnOptOut', true,
    'reason', 'Nurture should stay friendly, consent-safe, and limited.'
  ),
  "human_review_triggers" jsonb NOT NULL DEFAULT jsonb_build_object(
    'missingConsent', true,
    'missingChannelSetup', true,
    'ambiguousIntent', true,
    'providerFailureLimit', 2,
    'repeatedFailedAttempts', true,
    'sensitiveOrComplaintLanguage', true
  ),
  "off_duty_call_policy" jsonb NOT NULL DEFAULT jsonb_build_object(
    'behavior', 'defer_to_next_business_window',
    'respectTenantBusinessHours', true,
    'reason', 'Voice calls outside tenant calling hours are deferred, not placed.'
  ),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_lifecycle_rules_tenant_unique" UNIQUE ("tenant_id"),
  CONSTRAINT "tenant_lifecycle_rules_max_attempts_check"
    CHECK ("max_call_attempts" BETWEEN 1 AND 10),
  CONSTRAINT "tenant_lifecycle_rules_channel_order_check"
    CHECK (
      cardinality("channel_order") BETWEEN 1 AND 4
      AND "channel_order" <@ ARRAY['call', 'sms', 'whatsapp', 'email']::text[]
    ),
  CONSTRAINT "tenant_lifecycle_rules_policy_objects_check"
    CHECK (
      jsonb_typeof("no_answer_policy") = 'object'
      AND jsonb_typeof("busy_policy") = 'object'
      AND jsonb_typeof("not_available_policy") = 'object'
      AND jsonb_typeof("voicemail_policy") = 'object'
      AND jsonb_typeof("nurture_policy") = 'object'
      AND jsonb_typeof("human_review_triggers") = 'object'
      AND jsonb_typeof("off_duty_call_policy") = 'object'
      AND jsonb_typeof("metadata") = 'object'
    )
);

CREATE INDEX IF NOT EXISTS "idx_tenant_lifecycle_rules_tenant"
  ON "public"."tenant_lifecycle_rules" ("tenant_id");

CREATE OR REPLACE FUNCTION "public"."tenant_lifecycle_rules_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tenant_lifecycle_rules_set_updated_at" ON "public"."tenant_lifecycle_rules";
CREATE TRIGGER "tenant_lifecycle_rules_set_updated_at"
BEFORE UPDATE ON "public"."tenant_lifecycle_rules"
FOR EACH ROW EXECUTE FUNCTION "public"."tenant_lifecycle_rules_set_updated_at"();

CREATE OR REPLACE FUNCTION "public"."prevent_tenant_lifecycle_rules_tenant_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
    RAISE EXCEPTION 'tenant_lifecycle_rules.tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tenant_lifecycle_rules_prevent_tenant_change" ON "public"."tenant_lifecycle_rules";
CREATE TRIGGER "tenant_lifecycle_rules_prevent_tenant_change"
BEFORE UPDATE ON "public"."tenant_lifecycle_rules"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_tenant_lifecycle_rules_tenant_change"();

ALTER TABLE "public"."tenant_lifecycle_rules" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_lifecycle_rules_tenant_members_select" ON "public"."tenant_lifecycle_rules";
CREATE POLICY "tenant_lifecycle_rules_tenant_members_select"
ON "public"."tenant_lifecycle_rules"
FOR SELECT TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "tenant_lifecycle_rules_tenant_admins_insert" ON "public"."tenant_lifecycle_rules";
CREATE POLICY "tenant_lifecycle_rules_tenant_admins_insert"
ON "public"."tenant_lifecycle_rules"
FOR INSERT TO authenticated
WITH CHECK (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

DROP POLICY IF EXISTS "tenant_lifecycle_rules_tenant_admins_update" ON "public"."tenant_lifecycle_rules";
CREATE POLICY "tenant_lifecycle_rules_tenant_admins_update"
ON "public"."tenant_lifecycle_rules"
FOR UPDATE TO authenticated
USING (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
)
WITH CHECK (
  "public"."current_user_is_active_tenant_member"("tenant_id")
  OR "public"."current_user_is_platform_admin"()
);

GRANT SELECT, INSERT ON "public"."tenant_lifecycle_rules" TO authenticated;
REVOKE UPDATE ON "public"."tenant_lifecycle_rules" FROM anon, authenticated;
GRANT UPDATE (
  "max_call_attempts",
  "channel_order",
  "voicemail_allowed",
  "no_answer_policy",
  "busy_policy",
  "not_available_policy",
  "voicemail_policy",
  "nurture_policy",
  "human_review_triggers",
  "off_duty_call_policy",
  "metadata"
) ON "public"."tenant_lifecycle_rules" TO authenticated;
REVOKE DELETE ON "public"."tenant_lifecycle_rules" FROM anon, authenticated;

INSERT INTO "public"."tenant_lifecycle_rules" ("tenant_id", "metadata")
SELECT
  "id",
  jsonb_build_object('source', 'phase22_default_backfill')
FROM "public"."tenants"
ON CONFLICT ("tenant_id") DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."ensure_tenant_lifecycle_rules"(p_tenant_id uuid)
RETURNS "public"."tenant_lifecycle_rules"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rules "public"."tenant_lifecycle_rules";
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  INSERT INTO "public"."tenant_lifecycle_rules" ("tenant_id", "metadata")
  VALUES (p_tenant_id, jsonb_build_object('source', 'phase22_ensure_default'))
  ON CONFLICT ("tenant_id") DO NOTHING;

  SELECT *
  INTO v_rules
  FROM "public"."tenant_lifecycle_rules"
  WHERE "tenant_id" = p_tenant_id;

  IF v_rules."id" IS NULL THEN
    RAISE EXCEPTION 'tenant lifecycle rules were not found';
  END IF;

  RETURN v_rules;
END;
$$;

REVOKE ALL ON FUNCTION "public"."ensure_tenant_lifecycle_rules"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."ensure_tenant_lifecycle_rules"(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION "public"."get_effective_tenant_lifecycle_rules"(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rules "public"."tenant_lifecycle_rules";
BEGIN
  v_rules := "public"."ensure_tenant_lifecycle_rules"(p_tenant_id);

  RETURN jsonb_build_object(
    'tenantId', v_rules."tenant_id",
    'maxCallAttempts', v_rules."max_call_attempts",
    'channelOrder', to_jsonb(v_rules."channel_order"),
    'voicemailAllowed', v_rules."voicemail_allowed",
    'noAnswerPolicy', v_rules."no_answer_policy",
    'busyPolicy', v_rules."busy_policy",
    'notAvailablePolicy', v_rules."not_available_policy",
    'voicemailPolicy', v_rules."voicemail_policy",
    'nurturePolicy', v_rules."nurture_policy",
    'humanReviewTriggers', v_rules."human_review_triggers",
    'offDutyCallPolicy', v_rules."off_duty_call_policy",
    'metadata', v_rules."metadata",
    'updatedAt', v_rules."updated_at"
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_effective_tenant_lifecycle_rules"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_effective_tenant_lifecycle_rules"(uuid) TO anon, authenticated;
