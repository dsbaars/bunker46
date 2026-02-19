# Bunker46

A modern, secure NIP-46 Nsec Bunker management tool built with TypeScript.

## Stack

| Layer        | Technology                                                          |
| ------------ | ------------------------------------------------------------------- |
| **Frontend** | Vue 3, Vite 7, Tailwind CSS v4, shadcn-vue, nanostores, localforage |
| **Backend**  | NestJS 11, Fastify, Prisma ORM, nostr-tools                         |
| **Database** | PostgreSQL 17                                                       |
| **Auth**     | JWT + Argon2, TOTP (otplib), WebAuthn/Passkeys (@simplewebauthn)    |
| **Testing**  | Vitest, Playwright, eslint-plugin-security                          |
| **Infra**    | Docker, Docker Compose, Node 24, pnpm 10                            |

## Architecture

```
bunker46/
├── apps/
│   ├── server/          # NestJS + Fastify backend
│   │   ├── src/
│   │   │   ├── auth/    # JWT, TOTP, WebAuthn
│   │   │   ├── bunker/  # NIP-46 RPC handler, relay pool, URI parsing
│   │   │   ├── connections/ # CRUD for bunker connections & permissions
│   │   │   ├── logging/ # Signing logs & dashboard stats
│   │   │   ├── users/   # User management
│   │   │   ├── prisma/  # Database service
│   │   │   └── common/  # Encryption, guards, interceptors
│   │   └── prisma/      # Schema & migrations
│   └── web/             # Vue 3 SPA
│       ├── src/
│       │   ├── components/ # UI components (shadcn-style)
│       │   ├── views/     # Route views
│       │   ├── stores/    # nanostores + localforage
│       │   ├── router/    # Vue Router
│       │   └── lib/       # API client, utilities
│       └── e2e/          # Playwright E2E tests
├── packages/
│   ├── shared-types/    # Zod schemas & TypeScript types
│   ├── config/          # Environment config & constants
│   ├── tsconfig/        # Shared TypeScript configs
│   └── eslint-config/   # Shared ESLint configs
├── docker-compose.yml   # Production Docker Compose
└── docker-compose.dev.yml # Dev services (DB, Redis)
```

## Quick Start

### Prerequisites

- Node.js >= 24
- pnpm >= 10
- Docker & Docker Compose (for database)

### Development

```bash
# Install dependencies
pnpm install

# Start database services
docker compose -f docker-compose.dev.yml up -d

# Copy environment config
cp .env.example .env

# Generate Prisma client & run migrations
pnpm db:generate
pnpm db:migrate

# Start dev servers (backend + frontend)
pnpm dev
```

The frontend will be available at `http://localhost:5173` and the API at `http://localhost:3000`.

### Testing

```bash
# Run all unit/integration tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run E2E tests (Playwright)
pnpm e2e

# Run E2E with UI
pnpm e2e:ui

# Lint (includes security rules)
pnpm lint

# Security-specific lint
pnpm lint:security
```

### Production (Docker)

```bash
# Build and run all services
docker compose up --build

# Access the application
open http://localhost:8080
```

## NIP-46 Implementation

This tool implements the full [NIP-46 Nostr Remote Signing](https://nips.nostr.com/46) specification:

- **URI Support**: Parse and generate both `bunker://` and `nostrconnect://` URIs
- **All RPC Methods**: `connect`, `sign_event`, `ping`, `get_public_key`, `nip04_encrypt/decrypt`, `nip44_encrypt/decrypt`, `switch_relays`
- **Fine-grained Permissions**: Per-connection method and event kind restrictions
- **NIP-44 Encryption**: All communication encrypted using NIP-44
- **Auth Challenges**: Support for out-of-band authentication
- **Relay Management**: Configurable relays per connection with automatic reconnection

## Security

- Private keys (nsecs) are encrypted at rest using AES-256-GCM
- Passwords hashed with Argon2
- 2FA via TOTP and WebAuthn/Passkeys
- JWT with short-lived access tokens and refresh token rotation
- HTTP-only secure cookies option
- Security ESLint rules enforced
- Non-root Docker containers

## License

MIT
