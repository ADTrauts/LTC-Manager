# Dashboard program decisions

Decisions are recorded once here. Product decisions marked **accepted (user)** were made by the product owner on October 20, 2026. Decisions marked **accepted (program default)** are design defaults needed to write the plan. They follow from the user decisions and can be reopened at a phase boundary without changing the user decisions.

Open confirmation items are listed at the end (`DSH-Q`). None blocks DSH-00. Each names the phase that needs the answer.

---

## DSH-D01 — Run the Dashboard as its own program — accepted (user) October 20, 2026

**Decision.** The Dashboard is a separate phased program with its own tracker under `docs/dashboard/`. It is not a phase of the onboarding program.

**Why.** ONB-07 is on release hold with a fixed certification package. Mixing Dashboard scope into it would invalidate its gates. Dashboard work also touches shell, navigation and Run surfaces that onboarding does not own.

**Consequences.**
- `DSH-` identifiers are independent of `ONB-` and historical wave numbers.
- The only shared contract is the post-onboarding hand-off (`?onboarding=complete` shows `OnboardingLaunchChecklist`). DSH-02 must keep it working on the new page.

## DSH-D02 — One name and one route: "Dashboard" at `/dashboard` — accepted (user) October 20, 2026

**Decision.**
- The customer-facing name is **Dashboard**. The canonical route is `/dashboard`.
- `/workspace` becomes a redirect to `/dashboard` (preserving `?onboarding=complete`).
- "Business Workspace", "Operations Center", "Manager Dashboard", "Home Console", "Mission Control" and "Today's Work" are not used as product names.
- Code moves to `src/lib/dashboard/**` and `src/components/dashboard/**`. The nav icon key `operationsCenter` becomes `dashboard`.

**Why.** The page carries four names today: Dashboard (nav), Business Workspace (title), Customize Workspace (panel) and `operationsCenter` (icon). Since October 12 "Workspace" also means the operating-context selector in the header. One name removes the confusion.

**Consequences.**
- "Workspace" keeps exactly two meanings: the operating context in the shell and the Unit Workspace (a location's own page).
- The Language Guide row for Business Workspace is rewritten (see DSH-D17).
- The 16 legacy `redirect("/dashboard")` calls written when `/dashboard` was retired are reviewed in DSH-01. Unauthorized-role cases redirect to `resolveDefaultHomePath`, not to a page the viewer can't open.

## DSH-D03 — The Dashboard knows who is looking — accepted (user) October 20, 2026

**Decision.** Every Dashboard request computes one **Viewer Context**. Cards and scope come only from it. There are four authority bands:

| Authority band | Who | Default scope | May switch to |
|---|---|---|---|
| **Facility Administrator** | `FACILITY_ADMINISTRATOR` role (one per facility) | Whole facility at a high level. Self-operated Departments they do not head are view-only. Vendor-run Departments show summaries only (DSH-D18). | Any self-operated Department. Vendor-run Departments stay at summary level. |
| **Department leader** | GM of the Department, or the employee linked as Department head | Their Department | Only other Departments they lead |
| **Manager** | `MANAGER` role who does not lead a Department | Their primary Department | Nothing else (see DSH-Q02) |
| **Supervisor** | `SUPERVISOR` role | Their team's rooms in their primary Department | Their whole Department (a "whole department" toggle) |

`LEAD_TEAM_MEMBER`, `STAFF` and PIN floor sessions do not get the Dashboard. Their homes (`/unit/{id}`, `/logs`) are unchanged.

**Why.** Today Supervisors get four sections and Manager, GM and Facility Administrator get the identical full set. The data model already knows Department head, primary Department and team membership. Only Today's Work and Department settings use them.

**Consequences.**
- Scope is always enforced on the server. The `ltc_active_department` cookie is only a request for a lens. It is honored only when the Department is in the viewer's scope.
- Authority bands are derived. No new role, permission matrix or per-facility RBAC is added. Route authorization stays in the platform route registry.

## DSH-D04 — GM = Department head and sees only their own Department — accepted (user) October 20, 2026

**Decision.** A GM is treated as the leader of their Department. On the Dashboard a GM sees only the Department(s) they lead. A GM never gets a whole-facility Dashboard.

**Leader resolution rule.** A viewer leads Department D when either is true:
1. `D.headEmployeeId` is the viewer's employee, or
2. The viewer's role is `GM` and the viewer's employee has `primaryDepartmentId = D`.

This is the same rule `canManageDepartmentHeadSettings` already uses in `src/lib/dept-settings-access.ts`. One resolver serves both.

**Title and employer.**
- "Department head" and "GM" are the same position. A facility may title it either way.
- The leader may work for the Department's vendor. At Terrace View the GM of Food & Nutrition works for Metz Culinary.
- In a vendor-run Department:
  - the vendor's company admin assigns the head ([CDA-D06](../contracted-departments/DECISIONS.md#cda-d06--vendor-run-departments--accepted-user-october-20-2026))
  - the head signs in with a vendor account ([CDA-D07](../contracted-departments/DECISIONS.md#cda-d07--vendor-people-sign-in-with-vendor-accounts--accepted-user-october-20-2026))
  - for vendor accounts, rule 1 reads the vendor's head assignment (CDA-05)
- The head leads the Department, because leadership comes from the head link or the GM role in that Department, not from the employer. See DSH-D18 for what the Facility Administrator sees of that Department.

**Edge cases.**
- **Leads more than one Department.** The Dashboard offers a lens switch between led Departments only. The default is the primary Department when it is led, otherwise the first led Department by sort order.
- **A Manager linked as head** is a Department leader for that Department.
- **GM with no linked employee, no primary Department and no head link.** The Dashboard shows a single "Your Dashboard needs a Department" state that explains who can fix it. The Facility Administrator's setup card lists leaders without a Department and Departments without a leader.
- **Secondary memberships** (`EmployeeDepartment`) do not widen a leader's Dashboard. They may still choose those Departments in the sidebar for other pages. When the sidebar lens points outside Dashboard scope, the Dashboard shows its own scope and says which Department it covers.

**Supersedes.**
- The turn-1 recommendation that GM see the whole facility.
- The [Persona Model](../product/04_PERSONA_MODEL.md) GM description "Facility performance across departments". That doc is amended in DSH-02.

**Not decided here.** Whether GMs should also be restricted to their own Department on other pages, such as Employees or Reports. See DSH-Q03.

## DSH-D05 — Higher tiers see more through cards, not more scope — accepted (program default) October 20, 2026

**Decision.** Inside one Department, a higher authority band sees more cards about the same scope.
- Supervisor: the shift (now, rooms, people, records due, handoff).
- Manager: adds the Department day (timeline, review, recent activity).
- Department leader: adds leadership cards (Department setup, People alerts, Teams at a glance).
- Facility Administrator: adds facility comparison and Administration cards in facility scope.

Each card declares a minimum authority band. The card catalog lists the bands.

**Why.** It meets "GM sees more than the next tier" while keeping GM scope to their own Department (DSH-D04).

**Confirm.** The exact leadership-only cards (DSH-Q01) before DSH-02 freezes default layouts.

## DSH-D06 — A higher-level Dashboard that drills into owning areas — accepted (user) October 20, 2026

**Decision.**
- **One question per card.** Each card answers one question.
- **Drill into the owner.** Each card links to the area that owns the detail. The categories use product language:

  | Category | User's words | Drill-down homes |
  |---|---|---|
  | People & Coverage | employees | `/staffing`, `/staffing/assignments`, `/employees` |
  | Locations | facility | `/units`, `/unit/{id}` |
  | Operational Cycle & Work | operational timelines | `/staffing/cycles`, `/staffing/work-plans` |
  | Maintenance | equipment | `/assets`, `/repairs`, `/preventive-maintenance`, `/issues` |
  | Records & Audit / Reports | records | `/staffing/log-book`, `/logs` (legacy), `/reports` |
  | Menus | (Food & Nutrition) | `/menus` |
  | Administration | (Facility Administrator) | `/admin/departments`, `/admin/billing`, `/setup` |

- **No fact store.** The Dashboard stores no operational facts. It is a projection, like Log Book and Review.
- **Calm when healthy.** Exceptions come first. There is no wall of green tiles and no invented "health score".

**Why.** This matches the user's vision. It also follows the existing RUN freeze rule "Dashboard stays an aggregation, not 17 stacked cards".

## DSH-D07 — Retire Today's Work as a destination — accepted (user) October 20, 2026

**Decision.** Today's Work (`/today`, `/today/walk`, `/today/coverage`, `/today/handoffs`) stops being a page. Its unique tools move to their owners, and its duplicate parts are deleted.

| Today's Work part | Moves to |
|---|---|
| Summary counts and operating-location board | Deleted. They duplicate the Dashboard and Locations and counted differently. |
| Walk order (`/today/walk`) | Supervisor "Rounds" card on the Dashboard, plus a Rounds view in Locations (`/units?view=rounds`) |
| Coverage (`/today/coverage`) | "Coverage" card, drilling into Schedule (`/staffing`) and Assignments (`/staffing/assignments`) |
| Handoffs (`/today/handoffs`), including the AI shift summary | "Shift handoff" card plus a page under People & Coverage (`/staffing/handoffs`) |
| Call-downs | "Call-offs & call-downs" card, drilling into Schedule |
| Expected work | "Expected work" card, drilling into Work Plans |

- `/today*` routes become permanent redirects to their new homes.
- Supervisors land on `/dashboard`.
- The `TODAYS_WORK_ENABLED` and `PROJECTION_TODAYS_WORK_ENABLED` flags are removed when DSH-04 closes.

**Why it survived before.**
- Supervisors land on `/today` by default (`src/lib/nav-zones.ts`).
- The Constitution says "Supervisors begin in Today's Work".
- Five tests and the browser CI pin it.
- September phase prompts froze it.
- No phase was ever written to remove it.

This decision and DSH-04 remove each of those anchors on purpose.

**Consequences.**
- The roadmap rule "Never replace Today's Work handoffs" is satisfied by keeping handoffs as a full page. It is reworded in DSH-04.
- Shared helpers under `src/lib/todays-work/` are imported by scheduling, AI snapshot and staffing code, so they move rather than being deleted (DSH-04 relocation map).

## DSH-D08 — Snap grid with Small, Medium and Large sizes — accepted (user) October 20, 2026

**Decision.**
- **Grid.** 12 columns on desktop. Small = 3 columns, Medium = 6, Large = 12.
- **Tablet.** A 6-column grid. Small = 3; Medium and Large = 6.
- **Phone.** One column, in the saved order.
- **Layout data.** A layout is an ordered list of cards and sizes. There are no free x/y positions and no free resizing.
- **Ordering.** Cards flow in order. There is no "dense" packing, so visual order always matches reading and keyboard order.
- **Library.** Reordering uses `@dnd-kit` (already installed and used in Facility Builder). Keyboard reordering and a non-drag "Move up / Move down" control are required.

**Why.** Predictable on tablets and phones, accessible, and easy to reset. Free-form grids drift and break on small screens.

## DSH-D09 — Supervisor and up can customize — accepted (user) October 20, 2026

**Decision.**
- **Who.** Every viewer who gets the Dashboard (Supervisor and up) can enter "Edit dashboard".
- **What they can do.** Reorder cards, change a card's size among its allowed sizes, remove cards, add cards from a library, and reset to the role default.
- **What gets saved.** Layouts are personal. Each viewer has one per scope kind (Facility, Department, Team).
- **Who owns the layout.**
  - Password sessions save against the User.
  - Supervisor PIN sessions have no User row (`sessionUserIdForFk` returns null), so they save against the Employee.
- **Library.** It offers only cards the viewer is eligible for in the current scope.
- **New cards.** When a newly eligible card appears, viewers on the role default get it automatically. Viewers with a saved layout see "New cards available" in the library instead of having their layout changed.
- **Facility defaults (DSH-05).** Facility Administrators can later set facility default layouts per authority band. Personal layouts still win, and "Reset" returns to the facility default.

## DSH-D10 — Cards are platform-owned; Departments contribute capabilities, not screens — accepted (program default) October 20, 2026

**Decision.**
- **Registry.** All cards live in one platform registry in code (`src/lib/dashboard/cards/`). Department Products never ship dashboard UI or register cards at runtime.
- **Eligibility.** A card appears for a Department when that Department has the capabilities the card requires.
- **Where capabilities come from.** They are derived from:
  - the Product registry
  - engine admission
  - product operability
  - the Record engine
  - configuration that exists in Build

**Why.** The Department Product registry says it "is not a shared-engine admission list and not a plugin host". The retired Experience Framework designed a widget host that was never built. A capability contract works for every built Department, every custom Department and every future Product without per-Department dashboard code.

**Consequences.** This is a new platform building rule. It is defined in the [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md) and added to the Department Product blueprint in [doc 13](../product/13_DEPARTMENT_PRODUCT.md).

## DSH-D11 — A saved layout never grants visibility — accepted (program default) October 20, 2026

**Decision.**
- **Check on every render.** Eligibility (authority band, scope, capability, release flags, product operability) is evaluated on the server at every render.
- **Saved layouts are only a preference.** A layout can list a card the viewer is no longer eligible for. That card is skipped, not shown.
- **Ineligible cards stay saved.** They return automatically if the viewer becomes eligible again.
- **Write-time validation.** Saving checks that card IDs are known and sizes are allowed. Visibility is still decided only at render.

## DSH-D12 — One count per answer — accepted (program default) October 20, 2026

**Decision.** A number on the Dashboard comes from the same function as the page it drills into. Examples:
- "Needs attention" location counts come from the same Runtime Location State presentation as Locations.
- Expected work counts come from `loadTodaysExpectedWork`, as Work Plans do.

Cards never re-derive a domain count.

**Why.** The Dashboard and Today's Work disagreed for the same facility on October 16 ("0 operating / 3 spaces" vs "6 On Track") because they used different counting functions.

## DSH-D13 — Each card loads and fails on its own — accepted (program default) October 20, 2026

**Decision.**
- **Streaming.** Every card renders inside its own Suspense boundary.
- **Failures stay contained.** A card's loader catches its own errors and returns an "unavailable" state. A client error boundary is the backstop. One module failing never blanks the page.
- **Shared loads.** Common data comes from a request-scoped Fact Pack, so ten cards do not issue ten copies of the same query.

**Why.** Today one loader failure turns the whole page into "Workspace unavailable".

## DSH-D14 — New `DashboardLayout` model; `WorkspacePreference` is not migrated — accepted (program default) October 20, 2026

**Decision.**
- **New model.** DSH-03 adds a `DashboardLayout` model with a forward-only migration.
- **No data migration.** Existing `WorkspacePreference` rows describe hidden, collapsed and ordered sections of the old page. They don't map to the new cards, so they are not migrated.
- **Retiring the old table.** The new page stops reading `WorkspacePreference` when Business Workspace code is deleted in DSH-04. The table and its rows stay in the database. Dropping them needs separate, explicit approval in a later forward migration.

## DSH-D15 — Pilot behind a flag, then one code path — accepted (program default) October 20, 2026

**Decision.**
- **Pilot flag.** The new Dashboard ships behind `DASHBOARD_V2_ENABLED` (default `false`).
- **While the flag is off.** Current behavior is unchanged.
- **While the flag is on.**
  - Managers and up land on `/dashboard`.
  - `/workspace` redirects to it.
  - Supervisors keep Today's Work until DSH-04.
- **When DSH-04 closes:**
  - the flag is removed
  - Business Workspace code, its Projection path (`PROJECTION_BUSINESS_WORKSPACE_ENABLED`) and the Today's Work page are deleted
  - only one Dashboard code path remains

## DSH-D16 — No release, billing, Plant or Records-model side effects — accepted (user guardrails) October 20, 2026

**Decision.** The program does not:
- change Department Product release status, sellability, entitlements or billing packaging
- add Plant features or Plant migrations
- add a template, requirement or evidence model alongside the forward Records path
- turn on any default-off engine flag

Cards only read what those systems already expose. A card whose engine is off is not eligible.

## DSH-D17 — Superseded statements and amendment schedule — accepted October 20, 2026

The following statements are superseded. Each amendment lands in the phase named below. Until a phase ships, its statement still describes current behavior.

| Document | Statement | Superseded by | Amend in |
|---|---|---|---|
| [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md) | "Managers begin in Business Workspace." | Managers and up begin in the Dashboard. | DSH-02 |
| Product Constitution | "Supervisors begin in Today's Work." / "Site awareness lives on Dashboard and Today's Work." | Supervisors begin in the Dashboard (Team scope). Site awareness lives on the Dashboard; detail lives in owning areas. | DSH-04 |
| [Language Guide](../product/08_PRODUCT_LANGUAGE_GUIDE.md) | Business Workspace row (forbidding "Manager Dashboard") and the Operations Center and Today's Work rows. | "Dashboard" is the product term. Business Workspace, Operations Center and Today's Work become retired terms. | DSH-02 (Business Workspace, Operations Center), DSH-04 (Today's Work) |
| [Persona Model](../product/04_PERSONA_MODEL.md) | GM "Facility performance across departments"; Supervisor home is Today's Work. | GM = Department leader, own Department only. Supervisor home is the Dashboard. | DSH-02 (GM), DSH-04 (Supervisor) |
| [RUN surface freeze](../department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md) | Dashboard row ("do not rewire them in this freeze"). | The freeze is lifted for the Dashboard and Today's Work rows only. The aggregation rule is kept. | DSH-02 |
| [Business Workspace acceptance checklist](../business-workspace-acceptance-checklist.md) | Drag-and-drop out of scope. | Historical. Replaced by the DSH-03 exit gate. | DSH-03 |
| [Legacy Surface Register](../product/LEGACY_SURFACE_REGISTER.md) | No rows for `/workspace`, `/today*`. | Add redirect and retired rows. | DSH-02 (`/workspace`), DSH-04 (`/today*`) |
| [RUN guide](../product/LTC_MANAGER_RUN_GUIDE.md) | Today's Work and Business Workspace guidance. | Dashboard guidance. | DSH-04 |
| [Department Product contract](../product/13_DEPARTMENT_PRODUCT.md) | Blueprint has no Dashboard item. | New "Dashboard contributions" blueprint item and release gate. | DSH-00 (this record) |
| [Product roadmap](../product/10_PRODUCT_ROADMAP.md) | "Never replace Today's Work handoffs." | Handoffs are kept as a full page under People & Coverage. | DSH-04 |

The retired Experience Framework docs (`docs/platform-vision/`, retired September 25) remain retired. This program borrows vocabulary only.

## DSH-D18 — How the Dashboard shows each Department to the Facility Administrator — accepted (user) October 20, 2026

**Decision.** The Facility Administrator's Dashboard shows high-level work for every Department. How far it goes depends on who runs the Department and whether the Facility Administrator is its head. The rules come from the [Contracted Department Authority](../contracted-departments/README.md) program ([CDA-D04](../contracted-departments/DECISIONS.md#cda-d04--the-facility-administrators-access-to-departments--accepted-user-october-20-2026)).

| Department | Access mode | On the Facility Administrator's Dashboard |
|---|---|---|
| Self-operated, they are the head | Manage | Like any Department leader |
| Self-operated, they are not the head | View | Same cards and data, with no change actions. Drill-downs open read-only pages. |
| Vendor-run, before the vendor's head accepts | Manage | Full cards, so they can finish setup. Chip: "Vendor-run · Metz Culinary · head not yet accepted". |
| Vendor-run, after the vendor's head accepts | Summary | High-level cards only: status and counts. No people, no record details, no setup reasons, no links ([CDA-D08](../contracted-departments/DECISIONS.md#cda-d08--what-the-facility-administrator-sees-of-a-vendor-run-department--accepted-user-october-20-2026); list confirmed in CDA-Q07). Compliance Records open read-only from Records, not the Dashboard. |

**Worked example: Terrace View.**

| Department | Run by | Facility Administrator (ECMC) | Department leader |
|---|---|---|---|
| Food & Nutrition | Metz Culinary (vendor-run) | Summary: Records on time or overdue, coverage gaps, open requests to Plant, Operating Rhythm on track or late | Metz GM, on a Metz vendor account: the full Food & Nutrition Dashboard |
| Environmental Services | ECMC (self-operated) | View. Manage if they name themselves head. | EVS head: own Department |
| Facility Plant Operations | ECMC (self-operated) | View. Manage if they name themselves head. | Plant head: own Department |

Plant's work orders for Food & Nutrition's requests appear on Plant's cards, because they are Plant's records ([CDA-D09](../contracted-departments/DECISIONS.md#cda-d09--cross-department-work-stays-with-the-receiving-department--accepted-user-october-20-2026)).

**Rules on the Dashboard.**
- **Where the mode comes from.** Each Department's access mode comes only from the program's resolver (`resolveDepartmentAccessMap`). Dashboard code never derives it, so the Dashboard and every page agree.
- **View.** Cards show their data with no change actions:
  - no setup, Build or "fix" links
  - no Shortcuts that write
  - setup reasons shown as read-only information
- **Summary.** Only cards that declare a summary form render. They show counts and status with a "Vendor-run · operator" chip, and offer no drill-down.
- **None.** The Department does not appear.
- **Departments at a glance.** Lists every Department with its operating model and operator name. The same summary rule applies to its rows.
- **Compliance Records.** The Facility Administrator's read-only access to a vendor-run Department's compliance Records (current and ended periods, [CDA-Q01](../contracted-departments/DECISIONS.md#cda-q01--a-survey-during-a-vendor-contract--answered-user-october-20-2026)) opens from Records. The Dashboard never links to it from a Summary card, and never shows ended periods.

**Vendor heads.** A vendor's head signs in with a vendor account and gets the Department leader Dashboard. CDA-05 needs this, which brings the partner-Dashboard convergence planned for DSH-05 forward.

**Beyond the Dashboard.**
- View and Summary have to hold on every page. That is the Contracted Department Authority program's job.
- Until its enforcement is enabled (CDA-07), other pages behave as today.
- DSH-02 must not add change paths in View, and must not link into vendor pages in Summary.

**What the Facility Administrator keeps everywhere.** Governance: billing, adding Departments, choosing operators, naming self-operated heads, vendor relationships, rooms and buildings, and account security ([CDA-D02](../contracted-departments/DECISIONS.md#cda-d02--one-facility-administrator-per-facility-with-ownership-transfer--accepted-user-october-20-2026)).

**Supersedes.**
- The morning version of this decision gave the Facility Administrator **Oversight** (all data, read-only) on contracted Departments and **Manage** on facility-operated ones. The table above replaces it.
- [Domain model](../product/03_PRODUCT_DOMAIN_MODEL.md) and [doc 13](../product/13_DEPARTMENT_PRODUCT.md) amendments are the authority program's, at CDA-07 ([CDA-D15](../contracted-departments/DECISIONS.md#cda-d15--superseded-statements-and-amendment-schedule--accepted-october-20-2026)), not DSH's.

## DSH-D19 — The Dashboard reads only the forward Records engine — accepted (program default) October 20, 2026

**Decision.** Records cards read only the forward engine: Runtime Location State evidence and `loadFacilityRunLogRequirements`. There is no legacy `/logs` branch. A Department whose Record engine is still LEGACY gets a `not_configured` reason: "This Department still uses legacy Records."

**Why.**
- Nothing legacy may be in use at the first real customer ([CDA-D17](../contracted-departments/DECISIONS.md#cda-d17--nothing-legacy-at-the-first-real-customer--accepted-user-october-20-2026), [Legacy Retirement program](../legacy-retirement/README.md)).
- The earlier plan named `loadFacilityRunLogRequirements` as the legacy source. That was wrong: it is a forward-engine loader and returns nothing when `CANONICAL_LOGS_ENABLED` is off.

**Consequence.** Pilot facilities need the forward engine on, or their Records cards stay `not_configured`.

## DSH-D20 — Remaining partner people use the same Dashboard — accepted (user) October 23, 2026

**Decision.** A partner who can manage a Department sees the same card Dashboard, on `/partner`. An accepted head stays a Department leader for the Departments they head. Any other partner person who can manage a Department sees the manager Dashboard for those Departments. A partner with no Department they can run keeps the Review, Logs, and Assets summary.

**Why.** Vendor heads already had the Department Dashboard (DSH-D18). The product owner said the remaining partner people should use the same Dashboard.

**What stays the same.**
- Partner access is unchanged. The Dashboard only opens Departments they can already manage.
- A head is not shown Departments they do not head.
- Links that have a partner page open there (`/partner/logs`, `/partner/reports`, `/partner/locations`, `/partner/assets`, `/partner/people`). A card whose page a partner cannot open still shows, without that link.
- Arrange saves a personal layout for that person. Facility defaults stay with the Facility Administrator.
- `WorkspacePreference` is not dropped.

---

## Open confirmation items

All are answered or their defaults confirmed (user, October 20, 2026).

### DSH-Q01 — Which cards are leadership-only? — default confirmed (user) October 20, 2026

**Default.** Department setup, People alerts and Teams at a glance are Department leader and up. Everything else in a Department is Manager or Supervisor and up (see the [card catalog](./CARD_CATALOG.md)).

### DSH-Q02 — Manager scope when a Manager belongs to several Departments — default confirmed (user) October 20, 2026

**Default.** A Manager who does not lead a Department sees their primary Department only. Secondary memberships do not widen the Dashboard.

### DSH-Q03 — Is "GM sees only their own Department" Dashboard-only or app-wide? — answered (user) October 20, 2026

**Today.** Route authorization lets GMs and Managers open facility-wide pages, such as the Employees section with tabs for every Department (`resolveEmployeesDeptScope`).

**Answer.** App-wide. Each Department sees only its own: its employees, the rooms and locations assigned to it, and its schedules ([CDA-D16](../contracted-departments/DECISIONS.md#cda-d16--each-department-sees-only-its-own--accepted-user-october-20-2026)). Assets are shared only between the using Department and Plant; the Facility Administrator sees all of them ([CDA-D18](../contracted-departments/DECISIONS.md#cda-d18--assets-are-facility-property-shared-with-plant--accepted-user-october-20-2026)).

**Who delivers it.**
- The Contracted Department Authority program enforces it on every page (CDA-04).
- This program enforces Department scope on the Dashboard from DSH-01. Drill-down links always carry the viewer's Department, so they land scoped even before CDA-04.

### DSH-Q04 — Supervisor with no team assigned — default confirmed (user) October 20, 2026

**Default.** Same as Today's Work today: show the whole primary Department with a visible "No team assigned" notice and a link for the Manager to assign one.

### DSH-Q05 — Should Facility Administrator defaults be lockable? — default confirmed (user) October 20, 2026

**Default.** No. Facility defaults are starting points only, and personal layouts always win.

### DSH-Q06 — What does the Facility Administrator keep on a contracted Department? — answered (user) October 20, 2026

**Answer.** Governance only. The Facility Administrator keeps assigning the Department head.

**Default (governance only).** The Facility Administrator keeps:
- choosing or ending the operating Organization
- install, licensing and billing
- partner access
- shared facility structure
- assigning the Department head

Everything operational and every Department configuration is view-only.

**Afternoon revision.**
- In a vendor-run Department, the vendor's company admin assigns the head, not the Facility Administrator ([CDA-D06](../contracted-departments/DECISIONS.md#cda-d06--vendor-run-departments--accepted-user-october-20-2026)).
- After the head accepts, the Facility Administrator sees summaries only, not view-only detail (DSH-D18).
- The full governance list is [CDA-D02](../contracted-departments/DECISIONS.md#cda-d02--one-facility-administrator-per-facility-with-ownership-transfer--accepted-user-october-20-2026).

### DSH-Q07 — Who handles HR for people in a contracted Department? — answered (user) October 20, 2026

**Answer.** At Terrace View, all Food & Nutrition staff are Metz employees. The Department leader manages them. The Facility Administrator only views them.

**Why it matters.** It depends on who employs the Department's staff. If Food & Nutrition hourly staff are Metz employees, the Facility Administrator should only view them. If some are ECMC employees, the Facility may need HR actions such as discipline or separations.

**Default.** People in a contracted Department are managed by its leader. The Facility Administrator has view-only access.

**Afternoon revision.**
- Vendor employee records belong to the vendor and go with it when the contract ends.
- The Facility Administrator sees staffing as counts only, such as coverage gaps, not people ([CDA-D08](../contracted-departments/DECISIONS.md#cda-d08--what-the-facility-administrator-sees-of-a-vendor-run-department--accepted-user-october-20-2026), [CDA-D10](../contracted-departments/DECISIONS.md#cda-d10--data-belongs-to-the-operator-who-produced-it--accepted-user-october-20-2026)).

### DSH-Q08 — Write the Contracted Department Authority program? — answered (user) October 20, 2026

**Answer.** Yes. It is its own program record: [Contracted Department Authority](../contracted-departments/README.md) (`CDA-`). DSH-02 production enablement depends on its phase tracker.

**Scope.** It covers:
- one Facility Administrator per facility
- head-run Departments
- vendor operation and vendor accounts
- data ownership by operator period
- the amendments to the domain model and doc 13
- tests proving that only a Department's head and members can change it, on any page

Until its enforcement is enabled, the Dashboard only avoids adding new edit paths.

