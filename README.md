# LTC Manager

Phase 0 foundation for a unit-driven operations platform:
- Next.js + TypeScript app shell
- login/session baseline
- role-based route guards
- top navigation + dynamic left sidebar
- PostgreSQL + Prisma schema pipeline

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL

## Local Setup

1) Copy environment variables:

```bash
cp .env.example .env
```

2) Update `.env` with a valid PostgreSQL `DATABASE_URL` and an `AUTH_SECRET`.

3) Install dependencies:

```bash
npm install
```

4) Generate Prisma client and run migrations:

```bash
npm run db:generate
npm run db:migrate:dev -- --name init_phase0
```

5) Seed baseline data:

```bash
npm run db:seed
```

Seeded login credentials (**nonproduction demo only** — never reuse outside local development):
- email: `admin@terraceview.local`
- password: `ChangeMeNow123!` (override with `SEED_DEMO_PASSWORD` in CI / verify runs)

6) Start the app:

```bash
npm run dev
```

## Verification

Before opening a PR, run the repository gate. Prefer a disposable database — never point
verification at `ltc_manager`.

```bash
npm run verify:static
npm run test:hermetic
npm run verify:build

# Disposable DB required for the full gate:
export VERIFY_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/ltc_verify_local?schema=public'
export AUTH_SECRET='local-verify-secret'
export SEED_DEMO_PASSWORD='LocalVerifySeed!ChangeMe'
npm run verify:db
# or: npm run verify:all
```

Full command list, CI jobs, and triage: [`docs/engineering/CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md`](docs/engineering/CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md).

## Notes

- Sidebar is database-driven (`Dashboard` + active units ordered by `display_order`).
- Unit names are not hardcoded in code.
- Phase 0 intentionally keeps modules as route scaffolds; full functionality is added in later phases.
- GitHub Actions workflow `.github/workflows/verify.yml` runs the same scripts; it does not deploy.
