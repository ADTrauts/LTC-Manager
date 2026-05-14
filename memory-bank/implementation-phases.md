# Implementation phases — facility, org profile, roles, PIN

This document turns the agreed product direction into **sequenced phases**. Run work **one phase at a time**. After **each** phase completes, run the **phase quality gate** before starting the next.

---

## North star

- **Product name:** **LTC Manager** (customer / facility names appear in content, not as the app title).
- **Facility:** The app targets **one facility per deployment context** (tablet or browser session is **bound to a facility**).
- **Organization profile:** **Facility display name** and **management company** (e.g. contracted food service operator) are configurable, not hardcoded.
- **Authentication:** **Everyone** uses a **6-digit PIN**, unique **within the facility**. **Role** determines visibility and actions.
- **Devices:** After user logout, show a **number pad** with the **facility name** at the top. Only **GM** can fully sign out or **change facility** on the device (rebind / setup flow).
- **Units:** People often work **across units** — support **primary + allowed units + active unit** in session. **Optional exception:** a **floor tablet** can be **unit-locked** via device cookies so PIN sign-in always opens one unit; staff not assigned there may still sign in (warning + audit). Laptops/email sessions are unchanged.

**Explicitly later (not in these phases unless reprioritized):** public marketing signup, multi-facility district / VP bird’s-eye analytics, SSO.

---

## Quality gate (after every phase)

Run from the project root (`ltc-manager/`):

```bash
npm run lint
npm run typecheck
NODE_ENV=production npm run build
```

If the phase touched **Prisma schema** or migrations:

```bash
npm run db:validate
```

Record results in `progress-log.md` when the phase is merged or accepted.

---

## Phase A — Facility foundation + org profile + rebrand

**Goal:** Introduce a first-class **facility** in the data model, store **org-facing labels**, and rebrand the UI to **LTC Manager**.

**Deliverables (checklist):**

- [x] `Facility` (or equivalent) model in Prisma; single seeded facility for local dev.
- [x] Fields for **facility display name** and **management company name** (nullable or empty defaults OK).
- [x] Existing domain data that implicitly meant “this site” (e.g. units, employees) **scoped to `facilityId`** where appropriate, or a clear migration path documented in code comments if a follow-up sub-migration is needed.
- [x] App shell, `<title>`, and login copy use **LTC Manager**; remove **Terrace View** as product branding (seed/demo emails may keep example domains).
- [x] Minimal **Settings** (or **Organization**) page for **GM** (or agreed role) to edit facility name + management company.

**Exit criteria:** Quality gate passes; `db:validate` passes if schema changed.

---

## Phase B — Role expansion + permission matrix

**Goal:** Align roles with operational titles and enforce **least privilege** before PIN work multiplies entry points.

**Target roles (replace/extend current four):**

| Role | Summary |
|------|--------|
| **GM** | Full control; only role that can **change facility** on device / full logout to rebind. |
| **Manager** | See most operational areas; **cannot** change the most sensitive items (exact list implemented in code + comments). |
| **Supervisor** | Operational visibility; can **edit units** as needed; **blocked** from sensitive **user** data, **reports**, and **large structural** changes. |
| **Lead Team Member** | Narrower than supervisor — primarily unit operational work. |
| **Team Member** | Interact with **units** (logs, day-to-day); minimal admin surface. |

**Deliverables:**

- [x] `RoleKey` (or equivalent) extended in Prisma + seed.
- [x] Permission matrix implemented in **`access.ts`** (and related helpers): route groups or feature flags for dashboard, units, logs, employees, staffing, assets, repairs, reports, users, org settings.
- [x] Navigation and server actions respect new rules; supervisors/managers see only allowed UI stubs or redirects.
- [x] Document the matrix in a short table at the bottom of this file or in `architecture-decisions.md` when stable.

**Exit criteria:** Quality gate passes.

**Route / action minimum roles (implemented):**

| Area | Minimum role |
|------|----------------|
| Organization `/settings`, Admin `/admin` | GM |
| Employees, Reports | Manager |
| Units (CRUD), Staffing, Assets | Supervisor |
| Dashboard, unit dashboards `/unit/...`, Logs, Repairs (intake) | STAFF (Team Member) |
| Log template / assignment management | Manager (submit entry: STAFF) |

---

## Phase C — PIN authentication + facility-bound device UX

**Goal:** **PIN** replaces password for day-to-day login; sessions carry **facility**, **person**, **role**, and **active unit** where needed.

**Deliverables:**

- [x] **PIN** stored as **HMAC digest** (`Employee.pinDigest`), unique **per facility** (`@@unique([facilityId, pinDigest])`); lookup via `lib/pin.ts` (not bcrypt—see `architecture-decisions.md`).
- [x] **POST** `/api/auth/pin-login`: device cookie supplies facility; validates PIN; issues JWT with `authKind: "employee"`.
- [x] **Number pad** + **`LoginGate`** on `/login`: facility name when device is bound; email path when not; default mode PIN when bound.
- [x] **Session claims:** JWT includes `facilityId`, `uid`, `role`, `name`, `email`, `authKind` (`user` | `employee`), optional `activeUnitId`; **`/api/auth/active-unit`** reissues token.
- [x] **Logout:** standard **`/api/auth/logout`**; **GM-only** **`/api/auth/logout-full`** clears session + **`ltc_device_facility`** and **`ltc_device_unit`** cookies; **Apply device binding** on **Admin → Organization** (`/api/auth/bind-device`).
- [x] **Unit-locked tablets (post–Phase C):** optional HttpOnly **`ltc_device_unit`**; **`GET /api/auth/device-facility`** returns **`unit`** for login copy; **`bind-device`** accepts **`{ unitId }`**; PIN login forces unit + **`redirectTo`**; **`KioskUnitPinLoginEvent`** audit when restricted employee is not assigned to the locked unit; JWT **`kioskUnitAccessWarning`** + dismissible banner; **Locations** sidebar greys non-locked units for matching employee + device cookie sessions; **`active-unit`** allows staying on current unit when it would otherwise fail the access check (kiosk override).
- [x] Rate limiting: **`lib/pin-rate-limit.ts`** (in-memory; document Redis for multi-instance).

**Exit criteria:** Quality gate passes; `db:validate` passes.

---

## Phase D — Provisioning + PIN lifecycle

**Goal:** No public signup; **GM** (or agreed role) can manage people and PINs inside the app.

**Deliverables:**

- [x] UI for **create/update/deactivate** employee with **role**, **primary unit**, **allowed units** (`EmployeeUnitAccess` + `primaryUnitId`); **PIN** set/reset remains GM **Floor PIN** block on `/employees`. **Edit profile** (`?edit=`) for Manager+.
- [x] **Password vs PIN:** documented in `architecture-decisions.md` — **`User`** = email/password; **`Employee`** = PIN on bound devices; no removal of email login.
- [x] Seed: **Jane Carter** gets restricted unit access demo; `runbook.md` describes provisioning (PINs not embedded in seed).

**Exit criteria:** Quality gate passes.

---

## Phase E — Hardening + documentation

**Goal:** Operational clarity and safe defaults.

**Deliverables:**

- [x] `runbook.md` updated: facility provisioning, tablet binding, GM facility change, PIN reset, dev credentials.
- [x] `architecture-decisions.md` updated: PIN, facility binding, role matrix, session shape (JWT table).
- [x] `progress-log.md` updated with phase completion notes and gate results.

**Exit criteria:** Quality gate passes (no schema change expected unless fixes are needed).

---

## Phase F — Future backlog (reference only)

Do **not** schedule until product asks for it:

- Multi-facility / **district** rollups and executive **read-only** org views.
- **SSO** (SAML/OIDC) for enterprise customers.

### Phase F update (2026-05-08)

- Marketing **landing** + self-serve **signup** is no longer backlog-only.
- Delivered as a Post–Phase E production slice:
  - public hero page (`/`)
  - signup bootstrap (`/signup`, `/api/auth/signup`)
  - guided onboarding wizard (`/setup`)
  - Stripe SetupIntent card-on-file onboarding step.

### Phase F follow-up (2026-05-09)

- Onboarding **escape hatch** for legacy DBs and dev without Stripe: migration `20260509140000_backfill_legacy_onboarding_complete`, `stripeBillingReady` + finish-without-card path, setup **Sign out**.
- **GM roster:** signup creates **`Employee`**; **`/employees`** ensures GM roster row; **`npm run db:backfill-gm-roster`** for CLI backfill.

---

## Working agreement

1. Implement **one phase** at a time.
2. Run the **quality gate** after each phase; fix **lint** and **typecheck** before proceeding.
3. Update **`progress-log.md`** (and **`architecture-decisions.md`** when behavior changes) at phase completion.
