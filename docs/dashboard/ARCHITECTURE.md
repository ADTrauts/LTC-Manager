# Dashboard architecture

The technical contract for the Dashboard program. Product decisions are in [DECISIONS.md](./DECISIONS.md). The cards themselves are in the [card catalog](./CARD_CATALOG.md). The rules for Departments are in the [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md).

Code sketches are illustrative types, not final code. Each phase confirms names against source and the Next.js 16 guide in `node_modules/next/dist/docs/` before writing code.

## 1. Request pipeline

One request to `/dashboard` runs these steps on the server:

1. **Route gate.**
   - The platform route registry (`authorizeRoute`) allows Supervisor and up.
   - Floor roles go to `resolveDefaultHomePath`.
2. **Viewer Context.**
   - `resolveDashboardViewer(session, cookies)` returns who is looking, what they may see, and in which scope.
3. **Capabilities.**
   - `resolveDepartmentDashboardCapabilities(viewer)` returns the capabilities of each Department in scope.
4. **Eligible cards.**
   - `listEligibleCards(viewer, capabilities)` filters the platform card registry.
5. **Layout.**
   - `resolveDashboardLayout(viewer, eligible)` takes the personal layout if one exists, otherwise the facility default (DSH-05), otherwise the role default.
   - Cards the viewer can't see are skipped.
6. **Fact Pack.**
   - `createDashboardFactPack(viewer)` creates lazy, memoized loaders for shared data.
7. **Render.**
   - The page renders the grid. Each card is its own server component inside its own Suspense and error boundary.
   - Each card calls `card.load({ viewer, facts, size })` and renders its model.

Steps 1–5 are cheap and render the page frame immediately. Step 6 runs only when a card asks for data. Data loads stream into each card as they finish.

## 2. Viewer Context

**Location.** `src/lib/dashboard/viewer/` (DSH-01). The Viewer Context is assembled from inputs that already exist:

| Input | Existing source |
|---|---|
| Role | Facility session role (`FacilitySession`, `src/lib/access.ts` priorities) |
| Employee | `getOperationalEmployeeIdForSession` (`src/lib/session-employee.ts`) |
| Led Departments | `Department.headEmployeeId`, plus GM role + `Employee.primaryDepartmentId`. Same rule as `canManageDepartmentHeadSettings` (`src/lib/dept-settings-access.ts`). |
| Operable Departments | `loadCustomerOperableDepartments` / `evaluateCustomerDepartmentOperability` (`src/lib/department-products/`) |
| Operating model and access mode | `resolveDepartmentAccessMap` from the [Contracted Department Authority](../contracted-departments/ARCHITECTURE.md#3-the-resolver-srclibdepartment-authority) program (CDA-01). It is batched over `loadCurrentOperatorsForFacilityDepartments`. Vendor-run when the operating Organization differs from the Facility's parent Organization. |
| Sidebar lens | `ltc_active_department` cookie via `resolveActiveDepartmentForShell` (`src/lib/active-department-context.ts`) |
| Team rooms | `resolveViewerTeamScopes` (moves from `src/lib/todays-work/viewer-team-scope.ts` to `src/lib/dashboard/viewer/` in DSH-04, re-exported until then) |
| Service date and timezone | Facility operational time (`src/lib/operational-time`) |

```ts
type DashboardAuthority =
  | "FACILITY_ADMINISTRATOR"
  | "DEPARTMENT_LEADER"
  | "MANAGER"
  | "SUPERVISOR";

type DashboardScope =
  | { kind: "FACILITY" }
  | { kind: "DEPARTMENT"; departmentId: string }
  | { kind: "TEAM"; departmentId: string; teamIds: string[]; roomIds: string[] };

type DashboardViewer = {
  facilityId: string;
  facilityTimezone: string;
  serviceDate: string;                 // facility-local YYYY-MM-DD
  session: FacilitySession;            // passed through so domain authority checks still run
  role: AppRole;
  authority: DashboardAuthority;
  employeeId: string | null;
  layoutOwner: { kind: "USER"; userId: string } | { kind: "EMPLOYEE"; employeeId: string } | null;
  ledDepartmentIds: string[];
  scopeDepartmentIds: string[];        // Departments this viewer may ever see on the Dashboard
  departmentAccess: Record<string, "MANAGE" | "VIEW" | "SUMMARY">; // per Department in scope (DSH-D18); NONE is never in scope
  operators: Record<string, {          // per Department in scope, for the service date
    operatingModel: "SELF_OPERATED" | "VENDOR_RUN";
    operatorName: string;              // e.g. "Metz Culinary"
    vendorHeadAccepted: boolean;       // vendor-run only
  }>;
  scope: DashboardScope;               // what the current request summarizes
  availableScopes: DashboardScope[];   // what the lens switch offers
  notices: DashboardViewerNotice[];    // "No team assigned", "Dashboard covers Dietary", ...
  canCustomize: boolean;               // Supervisor and up with a layout owner
};
```

### 2.1 Scope resolution rules

| Authority | `scopeDepartmentIds` | Default `scope` | `availableScopes` |
|---|---|---|---|
| Facility Administrator | All customer-operable Departments | `FACILITY` | `FACILITY` plus each Department. A Summary Department's lens shows summary cards only. |
| Department leader | Led Departments | `DEPARTMENT` (primary if led, else first led) | Each led Department |
| Manager | Primary Department | `DEPARTMENT` | That Department only |
| Supervisor | Primary Department | `TEAM` when team rooms exist, else `DEPARTMENT` with a "No team assigned" notice | `TEAM` and its `DEPARTMENT` |

**Access mode per Department (DSH-D18).**

| Viewer | Self-operated Department | Vendor-run Department |
|---|---|---|
| Facility Administrator, not the head | `VIEW` (sees everything, changes nothing) | `MANAGE` until the vendor's head accepts, then `SUMMARY` |
| Facility Administrator, named themselves head | `MANAGE` | Not possible (CDA-D04) |
| Department leader | `MANAGE` (led Departments) | `MANAGE` (led Departments, vendor account) |
| Manager / Supervisor in the Department | `MANAGE` within their role | `MANAGE` within their role (vendor account or vendor-period workforce record) |

These values come from the CDA resolver, never from Dashboard code.

**View dependency.** Today Work, Records (Log Book), preventive maintenance, Plant requests, Job Flow and Assets deny or limit a Facility Administrator viewing a Department other than their primary one. Facility Administrator drill-downs into those areas need the CDA-03 view fix. Until it lands, those cards show no drill-down link to a Facility Administrator.

**Authority precedence.** Facility Administrator > Department leader > Manager > Supervisor. Department leader applies when the viewer leads at least one Department, whatever their role (GM, or a Manager linked as head).

**Lens.** A lens request (cookie or `?scope=` parameter) is honored only if it names one of `availableScopes`. Otherwise the default scope is used and a notice explains it.

**Missing Department.** When `scopeDepartmentIds` is empty for anyone below Facility Administrator, the page renders the "Your Dashboard needs a Department" state and no cards.

**Excluded Departments.** DEVELOPMENT products are excluded from `scopeDepartmentIds` for customers, so EVS never appears. Inactive Departments and Departments the facility is not licensed to operate are excluded too.

### 2.2 Session types

| Session | Dashboard |
|---|---|
| Facility User session, Supervisor+ | Yes. Layout owner is the User. |
| Facility Employee PIN session, Supervisor | Yes. Layout owner is the Employee. |
| Facility session, Lead / Staff | No. Default home unchanged. |
| Partner session | No. `/partner` is unchanged until DSH-05 convergence. Exception, as built in CDA-05 while Contracted Department Authority is on: an accepted vendor head is a Department leader for the Departments they run. Their partner Dashboard lists that leader's cards. Other partner sessions stay on the existing partner Dashboard. |
| Organization session | No. |
| VSSYL Console Facility work session | Follows its effective Facility role. Never saves a layout (layout owner `null`). |

## 3. Capabilities

**Location.** `src/lib/dashboard/capabilities.ts` (DSH-01). One function returns the capabilities of each Department in scope. It is the only place cards learn what a Department can do. The [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md#capability-vocabulary) defines the vocabulary.

```ts
type DashboardCapability =
  | "locations.runtime"     // Department owns Locations that Runtime Location State resolves
  | "cycles.published"      // Published Operational Cycle model for the service date
  | "work.expected"         // Work Plans engine admitted and at least one published plan
  | "coverage.planned"      // Coverage templates or Operational Assignments exist
  | "people.roster"         // Active employees in the Department
  | "records.canonical"     // Record engine resolves CANONICAL for this Department and date
  | "records.legacy"        // Record engine resolves LEGACY; only feeds a not_configured reason (DSH-D19)
  | "maintenance.shared"    // Shared Asset / Repair operations admitted for the Department
  | "plant.maintenance"     // Facility Plant Operations runtime enabled (requests, WOs, PM)
  | "plant.requests.filed"  // Department has an active request route to Plant
  | "menus"                 // Product ships Menus and the Department has Menu applicability
  | "meal.milestones";      // Food & Nutrition meal milestones (hasDietaryDomainCapabilities)

type DepartmentDashboardCapabilities = {
  departmentId: string;
  departmentKey: string;
  productKey: DepartmentProductKey | null;   // null for custom Departments
  has: ReadonlySet<DashboardCapability>;
  notConfigured: NotConfiguredReason[];      // feeds the Department setup card
};
```

Each capability is derived from an existing owner. No new configuration is created.

| Capability | Derived from |
|---|---|
| `locations.runtime` | Location Function bindings and spaces the Department owns (Runtime Location State inputs) |
| `cycles.published` | `isDepartmentEngineEnabledForFacility(…, "cycles", …)` plus a published cycle model (`loadDepartmentRunPresentation` non-empty) |
| `work.expected` | Work Plans engine admission plus a published Work Plan |
| `coverage.planned` | Coverage templates, or `OPERATIONAL_ASSIGNMENTS_ENABLED` plus assignment rows |
| `people.roster` | Active `Employee` rows in the Department |
| `records.canonical` / `records.legacy` | `resolveRecordEngine` for the Department and service date (`CANONICAL_LOGS_ENABLED` plus `RecordEngineRollout`) |
| `maintenance.shared` | Shared Asset engine admission for the Department |
| `plant.maintenance` | `isPlantRuntimeEnabled(facilityId, session)` and the Department is the Plant Department |
| `plant.requests.filed` | `listActiveRoutesForRequestingDepartment` returns at least one route |
| `menus` | Product registry `starters.menus` plus Menu applicability rows for the Department |
| `meal.milestones` | `hasDietaryDomainCapabilities(department.key)` |

**Rules.**
- **Fail closed.** If an owner throws or a flag is off, the capability is absent.
- **Engine admission.** Capabilities never bypass `department-operations.ts`. If an engine is not admitted, its capability is absent, even when rows exist.
- **Batching.** The function is batched. It runs one query per source for all Departments in scope, never one query per Department per capability.

## 4. Card registry

**Location.** `src/lib/dashboard/cards/registry.ts` (DSH-01). A frozen, platform-owned array. Adding a card is a code change reviewed like any other.

```ts
type DashboardCategory =
  | "people"          // People & Coverage
  | "locations"       // Locations
  | "operations"      // Operational Cycle & Work
  | "maintenance"     // Maintenance
  | "records"         // Records & Audit / Reports
  | "menus"           // Menus
  | "administration"; // Administration

type CardSize = "S" | "M" | "L";

type DashboardCardDefinition<Model> = {
  id: DashboardCardId;                       // stable; stored in layouts
  title: string;                             // product language
  question: string;                          // the one question it answers
  category: DashboardCategory;
  scopes: readonly DashboardScope["kind"][]; // where it is meaningful
  minAuthority: DashboardAuthority;
  requires: CapabilityRequirement;           // e.g. { anyOf: ["maintenance.shared", "plant.maintenance"] }
  sizes: readonly CardSize[];
  defaultSize: CardSize;
  load(input: CardLoadInput): Promise<CardResult<Model>>;
  drillDown(viewer: DashboardViewer, model: Model | null): DrillDown | null;
};

type DrillDown = {
  href: string;
  intent: "view" | "manage";                 // "manage" = opens a place to change things
  viewHref?: string;                         // read-only alternative for VIEW viewers
};

type CardResult<Model> =
  | { state: "ready"; model: Model; attention: DashboardAttentionItem[] }
  | { state: "quiet"; message: string }                 // healthy: nothing needs anyone
  | { state: "not_configured"; reason: NotConfiguredReason }
  | { state: "unavailable"; reason: "error" | "timeout" };
```

### 4.1 Eligibility

`listEligibleCards(viewer, capabilities)` is a pure function. A card is eligible when all of these hold:

1. `viewer.scope.kind` is in `card.scopes`.
2. `viewer.authority` is at or above `card.minAuthority`.
3. `card.requires` is satisfied:
   - **Department or Team scope:** by the capabilities of the Department in scope.
   - **Facility scope:** by at least one Department in scope.
4. Every route that `card.drillDown` can return passes `authorizeRoute` for the viewer's role and current flags. A card with a drill-down the viewer can't open is not eligible, so the Dashboard never shows a dead link.

**View.** For a Department where the viewer's access is `VIEW`:
- `manage` drill-downs use their `viewHref`, or render with no link.
- Write Shortcuts are removed.
- Card actions are not rendered.

The data shown is unchanged.

**Summary.** For a Department where the viewer's access is `SUMMARY`:
- A card is eligible only if it declares `summary` (see below).
- It renders the summary model only: counts and status.
- No drill-down, Shortcut, card action, person name, record detail or setup reason.
- Attention items carry only a count and a severity, and are labeled with the Department.

```ts
// Added to DashboardCardDefinition<Model>
summary?: {
  load(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>>;
};

type DashboardSummaryModel = {
  metrics: { label: string; value: number | string; tone: "ok" | "attention" | "late" }[];
};
```

The summary loader may read only aggregate queries over the vendor's current operator period. It never reads ended periods. The CDA-Q07 list decides which cards have a summary form:
- `records_due`
- `coverage`
- `shift_now` and `timeline` (Operating Rhythm on track or late)
- `department_setup`
- `requests_filed`, from DSH-05. Until then, open requests to Plant are a count on the `departments_glance` row.

**Not configured.** A card that is eligible except for a missing configuration capability can still render in a `not_configured` state, but only for viewers who can fix it: the Department leader, or the Facility Administrator when they hold `MANAGE`. `VIEW` viewers see the reason as read-only information, with no fix link. `SUMMARY` viewers and everyone else don't see it. The Department setup card collects those reasons in one place, so the Dashboard is not a grid of empty tiles.

## 5. Attention contract

**Location.** `src/lib/dashboard/attention.ts` (DSH-01). This is the single shape for "something needs a person". Every module that can raise attention gets a pure mapper from its existing output to this shape. Modules don't change what they compute.

```ts
type AttentionSeverity = "act_now" | "due_soon" | "watch";

type DashboardAttentionItem = {
  id: string;                    // stable: `${source}:${sourceId}`
  source:
    | "location"                 // Runtime Location State interventions
    | "coverage"                 // coverage gaps, unfilled call-offs
    | "records"                  // due / overdue / corrective Records
    | "maintenance"              // urgent work orders, asset exceptions
    | "plant_pm"                 // PM due / overdue
    | "plant_request"            // requests awaiting triage
    | "menus"                    // Menu applicability gaps
    | "setup";                   // configuration missing (leaders only)
  severity: AttentionSeverity;
  departmentId: string;
  locationId: string | null;     // unit or space id when location-bound
  title: string;                 // product language
  detail: string | null;
  dueAt: string | null;          // ISO, facility timezone applied at render
  href: string;                  // owner page; must pass authorizeRoute
};
```

| Mapper | Input (existing) | Phase |
|---|---|---|
| `attentionFromRuntimeLocations` | `presentDashboardWorkspace` interventions | DSH-01 |
| `attentionFromCoverage` | Runtime Location State coverage, `summarizeCallDowns` | DSH-01 |
| `attentionFromRecords` | Runtime Location State evidence and `loadFacilityRunLogRequirements` (both forward engine). No legacy source (DSH-D19). | DSH-01 |
| `attentionFromAssetExceptions` | `loadSupervisorAssetExceptions` | DSH-01 |
| `attentionFromPlantPm` | `loadPmRunBoard` counts | DSH-01 |
| `attentionFromPlantRequests` | `listPlantTriageQueue` | DSH-01 |
| `attentionFromMenus` | `evaluateMenuApplicabilityAttention` | DSH-01 |
| `attentionFromSetup` | Capability `notConfigured` reasons | DSH-02 |

**Severity rules.** Each mapper documents its severity mapping in a test.

| Severity | Meaning | Examples |
|---|---|---|
| `act_now` | Something is late or blocked now | Missed required Key Point, overdue required Record, urgent open work order, coverage gap in the current shift, unfilled call-off for the current shift |
| `due_soon` | Due inside the current Phase or the next two hours | |
| `watch` | Worth knowing, nobody is late | |

**Order and display.** Items sort by severity, then `dueAt`, then title. Severity maps to the existing design-system status tones in one table. Cards never invent tones.

## 6. Fact Pack

**Location.** `src/lib/dashboard/facts.ts` (DSH-01). The Fact Pack is a request-scoped object of lazy, memoized getters keyed by Department. Cards ask the Fact Pack and never call shared loaders directly. Memoization uses React `cache()` or a per-request promise map. Confirm against the Next.js 16 docs before writing it.

| Fact | Source | Shared by |
|---|---|---|
| `runtimeLocations(departmentIds)` | `loadRuntimeLocationStates` over `collectActionableLandingSpaces` (one batch for every space in scope) | Needs attention, Shift now, Coverage, Records due, Rounds, Departments at a glance |
| `runPresentation(departmentId)` | `loadDepartmentRunPresentation` (team scope passes `spaceIdFilter`) | Shift now, Today's timeline, Expected work |
| `cycleSummary(departmentId)` | `loadGmCycleSummary` | Today's timeline |
| `expectedWork(departmentId)` | `loadTodaysExpectedWork` | Expected work |
| `dailyCoverage(departmentId)` | `loadSupervisorDailyCoverage` | Coverage |
| `callOffs(departmentId)` | `loadPresenceCallOffs`, gaining a Department filter in DSH-01 | Call-offs & call-downs, Needs attention |
| `handoffs(scope)` | `buildHandoffData` / `presentHandoffsFromBoard` | Shift handoff |
| `assetExceptions(departmentId)` | `loadSupervisorAssetExceptions` | Work orders & issues |
| `workOrders(departmentId)` | `listWorkOrders` (session passed, so `resolveWorkOrderActorAuthority` applies) | Work orders & issues, Our requests to Maintenance |
| `pmBoard(departmentId)` | `loadPmRunBoard` | PM due |
| `triage(plantDepartmentId)` | `listPlantTriageQueue` | Requests to triage |
| `menus(departmentId)` | `resolveApplicableMenus` | Today's menu |
| `runLogRequirements(departmentId)` | `loadFacilityRunLogRequirements` (forward engine; empty when `CANONICAL_LOGS_ENABLED` is off) | Records due |
| `recentActivity(departmentIds)` | `loadWorkspaceNonOperationalExtras`, gaining a Department filter inside its queries in DSH-01 | Recent activity |
| `reviewDay(departmentId, date)` | `loadOperationalReviewDay` behind a day-level cache (DSH-05) | Yesterday in review |

**Rules.**
- **Authority.** Every fact takes the viewer's session or Department list from the Viewer Context. A fact never takes a Department id from the request.
- **Domain checks.** Facts call the domain's own function, so the domain's authority checks run.
- **Facility scope.** Facility-scope cards fan out by Department through the same memoized getters. This is bounded by the number of operable Departments.
- **No writes.** The Fact Pack never mutates.

## 7. Layout

### 7.1 Model (DSH-03, forward-only migration)

```prisma
enum DashboardScopeKind {
  FACILITY
  DEPARTMENT
  TEAM
}

model DashboardLayout {
  id            String             @id @default(cuid())
  facilityId    String
  userId        String?
  employeeId    String?
  scopeKind     DashboardScopeKind
  schemaVersion Int                @default(1)
  items         Json               // [{ "card": "attention", "size": "L" }, ...]
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  facility Facility  @relation(fields: [facilityId], references: [id], onDelete: Cascade)
  user     User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  employee Employee? @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([facilityId, userId, scopeKind])
  @@unique([facilityId, employeeId, scopeKind])
  @@index([facilityId])
}
```

**Database rules.**
- **One owner.** The migration adds a `CHECK (num_nonnulls("userId", "employeeId") = 1)` constraint.
- **Identity.** Layouts are keyed by scope kind, not by Department id. A Department leader with two Departments uses one Department layout for both. Ineligible cards are skipped per Department.
- **Facility defaults.** DSH-05 adds facility defaults as a separate model (`DashboardFacilityDefault`, keyed by facility, authority band and scope kind) in its own forward migration.
- **Before writing the migration.** Confirm field and relation names against the current schema.

### 7.2 Items

- **Format.** `items` holds the layout, validated with `zod` on read and write.
- **Write validation.** A save is rejected when:
  - a card id is unknown
  - a size is not allowed for that card
  - a card is duplicated
  - the layout has more than 24 items
- **Read tolerance.** Unknown ids are dropped on read, so a retired card disappears quietly. Known but ineligible ids are kept in storage and skipped at render (DSH-D11).
- **Versioning.** `schemaVersion` lets a later phase migrate the items shape in code.

### 7.3 Resolution order

1. Personal layout for the viewer's owner and scope kind.
2. Facility default for the authority band and scope kind (DSH-05).
3. Role default from `src/lib/dashboard/layouts/defaults.ts`. The [card catalog](./CARD_CATALOG.md#default-layouts) lists them.

The page then filters to eligible cards, keeping order and sizes.

### 7.4 Saving

A server action, `saveDashboardLayout({ scopeKind, items })`:
- requires `viewer.canCustomize`
- re-resolves the viewer
- validates the items
- upserts on the owner key

`resetDashboardLayout({ scopeKind })` deletes the personal row. Both actions are idempotent and never touch another viewer's row.

## 8. Rendering

- **Server-rendered grid.** The server renders the grid in layout order. Each cell is a server component wrapped in `<Suspense>` with a skeleton sized to the card. Each card's loader catches its own errors and returns `unavailable`. A client error boundary around each cell is the backstop.
- **Grid CSS.** 12 columns at desktop widths and 6 at tablet widths. Phones get one column. Sizes map to spans (DSH-D08). There is no `grid-auto-flow: dense`.
- **Edit mode.** A client island that receives the current items and eligible library. It uses `@dnd-kit/core` and `@dnd-kit/sortable` with pointer and keyboard sensors. Each card has a size menu, a remove control and Move up / Move down buttons. Saving calls the server action and refreshes. Edit mode renders card frames, not live card data, so it stays fast.
- **Post-onboarding hand-off.** `?onboarding=complete` renders the existing `OnboardingLaunchChecklist` above the grid, as `/workspace` does today.
- **Freshness.** Data is fetched per request. There is no polling. A "Refresh" control re-requests the page. Live updates are out of scope.
- **Design system.** Cards use existing components and status tones. The card frame shows:
  - the title
  - a scope chip, such as "Dietary · Team 2 West", plus "Vendor-run · Metz Culinary" when the Department is vendor-run
  - one primary number or list
  - a drill-down link

## 9. Routes, navigation and flags

| Item | While `DASHBOARD_V2_ENABLED=false` | While `true` (DSH-02 to DSH-04) | After DSH-04 |
|---|---|---|---|
| `/dashboard` | Redirect to `resolveDefaultHomePath` (current) | New Dashboard (Supervisor+) | New Dashboard (Supervisor+) |
| `/workspace` | Business Workspace (current) | Redirect to `/dashboard` | Redirect to `/dashboard` |
| `/today*` | Today's Work (current) | Today's Work (Supervisors still land here) | Redirects to new homes (DSH-D07) |
| Home for Manager+ | `/workspace` | `/dashboard` | `/dashboard` |
| Home for Supervisor | `/today` | `/today` | `/dashboard` |
| Nav item "Dashboard" | `/workspace` | `/dashboard` | `/dashboard` |
| Nav item "Today's Work" | Shown | Shown | Removed |

**Route registry.** Changes go in `src/lib/route-registry/platform-routes.ts`. The `/dashboard` entry changes from the legacy STAFF+ redirect to a Supervisor+ page. `/workspace` and `/today*` become redirect entries. The flag is added with the existing flag helpers and defaults to `false`.

## 10. Authorization rules

| Rule | Statement | Proven by |
|---|---|---|
| A1 | Only Facility sessions with Supervisor+ reach the Dashboard. | Route registry and page guard tests |
| A2 | Scope comes only from the Viewer Context. Request parameters and cookies can only pick among `availableScopes`. | Viewer matrix tests, including forged cookie and parameter cases |
| A3 | Eligibility is evaluated on every render. A saved layout never adds visibility. | Layout tests with ineligible ids |
| A4 | Cards call domain functions with the viewer's session, so domain authority (for example `resolveWorkOrderActorAuthority`) still applies. | Card loader tests with an under-privileged session |
| A5 | Every drill-down passes `authorizeRoute` for the viewer. Cards with unreachable drill-downs are ineligible. | One test iterates every card × authority band |
| A6 | Card models contain only data for Departments in scope. | Two-Department database tests for each Department-scoped fact |
| A7 | DEVELOPMENT products, inactive Departments and non-operable Departments contribute nothing to customer Dashboards. | Capability tests with EVS installed internally |
| A8 | Layout writes only touch the caller's own row. Supervisors cannot save Facility-scope layouts. | Server action tests |
| A9 | The Dashboard stores no operational facts. | Code review rule: Dashboard modules import no Prisma write APIs except `DashboardLayout` |
| A10 | In a `VIEW` Department the Dashboard offers no way to change anything: no manage drill-downs, write Shortcuts or card actions. | Hermetic test over every card × `VIEW`; browser test with the Terrace View fixture (self-operated EVS, Facility Administrator not head) |
| A11 | In a `SUMMARY` Department the Dashboard shows only summary models: no links, people, record details or setup reasons, and nothing from ended operator periods. | Hermetic test over every card × `SUMMARY`; model-shape test; browser test with vendor-run Food & Nutrition after the head accepts |

## 11. Performance budget

| Measure | Budget |
|---|---|
| Page frame (shell plus grid skeleton) | No card data on the critical path. The frame streams before any card loader finishes. |
| Runtime Location State | One batched load per request for all spaces in scope, reusing its prefetch. Never per card. |
| Card query discipline | A card adds no database round trips beyond its Fact Pack facts. Asserted by tests that count fact calls. |
| Pilot target | p95 time until every card has settled under 2.5 s for the pilot facility's largest Department, measured with existing telemetry. A miss blocks DSH-02 exit. |
| Heavy loaders | `loadOperationalReviewDay` is not used until it has a day-level cache (DSH-05). |

## 12. Planned file layout

```
src/lib/dashboard/
  viewer/                      resolveDashboardViewer, leader resolution, team scope (moved in DSH-04)
  capabilities.ts              resolveDepartmentDashboardCapabilities
  attention.ts                 DashboardAttentionItem + severity tones
  attention-mappers/           one file per source module
  facts.ts                     createDashboardFactPack
  cards/registry.ts            DASHBOARD_CARDS (frozen)
  cards/<card-id>.ts           one definition + loader per card
  layouts/defaults.ts          role default layouts
  layouts/parse.ts             zod parsing and validation
  layouts/store.ts             DashboardLayout reads and writes (DSH-03)
src/components/dashboard/
  dashboard-grid.tsx           server grid
  dashboard-card-frame.tsx     frame, skeleton, states
  dashboard-edit-mode.tsx      client edit island (DSH-03)
  cards/<card-id>.tsx          card body views
src/app/(protected)/dashboard/
  page.tsx                     the Dashboard
  actions.ts                   save / reset layout (DSH-03)
```

## 13. Testing strategy

Follow the repository test runners (`node --import tsx --test`; hermetic and DB suites; Playwright under `tests/*-browser/`). Apply proportionate verification in the same spirit as the [onboarding verification policy](../onboarding/VERIFICATION_POLICY.md). The full suite runs at DSH-02 and DSH-04 exits and whenever a change reaches shared shell or route code.

| Layer | What is tested |
|---|---|
| Hermetic | Viewer matrix (role × head link × primary Department × team × lens request × operating model), eligibility matrix (authority × scope × capability × flag × product status), layout parsing, attention mappers and severity, drill-down authorization for every card |
| Database | Leader resolution on real rows, capability derivation per Department type, Department filters on call-offs and recent activity, layout persistence and owner isolation, two-Department leakage tests |
| Count parity | For the same fixtures, Needs attention equals the Locations count and Expected work equals Work Plans |
| Browser | Facility Administrator, Department leader, Manager and Supervisor each see the correct default layout. Drag, resize, add, remove, reset and save persist across reloads. Phone width shows one column. Drill-downs open. `/workspace` and `/today*` redirect. The post-onboarding checklist renders. |
