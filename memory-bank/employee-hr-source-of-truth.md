# Employee & HR — source of truth (build tracker)

This document is the **single agreed reference** for employee-related product behavior and backlog. Update it when decisions change; implementation should trace to sections here.

**Related:** `implementation-phases.md` (facility foundation, roles, PIN, units). This file focuses on **employee records, union/HR, compliance, and discipline**.

---

## 1. Purpose

- Replace ad hoc **Google Sheets** workflows (roster, per-employee tabs, points summary, master cards) with **first-class data** in LTC Manager.
- Keep **one facility per session** context; employee data is **scoped to the facility**.
- **Discovery** (replacing the Sheets “Home” tab of hyperlinks): use **in-app navigation**, **filters**, and **sorting** on the Employees area and related reports — not a page of external links to per-person artifacts.

---

## 2. Already implemented (UI / app behavior)

These are **done in code** as of the consolidated Employees work and follow-on HR passes:

| Item | Behavior |
|------|----------|
| **Navigation (two rows in layout)** | **Employees** is one top-nav item. Under `/employees`, **`employees/layout.tsx`** renders: (1) **Department tabs** — Dietary / EVS / etc. (only departments with **`showInEmployeeApp`**) + **All departments**; (2) **Section tabs** (`EmployeesSubNav`) — **Employees**, **Points**, **CHRC** (STAFF+); **Separations**, **HR audit**, **Import** (MANAGER+). Section links **preserve `?dept=`**. |
| **Department scope (`?dept=`)** | When a department tab is selected, **directory**, **Points**, **CHRC**, **Separations**, and **HR audit** list only employees on that department (**`primaryDepartmentId`** or **`EmployeeDepartment`**). **Import** is **not** department-scoped. **All departments** clears the filter. Directory **Search & filters** keep `dept` via a hidden field. Helpers: `src/lib/employees-department-tabs.ts`, `src/lib/employee-department-scope.ts`. |
| **Admin → Departments (GM)** | **`/admin/departments`**: turn departments on/off for the employee app; assign **department head** (operational lead, not app GM role). Cannot hide a department while anyone is assigned to it. |
| **Primary department** | On **Add employee**, primary department is **required** (visible departments only). On **profile edit**, optional “Not set” remains for edge cases; dropdown must include the employee’s current primary even if that department is hidden (labeled “hidden in app”). |
| **Layout** | Single scrollable list of **employee cards** (directory + default assignments + profile no longer split into unrelated page sections). |
| **Collapse** | Card body is **collapsed by default**; expand to see details. Expanded card uses **tabs**: **Personal**, **HR & Union**, **CHRC**, **Assignments**, and **Discipline** (when union member or union is checked before save). **Floor PIN** (GM-only) sits in a **footer** below the tabs, not inside them. |
| **Profile save** | **One Save profile** submits Personal + HR & Union + CHRC + unit access (hidden tab panels stay in the DOM). **Add assignment** remains a separate action on the Assignments tab. |
| **Who can edit** | **Managers and above** for roster-style edits where the app enforces it; **Floor PIN / PIN management** is **GM-only** (PIN block hidden entirely for non-GMs). |
| **PIN entry** | Show/hide while typing (eye control); **stored PIN cannot be displayed** (digest-only storage). |
| **Default assignments** | Per-employee **add assignment** (no global “pick employee” form). |
| **HR fields (v1)** | **Union member** (single flag — covers seniority context + union discipline UI), hire date, classification, **multi-station** assignments, CHRC, shirt, notes, on-leave, birthday month-day — editable on the card (**HR & Union** / **CHRC** tabs). **Directory filters**: search, **employment status**, union, classification, station, CHRC, leave, **has discipline points**, **birth month**; **sort** (name, hire date, status). |
| **Termination + CHRC offboarding** | When **employment status** is **Terminated**: **termination date**, **CHRC offboarding** (completed date + notes). Cleared when status is not terminated. |
| **Termination records** | **Immutable** `EmployeeTerminationRecord` + JSON snapshot on transition to **Terminated**; **`/employees/separations`** (legacy **`/employees/terminations`** redirects); respects **`?dept=`** when set. |
| **CHRC report** | **`/employees/chrc-report`**: non-terminated roster split **Cleared** vs **Not cleared**; respects active **`?dept=`** filter when set. |
| **HR audit** | **`/employees/hr-audit`**: profile + PIN audit (last 500); respects active **`?dept=`** filter when set. |
| **Union handbook** | **GM** uploads PDF under **Admin → Organization** (`/admin/organization`; **`/settings`** redirects there); **Managers+** open via **`/api/facility/union-handbook`**; link from union **discipline** card. |
| **Dashboard** | **Birthdays this month** with links to `#employee-{id}` on `/employees`. |
| **Union discipline** | **`DisciplinePointEntry`** (attendance / performance, date, note); shown on cards when **`unionMember`**; **Points summary** at `/employees/points-summary` (totals **&gt; 0**; respects **`?dept=`** when set). |
| **CSV roster import** | **Managers+** at **`/employees/import`**; downloadable template; **upsert** by email (preferred) or first+last name; **create** rows cannot use **Terminated** (use ACTIVE/OFFBOARDING); **update** can set terminated and sync termination/offboarding fields; **2 MB** / **500** data-row limits; **primary unit** by unit **name** when column present; stations as pipe/comma-separated codes. |

**Data rule:** There is **no** separate “union discipline tracking” column — **`unionMember`** alone gates seniority-related copy and discipline/points surfaces.

If future requirements conflict with the above, update **this doc first**, then change code.

---

## 3. Legacy spreadsheet (reference — not source of truth)

The old tracker included:

- **Roster**: names, title/department, hire date, seniority, union flag, phone, “master card” flag, CHRC, shirt size, station columns, on-leave, notes.
- **Per-employee sheets** (from a Master template): pushed fields (last, first, department, seniority, start date); **attendance / performance points** in fixed cells; **union discipline** content on master-card sheets.
- **Automation**: Change log, Terminations list, Points Summary (totals &gt; 0), Home index with links, optional nightly sync.

**Migration:** No requirement to replicate Sheets one-for-one; **behaviors and fields** below are what we carry forward. The **Home** sheet’s name → URL links become **in-app lists with filters** (see §4.8).

---

## 4. Domain rules (agreed)

### 4.1 Union vs non-union

- The business employs **both union and non-union** employees.
- **`unionMember`** is the **only** union boolean on the employee record. It controls **seniority context** (with hire date) and **union discipline / points** UI — not a second “discipline tracking” toggle.
- **Union-only** concepts must not appear as required for non-union staff (seniority block, union discipline / “master card” tracking, handbook-driven discipline flows).

### 4.2 Seniority

- **Applies only to union members.**
- **Derived from start/hire date** (not a separate free-form “seniority number” unless we later cache for performance).
- UI: show seniority context **in the union area**; non-union: omit or show N/A.

### 4.3 Job classification vs stations

- **Classification** (contract / HR): e.g. **Cook**, **Food Service Worker**, **Diet Clerk** — typically **one primary** classification (extend later if needed).
- **Stations** (operations): e.g. retail, serving, diet clerk area, cook line — an employee may be **trained on multiple stations**.
- Union employees are often classified as cook or food service worker but may hold several station competencies.

### 4.4 Birthday

- Store **month and day** for culture / relations; **year optional or omitted** by default for privacy.
- **Dashboard**: a **birthdays this month** (and optionally this week) view so the facility can celebrate appropriately.

### 4.5 CHRC (NYS LTC background check)

- Track that the employee **went through / cleared** the government background check required for NYS long-term care (Terrace View and similar facilities).
- **Terminations are sensitive**: when someone leaves, **ex-employees must be removed from the CHRC process** — the app should support **tracking** (e.g. status + reminder/checklist fields, notes), not replace legal process.

### 4.6 “Master card” (Sheets) → app

- In Sheets, **Master Card** gated whether the script **cloned a per-employee master tab**.
- In the app, that maps to **union discipline** for **union members** only: structured **discipline / incidents / points** (the “master card file” concept), not a separate Google Sheet per person.

### 4.7 Union handbook

- **Upload a PDF** of the union handbook at **facility (or org) level** so managers can verify discipline steps against the rules.
- V1 is **reference storage + download/view**; automatic rule extraction is **out of scope** unless reprioritized.

### 4.8 Navigation & filters (replaces Sheets “Home”)

- **Do not** recreate a spreadsheet-style **index of hyperlinks** to open each person.
- **Do** use:
  - **Employees** (and future HR views): **filters** — e.g. union / non-union, classification, station, status (active / leave / terminated), CHRC status, “has discipline points,” birthday month, search by name. On the directory, the filter block is **collapsible** (collapsed by default; opens automatically when any filter is non-default; shows **N active** when collapsed and filters apply).
  - **Sorting** where useful (e.g. name, hire date, seniority for union).
  - **In-app routes** — `/employees` and related paths use query state for filters (`q`, `status`, union, etc.) and optional **`dept`** (department tabs in layout). **Points**, **CHRC**, **separations**, and **HR audit** honor the same **`dept`** filter; **import** does not. Optional **anchor/hash** `#employee-{id}` on directory links; “Open card” links include `dept` when a department is active.
- **Reports** (points summary, terminations, audit): same idea — **filterable tables** and links to **open the employee in-app**, not export-only.

**Gap vs §4.8 (minor):** **Seniority sort** is not a separate control (hire date proxies for union seniority). Optional **birthdays this week** on the dashboard (§5.4).

---

## 5. Backlog — data & features (build from here)

### 5.0 Suggested next slices (product may reorder)

1. **Richer exports** — CSV/PDF from points summary, terminations, audit (optional).
2. **Dashboard** — birthdays **this week** (§5.4).
3. **Optional (§5.6)** — email summaries, **rehire** workflow, CHRC system integration. (**CSV roster import** is shipped — see §2.)

### 5.1 Employee profile extensions

| Area | Status | Notes |
|------|--------|--------|
| **Union** | Shipped | `unionMember` — seniority + discipline/points (single flag). |
| **Hire / start date** | Shipped | Drives seniority for union members. |
| **Job classification** | Shipped | Enum in app; extend list if HR adds roles. |
| **Stations** | Shipped | Multi-select from facility list (`EmployeeWorkStation`). |
| **Birth month / day** | Shipped | Year not stored in v1. |
| **CHRC** | Shipped | Status + notes pattern; terminations + offboarding (§2). |
| **HR notes** | Shipped | Free text. |
| **Shirt size / on-leave** | Shipped | As fields on employee. |
| **Primary department** | Shipped | `Employee.primaryDepartmentId`; required on **create**; optional on profile edit; facility departments gated by **`showInEmployeeApp`** (Admin → Departments). |
| **Floater / multi-dept** | Shipped | `EmployeeDepartment` join rows; included in department roster tab filter and department-head eligibility. |
| **Job title** | Shipped | `JobTitle` model + `jobTitleId` on employee (separate from `roleType`). |

### 5.2 Discipline & points

| Item | Status | Notes |
|------|--------|--------|
| Auditable **entries** (category, date, note) | Shipped | `DisciplinePointEntry`; who/when can be extended. |
| Facility **points summary** (&gt; 0 totals) | Shipped | `/employees/points-summary`. |
| **Handbook** link in discipline card | Shipped | Opens uploaded PDF when present (404 if none). |
| Richer **reporting** (export, extra filters) | Backlog | Evolve with usage. |

### 5.3 Terminations & audit

| Item | Status | Notes |
|------|--------|--------|
| **Termination date** + **CHRC offboarding** on **terminated** employees | Shipped | Profile form; cleared when status changes away. |
| **Immutable termination record** + snapshot + **`/employees/terminations`** | Shipped | `EmployeeTerminationRecord`; one row per transition to `TERMINATED`. |
| **Field-level audit** + **`/employees/hr-audit`** | Shipped | Profile diffs + PIN set/clear; last 500 rows. |
| Discipline **entry** line items in audit | Backlog | Entries already store `createdBy`; optional parity with Sheets “change log” for points. |

### 5.4 Dashboard

| Item | Status | Notes |
|------|--------|--------|
| Birthdays **this month** + in-app anchor links | Shipped | See §2. |
| Birthdays **this week** (optional) | Backlog | Same month/day fields. |

### 5.4b Employees list UX (with §4.8)

| Item | Status | Notes |
|------|--------|--------|
| Search + filters (status, union, classification, station, CHRC, leave, **has points**, **birth month**) | Shipped | Query params on `/employees`; **collapsible** “Search & filters” panel (see §4.8). |
| **Department tabs** + **`dept` filter** | Shipped | Layout-level tabs on all `/employees/*` routes; filters directory, points, CHRC, separations, HR audit (not import). |
| **Sort** (name, hire date, status) | Shipped | See §2. |
| **CSV import** (roster) | Shipped | `/employees/import`; Manager+; **Import** tab last in **Employees** sub-nav (see §2). |
| **CHRC report** (cleared vs not) | Shipped | `/employees/chrc-report`; non-terminated employees; see §2. |
| Cards remain primary detail surface | Shipped | Filters narrow the list. |

### 5.5 Facility assets

| Item | Status | Notes |
|------|--------|--------|
| **Union handbook PDF** | Shipped | GM **Organization** upload; `uploadedAt`, optional **effective date**, filename; file on disk under `uploads/`. |

### 5.6 Optional later

- Email / scheduled summaries.
- **Rehire** workflow (Sheets had optional restore of archived tabs) — reopen or relink employee history if someone returns.
- Deeper integration with CHRC systems (if APIs exist) — not assumed.

---

## 6. Permissions (default intent)

- **GM / management**: HR fields, CHRC, terminations, union discipline, handbook management.
- **Floor staff**: operational app features; **not** full HR dossier unless explicitly opened later.
- **PIN management**: **GM-only** (already enforced for PIN UI).

Refine per role in app settings when RBAC is extended.

---

## 7. Completeness check vs discussion

| Topic | In this doc |
|------|----------------|
| Consolidated employee cards + tabbed profile + collapse + GM-only PIN in footer + PIN eye | §2 |
| Spreadsheet roster / points / master / logs / terminations (legacy) | §3 |
| Union vs non-union; **single `unionMember` flag** (no separate discipline toggle) | §4.1, §2 |
| Seniority from start date, union-only | §4.2 |
| Classification vs multi-station | §4.3 |
| Birthday month/day + dashboard | §4.4, §5.4 |
| CHRC + termination / removal from system | §4.5, §5.3 |
| Master card → union discipline in-app | §4.6 |
| Handbook PDF for rules | §4.7, §5.5 |
| Discipline/points as data + summary report | §5.2 |
| Audit log (field-level) | §5.3 |
| Termination v1 (dates, CHRC offboarding, employment status filter) | §2, §5.3 |
| Rehire / restored employee history | §5.6 (optional) |
| CSV roster import | §2 (shipped) |
| Shirt size, on-leave, notes (from sheet) | §5.1 |
| In-app navigation, filters, sort, handbook, audit, termination reports | §2, §4.8, §5 |

**Not** spelled out as separate epics: production object storage for PDFs (local `uploads/` for v1) — swap implementation when deploying to serverless/multi-instance.

---

## 8. How to use this doc

1. **Planning / tickets**: Trace features to **§4–§5**.
2. **Scope debates**: If it’s not here, add it here first, then build.
3. **After each milestone**: Update **§2** (shipped), **§5** (status tables), and **§5.0** if priorities shift.

Last updated: 2026-05-15 — **Admin → Departments**; department tabs on **all** `/employees/*` pages; **`?dept=`** scopes directory, points, CHRC, separations, HR audit (import excluded); section sub-nav preserves `dept`; required primary department on create; profile save fix for hidden departments; §2, §4.8, §5.1, §5.4b updated.
