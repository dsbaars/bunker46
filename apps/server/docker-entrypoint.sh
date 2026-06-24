#!/bin/sh
set -e
# Apply pending migrations (idempotent — a no-op when the DB is already up to date).
# Replaces the old `prisma db push`, which could not run data-preserving migrations (e.g. adding a
# NOT NULL column to a populated table). Pre-existing databases were baselined for the initial
# schema + hash-refresh-tokens migrations via `prisma migrate resolve --applied`, so only new
# migrations run here.
npx prisma migrate deploy --schema=prisma/schema.prisma
exec node dist/main.js
