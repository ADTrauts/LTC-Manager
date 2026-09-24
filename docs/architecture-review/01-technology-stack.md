# 1. Technology Stack

## Overview

| Layer | Technology | Version (from `ltc-manager/package.json`) |
|-------|------------|-------------------------------------------|
| Language | TypeScript | ^5 |
| Runtime | Node.js (implicit via Next.js) | — |
| Framework | Next.js (App Router) | 16.2.1 |
| UI library | React | 19.2.4 |
| Styling | Tailwind CSS | ^4 (CSS-first via `@tailwindcss/postcss`) |
| ORM | Prisma | ^6.19.2 |
| Database | PostgreSQL | via `DATABASE_URL` |
| Validation | Zod | ^4.3.6 |
| Auth (session) | Jose (JWT HS256) | ^6.2.2 |
| Password hashing | bcryptjs | ^3.0.3 |
| Payments | Stripe (server + React Elements) | stripe ^22.1.1, @stripe/react-stripe-js ^6.3.0 |
| Linting | ESLint + eslint-config-next | ^9 / 16.2.1 |

## Frameworks

- **Next.js App Router** — all pages under `src/app/`. Server Components are the default; co-located `actions.ts` files implement Server Actions for mutations.
- **Next.js 16 proxy** — request guarding lives in `src/proxy.ts` (replaces the older `middleware.ts` pattern in this codebase).
- **No separate API framework** — REST-style route handlers under `src/app/api/` for auth, onboarding, billing, and file streaming.

## Runtime

- **Node.js** for development (`next dev`), production (`next start`), Prisma CLI, and utility scripts in `scripts/`.
- **No edge runtime** observed on primary routes; protected layout sets `dynamic = "force-dynamic"`.
- Workspace root `package.json` delegates all scripts to `ltc-manager/` via `--prefix`.

## Database

- **PostgreSQL** with two connection URLs:
  - `DATABASE_URL` — application queries (documented for Supabase transaction pooler / PgBouncer on port 6543).
  - `DIRECT_URL` — migrations and introspection (direct Postgres, not pooler).
- **31 Prisma migrations** under `prisma/migrations/` (from phase 1 through June 2026).
- **Seed:** `prisma/seed.mjs` via `npm run db:seed`.
- **Provisioning scripts:** `scripts/provision-facility.mjs`, backfill scripts for log presets and GM roster.

## ORM

- **Prisma Client** generated on `postinstall` (`prisma generate`).
- Singleton client in `src/lib/prisma.ts` (dev intentionally avoids global caching to survive client regeneration).
- Schema: `prisma/schema.prisma` — 41 models, 30+ enums.

## Authentication

| Mechanism | Users | Storage | Session |
|-----------|-------|---------|---------|
| Email + password | `User` records | `passwordHash` (bcrypt) | JWT in `ltc_session` cookie |
| 6-digit PIN | `Employee` records | `pinDigest` (HMAC-SHA256 with `AUTH_SECRET` + facility id) | Same cookie; `authKind: "employee"` |
| Device binding | Browser | HttpOnly `ltc_device_facility`, optional `ltc_device_unit` | Not in JWT; required for PIN login |

- JWT payload fields: `uid`, `facilityId`, `authKind`, `role`, `name`, `email`, optional `activeUnitId`, optional `kioskUnitAccessWarning`.
- PIN brute-force protection: in-memory rate limiter (`src/lib/pin-rate-limit.ts`) — not durable across processes.
- Public signup at `/signup` creates first `FACILITY_ADMINISTRATOR` user + facility + matching employee row.

## Authorization

- **Role hierarchy** (`RoleKey`): `FACILITY_ADMINISTRATOR` > `GM` > `MANAGER` > `SUPERVISOR` > `LEAD_TEAM_MEMBER` > `STAFF`.
- **Route permissions:** DB-driven `AppRoute` + `RoleRoutePermission` matrix with 30s in-memory cache (`src/lib/route-permissions.ts`); fallback minimum roles in `src/lib/access.ts`.
- **Department scoping:** Cookie `ltc_active_department` + `src/lib/department-nav.ts` limits nav for DIETARY, EVS, PLANT operations staff.
- **Onboarding gate:** Incomplete FA onboarding redirects to `/setup` until `Facility.onboardingCompletedAt` is set.

## State management

- **No global client state library** (no Redux, Zustand, Jotai, React Query).
- **Server state:** Prisma queries in Server Components and Server Actions.
- **Session state:** JWT cookie; refreshed via `/api/auth/active-unit`, `/api/auth/active-department`.
- **URL state:** Search params for filters (`?dept=`, `?subtab=`, date ranges, staffing date, menu week/day).
- **Minimal client state:** Form components, drawer open/close, dismissible kiosk banner, login gate mode switching.

## UI libraries

- **React 19** with Server Components.
- **Tailwind CSS v4** — design tokens and utility classes in `src/app/globals.css` (`.app-card`, `.app-input`, `.app-btn`, status colors).
- **Geist** fonts via `next/font` in root layout.
- **No component library** (no shadcn, MUI, Chakra). Custom components in `src/components/`.
- **Stripe Elements** for card-on-file during onboarding (`@stripe/react-stripe-js`).

## Build and deployment

| Concern | Current state |
|---------|---------------|
| Build | `next build` (workspace: `npm run build`) |
| Typecheck | `tsc --noEmit` |
| Lint | `eslint` with `eslint-config-next` |
| DB validate | `prisma validate` |
| Config | `next.config.ts` — minimal/empty export |
| PostCSS | `postcss.config.mjs` with `@tailwindcss/postcss` |
| TypeScript | `tsconfig.json` — strict, `@/*` → `./src/*` |
| Env vars | `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, Stripe keys |
| Hosting | No `vercel.json` or Docker files in repo; `.env.example` comments reference **Vercel + Supabase** |
| File uploads | Local filesystem under `uploads/facilities/{facilityId}/` (union handbook PDF) |
| Quality gates | Documented in README: typecheck, lint, build, db:validate |

## Package management

- Workspace root declares `packageManager: pnpm@10.12.4`; app uses `npm` scripts conventionally.

## Testing

- **Unit tests exist** for `credential-policy` and `route-permissions` (`*.test.ts` in `src/lib/`).
- **No E2E test framework** observed (no Playwright/Cypress config).
- **Smoke test checklist:** `docs/self-serve-smoke-test.md` (manual).
