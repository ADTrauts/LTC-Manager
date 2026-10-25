# Dashboard phase tracker

Updated October 23, 2026 (DSH-05 accepted). This is the single status and authorization record for the [Dashboard program](./README.md). Scope for each phase is in the [phased plan](./PHASED_PLAN.md). Decisions are in [DECISIONS.md](./DECISIONS.md).

| Phase | Status | Gate / dependency |
|---|---|---|
| DSH-00 — Decision record and authorization | **Accepted (user) October 20, 2026, evening** | Docs only. DSH-Q01, Q02, Q04 and Q05 defaults confirmed (user); Q03 and Q06–Q08 answered. Stop before DSH-01. |
| DSH-01 — Foundation (no visible change) | **Accepted (user) October 21, 2026, morning** | With or after [CDA-01](../contracted-departments/PHASE_TRACKER.md) (accepted October 20, night). See the [DSH-01 record](#dsh-01-record--october-20-2026). |
| DSH-02 — New Dashboard behind `DASHBOARD_V2_ENABLED` | **Accepted (user) October 22, 2026.** DSH-04 removed the flag. | Authorized when the product owner said to start the dashboard page. [Record](#dsh-02-record--october-22-2026). |
| DSH-03 — Customization | **Accepted (user) October 22, 2026.** | Product owner accepted the arrange grid and the exit checks. |
| DSH-04 — Retire Today's Work and Business Workspace | **Accepted (user) October 23, 2026.** | Product owner approved the checklist walk. One-way door. [Record](#dsh-04-record--october-22-2026). |
| DSH-05 — Extend | **Accepted (user) October 23, 2026.** | Product owner accepted the facility defaults, the five cards, the partner Dashboard, and the Plant-runtime check. [Record](#dsh-05-record--october-23-2026). Dropping `WorkspacePreference` still waits for its own decision. |

## DSH-02 record — October 22, 2026

Accepted by the product owner October 22, 2026. The page, role layouts, lens, and staging pilot flag are in. The code default stays `false`. The production project stays unset until CDA-07 production enablement or an explicit exception.

The laptop settle samples were over 2.5 seconds because this computer is far from the staging database: 291 ms to open a connection, against 8 ms from Virginia. The product owner accepted that finding. A signed-in preview p95 was not collected, because the preview requires Vercel sign-in and a replacement deploy did not finish uploading.

### Accepted limits

- Production Dashboard flag stays off.
- Supervisors still begin in Today's Work. That move is DSH-04.
- Business Workspace remains the home while the flag is off.

DSH-04 closed these three limits on October 23, 2026. Supervisor and above begin in the Dashboard. The flag is gone.

## DSH-03 record — October 22, 2026

Started when the product owner accepted DSH-02 and said to move to the next step.

- [x] `DashboardLayout` and `DashboardScopeKind`. Migration `20261022160000_dsh03_dashboard_layout`. One owner, user or employee.
- [x] Layout item checks: unknown card, size, duplicate, and the 24-card limit.
- [x] Save and reset. A person can save only a view they can open. Cards they cannot see stay stored.
- [x] Edit mode at `?edit=1`. The product owner approved this grid on October 22: drag a card up or down to reorder it, drag it sideways to share a row, and drag the bottom-right corner to change width and height. Arrow keys reorder the focused card. A phone shows one column.
- [x] Browser check on the staging server: save and reset for the Facility Administrator. The saved layout reloaded, then reset returned the default. Keyboard reorder and a sideways drag were checked again on October 22. A Department leader opening `?scope=facility` stays in their Department.
- [x] Layout storage: a password user and a Supervisor employee each keep their own row, a layout does not cross facilities, reset can be repeated, and a row cannot have two owners or none. Migration `20261022160000_dsh03_dashboard_layout` applied on the staging database (existing Terrace View data) and on an empty disposable database (`ltc_verify_dsh03`, 157 migrations).

Accepted by the product owner October 22, 2026.

## DSH-04 record — October 22, 2026

Started when the product owner accepted DSH-03 and said to move to the next step.

- [x] Handoffs live at `/staffing/handoffs`. `/today/handoffs` redirects there.
- [x] Rounds live at `/units?view=rounds`. `/today/walk` redirects there.
- [x] Supervisor and above begin in the Dashboard. `/workspace` and `/today` only redirect to the Dashboard. `/today/coverage` only redirects to Schedule. Today's Work is not in the navigation.
- [x] Shared helpers moved: team scope with the Dashboard viewer, call-offs and coverage with Schedule, handoffs with People & Coverage, the walk list with Locations, and expected Work with Work. The old paths still re-export them.
- [x] The Business Workspace library is gone. The Dashboard keeps its own location summary, activity, and shortcuts. `WorkspacePreference` stays in the database and is not read.
- [x] `DASHBOARD_V2_ENABLED`, `PROJECTION_BUSINESS_WORKSPACE_ENABLED`, `TODAYS_WORK_ENABLED`, and `PROJECTION_TODAYS_WORK_ENABLED` are removed. Supervisor and above begin in the Dashboard. Handoffs and Rounds read the operating-location board. The old addresses stay reachable and only redirect.
- [x] Capability checklist walked on Terrace View, October 22, on the staging server. A Supervisor with no team sees “No team assigned. Your Dashboard shows all of Plant Operations.” A Supervisor on Checklist Team sees Team scope, Needs attention, Rounds, Call-offs, and Shift handoff. Rounds opens at `/units?view=rounds`. Handoffs opens at `/staffing/handoffs`. Food & Nutrition shows Coverage (“No coverage plan is set.”) opening Schedule, and Expected work (“No Work Plans are published.”) opening Work. Schedule has Log call-off. Saving one for Checklist Supervisor at Checklist Floor made the Call-offs card count one person not covered. `/staffing/assignments` still returns to Schedule while `OPERATIONAL_ASSIGNMENTS_ENABLED` is off. The AI shift summary stays behind its own flag.

Accepted by the product owner October 23, 2026.

### Accepted limits

- `/staffing/assignments` returns to Schedule while `OPERATIONAL_ASSIGNMENTS_ENABLED` is off.
- The AI shift summary appears only when its own flag is on.
- The full suite was not re-run at this exit. Targeted navigation, flag, and page checks passed, and the checklist was walked in the browser.

## DSH-05 record — October 23, 2026

Started when the product owner accepted DSH-04 and said to begin DSH-05.

- [x] `DashboardFacilityDefault`. Migration `20261023060000_dsh05_dashboard_facility_default`. One row per facility, authority band, and scope. Applied on the staging database and on `ltc_verify_dsh03`.
- [x] A personal layout wins. With no personal layout, the facility default is used. Otherwise the role default. Reset deletes only the personal row.
- [x] In Arrange, a Facility Administrator can set the current layout as the default for a band that opens that view. The write is facility governance. On Terrace View the control offered Facility Administrators, saved, and Reset kept that layout. The test row was then removed, and the administrator's personal arrangement was reset, so the Dashboard is back on the role default.
- [x] Departments & licensing, People alerts, and Teams at a glance are on the role defaults. On Terrace View the Facility view lists installed Departments and people issues. Plant Operations shows People alerts and Teams at a glance. Our requests to Maintenance appears for a Department or Team that has a route to Plant.
- [x] Yesterday in review reads `loadOperationalReviewDay` through a cache keyed by facility, Department, and service date. A failed load is not kept. On Terrace View Plant Operations the card says this Department still uses legacy Records and opens Audit / Reports. The heavy loader stays off until Records are canonical.
- [x] Remaining partner people use the same card Dashboard on `/partner` ([DSH-D20](./DECISIONS.md#dsh-d20--remaining-partner-people-use-the-same-dashboard--accepted-user-october-23-2026)). An accepted head stays a Department leader. Other partners who can manage a Department see the manager Dashboard. A partner with nothing to manage keeps the Review, Logs, and Assets summary.
- [x] Enabling Plant runtime puts its cards on the default layout with no saved arrangement. On Terrace View the Facility Administrator's Dashboard showed Work orders & issues, Preventive maintenance due, and Requests to triage. Plant Operations was then inactive: those three cards left, and Departments & licensing said Inactive. Turning Plant Operations active again brought the three cards back. Plant Operations is active. Terrace View has no personal layout and no facility default, so this was the role default.

Accepted by the product owner October 23, 2026.

### Accepted limits

- `WorkspacePreference` stays in the database. Dropping it needs a separate decision.
- EVS stays DEVELOPMENT.
- The full suite was not re-run. Targeted hermetic tests passed, and Terrace View was checked in the browser.
- The local `ltc_manager` database received both Dashboard layout migrations on October 23, 2026. Staging and `ltc_verify_dsh03` already had them.

## DSH-01 record — October 20, 2026

Authorized by the user on October 20, night. Built the same night and stopped at the exit gate. Accepted by the user on October 21, morning. Nothing is wired to a page.

### Delivered

Plan items 1–9 (item 10 was done during DSH-00):

1. **Viewer Context** (`src/lib/dashboard/viewer/`).
   - `resolveDashboardViewer` decides who is looking and in which scope. The sidebar cookie and `?scope=` can only pick among the scopes it offers; a forged value never widens scope.
   - Access mode and operator for each Department come from `resolveDepartmentAccessMap` (CDA-01).
   - `canManageDepartmentHeadSettings` now uses `resolveLedDepartmentIds`. A test compares the old and new rule over every role × primary Department × head link × facility combination and finds no difference.
2. **Capability resolver** (`src/lib/dashboard/capabilities.ts`). One query per source for all Departments in scope. A failing source removes only its own capability. Engine admission matches `isDepartmentEngineEnabledForFacility` for every key and flag setting.
3. **Card registry and eligibility** (`src/lib/dashboard/cards/`, `src/lib/dashboard/drill-down.ts`). All 18 DSH-02 cards, with stub loaders that answer `quiet`. `listEligibleCards` checks scope, authority, access mode and capability, and opens every drill-down through `authorizeRoute`.
4. **Attention** (`src/lib/dashboard/attention.ts`, `attention-mappers/`). One item shape and seven mappers: locations, coverage and call-offs, Records (forward engine only), asset exceptions, Plant PM, Plant requests and Menus. Merging collapses duplicates and folds a location's coverage and Records items into that location's item.
5. **Fact Pack** (`src/lib/dashboard/facts.ts`). Each fact loads once per request. A request for a Department outside the current scope is refused before any read. Team scope narrows to the Team's rooms.
6. **Department filters.** Both are optional, so existing callers are unchanged.
   - `loadPresenceCallOffs(facilityId, { departmentId })`. A call-off belongs to its shift's Department, otherwise to the employee's primary Department.
   - `loadWorkspaceNonOperationalExtras({ departmentIds, includeLegacyInspections })`. The filter is applied inside each query.
7. **Custom-Department check.** A database fixture gives a custom "Activities" Department a room. It derives `locations.runtime`, and its location loads through Runtime Location State without a Product.
8. **Stale redirects.** All 16 `redirect("/dashboard")` calls in 11 files now go to `resolveWorkspaceHomeHref(session)`. That is the page `/dashboard` already redirected to, so only the extra hop is gone. A test fails if a new one appears.
9. **Business Workspace dead code.** Removed branches that could never render: the header operation placeholder, priorities, Department health, manager focus and management agenda, with their types and loader code. The runtime view model is always present, so nothing visible changed.

### Verification

- Typecheck clean.
- Lint: no errors. 14 warnings, all in files this phase did not touch.
- Hermetic suite: 3,812 tests, 0 failures. 271 database tests skip without a database, as designed. New tests: viewer (17), head-settings equivalence (1), capabilities (11), eligibility (12), attention (10), Fact Pack (6), redirects (2).
- Production build: pass.
- Database: the new `dashboard-foundation.db.test.ts` passes (7 checks: leaders, head settings, operator periods across the June 30 / July 1 service-date boundary, capabilities for Food & Nutrition, Plant and a custom Department, the custom-Department location, and two-Department isolation for call-offs and recent activity). Managed `verify:db` on a disposable database: migrations, seed twice and schema assertions passed; 3,819 tests, 0 failures. The 7 skips are the real malware-scanner tests, which need an external worker. The database was dropped afterwards.
- No existing test file changed.

### Decisions to review

1. A custom Department has no Product declaration, so its setup card checks only Work, coverage and roster. Confirmed (user) October 21.
2. Catalog conflicts were resolved toward hiding a link, never toward a dead one:
   - Expected work is not offered to Supervisors, because Work Plans (`/staffing/work-plans`) is Manager and up.
   - The Department setup card's link is optional, because the Builder is Manager and up. A Supervisor who heads a Department sees the card without the link.
   - Maintenance open links to Repairs only. `/issues` is a legacy surface.
3. Recent activity on the Dashboard leaves out legacy inspections, so the Dashboard adds no new legacy reader.
4. Log Book counts as open when either the dietary evidence flag or canonical Records is on, matching its page guard.
5. Dashboard Department scope follows the sidebar lens rules. Harbor sessions also see Departments still in development.
6. A vendor-run Department stays Manage for the Facility Administrator until the vendor's head accepts (the CDA-01 rule). Summary starts only after acceptance, which arrives in CDA-05.
7. Plant "no preventive maintenance plans" is not a capability. DSH-02 can read the published plan count from the PM board.
8. The Fact Pack does not yet load handoffs, Menus or the review day; DSH-02 and DSH-05 add them when their cards need them.
9. Two link helpers (`spaceHref`, `lookAtHref`) are now exported from Business Workspace for the mappers. They must move before Business Workspace is deleted in DSH-04.

### Not done in DSH-01 (by design)

- No page, route, navigation, flag, schema or migration change. No card UI.
- No release status, billing, Plant or Records-model change. No default-off engine flag was turned on.

### Waiting on the product owner

- DSH-02 was authorized October 21. The page is behind `DASHBOARD_V2_ENABLED`, default off. Cards, role layouts, and the lens switch are in. Persona, count-parity, vendor-summary, fault-injection, menu drill-down, the sidebar-lens notice, and the Metz vendor-account leader check passed. The latest persona run used `ltc_verify_cda06`. Forcing the timeline card to fail left the menu and Department setup rendered. Three warm loads of the Food & Nutrition leader Dashboard settled in 1392 ms, 1590 ms, and 1392 ms. That is under the 2.5 s budget on this dev server. Each settled view now logs `dashboard.settled` through the existing event stream, with the elapsed time on `data-settle-ms`. On October 22, `DASHBOARD_V2_ENABLED=true` was set on the staging project for preview and development. The staging production target was left unset because that target has no database. The production project was left unset. Twenty settle samples on a local server against the staging Terrace View database: Food & Nutrition, the largest Department, summary view, 10 cards, p95 3948 ms; Plant leader, 9 cards, p95 5388 ms. A follow-up stopped the Dashboard from loading its capability list twice and folded the Department access reads into one round. The same 20-sample check then settled Food & Nutrition at p95 3035 ms and the Plant leader at p95 5318 ms. Card timing on that path: the Food & Nutrition Operating Rhythm summary was about 1.5 seconds, and Plant attention was about 1.8 seconds. From Virginia, next to the staging database, a database connection settled in 8 ms after the first handshake. From this laptop the same connection took 291 ms. The staging preview answered from Virginia in 266 ms and then asked for Vercel sign-in, so the signed-in page was not timed there. The laptop times are distance to the database, not the pilot exit. The pilot facility’s p95 is still the exit measurement. The Dashboard nav item points at `/dashboard` and uses the `dashboard` icon key only while the flag is on; flag off keeps `/workspace` and `operationsCenter`. Environmental Services stays off the customer Dashboard while that product is in development.

Done October 21, morning: DSH-01 was accepted at its exit gate, and decision 1 was confirmed. The two leftover disposable verify databases were dropped with the user's go-ahead.

## DSH-00 record — October 20, 2026

### Delivered

- [x] Program record under `docs/dashboard/`:
  - [README](./README.md)
  - [current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md)
  - [decisions](./DECISIONS.md)
  - [architecture](./ARCHITECTURE.md)
  - [card catalog](./CARD_CATALOG.md)
  - [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md)
  - [phased plan](./PHASED_PLAN.md)
  - this tracker
- [x] User decisions recorded:
  - name and route (DSH-D02)
  - Today's Work retirement (DSH-D07)
  - GM = Department head, own Department only, including a GM who works for the vendor (DSH-D04)
  - what the Facility Administrator's Dashboard shows of each Department (DSH-D18):
    - View for self-operated Departments they do not head
    - Manage where they are head
    - Summary for vendor-run Departments after the vendor's head accepts
  - DSH-Q06, Q07 and Q08 answered; the access model is its own [program](../contracted-departments/README.md)
  - snap grid with Small/Medium/Large (DSH-D08)
  - Supervisor and up customize (DSH-D09)
  - separate program (DSH-D01)
- [x] Afternoon revision: DSH-D03, D04 and D18, the architecture's access modes (rules A10, A11), the card catalog convention, contract rule R10 and the plan updated to the [Contracted Department Authority](../contracted-departments/README.md) model.
- [x] Department compatibility answered:
  - every built Department works without restructuring
  - a capability-based contract (R1–R10) is the new platform building rule
- [x] "Dashboard contributions" blueprint item added to [doc 13](../product/13_DEPARTMENT_PRODUCT.md#department-product-blueprint).
- [x] Program pointers added to `AGENTS.md`, the root `README.md`, `docs/product/README.md` and `memory-bank/README.md`.
- [x] Local " 2" duplicates archived outside the repository with the product owner's go-ahead (DSH-01 item 10, done early). 277 items, with manifest, in `../ltc-manager-duplicate-archive-2026-10-20/`.

### Not done in DSH-00 (by design)

- No code, test, route, flag, schema or migration change.
- No Constitution, Language Guide, Persona Model, RUN guide or Legacy Surface Register amendment. They land in DSH-02 and DSH-04 per DSH-D17.

### Waiting on the product owner

Nothing for DSH-00. DSH-01 was authorized on October 20, night, after CDA-01 was accepted.

Done October 20, evening: the DSH-00 record was accepted, and the DSH-Q01, Q02, Q04 and Q05 defaults were confirmed. DSH-Q03 was answered earlier that day: Department-only visibility is app-wide ([CDA-D16](../contracted-departments/DECISIONS.md#cda-d16--each-department-sees-only-its-own--accepted-user-october-20-2026)).
