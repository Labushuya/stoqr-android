# Development Setup

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker | 24+ | Docker Desktop or Engine + Compose plugin |

Verify:

```bash
node -v   # v22.x.x
pnpm -v   # 9.x.x
docker compose version
```

---

## Step-by-step setup

### 1. Clone the repository

```bash
git clone https://github.com/Labushuya/stoqr.git
cd stoqr
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all workspace packages (`apps/web`, `packages/db`) in one pass via Turborepo.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```dotenv
# Database — keep the dev defaults, they match docker-compose.dev.yml
DATABASE_URL=postgresql://stoqr:devpassword@localhost:5432/stoqr_dev

# Auth — generate a real secret for local use
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:5173

# App
PUBLIC_APP_URL=http://localhost:5173

# Encryption key for Bring! credentials stored in the DB
ENCRYPTION_KEY=<output of: openssl rand -hex 32>
```

The `TZ`, `NODE_ENV`, and `OFF_USER_AGENT` fields have safe defaults in the example file.

### 4. Start the database

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Wait for the health check to pass (a few seconds), then verify:

```bash
docker compose -f docker-compose.dev.yml ps
# postgres should show "healthy"
```

### 5. Run migrations

```bash
pnpm db:migrate
```

This runs Drizzle Kit migrations against the database defined by `DATABASE_URL` in your `.env`. All schema files live in `packages/db/drizzle/`.

### 6. Start the dev server

```bash
pnpm dev
```

Open `http://localhost:5173`. You will be redirected to `/login`.

---

## First login — creating the initial user

There is no seed script. The login page only signs in existing users. To create the first account, call the Better Auth signup endpoint directly:

```bash
curl -X POST http://localhost:5173/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "password": "changeme123",
    "name": "Your Name"
  }'
```

A `200` response means the user was created. Go to `http://localhost:5173/login` and sign in.

Alternatively, insert directly into the database (useful for scripting):

```sql
-- Connect: psql postgresql://stoqr:devpassword@localhost:5432/stoqr_dev

INSERT INTO users (id, username, display_name, email, password_hash, is_active)
VALUES (
  gen_random_uuid(),
  'admin',
  'Admin',
  'admin@example.com',
  -- bcrypt hash of 'changeme123', rounds=10
  '$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0/NA2aMdORi',
  true
);
```

The password hash above is for `changeme123` — change it after first login.

---

## Project structure

```
stoqr/
├── apps/
│   └── web/                   # SvelteKit application
│       └── src/
│           ├── app.html        # HTML shell
│           ├── app.css         # Global CSS / design tokens
│           ├── hooks.server.ts # Auth session hydration
│           ├── lib/
│           │   ├── components/ # Shared Svelte components
│           │   ├── server/
│           │   │   ├── auth.ts      # Better Auth instance
│           │   │   ├── db.ts        # Drizzle client (postgres)
│           │   │   └── queries/     # Server-side query functions
│           │   ├── stores/     # Svelte stores (e.g. toast)
│           │   └── utils/      # Pure helpers (cn, format, expiry)
│           └── routes/
│               ├── +layout.server.ts   # Passes user to all pages
│               ├── (app)/              # Protected pages (auth guard per page)
│               │   ├── +page.svelte    # Dashboard
│               │   ├── inventar/       # Inventory list + detail
│               │   └── orte/           # Locations
│               ├── (auth)/
│               │   └── login/          # Login page
│               └── api/
│                   ├── auth/[...auth]/ # Better Auth handler
│                   ├── inventory/      # REST: GET/POST inventory items
│                   ├── inventory/[id]/ # REST: GET/PATCH/DELETE single item
│                   ├── locations/      # REST: locations
│                   ├── storages/       # REST: storages
│                   ├── places/         # REST: places
│                   ├── products/       # REST: products
│                   └── categories/     # REST: categories
├── packages/
│   └── db/
│       ├── src/
│       │   ├── schema.ts       # All Drizzle table definitions
│       │   ├── client.ts       # postgres() connection
│       │   └── index.ts        # Re-exports schema + db
│       ├── drizzle/            # Generated SQL migration files
│       └── drizzle.config.ts
├── docker-compose.dev.yml      # Local dev: postgres only
├── docker-compose.yml          # Production: app + postgres + traefik labels
├── .env.example
└── turbo.json
```

---

## How to add a new page

1. **Create the route directory** under `apps/web/src/routes/(app)/`:

   ```
   src/routes/(app)/reports/
   ├── +page.server.ts
   └── +page.svelte
   ```

2. **Add the server load function** in `+page.server.ts`:

   ```typescript
   import { redirect } from '@sveltejs/kit'
   import type { PageServerLoad } from './$types'

   export const load: PageServerLoad = async ({ locals }) => {
     if (!locals.user) redirect(302, '/login')
     // fetch data here using functions from $lib/server/queries/
     return { /* data */ }
   }
   ```

3. **Build the page** in `+page.svelte`:

   ```svelte
   <script lang="ts">
     import type { PageData } from './$types'
     let { data }: { data: PageData } = $props()
   </script>

   <h1>Reports</h1>
   ```

4. **Add navigation** in `+layout.svelte` or the sidebar component if one exists.

5. **Add API routes** when needed under `src/routes/api/your-feature/+server.ts`. Export `GET`, `POST`, `PATCH`, `DELETE` as named functions.

---

## Running tests

```bash
# All workspaces
pnpm test

# Web app only (faster)
pnpm --filter @stoqr/web test

# Watch mode
pnpm --filter @stoqr/web exec vitest
```

Tests live in `apps/web/src/**/*.{test,spec}.{js,ts}`. The test environment is `node` (no browser). `passWithNoTests` is enabled so CI does not fail when no test files exist yet.

Type-check without running tests:

```bash
pnpm typecheck
```

---

## Common issues

### `DATABASE_URL` connection refused on migrate

The `db:migrate` script reads `DATABASE_URL` from your `.env`. If you see `ECONNREFUSED`:

- Make sure Docker is running: `docker compose -f docker-compose.dev.yml up -d postgres`
- Wait for the health check: `docker compose -f docker-compose.dev.yml ps`
- The default dev URL points to `localhost:5432`, not `postgres:5432` (that hostname is for container-to-container networking). Your `.env` must use `localhost`.

### `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` missing

The app will crash at startup if these are undefined. Both must be set in `.env`. Use the `openssl` commands from the `.env.example` comments to generate them.

### pnpm install fails with workspace errors

Make sure you are running `pnpm install` from the **repo root**, not from inside `apps/web` or `packages/db`. The workspace is defined in `pnpm-workspace.yaml` at the root.

### Svelte types not generated (`$types` import errors)

Run `pnpm --filter @stoqr/web exec svelte-kit sync` once after cloning. This generates `.svelte-kit/types/`. The `typecheck` script does this automatically.

### Port 5173 already in use

Vite will print an error. Either stop the other process or start on a different port:

```bash
pnpm --filter @stoqr/web exec vite dev --port 5174
```

Remember to update `BETTER_AUTH_URL` and `PUBLIC_APP_URL` in `.env` to match.

### `better-auth` sign-up returns 400

Better Auth validates the `name` field. Make sure the `curl` signup request includes `"name"`. If you used the direct DB insert path, the `display_name` column is `NOT NULL` — it must be set.

### Docker volume left over from a previous run

If you need a clean database:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d postgres
pnpm db:migrate
```

The `-v` flag removes the named volume `postgres_dev_data`.
