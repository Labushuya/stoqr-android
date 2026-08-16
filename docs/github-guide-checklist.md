Now I have a comprehensive understanding of the entire codebase. Let me produce both documents.

# GitHub Guide

## stoqr — GitHub Workflow Guide

This guide covers everything you need to work with the stoqr repository on GitHub day-to-day.

---

### 1. Repository Access

**URL:** https://github.com/Labushuya/stoqr

**Clone the repository:**
```bash
git clone https://github.com/Labushuya/stoqr.git
cd stoqr
```

**Credentials:** Already configured via the `gh` CLI. You do not need to enter a username or password. If GitHub ever prompts you, run `gh auth status` to verify the login is still active.

---

### 2. Daily Workflow

**Check what is currently going on:**
```bash
git status                 # shows uncommitted changes
git log --oneline -5       # shows the last 5 commits
```

**Pull the latest changes from GitHub:**
```bash
git pull origin main
```

**Check CI status for recent pushes:**
```bash
gh run list --limit 5
```

This shows the five most recent workflow runs with their status (pass/fail/in-progress) and the commit they ran against.

**Inspect a specific run in detail:**
```bash
gh run view [run-id]
```

Replace `[run-id]` with the number shown in `gh run list`. You can also view logs for a failing step:
```bash
gh run view [run-id] --log-failed
```

---

### 3. Understanding the Branches

| Branch | Purpose |
|---|---|
| `main` | The only active branch. Every push here triggers CI and Docker Publish. |

There is no separate `develop` branch. As a single developer, all work goes directly to `main`. Claude Code commits and pushes directly to `main` as well.

---

### 4. When Claude Code Makes Changes

When Claude Code finishes a task it commits the changes and pushes to `main`. Here is what happens automatically after that push:

1. **CI workflow runs** — lint, typecheck, and tests execute in parallel (~2-4 minutes). Both the `lint-typecheck` job and the `test` job must pass.
2. **Docker Publish workflow runs** — builds two Docker images in parallel (amd64 and arm64), then merges them into a multi-architecture manifest. This takes approximately 10-15 minutes for the ARM64 build.
3. **The new image is tagged** with `main`, `sha-[short-commit-hash]`, and any semver tags if you pushed a `v*.*.*` tag.

**After Docker Publish is green, update the Raspberry Pi:**
```bash
docker compose pull
docker compose up -d
```

Run these commands on the Pi to pull the new image and restart the container.

---

### 5. Rollback if Needed

**View the last 10 commits to find a known-good commit:**
```bash
git log --oneline -10
```

**Safe rollback — create a new revert commit (recommended):**
```bash
git revert HEAD
git push origin main
```
This creates a new commit that undoes the last change. It is safe and preserves history.

**Revert multiple commits:**
```bash
git revert HEAD~3..HEAD    # reverts the last 3 commits
git push origin main
```

**Force rollback — destructive, rewrites history:**
```bash
git reset --hard [commit-hash]
git push --force origin main
```
> **Warning:** This is destructive and rewrites the public history. Only use this if the revert approach is not suitable. Confirm before running.

**Pull a specific Docker image instead of rolling back git:**

If you just want to run an older container version without changing the code, use the `sha-` tag that Docker Publish creates for every commit:
```
ghcr.io/labushuya/stoqr:sha-[short-hash]
```

Example — replace `abc1234` with the short hash from `git log --oneline`:
```bash
# In docker-compose.yml, change the image line temporarily, then:
docker compose pull
docker compose up -d
```

---

### 6. GitHub Actions

All workflows are in `.github/workflows/`. There are three:

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| CI | `ci.yml` | Push to `main` or `develop`, PRs to `main` | Lint, typecheck, run tests against a real Postgres instance, build check |
| Docker Publish | `docker-publish.yml` | Push to `main`, any `v*.*.*` tag, manual trigger | Builds multi-arch Docker image (amd64 + arm64) and pushes to GHCR |
| Release | `release.yml` | Push of a `v*.*.*` tag | Generates changelog with git-cliff and creates a GitHub Release |

**CI jobs in detail:**
- `lint-typecheck` — ESLint + TypeScript type check
- `test` — runs migrations against a real Postgres 16 container, then runs the test suite
- `build` — verifies the SvelteKit production build completes without errors

All three CI jobs must be green before Docker Publish results are trusted.

**View all workflow runs in the browser:**
https://github.com/Labushuya/stoqr/actions

---

### 7. Secrets Management

The following secrets are stored in GitHub and injected into CI and Docker Publish automatically:

| Secret | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Signs authentication sessions. Never hardcode this. |
| `GITHUB_TOKEN` | Auto-provided by GitHub — used by Docker Publish to push to GHCR. You never set this. |

In CI, if `BETTER_AUTH_SECRET` is not set in repo secrets, a hardcoded development fallback is used (test-only, never production).

**Manage secrets:**
https://github.com/Labushuya/stoqr/settings/secrets/actions

The `ENCRYPTION_KEY` (used to encrypt Bring! credentials in the database) and `DB_PASSWORD` are **not** GitHub secrets — they live in the `.env` file on the Raspberry Pi and are never committed to the repository.

---

### 8. Issues and Discussions

**Bug reports:** Use GitHub Issues. Templates exist for both bug reports and feature requests:
- Bug report template: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Feature request template: `.github/ISSUE_TEMPLATE/feature_request.yml`

**How to create an issue from the CLI:**
```bash
gh issue create --title "Short description" --body "Details here"
```

**View open issues:**
```bash
gh issue list
```

**Browse issues in the browser:**
https://github.com/Labushuya/stoqr/issues

Use issues to track known problems, regressions, or planned work so nothing gets lost between sessions.

---

# Development Checklist

## stoqr — Development Checklist

**Legend:**
- ✅ Done — implemented and deployed
- 🔄 In Progress / Deployed but needs testing
- ⚠️ Known Bug / Regression
- 🔜 Planned (P1) — next priority
- 💡 Future (P2) — planned but not imminent
- ❌ Blocked — cannot proceed without a dependency

---

### Infrastructure & DevOps

| Status | Item |
|---|---|
| ✅ | Monorepo structure (pnpm workspaces + Turborepo) |
| ✅ | SvelteKit app (`apps/web`) with Node adapter |
| ✅ | PostgreSQL 16 as database (Drizzle ORM) |
| ✅ | 5-stage multi-arch Dockerfile (amd64 + arm64) |
| ✅ | Docker Compose production config with Traefik labels |
| ✅ | Docker Compose dev config (`docker-compose.dev.yml`) |
| ✅ | GitHub Actions CI (lint, typecheck, tests, build check) |
| ✅ | GitHub Actions Docker Publish (multi-arch, GHCR, sha tags) |
| ✅ | GitHub Actions Release workflow (git-cliff changelog) |
| ✅ | `BETTER_AUTH_SECRET` stored as GitHub repo secret |
| ✅ | `ENCRYPTION_KEY` env var for encrypting Bring! credentials |
| ✅ | Database migration runner (`migrate.js`) in Docker entrypoint |
| ✅ | Automatic DB migrations on container start (`entrypoint.sh`) |
| ✅ | Health check endpoint (`GET /api/health`) |
| ✅ | Raspberry Pi deployment via `docker compose pull` |
| ✅ | `.env.example` with all required variables documented |
| ✅ | Issue templates (bug report, feature request) |
| ✅ | PR template |
| ✅ | `.gitattributes`, `.prettierrc`, ESLint config |
| ✅ | Drizzle migration files (0000–0004) committed |
| ✅ | Database seed scripts (categories, nutrient types) |

---

### Authentication & Users

| Status | Item |
|---|---|
| ✅ | Better Auth integration (email + password) |
| ✅ | Login page (`/login`) |
| ✅ | Register page (`/register`) — creates household on first signup |
| ✅ | Invite-based registration flow (token passed via URL) |
| ✅ | Server-side session guard (hooks.server.ts redirects unauthenticated users) |
| ✅ | `users.username` nullable so Better Auth signup works without a username |
| ✅ | CI test verifies `users.username` is nullable |
| ✅ | User `displayName` field (mapped from Better Auth `name`) |
| ✅ | User `locale` field (default `de-DE`) |
| ✅ | User `isActive` flag |
| 💡 | Email verification flow (field exists in schema, not yet wired to UI) |
| 💡 | Password reset flow |
| 💡 | OAuth providers (schema supports `accounts` table) |

---

### Households & Multi-User

| Status | Item |
|---|---|
| ✅ | Household model — auto-created on first user registration |
| ✅ | `household_members` table with roles (`admin`, `member`) |
| ✅ | Household member management UI (`/einstellungen/mitglieder`) |
| ✅ | Invite members by email (token-based, stored in `invites` table) |
| ✅ | Remove members from household |
| ✅ | All data scoped to `household_id` (inventory, locations, stores, etc.) |
| 💡 | Multiple households per user |
| 💡 | Household name editing UI |

---

### Locations & Storage Hierarchy

| Status | Item |
|---|---|
| ✅ | 3-level hierarchy: Location → Storage → Place |
| ✅ | Location management (`/orte`) — full CRUD |
| ✅ | Storage management — full CRUD inside locations |
| ✅ | Place management — full CRUD inside storages |
| ✅ | Inline edit for location/storage/place names and icons |
| ✅ | Emoji picker for location/storage icons (curated household emoji groups) |
| ✅ | Accordion UI — locations and storages expand/collapse |
| ✅ | Sort order field on all three levels |
| ✅ | `storageType` enum (fridge, freezer, shelf, cabinet, other) |
| ✅ | `temperatureZone` enum (ambient, chilled, frozen) |
| ✅ | Cascade delete: deleting a location removes storages and places |
| ✅ | REST API: `GET/POST /api/locations`, `PATCH/DELETE /api/locations/[id]` |
| ✅ | REST API: `GET/POST /api/storages`, `PATCH/DELETE /api/storages/[id]` |
| ✅ | REST API: `GET/POST /api/places`, `PATCH/DELETE /api/places/[id]` |

---

### Product Catalogue

| Status | Item |
|---|---|
| ✅ | Product model with GTIN, name, brand, image URL, description |
| ✅ | Open Food Facts integration — barcode lookup fetches product data |
| ✅ | OFF product cache (7-day freshness check, stored in `off_data` JSONB + `off_fetched_at`) |
| ✅ | OFF nutrient extraction (energy, fat, carbs, sugar, protein, fibre, salt) |
| ✅ | OFF category mapping → stoqr categories |
| ✅ | OFF quantity string parsing (g, kg, ml, l, cl) |
| ✅ | Product deduplication by GTIN (`getOrCreateProductByGtin`) |
| ✅ | Category hierarchy (parent/child, slug, icon, default expiry tolerance) |
| ✅ | Seeded categories (beverages, dairy, meat, fish, fruits, vegetables, bakery, cereals, frozen, condiments, snacks, desserts, canned, pasta, etc.) |
| ✅ | `nutrient_types` table with hierarchy and `off_key` mapping |
| ✅ | Seeded nutrient types (energy-kcal, fat, saturated-fat, carbohydrates, sugars, proteins, fibre, salt) |
| ✅ | `product_nutrients` table — upsert from OFF data |
| ✅ | Nutrient editor (inline auf der Artikel-Detailseite) |
| ✅ | `isVerified` flag on products |
| ✅ | `bringItemId` field for Bring! integration |
| ✅ | REST API: `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]` |
| ✅ | REST API: `GET /api/barcode/[gtin]` — cache-first, OFF fallback |
| ✅ | REST API: `GET /api/categories` |
| 💡 | Product editing UI (edit name, brand, image, category) |
| 💡 | Manual product creation UI (without barcode) |

---

### Inventory

| Status | Item |
|---|---|
| ✅ | Inventory list page (`/inventar`) — grid layout, 2-4 columns responsive |
| ✅ | Item card with product image (or category emoji fallback) |
| ✅ | MHD badge (fresh / ok / soon / critical / expired, colour-coded) |
| ✅ | Location breadcrumb on item card (Location › Storage › Place) |
| ✅ | Quantity and unit display per item |
| ✅ | Status badges (consumed, expired, donated, discarded) |
| ✅ | Search bar — live filter by product name or brand |
| ✅ | Place filter dropdown — filter by specific storage place |
| ✅ | "Available only" toggle filter (default on) |
| ✅ | FAB — "Neuer Artikel" opens add sheet |
| ✅ | FAB secondary — "Bestand hinzufügen" goes to easy-add flow |
| ✅ | Add item bottom sheet — product name, barcode, category, location cascade, MHD, quantity, unit, notes |
| ✅ | Edit item bottom sheet — pre-populated, same fields |
| ✅ | Cascading location selectors (Location → Storage → Place, reset on parent change) |
| ✅ | Barcode scanner in add sheet (BarcodeDetector API, camera overlay with reticle) |
| ✅ | Barcode → OFF lookup fills product name, category, brand automatically |
| ✅ | Three-dot context menu per item — edit, add stock, edit sources, mark consumed, delete |
| ✅ | Confirm modal before deleting inventory item |
| ✅ | Toast notifications (success/error) |
| ✅ | Mark item as consumed via context menu (PATCH status=consumed) |
| ✅ | Hard delete inventory item (DELETE endpoint) |
| ✅ | REST API: `GET/POST /api/inventory` |
| ✅ | REST API: `GET/PATCH/DELETE /api/inventory/[id]` |
| ✅ | REST API: `POST /api/inventory/[id]/consume` (partial consumption by amount) |
| ✅ | Custom units per household (`units` table, system + household-specific) |
| ✅ | REST API: `GET/POST /api/units`, `PATCH/DELETE /api/units/[id]` |

---

### Inventory Detail Page

| Status | Item |
|---|---|
| ✅ | Detail page (`/inventar/[id]`) |
| ✅ | MHD expiry status using per-household expiry config |
| ✅ | Inline edit: quantity, best-before date, notes, lot number, unit |
| ✅ | Purchase date field |
| ✅ | Purchase price (stored as cents) |
| ✅ | "Opened at" timestamp and opened expiry days |
| ✅ | Lot number field |
| ✅ | Product stores section ("Bezugsquellen") — link product to stores |
| ✅ | Nutrient table on detail page (from OFF data) |
| ✅ | Consume action with amount input (partial consumption) |
| ✅ | Location breadcrumb on detail page |
| 🔄 | Product image display (field and URL stored, rendering needs testing end-to-end) |

---

### Easy-Add Flow

| Status | Item |
|---|---|
| ✅ | Easy-add page (`/inventar/easy-add`) — step-by-step add flow |
| ✅ | Step 1: product search (searches existing catalogue by name) |
| ✅ | Barcode scan in easy-add (BarcodeDetector API) |
| ✅ | Pre-selection via query param (`?productId=...&productName=...`) |
| ✅ | Step 2: location/storage/place cascade selector |
| ✅ | Step 3: quantity, unit, MHD (multiple MHD rows supported) |
| ✅ | MHD camera scan via `MhdScanner.svelte` (Tesseract.js OCR) |
| ✅ | REST API: `POST /api/ocr/mhd` — Tesseract OCR for date extraction |
| ✅ | OCR date extraction patterns: DD.MM.YYYY, DD.MM.YY, MM/YYYY, YYYY-MM-DD |
| ✅ | OCR MHD prefix prioritisation (MHD:, Best by:, haltbar bis:) |

---

### Dashboard

| Status | Item |
|---|---|
| ✅ | Dashboard home page (`/`) |
| ✅ | Personalised greeting (Guten Morgen / Guten Tag / Guten Abend + display name) |
| ✅ | Stats row: total items, expiring this week, expired count, location count |
| ✅ | Clickable stat cards scroll to the relevant section |
| ✅ | "Bald ablaufend" section — items expiring in the next 14 days |
| ✅ | "Bereits abgelaufen" section — items past their MHD |
| ✅ | Location breadcrumb per item in dashboard lists |
| ✅ | Quick action buttons: Artikel hinzufügen, Orte verwalten |
| ✅ | Responsive 2-column / 4-column stats grid |

---

### Expiry System

| Status | Item |
|---|---|
| ✅ | `expiry_config` table per household (yellow/red thresholds, grace days) |
| ✅ | Default thresholds: yellow = 7 days, red = 2 days, grace = 0 days |
| ✅ | Expiry settings UI (`/einstellungen`) — edit yellow, red, grace days |
| ✅ | Per-category default expiry tolerance days |
| ✅ | Category tolerance editing inline in settings |
| ✅ | `expiry.ts` utility — `getExpiryStatus`, `getDaysRemaining`, `getExpiryLabel`, `EXPIRY_CLASS` |
| ✅ | `MhdBadge.svelte` component |
| ✅ | Expiry config used on inventory list and detail page |
| ⚠️ | Dashboard expiry display uses hardcoded constants (7/2/0), not the per-household config loaded from DB — these should match but could diverge if config is changed |

---

### Stores & Product-Store Linking

| Status | Item |
|---|---|
| ✅ | `stores` table (name, chain, address, city, lat/lon, isFavorite, notes, bringListUuid) |
| ✅ | Stores management UI (`/einstellungen/maerkte`) — add, inline edit, delete |
| ✅ | REST API: `GET/POST /api/stores`, `PATCH/DELETE /api/stores/[id]` |
| ✅ | `product_stores` junction table (product ↔ store, with sort order, SKU, last seen price) |
| ✅ | REST API: `GET/POST /api/product-stores`, `PATCH/DELETE /api/product-stores/[id]` |
| ✅ | "Bezugsquellen" section on inventory detail page |
| 💡 | Store map/location view (lat/lon stored, no map UI yet) |
| 💡 | Price tracking over time (last_seen_price_ct stored, no history chart) |

---

### Shopping List (Einkaufsliste)

| Status | Item |
|---|---|
| ✅ | Route and nav item exist (`/einkaufsliste`) |
| ✅ | `shopping_list_items` table (product, free-text, quantity, unit, store, priority, checked, Bring sync fields) |
| 🔜 | Shopping list CRUD UI — add, check off, delete items |
| 🔜 | Manual item entry (free-text and/or product-linked) |
| 🔜 | Automatic generation from stock targets below minimum quantity |
| 🔜 | Per-item preferred store assignment |
| 🔜 | Sort/group by store |

---

### Bring! Integration

| Status | Item |
|---|---|
| ✅ | `bring_sync_log` table (direction, store, item count, status, payload) |
| ✅ | `bringListUuid` on stores table |
| ✅ | `bringItemUuid` and `bringsSyncedAt` on shopping_list_items |
| ✅ | `bringItemId` on products table |
| ✅ | `ENCRYPTION_KEY` env var for encrypting credentials |
| ✅ | `BRING_EMAIL` / `BRING_PASSWORD` documented in `.env.example` |
| 🔜 | Bring! credentials UI (configure in settings) |
| 🔜 | Export shopping list to Bring! |
| 🔜 | Import items from Bring! back into stoqr |

---

### Stock Targets

| Status | Item |
|---|---|
| ✅ | `stock_targets` table (household, product, target/min quantity, unit, preferred place/store, notes, isActive) |
| ✅ | REST API: `GET/POST /api/storages`, `PATCH/DELETE /api/storages/[id]` (note: storages API exists, stock targets API not yet confirmed separate) |
| 🔜 | Stock targets UI (set minimum quantities per product) |
| 🔜 | Trigger shopping list items when stock falls below minimum |

---

### Audit Log

| Status | Item |
|---|---|
| ✅ | `audit_log` table (user, action, table, record, old/new values, changed fields, IP, user agent) |
| 💡 | Audit log UI (no frontend access yet) |

---

### Settings

| Status | Item |
|---|---|
| ✅ | Settings landing page (`/einstellungen`) with navigation cards |
| ✅ | Expiry tolerance settings (global + per-category) |
| ✅ | Stores management sub-page |
| ✅ | Household members sub-page |
| 🔜 | User profile settings (display name, locale, password change) |
| 🔜 | Unit management UI (custom units per household) |
| 💡 | Bring! credentials configuration |
| 💡 | Household name and settings |
| 💡 | Data export (CSV / JSON) |

---

### API Surface (complete)

| Status | Endpoint |
|---|---|
| ✅ | `GET /api/health` |
| ✅ | `GET/POST /api/inventory` |
| ✅ | `GET/PATCH/DELETE /api/inventory/[id]` |
| ✅ | `POST /api/inventory/[id]/consume` |
| ✅ | `GET /api/barcode/[gtin]` |
| ✅ | `POST /api/ocr/mhd` |
| ✅ | `GET /api/categories` |
| ✅ | `GET/POST /api/products` |
| ✅ | `PATCH/DELETE /api/products/[id]` |
| ✅ | `GET/POST /api/product-stores` |
| ✅ | `PATCH/DELETE /api/product-stores/[id]` |
| ✅ | `GET/POST /api/locations` |
| ✅ | `PATCH/DELETE /api/locations/[id]` |
| ✅ | `GET/POST /api/storages` |
| ✅ | `PATCH/DELETE /api/storages/[id]` |
| ✅ | `GET/POST /api/places` |
| ✅ | `PATCH/DELETE /api/places/[id]` |
| ✅ | `GET/POST /api/stores` |
| ✅ | `PATCH/DELETE /api/stores/[id]` |
| ✅ | `GET/POST /api/units` |
| ✅ | `PATCH/DELETE /api/units/[id]` |
| ✅ | `GET /api/auth/[...auth]` (Better Auth handler) |