# Architecture Decisions

## Stack

- Frontend: Next.js App Router + React + TypeScript
- Styling: Tailwind + global utility classes in `src/app/globals.css`
- ORM/DB: Prisma + PostgreSQL
- Auth: custom JWT session cookie (`jose`) + role checks in proxy; payload includes **`authKind`**: **`user`** (email/password) vs **`employee`** (facility PIN). User sessions populate `User`-linked audit fields where applicable; employee sessions use `submittedByEmployeeId` etc. Old tokens without `authKind` are treated as **`user`**.

## Routing & Access

- Protected app routes live under `src/app/(protected)/...`
- Public self-serve routes:
  - `/` (hero landing for logged-out users)
  - `/signup` (first-admin account creation)
  - `/setup` (guided onboarding wizard for GM until completion)
- Access control is role-priority based in `src/lib/access.ts` (`hasAtLeastRole`, `requireAtLeastRole`, `canAccessRoute`).
- Request guard is enforced in `src/proxy.ts` (also requires `facilityId` on the JWT).
- **Roles** (Prisma `RoleKey`): `GM` > `MANAGER` > `SUPERVISOR` > `LEAD_TEAM_MEMBER` > `STAFF` (STAFF = Team Member in UI). **Route minimums (summary):** `/settings` and `/admin` → GM (**`/settings`** redirects to **`/admin/organization`** for org profile / device binding); `/employees`, `/reports` → Manager+; `/units`, `/staffing`, `/assets` → Supervisor+; `/dashboard`, `/unit/*`, `/logs`, `/repairs` → all authenticated users (STAFF+). Server actions mirror this (e.g. unit CRUD requires Supervisor+, log template CRUD requires Manager+, log submit requires STAFF+).
- Onboarding gate (GM only): when `Facility.onboardingCompletedAt` is null, proxy redirects protected navigation to `/setup` except setup/billing onboarding APIs; once complete, `/setup` redirects back to `/dashboard`.

## Session shape (JWT cookie)

Cookie name: **`ltc_session`** (see `src/lib/auth.ts`). Payload fields (HS256 via **`jose`**):

| Field | Meaning |
|--------|---------|
| `uid` | `User.id` for email sessions; **`Employee.id`** for PIN sessions |
| `facilityId` | Required for all app routes |
| `authKind` | **`user`** (email/password) or **`employee`** (PIN); omitted in old tokens → treated as **`user`** |
| `role` | `RoleKey` — for employees, the employee’s operational role |
| `name`, `email` | Display / audit; employee email may be empty |
| `activeUnitId` | Optional; current unit focus for logs/navigation; set via **`/api/auth/active-unit`** |
| `kioskUnitAccessWarning` | Optional; **`true`** only for **employee** sessions when PIN login occurred on a **unit-locked** tablet and the employee’s **`EmployeeUnitAccess`** list is non-empty and does **not** include that unit (they may still work; see banner + audit row). |

Related: device binding cookies (see `src/lib/device-cookie.ts`) — **not** part of the JWT:

- **`ltc_device_facility`** — facility id; required for PIN pad on `/login`.
- **`ltc_device_unit`** — optional unit id; when present and valid for that facility, PIN login **forces** `activeUnitId` to that unit, redirects to **`/unit/{id}`**, and (for employee sessions matching this lock) the **Locations** sidebar greys out other units so they are not clickable.

## Auth route behavior (logout & PIN)

- **Logout redirects:** `POST /api/auth/logout` and `POST /api/auth/logout-full` use **`303 See Other`** when redirecting to `/login` so the browser follows with **GET**. Default `307` would repeat **POST** on `/login` and could hang the navigation.
- **Stale device cookies:** If **`ltc_device_facility`** points at a deleted facility id, **`GET /api/auth/device-facility`** clears facility + unit device cookies. If **`ltc_device_unit`** points at a missing/inactive unit, **`device-facility`** clears only the unit cookie; **`pin-login`** treats invalid unit as “no unit lock” and clears the stale unit cookie on success when appropriate.
- **Client fetch:** PIN pad uses **`credentials: "include"`** when posting to **`/api/auth/pin-login`** so HttpOnly cookies are sent reliably.

## Data Model Direction

- **`Facility`** is the tenancy boundary: users, units, employees, log templates, and equipment vendors are scoped with `facilityId`. One deployment typically has one facility row; multi-site is a future extension.
- Self-serve billing + onboarding state is anchored on `Facility`:
  - `billingEmail`
  - `stripeCustomerId`
  - `stripeDefaultPaymentMethodId`
  - `onboardingCurrentStep`
  - `onboardingStartedAt`
  - `onboardingCompletedAt`
- Optional manager onboarding emails are captured in `OnboardingManagerInvite` (`facilityId + email` unique) for low-touch GM follow-up and future invitation automation.
- Unit-driven model is foundational; unit names are not hardcoded per facility (`@@unique([facilityId, name])` on units and related entities).
- Log framework uses template -> assignment -> submission layering.
- Staffing separates defaults, planned schedules, and day-of overrides.
- Repairs are linked to unit and optionally asset/vendor.
- **Operational timing vs compliance submissions:** Servery service timing is stored in dedicated **`ServeryMealServiceEvent`** rows (unique by `unitId + serviceDate`) instead of `LogSubmission`. Rationale: this captures two distinct operational moments (`mealServiceReadyAt` and `mealServiceStartedAt`) with straightforward daily upsert semantics and clear ownership (`readyRecordedById` / `startedRecordedById`), without overloading compliance log template workflows.

## Self-serve onboarding + billing flow

- Signup bootstrap (`/api/auth/signup`) creates facility + GM user in one transaction, then issues session cookies and redirects to `/setup`.
- Onboarding wizard APIs:
  - `/api/onboarding/state` (load/update step state + facility profile)
  - `/api/onboarding/managers` (optional manager email capture)
  - `/api/onboarding/locations` (optional initial `Unit` creation)
- Billing (Stripe) APIs:
  - `/api/billing/setup-intent` creates/reuses Stripe customer and returns SetupIntent client secret
  - `/api/billing/payment-method/default` attaches + sets default payment method and advances onboarding state
  - `/api/billing/webhook` handles setup-intent success reconciliation.

## UX Direction

- Tablet-first, fast-entry forms
- Status-forward cards (complete/progress/alert)
- Strong contrast defaults for form controls and buttons

### App shell header (`AppShell`)

- **Layout:** CSS **grid** (`src/components/app-shell.tsx`): narrow screens use two columns (brand row + sign-out; full-width nav row); from **`lg`** up, three columns with a capped-width brand column, **flexible center**, and trailing actions.
- **Branding:** Facility name and session text are **stacked** with **truncation** to avoid one overloaded line when display names are long.
- **Top nav:** **`TopNav`** (`src/components/top-nav.tsx`) is **single-line**; the wrapper scrolls **horizontally** when items exceed width (`overflow-x-auto`, `flex-nowrap`, links `shrink-0`).
- **Employees area (Manager+):** **Points**, **Terminations**, **HR audit**, and **Import** are **secondary tabs** under `/employees` (`employees/layout.tsx`, `EmployeesSubNav`) so the global header stays shorter; **`TOP_NAV_ITEMS`** lists **Employees** once; **`isActivePath`** treats those sub-routes as part of **Employees**.
- **Sign out:** **`SignOutControls`** (`src/components/sign-out-controls.tsx`). **GM** gets a **split control**: main button signs out; a **chevron** opens a `<details>` panel for **Sign out & unbind device** (full logout + clear **`ltc_device_facility`** and **`ltc_device_unit`**). Other roles get a plain sign-out button only.
- **Shell scrolling behavior:** from **`lg`** up, the left **Locations** rail and main pane scroll independently (pane-level overflow with constrained shell height). On smaller screens, layout stays single-column with unified page scroll.
- **Kiosk unit banner:** When JWT has **`kioskUnitAccessWarning`**, **`AppShell`** renders **`KioskUnitAccessBanner`** (dismissible in the client for the current page session) above the main layout.
- **Servery service controls:** unit servery actions are grouped under a meal-period selector (Breakfast/Lunch/Dinner) rather than rendering one full action block per meal. The selector preselects a local-time daypart default (Breakfast 4:00–10:30, Lunch 10:30–2:30, Dinner thereafter through evening), then actions submit for the selected meal.
- **Brand accent system:** facility-scoped `brandColor` is set by GMs in **Admin > Organization** and exposed as a shell-level CSS variable (`--brand-accent`). Accent usage is intentionally limited to active-state controls, primary actions, and divider emphasis for better separation without introducing a high-saturation multicolor UI.

## PIN and facility binding

- **PIN format:** 6 digits, unique per facility when set.
- **Storage:** **`pinDigest`** = HMAC-SHA256 of facility id + PIN using **`AUTH_SECRET`** (`lib/pin.ts`). Enables O(1) lookup without scanning employees with bcrypt. This is **not** the same as storing a slow bcrypt hash of the PIN alone; threat model assumes **`AUTH_SECRET`** stays server-only. To rotate PINs after a secret leak, reassign PINs or rotate **`AUTH_SECRET`** (invalidates all sessions and digests—plan accordingly).
- **Device binding:** HttpOnly cookies on the browser (not in the JWT). **GM** applies binding from **Admin → Organization** via **`BindDeviceForm`** → **`POST /api/auth/bind-device`** with JSON **`{ unitId: string | null }`**: always refreshes **`ltc_device_facility`** to the current facility; **`unitId`** set writes **`ltc_device_unit`**, **`null`** clears unit lock (facility-wide PIN tablet).
- **PIN login on unit-locked tablets:** **`POST /api/auth/pin-login`** sets **`activeUnitId`** to the device unit (overrides schedule/primary resolution). Response includes **`redirectTo`** (`/unit/{id}` or **`/dashboard`** when no unit lock). Staff with restricted **`EmployeeUnitAccess`** who are **not** assigned to that unit still sign in; JWT gets **`kioskUnitAccessWarning: true`**, UI shows the banner, and a **`KioskUnitPinLoginEvent`** row is written (**`unassignedToUnit`**, optional **`clientIp`**).
- **PIN brute force:** **`lib/pin-rate-limit.ts`** — in-memory sliding window + lockout per facility + client key; **not** durable across processes—use **Redis** (or similar) in multi-instance production.

## Email (User) vs PIN (Employee)

- **`User`** records are for **email + password** sign-in (laptops, management). **Self-serve signup** (`/signup` → `/api/auth/signup`) creates the first **GM** `User` for a new facility; other accounts remain provisioned by admins, seed, or `npm run db:provision` as before.
- **`Employee`** records are the **roster** (directory, staffing, HR, PIN identity). **GM self-serve signup** also creates a matching **`Employee`** (same email, `RoleKey.GM`) so the GM appears on **Employees**; if a legacy GM `User` exists without a roster row, opening **`/employees`** runs **`ensureGmEmployeeRosterRow`** once to create the missing row (see `src/lib/ensure-gm-employee-roster.ts`). Optional bulk repair: **`npm run db:backfill-gm-roster`**.
- **`Employee`** records are operational people; **PIN** is assigned in-app (GM) for **facility-bound** browsers. Floor staff typically use **PIN** only; they do not receive a `User` row unless they also need email access.
- **Sidebar units:** Email sessions see **all** active units. **Employee** (PIN) sessions use **`EmployeeUnitAccess`**: if the employee has **no** access rows, they may use **all** active units; if they have rows, they are **restricted** to those units. **`primaryUnitId`** sets the default **active unit** when they sign in with PIN **unless** the browser has a valid **`ltc_device_unit`** cookie (then PIN login forces that unit). **`getSidebarUnitsForSession`** also injects the current **`activeUnitId`** into the list when it would otherwise be missing (e.g. kiosk override). **`LeftSidebar`** receives **`lockedUnitId`** from **`AppShell`** when `authKind === "employee"` and device unit cookie matches **`session.activeUnitId`**, and renders non-locked units as **non-clickable** grey text.

## Known Tradeoffs

- Prisma is pinned to v6 for stability in current workflow.
- `package.json#prisma` seed config is deprecated (non-blocking now; migrate later).

