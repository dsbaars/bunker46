-- Store refresh tokens hashed (HMAC-SHA256) at rest instead of plaintext.
--
-- Existing refresh tokens are stored in plaintext and cannot be re-derived into HMACs inside SQL
-- (the HMAC key lives in the application, not the database), so existing sessions are invalidated
-- during this rollout. Users simply log in again; access tokens already expire within minutes.
DELETE FROM "sessions";

-- DropIndex
DROP INDEX "sessions_refresh_token_key";

-- AlterTable
ALTER TABLE "sessions" RENAME COLUMN "refresh_token" TO "refresh_token_hash";

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
