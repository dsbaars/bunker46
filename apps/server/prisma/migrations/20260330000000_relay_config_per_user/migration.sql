-- Per-user relay configuration (was global unique on url).

ALTER TABLE "relay_configs" DROP CONSTRAINT IF EXISTS "relay_configs_url_key";

ALTER TABLE "relay_configs" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

UPDATE "relay_configs" rc
SET "user_id" = (SELECT u.id FROM "users" u ORDER BY u.created_at ASC LIMIT 1)
WHERE rc."user_id" IS NULL
  AND EXISTS (SELECT 1 FROM "users");

DELETE FROM "relay_configs" WHERE "user_id" IS NULL;

ALTER TABLE "relay_configs" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "relay_configs"
  ADD CONSTRAINT "relay_configs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "relay_configs_user_id_url_key" ON "relay_configs" ("user_id", "url");

CREATE INDEX "relay_configs_user_id_idx" ON "relay_configs" ("user_id");
