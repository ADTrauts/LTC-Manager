# 2. Repository Structure

## Workspace layout

```
ltc-manager/                          # Git root and primary application
├── package.json
├── docs/                             # Product, engineering, and planning docs
├── tests/                            # Playwright suites and configs
├── prisma/
│   ├── schema.prisma
│   ├── seed.mjs
│   └── migrations/
├── scripts/                          # CLI provisioning/backfill and verify runners
├── memory-bank/                      # Agent/project notes
├── src/
│   ├── proxy.ts
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── lib/
├── AGENTS.md / CLAUDE.md
└── README.md
```

There is **one major application** (`ltc-manager`). No separate mobile app, worker service, or shared packages monorepo.

## Top-level folders (application)

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages, layouts, API routes, server actions |
| `src/components/` | Reusable React components (shell, forms, feature UI) |
| `src/lib/` | Domain logic, auth, Prisma helpers, permissions, utilities |
| `src/hooks/` | Client hooks (`use-nav-pathname.ts`) |
| `prisma/` | Schema, migrations, seed |
| `scripts/` | One-off provisioning and backfill CLIs |
| `memory-bank/` | Living architecture/product docs for agents and developers |
| `uploads/` | Facility-scoped file storage at runtime |

## Application route groups

### Public (`src/app/`)

| Path | File |
|------|------|
| `/` | `page.tsx` |
| `/login` | `login/page.tsx` |
| `/signup` | `signup/page.tsx` |
| `/setup` | `setup/page.tsx` |

### Protected (`src/app/(protected)/`)

Wrapped by `(protected)/layout.tsx` → `AppShell`.

| Area | Routes |
|------|--------|
| Core ops | `/dashboard`, `/unit/[unitId]`, `/units`, `/logs`, `/staffing` |
| Department modules | `/menus`, `/evs`, `/assets`, `/repairs` |
| People | `/employees/*` (layout with sub-nav) |
| Analytics | `/reports` |
| Account | `/account` |
| Department admin | `/department/settings/[departmentId]` |
| Facility admin | `/admin/*` (layout with FA guard) |

### API (`src/app/api/`)

| Namespace | Routes | Count |
|-----------|--------|-------|
| `auth/` | login, signup, logout, logout-full, pin-login, session, bind-device, device-facility, active-department, active-unit | 10 |
| `onboarding/` | state, managers, locations | 3 |
| `billing/` | setup-intent, payment-method/default, webhook | 3 |
| `facility/` | union-handbook | 1 |

**Total API route files:** 17

## Shared libraries (`src/lib/`)

41 modules. Grouped by concern:

| Concern | Modules |
|---------|---------|
| Auth & session | `auth.ts`, `pin.ts`, `pin-rate-limit.ts`, `device-cookie.ts`, `credential-policy.ts`, `session-employee.ts` |
| Access control | `access.ts`, `route-permissions.ts`, `facility-admin.ts`, `facility-admin-guard.ts`, `dept-settings-access.ts` |
| Tenancy | `facility-context.ts`, `facility-uploads.ts`, `onboarding.ts` |
| Departments | `department-nav.ts`, `department-scope.ts`, `active-department-context.ts`, `ensure-default-departments.ts` |
| Employees / HR | `employee-units.ts`, `employee-department-scope.ts`, `employee-directory-filters.ts`, `employees-department-tabs.ts`, `employee-csv-import.ts`, `employee-hr-labels.ts`, `hr-audit.ts`, `ensure-gm-employee-roster.ts`, `roster-name.ts` |
| Units & scheduling | `units.ts`, `unit-type-config.ts`, `scheduling-eligibility.ts`, `servery-meal-service.ts` |
| Menus | `menu-cycle.ts`, `menu-db.ts` |
| Assets & repairs | `attachments.ts`, `repair-routing.ts` |
| Billing | `stripe.ts`, `telemetry.ts` |
| Data | `prisma.ts`, `csv-parse.ts` |

## Components (`src/components/`)

28 files + 2 subfolders (`logs/`, `menus/`).

| Category | Components |
|----------|------------|
| Shell | `app-shell.tsx`, `left-sidebar.tsx`, `top-nav.tsx`, `department-scope-switcher.tsx`, `sign-out-controls.tsx` |
| Auth / onboarding | `login-gate.tsx`, `login-form.tsx`, `pin-login-form.tsx`, `signup-form.tsx`, `setup-wizard.tsx`, `bind-device-form.tsx` |
| Employees | `create-employee-drawer.tsx`, `employee-management-card.tsx`, `employees-*` (tabs, filters, sub-nav) |
| Units | `units-manager.tsx` |
| Staffing | `staffing-toolbar.tsx`, `staffing-auto-assign-form.tsx`, `staffing-date-auto-advance.tsx` |
| Logs | `logs/logs-tabs-client.tsx` |
| Menus | `menus/menu-day-builder.tsx`, `menus/menu-period-settings-form.tsx` |
| Servery | `servery-meal-service-controls.tsx` |
| Kiosk | `kiosk-unit-access-banner.tsx` |
| Shared | `drawer.tsx`, `module-placeholder.tsx` (unused legacy) |

## Co-location pattern

Heavy feature logic follows a consistent pattern:

```
(protected)/{feature}/
  page.tsx          # Server Component, data loading
  actions.ts        # Server Actions (mutations)
  *.tsx             # Feature-specific client/server components (employees area)
```

Admin and employees areas add nested `layout.tsx` for section guards and sub-navigation.

## Scripts

| Script | npm command | Purpose |
|--------|-------------|---------|
| `provision-facility.mjs` | `db:provision` | Greenfield facility + GM user + employee + departments + log presets |
| `backfill-gm-employees-from-users.mjs` | `db:backfill-gm-roster` | Create missing Employee rows for GM Users |
| `backfill-log-template-presets.mjs` | `db:backfill-log-presets` | Insert/update log template presets for all facilities |

## Configuration files

| File | Role |
|------|------|
| `next.config.ts` | Next.js config (minimal) |
| `tsconfig.json` | TypeScript paths and strict mode |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin |
| `eslint.config.mjs` | Next.js ESLint presets |
| `.env.example` | Required environment variables |
| `src/app/globals.css` | Tailwind import + design system tokens |

No `tailwind.config.*` — Tailwind v4 uses CSS-first configuration.

## Documentation assets

| Location | Contents |
|----------|----------|
| `memory-bank/` | 9 markdown files: overview, architecture decisions, phases, progress, runbook, HR source of truth, strategy |
| `docs/` | Product, engineering, operations, and planning documentation |
| `tests/` | Playwright suites and config files |
| `AGENTS.md` | Agent guardrails (Prisma migrations, assets UI conventions) |
