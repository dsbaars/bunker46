#!/bin/sh
set -e
# Sync DB schema (creates tables if none exist; use migrate deploy once you have migration files)
npx prisma db push --schema=prisma/schema.prisma
exec node dist/main.js
