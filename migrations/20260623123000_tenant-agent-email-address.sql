ALTER TABLE "public"."tenant_agents"
  ADD COLUMN IF NOT EXISTS "email_address" varchar(255),
  ADD COLUMN IF NOT EXISTS "email_local_part" varchar(120),
  ADD COLUMN IF NOT EXISTS "email_domain" varchar(255),
  ADD COLUMN IF NOT EXISTS "email_configured_at" timestamp with time zone;

WITH base_aliases AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        trim(both '.' FROM regexp_replace(lower(trim(display_name)), '[^a-z0-9]+', '.', 'g')),
        ''
      ),
      'bob'
    ) AS base_local_part
  FROM "public"."tenant_agents"
  WHERE email_address IS NULL
),
ranked_aliases AS (
  SELECT
    ta.id,
    CASE
      WHEN row_number() OVER (PARTITION BY ba.base_local_part ORDER BY ta.created_at ASC, ta.id ASC) = 1
        THEN ba.base_local_part
      ELSE concat(ba.base_local_part, '.', left(ta.id::text, 8))
    END AS local_part
  FROM "public"."tenant_agents" ta
  JOIN base_aliases ba ON ba.id = ta.id
)
UPDATE "public"."tenant_agents" ta
SET
  email_local_part = ranked_aliases.local_part,
  email_domain = 'setmymeet.ca',
  email_address = concat(ranked_aliases.local_part, '@setmymeet.ca'),
  email_configured_at = COALESCE(ta.email_configured_at, now()),
  metadata = COALESCE(ta.metadata, '{}'::jsonb) || jsonb_build_object(
    'emailAddress',
    concat(ranked_aliases.local_part, '@setmymeet.ca')
  ),
  updated_at = now()
FROM ranked_aliases
WHERE ta.id = ranked_aliases.id
  AND ta.email_address IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_agents_email_address_format_check'
  ) THEN
    ALTER TABLE "public"."tenant_agents"
      ADD CONSTRAINT "tenant_agents_email_address_format_check"
      CHECK (
        email_address IS NULL
        OR email_address ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_agents_email_address_unique"
  ON "public"."tenant_agents" (lower(email_address))
  WHERE email_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_tenant_agents_email_domain_local"
  ON "public"."tenant_agents" (email_domain, email_local_part)
  WHERE email_address IS NOT NULL;
