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

Seeded login credentials:
- email: `admin@terraceview.local`
- password: `ChangeMeNow123!`

6) Start the app:

```bash
npm run dev
```

## Phase Exit Quality Gate Commands

Run these before moving to the next phase:

```bash
npm run typecheck
npm run lint
npm run build
npm run db:validate
```

## Notes

- Sidebar is database-driven (`Dashboard` + active units ordered by `display_order`).
- Unit names are not hardcoded in code.
- Phase 0 intentionally keeps modules as route scaffolds; full functionality is added in later phases.
