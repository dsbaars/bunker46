-- Grandfather existing permission-less connections into the new default-deny permission model.
--
-- Before this change an empty permission set meant "allow everything" (fail-open). The NIP-46 RPC
-- handler is now default-deny, and newly created connections are seeded with a conservative default
-- set in application code. Existing ACTIVE/PENDING connections that currently have NO permission
-- rows were operating under the old allow-all behaviour; denying them outright would break live
-- signers. To avoid downtime we make their previous implicit access EXPLICIT: one method-level row
-- (kind = NULL = all kinds for sign_event) per gated capability method. Operators should review and
-- tighten these in the dashboard afterwards. New connections are unaffected (seeded at creation).
--
-- Idempotent: re-running is a no-op because the NOT EXISTS guard skips any connection that already
-- has permission rows.
INSERT INTO "connection_permissions" ("id", "connection_id", "method", "kind", "allowed")
SELECT gen_random_uuid()::text, c."id", m."method", NULL, true
FROM "bunker_connections" c
CROSS JOIN (VALUES
  ('sign_event'),
  ('nip04_encrypt'),
  ('nip04_decrypt'),
  ('nip44_encrypt'),
  ('nip44_decrypt')
) AS m("method")
WHERE c."status" IN ('ACTIVE', 'PENDING')
  AND NOT EXISTS (
    SELECT 1 FROM "connection_permissions" p WHERE p."connection_id" = c."id"
  );
