# Runbook

## Start App

```bash
cd "/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager"
npm run dev
```

## Environment

Required in `.env`:

- `DATABASE_URL`
- `AUTH_SECRET`
- `STRIPE_SECRET_KEY` (self-serve billing step)
- `STRIPE_WEBHOOK_SECRET` (Stripe webhook verification)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Stripe Elements on `/setup`)

Typical local DB URL:

`postgresql://USER:PASSWORD@127.0.0.1:5432/ltc_manager?schema=public`

**Union handbook PDF:** GM uploads under **Organization** store files under `uploads/facilities/{facilityId}/` (gitignored). Back up this folder with your deployment backups if you rely on handbook storage.

## Database Commands

```bash
npm run db:generate
npm run db:migrate:dev -- --name <migration_name>
npm run db:seed
npm run db:backfill-log-presets
npm run db:backfill-gm-roster
npm run db:validate
```

`db:backfill-log-presets` inserts/updates shipped log templates for all existing facilities (useful after adding new preset templates to a live or long-running local DB).

`db:backfill-gm-roster` adds **`Employee`** roster rows for active **GM** **`User`** accounts that have the same email but no matching employee at that facility (covers GMs who self-signed up before roster auto-create shipped).

### New database without `db:seed`

Migrations include **facility backfill** (Phase A), **`Role` lookup rows** (Phase B), and enum values so you can run **`npx prisma migrate deploy`** without seeding. You still need at least one **`Facility`** row, one **`User`** (with `facilityId`, `roleId`, bcrypt `passwordHash`), and your operational data—or use `npm run db:seed` when you want the demo dataset.

## Facility provisioning (greenfield)

Use this when standing up a **new** database with **no** seed data.

1. Copy **`.env.example`** to **`.env`** and set **`DATABASE_URL`**, **`AUTH_SECRET`** (long random string; required for JWT and PIN digests).
2. From **`ltc-manager/`**: `npx prisma migrate deploy` then `npx prisma generate`.
3. Create a **facility** row (display name, optional management company) and at least one **`Role`** row if your install did not run migrations that upsert roles—most migrations already ensure **`Role`** rows exist.
4. Create a **`User`** with **`facilityId`**, **`roleId`** pointing to the GM (or desired) role, **`email`**, and **`passwordHash`** (bcrypt), or use the self-serve route at `/signup` after app boot if the deployment is intended for customer-led setup.
5. Sign in at **`/login`** with that user, configure **Admin → Organization** (`/admin/organization`), then **bind** tablets as needed.

For local development, **`npm run db:seed`** provisions a demo facility, GM user, units, and sample employees (see **Dev credentials** below).

## Self-serve onboarding flow (delivered)

1. Logged-out user visits `/` and clicks **Start free setup**.
2. User creates first-admin account at `/signup`.
3. App creates facility + GM user, signs them in, and redirects to `/setup`.
4. GM completes guided steps:
   - Facility profile (name, optional management company, billing email)
   - Optional manager emails
   - Optional initial locations
   - Stripe card setup (SetupIntent; no immediate charge)
5. App marks onboarding complete and redirects to `/dashboard?onboarding=complete`.

Notes:

- While onboarding is incomplete, GM navigation is forced to `/setup` by proxy guard.
- **Stripe optional in dev:** if **`STRIPE_SECRET_KEY`** and **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** are not both set, the wizard offers **finish without card**; when both are set, completing onboarding requires a saved card (or complete via the normal Elements flow).
- **Existing databases** after onboarding columns ship: run **`npx prisma migrate deploy`** so migration **`20260509140000_backfill_legacy_onboarding_complete`** marks pre-self-serve facilities complete (avoids trapping seeded GMs in `/setup`).
- Stripe card collection for the full in-wizard flow depends on the three Stripe env vars above.
- **GM missing from Employees roster:** open **`/employees`** once (auto-fix), or run **`npm run db:backfill-gm-roster`** from `ltc-manager/`.
- Use `docs/self-serve-smoke-test.md` as a pre-release verification checklist for this flow.

### Departments (employee app visibility + heads)

After pulling code that adds department admin / roster tabs, apply:

```bash
cd "/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager"
npx prisma migrate deploy
npx prisma generate
```

Relevant migrations:

- `20260514220000_department_head_employee` — `Department.headEmployeeId`
- `20260515200000_department_show_in_employee_app` — `Department.showInEmployeeApp` (default `true` for existing rows)

**GM workflow:** **Admin → Departments** (`/admin/departments`) — turn departments on for the employee app, assign department heads. If **Add employee** is disabled for department, enable at least one department there.

**Employees area:** department tabs appear on **all** `/employees/*` pages (layout). `?dept=<id>` filters **directory**, **points summary**, **CHRC report**, **separations**, and **HR audit** to employees whose **primary** department matches or who have an **`EmployeeDepartment`** row. **Import** is not filtered by department. **All departments** clears `dept`. Invalid `dept` values redirect on the **current** path without `dept`. Section tabs (Points, CHRC, etc.) keep `dept` in the URL when switching views.

### Shipped log template presets

- Presets are included in both:
  - `npm run db:seed` (seed facility + demo data)
  - `npm run db:provision` (blank facility flow)
- For databases created before presets existed, run:

```bash
cd "/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager"
npm run db:backfill-log-presets
```

- If npm reports missing scripts or `npx prisma` tries to install an unexpected version, confirm you are in `ltc-manager/` (not the parent `LTC Manager/` folder).

### Blank facility + one GM (no sample units/logs)

Use this when you want an **empty** app except one facility, one **User** (email/password), and one **Employee** (same person, for **PIN** testing after bind).

1. **Empty database** — create a new Postgres DB and point **`DATABASE_URL`** at it.
2. **`npx prisma migrate deploy`** and **`npx prisma generate`**.
3. Set secrets **only in your shell** (do not commit):

```bash
FACILITY_DISPLAY_NAME="Terrace View" \
GM_EMAIL="you@company.com" \
GM_PASSWORD='your-secure-password' \
GM_PIN="123456" \
GM_DISPLAY_NAME="Your Name" \
npm run db:provision
```

Optional env: **`FACILITY_MANAGEMENT_COMPANY`**, **`GM_FIRST_NAME`**, **`GM_LAST_NAME`**. The script refuses to run if a **`User`** already exists (unless **`PROVISION_ALLOW_NONEMPTY=1`**).

**PIN:** `GM_PIN` must be exactly **6 digits**; it is stored as **`pinDigest`** (HMAC) like the app. **`AUTH_SECRET`** in **`.env`** must match what the app uses.

After provision: sign in with email → **Admin → Organization** → **Apply device binding** → sign out → test **PIN** on the pad.

## Facility-bound tablet / PIN flow

1. **GM** signs in with **email + password** at `/login`.
2. Open **Admin → Organization** (`/admin/organization`) and use **Facility tablet / shared device**:
   - Click **Apply device binding** to set the **`ltc_device_facility`** cookie for this browser (same origin; HTTPS in production).
   - Optionally choose a unit under **Unit lock** so the tablet also gets **`ltc_device_unit`**. Staff PIN sign-in then **always opens that unit**; the login screen shows **Unit: …** when locked. Choose **Entire facility — no unit lock** to clear only the unit cookie (facility PIN still works).
3. After **Sign out**, the login page shows the **PIN pad** with the facility name (and unit label when unit-locked). Staff PINs are set under **Employees** → **Floor PIN sign-in** (GM only).
4. **GM** can **Sign out & unbind device** in the header to clear session plus **`ltc_device_facility`** and **`ltc_device_unit`** (PIN pad no longer appears until the device is bound again).

**Unit lock vs. staff assignment:** If an employee has **selected units only** (`EmployeeUnitAccess`) and signs in on a tablet locked to a **different** unit, they are still allowed in; the app shows a **warning banner** (dismissible) and records a **`KioskUnitPinLoginEvent`** row for review. The **Locations** sidebar greys out other units on that tablet so users cannot click away from the locked unit.

**Changing facility on a device (GM only):** Use **Sign out & unbind device** to clear the facility cookie, then sign in with email again and **Bind** to a different facility context if your deployment ever has more than one facility row (single-facility installs still use this to “reset” the browser to email-only login until rebound).

**Email vs PIN:** Managers and GMs typically use **email** on laptops; floor staff use **PIN** on shared tablets once the device is bound.

### Provisioning people (Phase D)

- **Managers+** create and edit employees under **Employees** (profile, role, status, unit access).
- **Unit access:** “All units” vs “Selected units only” controls **`EmployeeUnitAccess`**. **Primary unit** is the default active unit after PIN login.
- **PINs** are never shown after save—assign a new 6-digit PIN in **Floor PIN sign-in** (GM). For documentation, refer to PINs as placeholders (e.g. “a 6-digit PIN you set in the app”), not real values.

### Reset a staff PIN

1. Sign in as **GM** (email session).
2. Open **Employees** → **Floor PIN sign-in**.
3. Enter a **new 6-digit PIN** for that employee and save, or use **Clear PIN** to remove PIN sign-in until a new one is set.

If a PIN is forgotten, **clear** or **set a new** PIN here; there is no “reveal” of the old value.

### PIN says “Invalid PIN” but the digits are correct

1. **`AUTH_SECRET` changed** after the PIN was set (provision script or **Employees** save). PIN digests are HMACs of `facilityId + PIN` using **`AUTH_SECRET`**. Fix: sign in as GM → **Employees** → **Floor PIN sign-in** → save the same PIN again (or a new one) so the digest matches the current secret.
2. **Stale `ltc_device_facility` cookie** after resetting the database or re-provisioning (cookie pointed at an old facility id). Fix: **Sign in with email** once (refreshes the cookie), use **Apply device binding** on **Admin → Organization** if needed, or **Sign out & unbind device** / clear site cookies for localhost.
3. **Stale `ltc_device_unit` cookie** (unit deleted or deactivated): **`device-facility`** clears it on next load; PIN login continues without unit lock and clears the cookie when appropriate.
4. **Employee not ACTIVE** or PIN was cleared in the database — set the PIN again in **Employees**.

## Dev / seed notes

- **`AUTH_SECRET`** is required for JWT and PIN digest derivation.
- Sample demo credentials (if you use **`npm run db:seed`**) remain in seed output / project docs; **do not** use production PINs in documentation—use placeholders like `******` for examples.
- After seed, assign PINs in the UI; the seed does **not** set `pinDigest`. Demo employee **Jane Carter** is seeded with **restricted** unit access (one servery) so PIN sidebar behavior can be tested once a PIN is assigned.

### Dev credentials (seed only)

| Item | Notes |
|------|--------|
| Seeded GM email | `admin@terraceview.local` (see `prisma/seed.mjs`) |
| Seeded password | Defined in **`prisma/seed.mjs`** at seed time—**change it** after first login in any shared or non-local environment. Do not commit real production passwords. |
| PINs | Not seeded; set under **Employees** → **Floor PIN sign-in** after bind. |

For a **non-seeded** database, there are no default users—create a `User` row as in **Facility provisioning** above.

## Quality Gate Commands

```bash
npm run typecheck
npm run lint
NODE_ENV=production npm run build
npm run db:validate
```

## Troubleshooting

- ENOENT `package.json`:
  - run commands from `ltc-manager/`, not the parent folder.
- Hydration warning with unexpected body attributes:
  - usually browser extension injection; `suppressHydrationWarning` is enabled on `<body>`.
- Prisma P1010 auth denied:
  - verify `DATABASE_URL` user/password and DB privileges.

