# Jewellery ERP + Commerce Platform

A production-grade Jewellery ERP and Commerce platform for an Indian jewellery
business. Three interfaces share one backend and one MongoDB database:

| App | Path | Purpose | Dev port |
|---|---|---|---|
| ERP / admin | `apps/erp` | Internal operations — inventory, pricing, procurement, manufacturing, hallmarking, accounting, reports | `3000` |
| B2C storefront | `apps/b2c-store` | Direct-to-consumer commerce (browse, cart, checkout, payments) | `3001` |
| B2B wholesale portal | `apps/b2b-portal` | Retailer/wholesaler ordering with credit terms, quotations, invoicing | `3002` |
| API | `apps/api` | One Express process serving all three (`/api/*`, `/api/store/*`, `/api/portal/*`, `/api/b2b/*`, ...) | `4000` |

See [CLAUDE.md](CLAUDE.md) for the architectural rules this repo follows, and
[docs/](docs/) for the full design/audit docs (architecture, business rules,
data model, security, performance, production readiness, progress).

## Tech stack

- **Frontend:** React, TypeScript, Next.js 14 (App Router), Tailwind CSS, TanStack Query, React Hook Form, Zod
- **Backend:** Node.js, TypeScript, Express, Mongoose
- **Database:** MongoDB, **must be a replica set** — multi-document transactions back the inventory ledger and every other append-only event log
- **Monorepo:** pnpm workspaces (`apps/*`, `packages/*`)
- **Testing:** Vitest (unit/integration), `mongodb-memory-server` for API tests (no real DB needed to run the test suite)

## Prerequisites

- Node.js >= 20
- pnpm 9.15.9 (`corepack enable` will pick up the version pinned in `package.json`)
- MongoDB, running as a replica set — **only needed if you want to run against a real, persistent database.** For local development without installing MongoDB at all, see the "fastest way to run everything" option below, which boots an in-memory replica set for you.

## Install

```bash
pnpm install
```

This installs dependencies for every app and package in the workspace.

## Fastest way to run everything (no MongoDB install required)

The API has a `dev:memory` mode that boots a throwaway **in-memory** MongoDB
replica set (via `mongodb-memory-server`), seeds a full demo dataset — one
user per role, a seeded catalogue, inventory, pricing rules, storefront
content, and two seeded B2B wholesale accounts — and starts a sandbox
payment gateway. Nothing here touches a real database or moves real money;
everything disappears when the process stops.

**Terminal 1 — API (in-memory, seeded):**

```bash
pnpm --filter @jewellery/api dev:memory
```

On boot it prints the demo login for every role, e.g.:

```
[dev-memory] API on :4000 — demo users (password "Demo-Password-123"):
  super.admin@demo.test  (SUPER_ADMIN)
  inventory.manager@demo.test  (INVENTORY_MANAGER)
  sales.manager@demo.test  (SALES_MANAGER)
  ... one per role
```

It also prints the seeded B2B wholesale portal login(s) (same password).

**Terminal 2 — ERP admin app:**

```bash
pnpm --filter @jewellery/erp dev
```

Open http://localhost:3000 and sign in with any demo user above.

**Terminal 3 — B2C storefront:**

```bash
pnpm --filter @jewellery/b2c-store dev
```

Open http://localhost:3001 to browse the seeded catalogue and run a full
guest checkout (sandbox payment gateway — no real money moves).

**Terminal 4 — B2B wholesale portal:**

```bash
pnpm --filter @jewellery/b2b-portal dev
```

Open http://localhost:3002 and sign in with one of the seeded buyer logins
printed by the API on boot.

Or run all three frontends (with the shared root `dev` script only covering
the ERP) individually as above — there's no single "start everything"
script by design, since each app is a separate process you'll usually want
its own terminal/log stream for.

## Running against a real, persistent MongoDB

Use this once you need data to survive a restart, or you're testing
something the in-memory seed doesn't cover.

1. **Start a MongoDB replica set.** Simplest local option, a single-node
   replica set:

   ```bash
   mongod --replSet rs0 --dbpath /path/to/your/data/dir
   # in a separate shell, one-time initiation:
   mongosh --eval "rs.initiate()"
   ```

2. **Configure the API.** Copy the example env file and fill in a secret:

   ```bash
   cd apps/api
   cp .env.example .env
   ```

   At minimum, set:

   ```
   MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0
   MONGODB_DB=jewellery-erp
   JWT_ACCESS_SECRET=<32+ random chars — see the comment in .env.example for a generator command>
   ```

   The rest of `.env.example` has sensible development defaults — read the
   comments before changing anything in production.

3. **Create the first admin user** (there's no seed data against a real DB —
   `bootstrap-admin` refuses to run if a `SUPER_ADMIN` already exists):

   ```bash
   BOOTSTRAP_ADMIN_EMAIL=you@example.com \
   BOOTSTRAP_ADMIN_PASSWORD=<a real password, 10+ chars> \
   pnpm --filter @jewellery/api bootstrap-admin
   ```

4. **Start the API:**

   ```bash
   pnpm --filter @jewellery/api dev
   ```

5. **Start whichever frontend app(s) you need**, same commands as above
   (`pnpm --filter @jewellery/erp dev`, etc.). They talk to the API at
   `http://localhost:4000` by default; override with `NEXT_PUBLIC_API_URL`
   (ERP, B2B portal) or `API_URL` (B2C storefront, server-side only — the
   browser never sees the API address, see `apps/b2c-store/lib/api.ts`) if
   the API isn't on localhost.

Note: with a real database there's no seeded catalogue, pricing rules, or
inventory — you'll need to create them through the ERP screens (Product
Master, Pricing Playground, Inventory) before the storefront or B2B portal
have anything to show.

## Common commands (run from the repo root)

```bash
pnpm install        # install all workspace dependencies
pnpm dev             # shortcut for `pnpm --filter @jewellery/erp dev`
pnpm build           # production build of every app/package
pnpm typecheck       # tsc --noEmit across the whole workspace
pnpm lint            # lint every app
pnpm test            # run every test suite (apps/api, apps/erp, apps/b2c-store, apps/b2b-portal, packages/pricing-engine)
```

To scope any of these to one app/package, use `pnpm --filter <name> <script>`,
e.g. `pnpm --filter @jewellery/api test` or `pnpm --filter @jewellery/erp build`.

Package names (for `--filter`): `@jewellery/api`, `@jewellery/erp`,
`@jewellery/b2c-store`, `@jewellery/b2b-portal`, `@jewellery/pricing-engine`,
`@jewellery/types`, `@jewellery/validation`, `@jewellery/ui`, `@jewellery/config`.

### Production builds

```bash
pnpm --filter @jewellery/erp build && pnpm --filter @jewellery/erp start        # :3000
pnpm --filter @jewellery/b2c-store build && pnpm --filter @jewellery/b2c-store start  # :3001
pnpm --filter @jewellery/b2b-portal build && pnpm --filter @jewellery/b2b-portal start # :3002
pnpm --filter @jewellery/api start   # runs src/server.ts directly via tsx, against a real MongoDB
```

`apps/api` has no build step (`tsx` runs the TypeScript directly); in
production you'd typically run it under a process manager (pm2, systemd,
a container) with `NODE_ENV=production` and a real `.env`.

## Repository layout

```
apps/
  api/          Express API — the only place with business logic (services, modules/*)
  erp/          Next.js admin app (Server Components by default)
  b2c-store/    Next.js storefront
  b2b-portal/   Next.js wholesale portal
packages/
  types/            Shared TypeScript types, including the PERMISSIONS vocabulary
  validation/       Shared Zod schemas
  pricing-engine/   The one pricing engine — pure functions, no I/O
  ui/               Shared React components (shadcn/ui-based)
  config/           Shared tsconfig/eslint/tailwind config
docs/           Architecture, business rules, data model, security/performance/
                production-readiness audits, progress log
tests/          Cross-cutting test plan
```

## Further reading

- [docs/architecture.md](docs/architecture.md) — system design, module boundaries
- [docs/business-rules.md](docs/business-rules.md) — rules that must hold regardless of channel
- [docs/data-model.md](docs/data-model.md) — MongoDB collections and relationships
- [docs/security-audit.md](docs/security-audit.md) — verified security posture
- [docs/production-readiness.md](docs/production-readiness.md) — cross-module readiness review
- [docs/progress.md](docs/progress.md) — current phase and what's been built
