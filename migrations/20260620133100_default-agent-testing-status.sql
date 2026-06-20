UPDATE "public"."tenant_agents"
SET "status" = 'testing',
    "updated_at" = now()
WHERE "template_key" = 'bob-default'
  AND "status" IN ('draft', 'paused');
