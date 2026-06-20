ALTER TABLE "public"."tenant_agents"
  ALTER COLUMN "template_key" SET DEFAULT 'custom-agent';

UPDATE "public"."tenant_agents"
SET "status" = 'testing',
    "updated_at" = now()
WHERE "status" = 'draft';

UPDATE "public"."tenant_agents"
SET "status" = 'testing',
    "updated_at" = now()
WHERE "template_key" = 'bob-default'
  AND "status" = 'paused';
