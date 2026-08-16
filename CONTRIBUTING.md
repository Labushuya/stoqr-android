# Contributing to stoqr

Thanks for your interest in contributing! stoqr is licensed under **AGPL-3.0** and built with a self-hosted-first philosophy — contributions that keep it easy to run on your own infrastructure are especially welcome.

---

## Development Setup

**Prerequisites:** Node.js 20+, pnpm, Docker

```bash
# Install dependencies
pnpm install

# Start the dev environment (database, services)
docker compose -f docker-compose.dev.yml up -d

# Run database migrations
pnpm db:migrate

# Start the dev server
pnpm dev
```

---

## Branch Naming

Keep branch names short and consistent:

- `feature/` — new functionality
- `fix/` — bug fixes
- `chore/` — maintenance, deps, tooling

Example: `feature/barcode-scanner`, `fix/stock-count-rounding`

---

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add barcode scanner support
fix: correct rounding in stock count
docs: update API reference
chore: bump dependencies
```

No strict enforcement, but it keeps the changelog readable.

---

## Pull Requests

- Keep PRs **small and focused** — one concern per PR makes review much easier
- Describe **what** changed and **why** in the PR description
- Reference related issues where applicable
- Draft PRs are welcome for early feedback

---

## Code Style

We use Prettier for formatting and ESLint for linting. Run both before opening a PR:

```bash
pnpm lint
pnpm format
```

No need to configure anything — the config is already in the repo.

---

## A Note on Rules

These are guidelines, not gatekeepers. If something here doesn't fit your contribution, just mention it in the PR and we'll figure it out together.
