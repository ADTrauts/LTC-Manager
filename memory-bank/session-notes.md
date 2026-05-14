# Session Notes

## 2026-05-09

- Hardened self-serve onboarding after first ship:
  - Migration **`20260509140000_backfill_legacy_onboarding_complete`** so facilities that never started wizard (`onboardingStartedAt` null) get `onboardingCompletedAt` set—prevents all legacy GMs being redirected to `/setup`.
  - Onboarding API exposes **`stripeBillingReady`**; billing step can **finish without card** when Stripe is not fully configured; strict completion when both Stripe keys exist and default PM saved.
  - **`/setup`:** Sign out control + clearer billing copy.
- **Employees roster vs GM `User`:** signup now creates **`Employee`** alongside GM **`User`**; added **`ensureGmEmployeeRosterRow`** on **`/employees`** load and **`npm run db:backfill-gm-roster`** script for one-off/bulk backfill.
- **UI:** accent primary buttons use readable light text on dark fills (`globals.css`).

## 2026-05-08

- Delivered the self-serve onboarding plan end-to-end:
  - Public hero landing at `/` for logged-out traffic.
  - First-admin signup at `/signup` with transactional bootstrap API (`/api/auth/signup`).
  - Guided setup wizard at `/setup` with facility, managers (optional), locations (optional), and billing steps.
- Added onboarding persistence and billing primitives to Prisma:
  - `Facility` onboarding/billing fields (`billingEmail`, Stripe IDs, onboarding step timestamps/state).
  - `OnboardingManagerInvite` model for manager-email capture.
  - Migration: `20260508071500_self_serve_onboarding_billing`.
- Added Stripe integration for card-on-file onboarding:
  - `/api/billing/setup-intent`
  - `/api/billing/payment-method/default`
  - `/api/billing/webhook`
  - env scaffolding in `.env.example`.
- Enforced GM onboarding gate in `proxy.ts` so incomplete accounts are routed to `/setup` until completion.
- Added post-completion dashboard checklist card and smoke test playbook in `docs/self-serve-smoke-test.md`.
- Verification:
  - `npm run db:generate` passed.
  - `npm run typecheck` passed.
  - lint surfaced pre-existing unrelated errors in `menu-day-builder`, `units-manager`, and `use-nav-pathname`.

## 2026-05-05

- Implemented admin-managed role permissions end-to-end:
  - Added Prisma models `AppRoute` and `RoleRoutePermission` plus `Role.isActive`.
  - Seed now upserts route definitions and role-route allow rules that mirror prior hard-coded access behavior.
  - Middleware and top-nav access are now DB-backed via `src/lib/route-permissions.ts` (with short TTL cache + invalidation).
  - Added GM-only **Admin -> Permissions** UI for role metadata, active/inactive toggles, route access matrix, and role-permission cloning.
- Added login hardening to require both `User.isActive` and `Role.isActive`.
- Local DB migration note: `prisma migrate dev` was blocked by migration drift (`20260423105656` modified after apply), so schema was synced non-destructively with `prisma db push` (no reset) and reseeded.
- Login incident and resolution:
  - 401 persisted after password reset because running dev server had stale Prisma runtime state.
  - Verified DB hashes directly and confirmed both `andrew.trautman@metzcorp.com` and `admin@terraceview.local` were valid/active.
  - Reset `andrew.trautman@metzcorp.com` password to known dev value `ChangeMeNow123!` for immediate access recovery.

## 2026-05-04

- **Unit-locked floor tablets:** Optional HttpOnly **`ltc_device_unit`** with **`ltc_device_facility`**; GM configures via **`BindDeviceForm`** on **Admin → Organization** (`POST /api/auth/bind-device` with **`{ unitId }`** or **`null`**).
- **PIN login:** Forces **`activeUnitId`** to the locked unit; JSON **`redirectTo`** to **`/unit/{id}`**; login gate shows **Unit:** label when bound.
- **Guardrails:** Restricted staff not assigned to the locked unit still sign in; JWT **`kioskUnitAccessWarning`**, **`KioskUnitAccessBanner`**, and **`KioskUnitPinLoginEvent`** (migration **`20260501120000_kiosk_unit_pin_login_event`**).
- **UX lock:** **`LeftSidebar`** greys non-locked unit links when employee session matches device unit cookie + **`activeUnitId`**; **`getSidebarUnitsForSession`** injects current unit when needed; **`active-unit`** API allows **staying** on current unit for kiosk override.
- **Memory bank:** Updated **`architecture-decisions.md`**, **`implementation-phases.md`**, **`runbook.md`**, **`project-overview.md`**, **`progress-log.md`**, **`future-projects-ltc-ops-strategy.md`** (this batch aligns Phase C bullets + strategy cross-link).

## 2026-05-01

- Delivered a full **Menus** feature slice with top-nav access, a settings/builder tab split, cycle controls (3 or 4 weeks, Sunday/Monday start), and dynamic meal period/category configuration persisted in `MenuSettings.periodConfigJson`.
- Reworked builder UX to week/day tab editing and line-based category entry (`+ Add line`) with server actions saving per-category menu rows.
- Added structured menu row persistence support in `MenuItem` for `portionValue`, `portionUnit`, and `entryType` (`FIXED` / `CHOICE_PLACEHOLDER`), then later simplified the UI to show only the item line while keeping backend fields intact for future use.
- Wired menu outputs into unit servery and logs contexts via shared menu loading/formatting helpers, including selected-day preview and today-cycle preview behavior on `/menus`.
- Hardened menu infra behavior for non-destructive migration workflows: used forward-only SQL apply + `migrate resolve`, avoided migration-history rewrites, and resolved stale Prisma/Next dev cache issues by regenerating Prisma client and clearing `.next` when needed.
- Applied migration `20260430180000_menu_item_portions` with `prisma db execute` + `prisma migrate resolve --applied`, then regenerated Prisma client.

## 2026-04-29

- Added subtle facility branding controls: new `Facility.brandColor` setting editable by GM in **Admin > Organization**.
- Wired facility brand color into app-shell CSS variable theming and applied restrained accent usage to nav active states, key action buttons, and shell divider lines for clearer visual separation.
- Preserved low-noise styling intent: no full UI recolor; accent is used as a delineation layer only.
- Updated app shell scrolling so the left **Locations** column and center content move independently on desktop; mobile remains a single-column scroll.
- Reworked servery meal-service controls into a single control surface with a meal-period selector (Breakfast/Lunch/Dinner) that drives which ready/started actions are posted.
- Added local-time meal-period defaulting helpers so the selector prompts the expected meal period by time of day and falls back safely when a unit has limited configured slots.
- Synced memory bank docs (`progress-log.md`, `architecture-decisions.md`, and this session note) with the above UX changes.

## 2026-04-24

- Implemented shipped food-safety log template presets so facilities start with usable templates instead of a blank template catalog.
- Added shared preset source + applier in `prisma/apply-log-template-presets.mjs` and wired it into both `prisma/seed.mjs` and `scripts/provision-facility.mjs`.
- Added backfill utility `scripts/backfill-log-template-presets.mjs` plus npm script `db:backfill-log-presets` to retrofit existing facilities.
- Updated seed behavior to assign key presets to demo units (servery per-meal logs; central kitchen daily logs).
- Verified with `npx prisma db seed` from `ltc-manager/`.

## 2026-04-23

- Added operational servery timing capture with two distinct actions on unit dashboard: **Meal service ready** vs **Meal service started**.
- Introduced `ServeryMealServiceEvent` persistence model + migration (`20260423120000_servery_meal_service_events`) and recorder attribution fields.
- Added confirmation feedback banner after recording service timestamps.
- Built per-unit nested log IA: top-level **Overview / Logs**, with dynamic **Logs** subcategories from assigned template categories and built-in **Service Log** for serveries.
- Updated global `/logs` IA to match unit structure: parent **Logs** tab plus dynamic category sub-tabs and **Service Log** sub-tab.
- Applied UI contrast pass for new controls: larger/bolder action buttons and stronger tab contrast.

## 2026-03-30

- **Employees sub-nav:** Manager+ routes **Points**, **Terminations**, **HR audit**, and **Import** are tabs under `/employees` (order ends with **Import**); removed from crowded top nav. **`TopNav`** highlights **Employees** for all related paths; config in **`access.ts`**.
- **Directory:** **Search & filters** is **collapsible** (default collapsed; expands when filters active; **N active** when collapsed).
- Phases A–E complete per `implementation-phases.md`; memory bank and runbook aligned with facility, roles, PIN, provisioning, and docs.
- Added **`scripts/provision-facility.mjs`** / **`npm run db:provision`** for greenfield facility + GM user + employee PIN without full seed.
- Fixed **sign-out** flows: **`303`** redirects from logout routes so POST does not replay on `/login`.
- Hardened **PIN / device binding**: clear stale **`ltc_device_facility`** when facility missing; clearer **`pin-login`** errors; **`credentials: "include"`** on PIN fetch.
- Documented **npm vs npx**, **`cd ltc-manager`**, Prisma from project root, and PIN troubleshooting in **`runbook.md`**.
- **App shell header:** Grid layout; facility + session on separate truncated lines; **top nav** horizontal scroll instead of wrap; **GM** **split sign-out** (primary sign out + chevron **`details`** menu for **sign out & unbind**). See **`progress-log.md`** (Post–Phase E — app shell header) and **`architecture-decisions.md`** (App shell header).

## 2026-03-24

- Built and validated MVP Phases 0 through 6 end-to-end.
- Implemented auth, units, logs, dashboards, employees/staffing, assets/repairs, and reports.
- Applied migrations and seed data through Phase 5 schema additions.
- Added project memory bank files for durable context.
- Resolved local startup and DB setup friction (working dir, postgres role/db, migration permissions).
- Addressed hydration warning caused by browser extension attribute injection.
- Improved global form/button contrast behavior for better readability.

