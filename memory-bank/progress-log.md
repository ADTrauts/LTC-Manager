# Progress Log

## Phase 0 - Foundation + Security

Status: complete

- App scaffolded in `ltc-manager/`
- Auth/session APIs implemented
- Role-aware proxy guard implemented
- App shell, top nav, dynamic sidebar scaffolded
- Prisma baseline schema + seed added

Gate: typecheck/lint/build/db-validate passed

## Phase 1 - Units Builder

Status: complete

- Unit CRUD, activation, ordering, meal time config implemented
- Sidebar fully DB-driven from active units

Gate: typecheck/lint/build/db-validate passed

## Phase 2 - Logs Engine

Status: complete

- Log templates, template fields, assignments implemented
- Submission workflow and history implemented

Migration: `phase2_logs_engine` applied
Gate: typecheck/lint/build/db-validate passed

## Phase 3 - Dashboards

Status: complete

- Global dashboard cards + exception drill-down
- Unit dashboard live cards + quick-entry links

Gate: typecheck/lint/build/db-validate passed

## Phase 4 - Employees + Staffing

Status: complete

- Employee directory + status updates
- Default assignments
- Schedule entries + day-of overrides
- Dashboard staffing integration

Migration: `phase4_employees_staffing` applied
Gate: typecheck/lint/build/db-validate passed

## Phase 5 - Assets + Repairs

Status: complete

- Vendor + asset registry flows
- Repair ticket lifecycle + updates
- Dashboard repair visibility integration

Migration: `phase5_assets_repairs` applied
Gate: typecheck/lint/build/db-validate passed

## Phase 6 - Reports + UX Hardening

Status: complete

- Reports page with date/unit/status filters
- Core report sections for logs/temps/repairs/staffing
- Global contrast hardening for controls and status UI

Gate: typecheck/lint/build/db-validate passed

## Phase A — Facility + org profile + rebrand

Status: complete

- Added `Facility` model; migration `phase_a_facility` backfills existing rows to a default facility id.
- Scoped `User`, `Unit`, `Employee`, `LogTemplate`, and `Vendor` with `facilityId`; JWT session includes `facilityId`; queries and server actions enforce scope.
- Organization settings (GM): facility display name + management company; **`/settings`** redirects to **`/admin/organization`** in the app guard.
- Product rebrand to **LTC Manager** in metadata, shell, and login copy.

Migration: `phase_a_facility` applied
Gate: typecheck/lint/build/db-validate passed

## Phase B — Roles + permission matrix

Status: complete

- Extended `RoleKey` with `LEAD_TEAM_MEMBER`; `STAFF` remains the Team Member floor role (display name “Team Member” in `Role` seed/migration).
- Migrations: `phase_b_roles_enum` (add enum value) and `phase_b_roles_rows` (upsert `Role` rows for installs that skip `db:seed`).
- `src/lib/access.ts`: `ROLE_PRIORITY`, `canAccessRoute` prefix rules, `requireAtLeastRole`; nav and proxy aligned; server actions use `requireAtLeastRole` (e.g. units → Supervisor+, employees/reports → Manager+, org → GM, log submit → STAFF+).

Migrations: `phase_b_roles_enum`, `phase_b_roles_rows` applied
Gate: typecheck/lint/build/db-validate passed

## Phase C — PIN + facility-bound device UX

Status: complete

- **`Employee.pinDigest`** + optional **`LogSubmission.submittedByEmployeeId`**; migration `20260329150000_phase_c_pin`.
- **Auth:** `authKind` on JWT (`user` vs `employee`); email login sets device cookie; PIN login uses `ltc_device_facility` + HMAC digest lookup; middleware allows `/api/auth/pin-login` and `/api/auth/device-facility` without session.
- **UI:** `LoginGate`, `PinLoginForm`, GM **Floor PIN** on `/employees`, device binding on **Admin → Organization** (`BindDeviceForm`, `/api/auth/bind-device`), app shell shows PIN session vs user session + **Sign out & unbind device** for GM. **Post–Phase C:** optional **`ltc_device_unit`** unit lock, kiosk banner, **`KioskUnitPinLoginEvent`**, and **Locations** sidebar grey-out — see **“Unit-locked tablet (kiosk PIN) + sidebar”** below.
- **Rate limit:** in-memory PIN brute-force limits in `src/lib/pin-rate-limit.ts`.

Migration: `20260329150000_phase_c_pin` applied
Gate: `npm run typecheck`, `npm run lint`, `NODE_ENV=production npm run build` passed

## Phase D — Provisioning + unit access

Status: complete

- **`Employee.primaryUnitId`**, **`EmployeeUnitAccess`** (restrict PIN sidebar; empty = all units); migration `20260329160000_phase_d_employee_units`.
- **`getSidebarUnitsForSession`**, **`active-unit`** and **PIN login** respect allowed units; initial **active unit** from primary + access.
- **Employees** UI: unit access on create; **Edit profile** with full fields + redirect after save; seed clears **`EmployeeUnitAccess`** on reset; Jane demo row restricted to **1A Naval Park**.

Migration: `20260329160000_phase_d_employee_units` applied
Gate: typecheck, lint, `NODE_ENV=production` build, `db:validate` (run after pull)

## Phase E — Hardening + documentation

Status: complete

- **`runbook.md`:** Greenfield facility provisioning steps; GM **change facility / unbind**; **PIN reset** procedure; **dev credentials** table (seed email + pointer to `seed.mjs` for password); existing tablet/PIN flow retained.
- **`architecture-decisions.md`:** **Session shape** table (JWT fields + device cookie pointer); role matrix unchanged (already documented).
- No schema or migration changes.

Gate: `npm run lint`, `npm run typecheck`, `NODE_ENV=production npm run build`, `npm run db:validate`

**Next:** Phase F is backlog-only (multi-facility district, marketing signup, SSO)—do not implement until product requests.

## Unit-locked tablet (kiosk PIN) + sidebar

Status: complete

- **Device cookies:** **`ltc_device_unit`** (optional) alongside **`ltc_device_facility`**; **`GET /api/auth/device-facility`** returns **`{ facility, unit }`**; **`POST /api/auth/bind-device`** JSON **`{ unitId }`** or **`null`**; **`logout-full`** clears both device cookies.
- **PIN login:** Forces **`activeUnitId`** to device unit when set; JSON response **`redirectTo`** (`/unit/...` vs `/dashboard`); stale unit cookie cleared when invalid.
- **JWT / UX:** **`kioskUnitAccessWarning`** on session when restricted employee signs into a unit-locked tablet for a unit they are not assigned to; **`KioskUnitPinLoginEvent`** Prisma model + migration **`20260501120000_kiosk_unit_pin_login_event`**; **`KioskUnitAccessBanner`** in **`AppShell`**; login gate shows locked unit name on PIN form.
- **Navigation lock:** **`LeftSidebar`** greys out non-locked unit links when **`AppShell`** passes **`lockedUnitId`** (employee session + device unit cookie matches **`activeUnitId`**).
- **Sidebar list:** **`getSidebarUnitsForSession`** appends current **`activeUnitId`** when missing from filtered list (kiosk override).
- **`active-unit` API:** Employee may **keep** current unit even if not in **`EmployeeUnitAccess`** (same `unitId` as session); preserves **`kioskUnitAccessWarning`** when reissuing JWT.

**Files (representative):** `src/lib/device-cookie.ts`, `src/app/api/auth/{device-facility,bind-device,pin-login,active-unit,logout-full}/route.ts`, `src/lib/auth.ts`, `src/components/{bind-device-form,login-gate,pin-login-form,kiosk-unit-access-banner,left-sidebar,app-shell}.tsx`, `prisma/schema.prisma`, `prisma/migrations/20260501120000_kiosk_unit_pin_login_event/`.

Gate: `npx tsc --noEmit` after schema/migration (run **`npm run db:validate`** / **`migrate deploy`** in each environment).

## Post–Phase E — operational fixes (auth + PIN)

Status: complete (no new migrations)

- **Logout / unbind:** `303` redirects from **`/api/auth/logout`** and **`/api/auth/logout-full`** (fixes stuck spinner on sign-out).
- **PIN login:** validate facility id exists; clear invalid **`ltc_device_facility`** cookie; **`device-facility`** GET clears cookie when facility row missing; **`pin-login`** fetch uses **`credentials: "include"`**.
- **Runbook:** troubleshooting for “Invalid PIN” (**`AUTH_SECRET`** vs digest, stale cookie after DB reset, re-save PIN in Employees).
- **Provisioning:** **`scripts/provision-facility.mjs`** + **`npm run db:provision`** for blank facility + GM user + employee PIN (documented in **`runbook.md`**).

Gate: lint / typecheck / production build as run during changes

## Post–Phase E — app shell header layout (UX)

Status: complete (no migrations)

- **Congestion:** Header uses a **CSS grid** so branding, navigation, and account actions stay predictable on wide and narrow viewports.
- **Branding:** Facility **display name** and **session label** are on **separate lines** (both `truncate`) instead of one long “Facility · Signed in as …” string.
- **Top navigation:** `TopNav` uses **`flex-nowrap`** with **`shrink-0`** links; the nav sits in a parent with **`overflow-x-auto`** and thin scrollbar styling so many items stay on **one row** and scroll horizontally when needed (no second wrap row).
- **Sign out (GM):** Two buttons replaced by **`SignOutControls`**: primary **Sign out** (`POST /api/auth/logout`) plus a **chevron** on a `<details>` control that reveals **Sign out & unbind device** (`POST /api/auth/logout-full`, same tooltip as before). Non-GM users still see a single sign-out button.

**Files:** `src/components/app-shell.tsx`, `src/components/top-nav.tsx`, `src/components/sign-out-controls.tsx`

## Post–Phase E — Employee HR + union discipline (directory)

Status: complete (see also `memory-bank/employee-hr-source-of-truth.md`)

- **Employees UX:** Consolidated **employee cards** (directory + profile + assignments); collapsible sections; **Manager+** HR profile edits; **GM-only** floor PIN block.
- **HR fields:** Union member, hire date, classification, multi-**station**, CHRC, shirt, notes, on-leave, birthday month/day; **directory filters** (search, union, classification, station, CHRC, leave).
- **Union member** is the **single** union boolean — covers seniority context and union discipline UI (migration `20260330200000_drop_union_discipline_tracking_column` removed the redundant column).
- **Discipline:** `DisciplinePointEntry` + card UI for union members; **`/employees/points-summary`** for facility totals &gt; 0.
- **Dashboard:** **Birthdays this month** with anchors to `#employee-{id}` on `/employees`.
- **Docs:** `employee-hr-source-of-truth.md` tracks shipped vs backlog (terminations, handbook PDF, audit).

Gate: `npm run lint`, `npm run typecheck`, `NODE_ENV=production npm run build`, `npm run db:validate` after migrations

## Post–Phase E — Terminations + CHRC offboarding (slice 1)

Status: complete (see `employee-hr-source-of-truth.md` §2 / §5.3)

- **`Employee` fields:** `terminationDate` (date), `chrcOffboardingCompletedAt`, `chrcOffboardingNotes`; cleared when employment status is not `TERMINATED` (profile save and `updateEmployeeStatusAction`).
- **Profile UI:** Termination section when status draft is **Terminated** (controlled status select on the employee card).
- **Directory:** Filter by **employment status** (`/employees?status=…`).
- **Backlog:** Immutable termination record + snapshot + dedicated report; field-level **audit log**.

Migration: `20260330213000_employee_termination_chrc_offboarding`
Gate: lint, typecheck, production build, `db:validate` after migrate

## Post–Phase E — HR backlog closure (handbook, audit, terminations, directory)

Status: complete

- **Union handbook:** Facility fields + GM upload on **Admin → Organization** (`/admin/organization`; **`/settings`** redirects); PDF stored under **`uploads/facilities/{facilityId}/`** (gitignored); **Managers+** download via **`GET /api/facility/union-handbook`**; link in union **discipline** card.
- **HR audit:** `EmployeeHrAuditLog` — profile field diffs on save; **PIN** set/clear for GM; **`/employees/hr-audit`** (500 rows).
- **Termination records:** `EmployeeTerminationRecord` with JSON snapshot when status transitions **to** `TERMINATED` (profile save or `updateEmployeeStatusAction`); **`/employees/terminations`**.
- **Employees directory:** Filters **has discipline points**, **birth month**; **sort** (name, hire date, status). *(Superseded for nav: Terminations + HR audit were added to top nav here; later moved under **Employees** sub-nav — see **Post–Phase E — Employees section navigation + filters** below.)*

Migration: `20260330220000_hr_backlog_handbook_audit_terminations`

Gate: `npm run lint`, `npm run typecheck`, `NODE_ENV=production npm run build`, `npm run db:validate`

## Post–Phase E — CSV roster import

Status: complete (no new migrations — uses existing `Employee` and related fields)

- **`/employees/import`:** Managers+ upload CSV; template download; row-level errors + created/updated counts.
- **Server action:** `importEmployeesFromCsvAction` — upsert by **email** (case-insensitive) or **first + last name** (errors on ambiguous matches); new rows cannot start as **TERMINATED**; updates can terminate and write **`EmployeeTerminationRecord`** when transitioning; work stations synced; **primary unit** by name when column present.
- **Helpers:** `src/lib/csv-parse.ts`, `src/lib/employee-csv-import.ts`; **Nav:** **Import** under **Employees** sub-nav (see Post–Phase E — Employees section navigation + filters).

Gate: `npm run lint`, `npm run typecheck` (see `employee-hr-source-of-truth.md` §2)

## Post–Phase E — Employees section navigation + filters (UX)

Status: complete (no migrations)

- **Top nav:** A single **Employees** item for manager HR surfaces (no separate top-level **Points**, **Import**, **Terminations**, **HR audit**).
- **Sub-nav** (`src/components/employees-sub-nav.tsx`, `src/app/(protected)/employees/layout.tsx`): **Manager+** see a second tab row on all `/employees/*` routes — **Employees** · **Points** · **Terminations** · **HR audit** · **Import** (**Import** last).
- **Top nav active state** (`src/components/top-nav.tsx`): **Employees** stays selected for the directory, points summary, import, terminations, and HR audit paths.
- **Config** (`src/lib/access.ts`): `TOP_NAV_ITEMS` lists **Employees** once; sub-routes are not duplicated in the header.
- **Directory filters:** Collapsible **Search & filters** (`src/components/employees-filters-collapsible.tsx`); collapsed by default, auto-expands when any filter is non-default; **N active** badge when collapsed with active filters. Helpers: `hasNonDefaultEmployeeFilters` / `countNonDefaultEmployeeFilters` in `src/lib/employee-directory-filters.ts`; **`embedded`** form variant in `src/components/employees-filters.tsx`.

Gate: `npm run lint`, `npm run typecheck`

## Post–Phase E — Employee card tabs + CHRC report (2026-03-31)

Status: complete (no migrations)

- **Employee cards** (`src/components/employee-management-card.tsx`): Tabbed expanded body — **Personal**, **HR & Union**, **CHRC**, **Assignments**, **Discipline** (union); single **Save profile**; **Floor PIN** in footer for GMs. HR form split in `employee-hr-form-fields.tsx` (`EmployeeHrUnionFormSection`, `EmployeeChrcFormSection`; `EmployeeHrFormFields` unchanged for create drawer).
- **CHRC report:** **`/employees/chrc-report`** — non-terminated roster in two tables: **Cleared** vs **Not cleared**; links to `#employee-{id}` on `/employees`.
- **Nav:** `employees-sub-nav.tsx` adds **CHRC** after Terminations; `top-nav.tsx` keeps **Employees** active for `chrc-report`.

Gate: lint, typecheck, production build (run after changes)

## Post–Phase E — Unit meal-service operational logging + nested Logs IA (2026-04-23)

Status: complete

- Added `ServeryMealServiceEvent` model and migration `20260423120000_servery_meal_service_events` to store per-unit/per-day operational timestamps:
  - `mealServiceReadyAt` (servery setup complete)
  - `mealServiceStartedAt` (nursing distribution start)
  - recorder user references for each timestamp
- Unit dashboard (`/unit/[unitId]`) now has two top-corner actions for serveries:
  - **Meal service ready**
  - **Meal service started**
  These upsert into `ServeryMealServiceEvent`, revalidate unit/dashboard, and show a success banner on return.
- Unit information architecture updated to nested tabs:
  - top-level: **Overview** and **Logs**
  - **Logs** subcategories auto-generated from assigned log template categories for that unit
  - serveries include built-in **Service Log** subcategory
- Main `/logs` IA now mirrors nested structure:
  - top-level includes **Logs** parent tab
  - subcategories include built-in **Service Log** plus dynamic category tabs from templates
  - category views show recent submissions; Service Log shows facility-wide servery timing records
- Contrast/accessibility polish for newly-added controls:
  - larger, bolder meal-service buttons
  - stronger visual contrast for primary tabs and log sub-tabs (active + inactive states)

Migrations:
- `20260423120000_servery_meal_service_events`
- `20260423105656` (auto-generated follow-up: drops default on `ServeryMealServiceEvent.updatedAt`)

Gate: `npm run typecheck` and targeted lints passed during implementation

## Post–Phase E — Shipped log template presets (2026-04-24)

Status: complete (no new migrations)

- Added shared preset catalog and applier in `prisma/apply-log-template-presets.mjs`:
  - `Unit Cooler Temp Log` (PER_MEAL)
  - `Servery – Hot and cold holding` (PER_MEAL)
  - `Walk-in cooler temperature` (DAILY)
  - `Walk-in freezer temperature` (DAILY)
  - `Dishwashing – high-temp / machine` (DAILY)
  - `Dry storage – ambient` (DAILY)
  - `Receiving – TCS / cold chain` (DAILY)
- Presets are upserted per facility (`facilityId + name`) and template fields are refreshed to keep shipped definitions consistent.
- `prisma/seed.mjs` now applies all presets, replacing the previous single hardcoded cooler template block.
- Seed adds demo assignments for core workflows:
  - Servery: cooler temp + hot/cold holding (per meal)
  - Central Kitchen: walk-in cooler + dishwashing (daily)
- `scripts/provision-facility.mjs` now applies preset templates during blank-facility provisioning.
- Added `scripts/backfill-log-template-presets.mjs` and package script `db:backfill-log-presets` to apply presets to pre-existing facilities.

Gate: `npx prisma db seed` passed after changes

## Post–Phase E — Servery per-meal live states + dashboard IA polish (2026-04-26 to 2026-04-29)

Status: complete

- **Servery events are now per meal period** (`BREAKFAST`/`LUNCH`/`DINNER`) instead of one row per day:
  - `ServeryMealServiceEvent.mealType` added
  - unique key changed to `(unitId, serviceDate, mealType)`
  - action upsert now targets `unitId_serviceDate_mealType`
- Added migration `20260424120000_servery_meal_service_per_meal`:
  - adds `mealType` column
  - replaces unique index
  - applied with `prisma migrate deploy` in local environment during implementation
- Added shared servery window helpers in `src/lib/servery-meal-service.ts`:
  - 1-hour live window for ready/started timestamps
  - live-stamp formatter for control labels
  - board visibility predicate used by dashboard
- **Unit servery controls** (`src/components/servery-meal-service-controls.tsx` + unit page wiring):
  - meal period selector + per-meal button posts (`mealType` hidden input)
  - ready/started labels auto-reset to `Not recorded` after 1 hour
  - service log history now shows meal column
- **Global dashboard meal boards** (`src/app/(protected)/dashboard/page.tsx`):
  - serveries appear per meal only while that meal has a live ready/started timestamp
  - status text updated to operational states; `Ready` and `Started` rendered independently
  - color coding: `Ready` in yellow, `Started` in green
  - meal boards moved to first section on Units tab
- **Dashboard IA update**:
  - added `Units` / `Employees` tabs on dashboard
  - birthdays moved under `Employees` tab
  - removed dashboard subtitle and aligned tabs on same row as title
- **Unit page top spacing fix**:
  - moved `Overview`/`Logs` nav into the left header column under the unit title
  - removes large empty vertical gap when the right-side servery controls are tall

Gate: `npm run typecheck` passed after each change-set; lints clean on edited files

## Post–Phase E — App shell independent scroll + servery meal-period selector (2026-04-29)

Status: complete (no migrations)

- **App shell layout** (`src/components/app-shell.tsx`, `src/components/left-sidebar.tsx`):
  - desktop (`lg+`) now uses independent vertical scrolling for the **Locations** sidebar and the main content pane
  - header/footer are fixed within the shell; content area is constrained with `h-dvh`, `min-h-0`, and pane-level `overflow-y-auto`
  - mobile keeps a single-column flow with unified scroll behavior
- **Servery meal-service UX** (`src/components/servery-meal-service-controls.tsx`, `src/app/(protected)/unit/[unitId]/page.tsx`):
  - replaced stacked per-meal action cards with one control surface and a meal-period selector (Breakfast/Lunch/Dinner based on configured unit slots)
  - ready/started actions post using the currently selected meal period
- **Time-based prompting defaults** (`src/lib/servery-meal-service.ts`):
  - introduced daypart helper for local-time defaults:
    - Breakfast: 4:00 AM–10:30 AM
    - Lunch: 10:30 AM–2:30 PM
    - Dinner: 2:30 PM–9:00 PM (plus late-evening default through midnight)
  - selector preselects the time-appropriate meal period when available for the unit; otherwise falls back to available slot order

Gate: `npx tsc --noEmit` passed; eslint clean on edited files

## Post–Phase E — Subtle brand-accent theming + org color setting (2026-04-29)

Status: complete

- Added optional facility-level brand accent color (`Facility.brandColor`) with migration `20260424073000_facility_brand_color`.
- Admin Organization now includes a GM-editable **Brand accent color** picker (`/admin/organization`) alongside facility profile settings.
- App shell now injects a CSS variable (`--brand-accent`) from facility settings and applies subtle accent treatment to:
  - header/footer/sidebar separators
  - active top-nav and sidebar states
  - key primary actions (e.g., organization save, bind-device action)
- Kept palette intentionally restrained: accent is used for delineation and active-state clarity, not full-surface recoloring.

Gate: `npm run db:generate`, `npm run typecheck` passed after implementation

## Post–Phase E — Menu cycle builder + operational menu wiring (2026-05-01)

Status: complete

- Added menu planning infrastructure for repeating cycle menus:
  - `MenuSettings` supports cycle length (3/4), week start day, anchor date, and dynamic period/category configuration JSON.
  - `MenuItem` rows keyed by facility/week/day/meal period/category with ordered entries.
- Implemented `/menus` with:
  - top-level **Builder** and **Settings** tabs
  - week/day tab navigation for one-day-at-a-time editing
  - selected-day and current-cycle live preview panels
- Settings UX supports configurable periods and categories; duplicate labels/keys/categories are normalized/deduped before save.
- Builder switched from freeform textarea to line-by-line entry with per-category save and `itemsJson` payload handling in server actions.
- Added optional structured row fields in persistence (`portionValue`, `portionUnit`, `entryType`) and enum `MenuItemEntryType`; backend keeps these fields even after UI simplification to item-only entry.
- Wired menu data into:
  - servery unit page contextual menu display
  - logs temperature checklist menu hints
  via shared helpers in `src/lib/menu-cycle.ts` and `src/lib/menu-db.ts`.
- Added graceful menu infrastructure checks (`assertPrismaMenuReady`, delegate/table guards) so stale clients or missing menu tables show actionable guidance.

Migrations:
- `20260429174000_menu_cycle_builder`
- `20260430110000_menu_period_builder`
- `20260430180000_menu_item_portions` (applied with forward-only `prisma db execute` + `prisma migrate resolve --applied`)

Gate: `./node_modules/.bin/tsc --noEmit` passed on edited code; Prisma client regenerated after schema updates

## Post–Phase E — Admin-managed jobs and route permissions (2026-05-05)

Status: complete

- Added DB-backed permission entities:
  - `Role.isActive`
  - `AppRoute` (canonical route prefixes + nav metadata)
  - `RoleRoutePermission` (per-role route allow matrix)
- Added migration `20260505104000_admin_route_permissions` and seed updates to preserve existing role hierarchy defaults at rollout.
- Replaced hard-coded route/nav access checks with DB-backed permission resolution:
  - `src/lib/route-permissions.ts` provides longest-prefix evaluation, nav item projection, and cache invalidation.
  - `src/proxy.ts` now checks `canAccessRouteByRole(...)`.
  - `src/components/app-shell.tsx` and `src/components/top-nav.tsx` now render nav from DB permissions.
- Added GM-only permissions management UI:
  - `/admin/permissions` page for role metadata editing, active/inactive toggles, route matrix toggles, and role-permission clone.
  - Linked from `/admin`.
  - Safety guard prevents unassigning all active roles from critical routes.
- Login hardening:
  - `/api/auth/login` now requires both active user and active role.
- Validation/tests:
  - Added `src/lib/route-permissions.test.ts` for prefix resolution behavior.
  - Typecheck and targeted lint on changed files passed.
- Local operational note:
  - `prisma migrate dev` was blocked by historical migration drift in local DB.
  - Used non-destructive `prisma db push` + `db:seed` to align schema without reset.

## Post–Phase E — Self-serve onboarding + Stripe card setup (2026-05-08)

Status: complete

- Added a public acquisition funnel:
  - `/` now serves a hero landing page for logged-out users.
  - `/signup` provides first-admin account creation with clear CTA progression.
- Added atomic signup bootstrap API (`/api/auth/signup`) that creates:
  - `Facility` (name + optional management company)
  - first GM `User` (email/password)
  - authenticated session + onboarding redirect.
- Added guided onboarding flow at `/setup` with resume-friendly state:
  - facility profile step
  - optional manager email step
  - optional initial locations step (creates `Unit` rows)
  - billing step (Stripe Elements + SetupIntent).
- Added onboarding and billing persistence on `Facility`:
  - `billingEmail`, `stripeCustomerId`, `stripeDefaultPaymentMethodId`
  - `onboardingCurrentStep`, `onboardingStartedAt`, `onboardingCompletedAt`
  - plus `OnboardingManagerInvite` model for manager-email capture.
- Added billing backend routes:
  - `/api/billing/setup-intent`
  - `/api/billing/payment-method/default`
  - `/api/billing/webhook`
- Updated proxy gating:
  - GM users with incomplete onboarding are redirected to `/setup`
  - completed facilities bypass setup and go to `/dashboard`.
- Added post-onboarding dashboard completion checklist via `?onboarding=complete`.
- Added launch hardening assets:
  - lightweight telemetry events for signup/onboarding/billing milestones
  - smoke test checklist in `docs/self-serve-smoke-test.md`.

Migration:
- `20260508071500_self_serve_onboarding_billing`

Gate:
- `npm run db:generate` passed
- `npm run typecheck` passed
- `npm run lint` reported pre-existing unrelated lint errors outside this slice (`menu-day-builder`, `units-manager`, `use-nav-pathname`).

## Post–Phase E — Self-serve follow-ups: onboarding escape hatch + GM roster (2026-05-09)

Status: complete

- **Legacy facilities trapped in `/setup`:** migration `20260509140000_backfill_legacy_onboarding_complete` sets `onboardingCompletedAt` + `onboardingCurrentStep = complete` for facilities that never started self-serve (`onboardingStartedAt` null), so seeded GMs are not forced through the wizard after new columns ship.
- **Stripe not configured:** `GET /api/onboarding/state` exposes `stripeBillingReady`; setup wizard can **finish without card** when Stripe keys are incomplete; `PATCH` completion with Stripe fully configured requires a saved default payment method (or skip path when keys absent).
- **Setup UX:** `/setup` includes **Sign out** (POST `/api/auth/logout`) and clearer billing messaging.
- **GM appears on Employees roster:** self-serve signup (`/api/auth/signup`) now creates matching **`Employee`** (same email, `RoleKey.GM`, active, full-time) alongside **`User`**; helper `src/lib/roster-name.ts` derives first/last from signup display name.
- **Idempotent roster repair:** `src/lib/ensure-gm-employee-roster.ts` runs at start of **`/employees`** for email-session **GM** users—creates missing `Employee` row if none exists for that facility + email (covers pre-fix signups without manual SQL).
- **Optional CLI backfill:** `npm run db:backfill-gm-roster` → `scripts/backfill-gm-employees-from-users.mjs` for bulk repair without opening the UI.
- **UI polish:** `.app-accent-button` uses white text so dark accent buttons remain readable.

Migrations:
- `20260509140000_backfill_legacy_onboarding_complete`

Gate: `npm run typecheck` passed on touched files.

## Post–Phase E — Departments admin + Employees roster department tabs (2026-05-15)

Status: complete

### Problem / direction (product)

- Earlier experiment scoped the **entire** Employees area by `?dept=` and hid the roster when no department was assigned — users could not assign departments and saw an empty list.
- Desired model: **GM configures which departments exist in the employee app** under **Admin → Departments** (`showInEmployeeApp`); **department tabs** on **all** `/employees/*` routes filter HR views by enabled department; **section** tabs (Points, CHRC, etc.) stay in `EmployeesSubNav` and **preserve `?dept=`** when switching views.

### Schema & migrations

- **`Department.showInEmployeeApp`** (`Boolean`, default `true`) — when `false`, department is hidden from employee primary-department pickers and similar HR UI; index on `(facilityId, showInEmployeeApp)`.
- **`Department.headEmployeeId`** — operational department lead (must be on department roster); distinct from app permission tier (`RoleKey` / GM).
- Migrations:
  - `20260514220000_department_head_employee`
  - `20260515200000_department_show_in_employee_app`
- Default departments (Dietary, EVS, Plant Operations) still seeded per facility via `src/lib/ensure-default-departments.ts` with `showInEmployeeApp: true` on **create** only.

### Admin → Departments (`/admin/departments`)

- Linked from **`/admin`**.
- Per active department: toggle **In employee app** (yes/no); cannot hide while any employee has that department as **primary** or **`EmployeeDepartment`** membership.
- **Department head** select (visible departments only): lists **on-roster** employees in one optgroup and **all other active** employees in another; **Save head** adds primary or floater membership when the chosen person is not yet on that department roster.
- Server actions: `setDepartmentShowInEmployeeAppAction`, `setDepartmentHeadAction` in `src/app/(protected)/admin/departments/actions.ts`.

### Employees layout — two tab rows (`employees/layout.tsx`)

1. **Department tabs** (`EmployeesDepartmentTabs`) — first row on **every** `/employees/*` page; tabs = departments with **`showInEmployeeApp: true`** plus **All departments**. Uses current pathname so switching department **stays on the same view** (e.g. Points + Dietary stays on Points).
2. **Section sub-nav** (`EmployeesSubNav`) — second row; links append **`?dept=`** when a department is selected.

Shared server/client helpers: **`src/lib/employees-department-tabs.ts`**

- `loadEmployeeAppDepartments`, `resolveEmployeesDeptScope` (invalid `dept` → redirect on current path)
- `employeeWhereForFacilityAndDept` / `employeeBelongsToDepartmentWhere` — primary **or** `EmployeeDepartment`
- `hrefWithEmployeesDept` — “Open card” links keep department context

### Views filtered by `?dept=` (when a department tab is selected)

| Route | What is scoped |
|-------|----------------|
| `/employees` | Directory cards + directory filters (`EmployeeDirectoryQuery.dept` → `buildEmployeeWhere`) |
| `/employees/points-summary` | Discipline point totals |
| `/employees/chrc-report` | Cleared / not cleared tables |
| `/employees/separations` | Termination records + “Record separation” roster |
| `/employees/hr-audit` | Audit log rows (last 500) |
| `/employees/import` | **Not** department-scoped (facility-wide CSV) |

- **All departments** clears `dept` and shows the full facility on each view.
- Page subtitles note the active department when filtered (e.g. “Showing Dietary only”).
- **Filters** on directory (`employees-filters.tsx`): hidden `dept` field so **Apply** does not drop the tab.

### Employees directory — other behavior

- **Profile department save fix:** dropdown includes visible departments **plus** any employee’s current primary if hidden (labeled “hidden in app”); server validation accepts active facility departments so saves do not silently clear to “Not set”.
- **Add employee:** **`primaryDepartmentId` required** in `createEmployeeSchema` + UI (no “Not set”; defaults to first visible department; submit disabled if none enabled — message points to Admin → Departments).

### Anti-patterns (do not reintroduce)

- `employees-nav-shell.tsx`, `employees-department-tab-scope.ts`
- Facility-wide **`?dept=` redirect** that hid the roster or blocked assigning departments before any employee had a primary department

### Key files

| Area | Path |
|------|------|
| Admin UI | `src/app/(protected)/admin/departments/page.tsx` |
| Admin actions | `src/app/(protected)/admin/departments/actions.ts` |
| Layout (both tab rows) | `src/app/(protected)/employees/layout.tsx` |
| Department tabs (client) | `src/components/employees-department-tabs.tsx` |
| Section sub-nav (client) | `src/components/employees-sub-nav.tsx` |
| Dept scope helpers | `src/lib/employees-department-tabs.ts`, `src/lib/employee-department-scope.ts` |
| Directory filters | `src/lib/employee-directory-filters.ts` |
| Scoped pages | `employees/page.tsx`, `points-summary/page.tsx`, `chrc-report/page.tsx`, `separations/page.tsx`, `hr-audit/page.tsx` |
| Create drawer | `src/components/create-employee-drawer.tsx` |
| Employee actions | `src/app/(protected)/employees/actions.ts` |

### Facility Administrator, department-scoped nav, repairs routing

- **`RoleKey.FACILITY_ADMINISTRATOR`** tops `GM` for facility-wide **`/admin`**, onboarding APIs, Stripe billing helpers, device bind/unbind, and permissions/org server actions.
- **`/signup`** seeds the hub user + roster row as **`FACILITY_ADMINISTRATOR`** (see `signup/route.ts`, `ensure-gm-employee-roster.ts`).
- **Repairs:** `RepairTrade` on create + `suggestRepairDepartmentIds`; EVS **`createEvsRepairTicketAction`** + board form (no Repairs nav for EVS per `department-nav.ts`).
- **Assets:** `departmentId` on **`createAssetAction`** / **`updateAssetDepartmentAction`** with unit-based default fallback.
- **Tests:** extended `credential-policy.test.ts`, `route-permissions.test.ts` for FA semantics.

Gate: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc --noEmit` passed after implementation.
