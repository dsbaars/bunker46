-- Preserve audit logs after a connection is deleted.
--
-- Previously signing_logs.connection_id was NOT NULL with ON DELETE CASCADE, so deleting a
-- connection wiped its entire signing history. We now decouple the log from the connection
-- lifecycle: the FK becomes nullable + ON DELETE SET NULL, and the owning user, connection name
-- and client pubkey are denormalized onto each log so an orphaned record stays scoped to its
-- user and remains readable. Deleting a *user* still purges their logs (new FK below cascades).

-- AlterTable: add denormalized columns (nullable first so existing rows can be backfilled)
ALTER TABLE "signing_logs"
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "connection_name" TEXT,
  ADD COLUMN "client_pubkey" TEXT;

-- Backfill from the connections that still exist (every current log has a valid connection,
-- since the old FK was NOT NULL + CASCADE, so there are no orphans to leave behind).
UPDATE "signing_logs" sl
SET "user_id" = bc."user_id",
    "connection_name" = bc."name",
    "client_pubkey" = bc."client_pubkey"
FROM "bunker_connections" bc
WHERE sl."connection_id" = bc."id";

-- Enforce NOT NULL now that the columns are populated
ALTER TABLE "signing_logs"
  ALTER COLUMN "user_id" SET NOT NULL,
  ALTER COLUMN "connection_name" SET NOT NULL,
  ALTER COLUMN "client_pubkey" SET NOT NULL;

-- Make connection_id nullable so ON DELETE SET NULL can apply
ALTER TABLE "signing_logs" ALTER COLUMN "connection_id" DROP NOT NULL;

-- Swap the connection FK from CASCADE to SET NULL
ALTER TABLE "signing_logs" DROP CONSTRAINT "signing_logs_connection_id_fkey";
ALTER TABLE "signing_logs" ADD CONSTRAINT "signing_logs_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "bunker_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add the user FK (CASCADE so deleting a user still purges their audit logs)
ALTER TABLE "signing_logs" ADD CONSTRAINT "signing_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for user-scoped log queries
CREATE INDEX "signing_logs_user_id_idx" ON "signing_logs"("user_id");
