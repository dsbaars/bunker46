-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LogResult" AS ENUM ('APPROVED', 'DENIED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "date_format" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "time_format" TEXT NOT NULL DEFAULT '12h',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "totp_verified" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "credential_public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL DEFAULT 'My Passkey',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nsec_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "encrypted_nsec" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default Key',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nsec_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bunker_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nsec_key_id" TEXT NOT NULL,
    "client_pubkey" TEXT NOT NULL,
    "remote_pubkey" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Unnamed Connection',
    "logo_url" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "relays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" TEXT,
    "logging_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_activity" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bunker_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_permissions" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "kind" INTEGER,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "connection_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_logs" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "event_kind" INTEGER,
    "result" "LogResult" NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relay_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "is_healthy" BOOLEAN NOT NULL DEFAULT true,
    "last_check" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relay_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

-- CreateIndex
CREATE INDEX "nsec_keys_user_id_idx" ON "nsec_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "nsec_keys_user_id_public_key_key" ON "nsec_keys"("user_id", "public_key");

-- CreateIndex
CREATE INDEX "bunker_connections_user_id_idx" ON "bunker_connections"("user_id");

-- CreateIndex
CREATE INDEX "bunker_connections_client_pubkey_idx" ON "bunker_connections"("client_pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "bunker_connections_client_pubkey_nsec_key_id_key" ON "bunker_connections"("client_pubkey", "nsec_key_id");

-- CreateIndex
CREATE INDEX "connection_permissions_connection_id_idx" ON "connection_permissions"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_permissions_connection_id_method_kind_key" ON "connection_permissions"("connection_id", "method", "kind");

-- CreateIndex
CREATE INDEX "signing_logs_connection_id_idx" ON "signing_logs"("connection_id");

-- CreateIndex
CREATE INDEX "signing_logs_created_at_idx" ON "signing_logs"("created_at");

-- CreateIndex
CREATE INDEX "signing_logs_method_idx" ON "signing_logs"("method");

-- CreateIndex
CREATE INDEX "relay_configs_user_id_idx" ON "relay_configs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "relay_configs_user_id_url_key" ON "relay_configs"("user_id", "url");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nsec_keys" ADD CONSTRAINT "nsec_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bunker_connections" ADD CONSTRAINT "bunker_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bunker_connections" ADD CONSTRAINT "bunker_connections_nsec_key_id_fkey" FOREIGN KEY ("nsec_key_id") REFERENCES "nsec_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_permissions" ADD CONSTRAINT "connection_permissions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "bunker_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_logs" ADD CONSTRAINT "signing_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "bunker_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relay_configs" ADD CONSTRAINT "relay_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
