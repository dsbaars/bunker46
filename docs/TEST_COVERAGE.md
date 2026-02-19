# Test coverage completeness

This document maps existing tests to app features and lists gaps. Use it to prioritize new tests.

## Current test inventory

### E2E (Playwright) – 3 files, 7 tests

| File                               | What it covers                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/e2e/auth.spec.ts`        | Login page default, register link, navigate to register, validation error on empty login, TOTP page visible |
| `apps/web/e2e/dashboard.spec.ts`   | Redirect to login when unauthenticated                                                                      |
| `apps/web/e2e/connections.spec.ts` | Redirect to login when not authenticated                                                                    |

**Config:** E2E now starts the full stack from monorepo root (`pnpm dev` → server + web) so API calls work without a separate terminal.

### Unit / integration (Vitest)

| Package                 | File                                           | What it covers                                                   |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web`              | `src/lib/utils.spec.ts`                        | `cn()` class merge utility                                       |
| `apps/web`              | `src/stores/auth.spec.ts`                      | Auth store: unauthenticated, setTokens, TOTP requirement, logout |
| `packages/shared-types` | `src/permissions.spec.ts`                      | Permission parse/format/list and wildcard checks                 |
| `apps/server`           | `src/bunker/bunker-uri.service.spec.ts`        | Bunker URI parse/build, nostrconnect parse                       |
| `apps/server`           | `src/common/crypto/encryption.service.spec.ts` | Encrypt/decrypt string, distinct ciphertexts                     |

---

## Gaps

### E2E – high impact

- **Auth flows (full stack)**
  - Register: submit form, see success or validation errors.
  - Login: valid credentials → redirect to dashboard; invalid → error message.
  - (Optional) TOTP: login with TOTP user → 2FA page → enter code → dashboard. E2E has a skipped test for this; implementing it would require a seeded test user with TOTP enabled and a known secret to generate codes.
  - (Optional) Passkey: can be skipped or mocked; real passkey is device-dependent.

- **Dashboard (authenticated)**
  - After login, dashboard loads; stats (sessions, connections, actions) or “empty” state visible.
  - Protects against regressions in stats API and layout.

- **Keys**
  - List keys (empty vs existing).
  - Add nsec key (form + success or validation).
  - (Optional) Set default key, delete key.

- **Connections**
  - List connections (empty vs existing).
  - Generate bunker URI flow (select key, optional name, copy/show URI).
  - (Optional) Import nostrconnect URI and see connection in list.
  - Open connection detail: permissions, status, last activity.
  - (Optional) Connection logs page.

- **Settings**
  - **General:** Date/time format change and persistence.
  - **Security:** TOTP enable/disable, passkey list/register/remove, change password, session list and “revoke other sessions”.
  - **Relays:** List/add/remove relays.
  - (Optional) Profile if you add editable profile fields.

- **Guards**
  - Authenticated user visiting `/login` redirects to dashboard.
  - (Already covered) Unauthenticated visiting `/dashboard` or `/connections` redirects to login.

### E2E – medium / nice-to-have

- Navigation: sidebar links (Keys, Connections, Relays, Security, Settings) from dashboard.
- Activity stream: dashboard/connections refetch when backend publishes (needs Redis in e2e or mock).
- Connection detail: revoke connection, toggle logging.

### Unit / integration – server (high value)

- **Auth**
  - `AuthService`: login (success, invalid, TOTP required), register, refresh, logout, listSessions, revokeSession, revokeAllOtherSessions, createTokens (session + sessionId in JWT).
  - Can use in-memory or test DB; avoid hitting real DB in fast unit tests if you add integration tests separately.

- **Connections**
  - `ConnectionsService`: createConnection, listConnections, getConnection, update status/logging, deleteConnection, addNsecKey, getNsecKeys, deleteNsecKey.
  - Mock Prisma or use test DB.

- **Users**
  - `UsersService`: create, findByUsername, findById, verifyPassword, updatePassword, updateUserSettings, getUserSettings, disableTotp.

- **Logging / stats**
  - `StatsService`: getDashboardStats (counts, recent activity).
  - `LoggingService`: create log, list logs for connection.

- **Bunker**
  - `BunkerService`: generateBunkerUri, parseUri (delegate to BunkerUriService), relay CRUD, status.
  - RPC handler (sign_event, connect, etc.) is heavier; consider integration test with test DB and mock relay.

- **Events**
  - `EventsService`: publish and subscribe (or mock Redis).

- **Controllers**
  - No HTTP tests today. Optional: e2e-style API tests (supertest or fetch) for critical routes (login, register, /users/me, /connections, /dashboard/stats).

### Unit / integration – web (medium value)

- **Stores**
  - `settings.ts`: load, update, clear (with mocked API).
  - `ui.ts`: sidebar collapse, theme (if used).

- **Composables**
  - `useFormatting`: formatDate, formatTime, formatDateTime with different settings.
  - `useActivityStream`: connect and refetch (mock EventSource).

- **API client**
  - `lib/api.ts`: get/post/patch/delete with auth header and error handling (mock fetch).

- **Router**
  - `beforeEach` guard: requiresAuth → redirect to login; guest + authenticated → redirect to dashboard.

- **Components / views**
  - Mostly covered indirectly by e2e. Optional: key components (e.g. StatCard, connection list item) with mocked props.

### Packages

- **shared-types**
  - `permissions.spec.ts` is solid.
  - Optional: Zod schema tests for API DTOs (auth, dashboard, connections) if you want strict validation coverage.

- **config**
  - Optional: server env parsing (valid/invalid env) if you add validation.

---

## Suggested priorities

1. **E2E full-stack auth**  
   One test: register → login → see dashboard. Uses real API; covers register, login, and auth guard.  
   Then add: login with invalid credentials shows error.

2. **E2E dashboard and connections (authenticated)**  
   Reuse the same “logged-in” setup (or a shared fixture): open dashboard, see stats or empty state; open connections, see list or empty state.  
   Then: generate bunker URI (select key, get URI) and optionally keys flow (add key, see in list).

3. **Server unit tests**  
   Start with `AuthService` (login, register, refresh, sessions) and `ConnectionsService` (list, create, get, update, delete) with mocked Prisma.  
   Then `UsersService` and `StatsService`.

4. **E2E settings**  
   Security: session list, “revoke other sessions”; general: change date format and reload.  
   Relays and passkey/TOTP can follow.

5. **Web unit**  
   `useFormatting`, settings store with mocked API, then API client with mocked fetch if you want explicit contract tests.

---

## Running tests

- **Unit / integration:**  
  `pnpm test` (all packages) or `pnpm --filter @bunker46/server run test`, `pnpm --filter @bunker46/web run test`.

- **Coverage:**  
  `pnpm test:coverage`.

- **E2E (full stack):**  
  `pnpm e2e` – starts server + web from root, then runs Playwright.  
  Ensure DB (and optionally Redis) are up, e.g. `docker compose -f docker-compose.dev.yml up -d`, and migrations run (`pnpm db:migrate`).

- **E2E with existing dev server:**  
  Start `pnpm dev` in another terminal; Playwright will reuse it when `reuseExistingServer` is true (default when not in CI).
