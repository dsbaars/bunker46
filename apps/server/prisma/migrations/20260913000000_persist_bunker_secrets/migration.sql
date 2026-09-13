-- CreateTable
CREATE TABLE "bunker_secrets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nsec_key_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Bunker46',
    "permissions" JSONB,
    "connection_id" TEXT,
    "last_used_at" TIMESTAMP(3),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bunker_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bunker_secrets_secret_hash_key" ON "bunker_secrets"("secret_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bunker_secrets_connection_id_key" ON "bunker_secrets"("connection_id");

-- CreateIndex
CREATE INDEX "bunker_secrets_nsec_key_id_idx" ON "bunker_secrets"("nsec_key_id");

-- AddForeignKey
ALTER TABLE "bunker_secrets" ADD CONSTRAINT "bunker_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bunker_secrets" ADD CONSTRAINT "bunker_secrets_nsec_key_id_fkey" FOREIGN KEY ("nsec_key_id") REFERENCES "nsec_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
