# Department Dashboard Contract

New platform building rules for how every Department appears on the Dashboard. They apply to built Department Products, facility-created custom Departments and every future Product. They are part of the [Department Product blueprint](../product/13_DEPARTMENT_PRODUCT.md#department-product-blueprint) as the "Dashboard contributions" item.

## Short answer: does the Dashboard work with every built Department?

**Yes.** Cards are platform-owned. A Department contributes capabilities. It does not ship dashboard screens.

- **Food and Nutrition** contributes locations, a published Operating Rhythm, coverage, people, Records, and Menus when those facts exist. Meal timing is Key Points on that rhythm.
- **Facility Plant Operations** contributes maintenance: requests, work orders, issues, and preventive maintenance. It has no required cycle starter and no Location Function. Location cards appear only when the facility assigns locations or publishes a cycle.
- **Environmental Services** is DEVELOPMENT. It contributes nothing to a customer Dashboard.
- **Custom Departments** get the shared cards their configuration supports, and no product cards.

`work.expected` is not admitted. Generic Work Plans are retired. A saved layout that still names that card degrades. It does not show an empty work tile.

## Rules

**R1 — Departments never ship dashboard UI.**
- All cards live in the platform card registry (DSH-D10).
- A Department Product does not register, upload or configure cards.
- This matches the Product registry rule that it is "not a plugin host".

**R2 — Eligibility comes from derived capabilities.**
- A card shows for a Department only when the Department has the card's required capabilities.
- One resolver derives them from:
  - the Product registry
  - engine admission (`department-operations.ts`)
  - product operability
  - the Record engine
  - configuration that exists in Build
- Nothing is declared by hand per facility.

**R3 — Attention flows through one contract.**
- Any module that can make something "need a person" provides a pure mapper to `DashboardAttentionItem` ([Architecture §5](./ARCHITECTURE.md#5-attention-contract)), with `departmentId` set.
- Modules keep their own logic. The mapper only translates.

**R4 — Every summary is Department-scoped and authority-checked.**
- Any function a card uses accepts a Department scope and runs the module's own authority check with the viewer's session.
- Facility-wide functions get a Department filter inside their queries, not a filter applied after `take:`.

**R5 — One count per answer.**
- A card's number comes from the same function as the page it drills into (DSH-D12).

**R6 — "Not configured" is not "broken".**
- When a Department lacks configuration, its cards return `not_configured` with a reason, shown only to people who can fix it.
- They do not show zeros, "not programmed" lists or empty tiles.
- The Department setup card collects the reasons.

**R7 — Release status is respected.**
- DEVELOPMENT products contribute nothing to customer Dashboards.
- AVAILABLE products and entitled RETIRED products contribute normally.
- Release status is never changed by Dashboard work.

**R8 — Custom Departments get shared cards only.**
- A facility-created Department (no Product) is eligible for any shared card its capabilities satisfy. No product cards (Menus, Plant maintenance, Food and Nutrition Key Points).

**R9 — Products declare their Dashboard contribution before release.**
- A Department Product cannot become AVAILABLE, or ship a new operational capability, without:
  - an updated Dashboard contribution declaration (below)
  - the tests listed in [Release gate](#release-gate)

**R10 — Access modes are respected.**
- Every Department is run by its head and team. Vendor-run Departments are run by the vendor's head and team.
- On the Dashboard (DSH-D18), a Facility Administrator who is not the head sees:
  - a self-operated Department in View: same data, no change actions
  - a vendor-run Department in Summary: counts and status only, after the vendor's head accepts
- Access modes come from the Contracted Department Authority resolver. A Product never declares or overrides them.
- Each Product write action is classified in that program's write manifest (CDA-D12).

## Capability vocabulary

Capabilities are facts about one Department on one service date. The resolver ([Architecture §3](./ARCHITECTURE.md#3-capabilities)) derives each from the named owner. Adding a capability is a platform change reviewed with this contract.

| Capability | Meaning | Owner it is derived from | "Not configured" reason when the engine is admitted but this is missing |
|---|---|---|---|
| `locations.runtime` | The Department is responsible for places Runtime Location State can resolve | Department responsibility on canonical Units / UnitSpaces | "No locations are assigned to this Department." |
| `cycles.published` | A published Operational Cycle model applies today | Cycles engine admission plus published model | "No Operating Rhythm is published." |
| `work.expected` | **Retired.** The resolver never admits it. Generic Work Plans are not a Dashboard capability. | — | — |
| `coverage.planned` | Coverage templates, or Operational Assignments, exist | Scheduling / coverage owners | "No coverage plan is set." |
| `people.roster` | The Department has active employees | `Employee` rows | "No employees are in this Department." |
| `records.canonical` | Record engine is CANONICAL for this Department and date | `CANONICAL_LOGS_ENABLED` | n/a. The flag is not a Department setup step. |
| `records.legacy` | Record engine is LEGACY because canonical logs are off. Produces no count, only a setup reason. | `CANONICAL_LOGS_ENABLED` off | "This Department still uses legacy Records." |
| `maintenance.shared` | Shared Asset and Repair operations are admitted | Asset engine admission | n/a |
| `plant.maintenance` | Plant runtime is enabled and this is the Plant Department | `isPlantRuntimeEnabled` | "Plant is installed but not enabled for operation." |
| `plant.requests.filed` | The Department has an active request route to Plant | `listActiveRoutesForRequestingDepartment` | n/a |
| `menus` | Product ships Menus and the Department has Menu applicability | Product registry `starters.menus` plus Menu applicability | "No Menu is assigned to this Department's locations." |
| `meal.milestones` | **Retired.** Food and Nutrition timing is Key Points on the published Cycle. The resolver does not admit a meal-milestone capability. | — | — |

## Compatibility matrix

Status after the November 2026 foundation. ✓ means the card is eligible when its capability is present. ✗ means the Product does not produce that capability. Hidden means the Product is DEVELOPMENT.

| Card | Food and Nutrition | Facility Plant Operations | Environmental Services | Custom Department |
|---|---|---|---|---|
| Needs attention | ✓ from Runtime Location State and Key Points | ✓ PM, triage, and asset/work-order mappers | Hidden | ✓ when `locations.runtime` |
| Shift now / Today's timeline | ✓ when a cycle is published | Only if the facility publishes a Plant cycle | Hidden | ✓ when a cycle is published |
| Expected work | ✗ retired | ✗ retired | Hidden | ✗ retired |
| Coverage | ✓ when planned | ✓ when planned | Hidden | ✓ when planned |
| Shift handoff / Rounds | ✓ when the Department has locations | Only if Plant is responsible for locations | Hidden | ✓ when `locations.runtime` |
| Records due | ✓ when `CANONICAL_LOGS_ENABLED` is on. Off shows the legacy setup reason. | Same Records rule. PM and Work Order evidence use Catalog forms. | Hidden | ✓ when Records are attached and canonical logs are on |
| Work orders & issues | ✓ shared Assets are admitted with the installed Department | ✓ | Hidden | ✓ |
| Preventive maintenance due | ✗ | ✓ | ✗ | ✗ |
| Requests to triage | ✗ | ✓ | ✗ | ✗ |
| Our requests to Maintenance | ✓ when it has a route to Plant | ✗ | Hidden | ✓ when it has a route to Plant |
| Today's menu | ✓ when a Menu applies | ✗ | ✗ | ✗ |
| Department setup | ✓ | ✓ | Hidden | ✓ |

## Assessment by Department

### Food and Nutrition (AVAILABLE)

**Fit: the rhythm product.** It contributes:
- Department responsibility for its places
- Breakfast / Lunch / Dinner Cycles with Prep, Service, and Cleanup Phases
- Key Points: Meal Due (NONE), Ready and Service Started (REQUIRED, LOCATION)
- Menus
- People and Coverage
- Records when canonical logs are on

Capabilities come with the installed Department. There is no dietary capability switch.

**Watch-out.** `CANONICAL_LOGS_ENABLED` defaults off. Records cards then show the legacy setup reason instead of a count.

### Facility Plant Operations (AVAILABLE V1, October 7, 2026)

**Fit: the maintenance product.** The operating loop is request, issue, work order, and preventive maintenance. Dashboard capabilities are `plant.maintenance` and `maintenance.shared`. Attention mappers cover PM due or overdue, requests awaiting triage, and asset or work-order exceptions.

**Watch-out.** Plant has no cycle starter. Shift and location cards stay hidden until the facility assigns locations or publishes a cycle. That hidden state is correct.

### Environmental Services (DEVELOPMENT)

**Today.** Customer Dashboards omit it (R7). It does not contribute Location Functions or Work Plans.

**Before AVAILABLE.** Complete the declaration below and pass the release gate. The declaration uses the same capabilities as any rhythm Department: locations, published cycles, coverage, people, and Records. It does not use `resident_care`, `service_support`, or `work.expected`.

### Custom (facility-created) Departments

**Fit: shared cards only.** Shared engines admit any active custom Department. The Dashboard shows the shared cards its configuration supports: coverage, cycles when published, Records, and maintenance. Product cards never appear (R8). `locations.runtime` comes from responsibility rows. A Department with no responsible places has no location cards. That is the correct, calm outcome.

### Worked example: Terrace View (ECMC) with vendor-run Food & Nutrition (Metz Culinary)

| Department | Operator | How it appears |
|---|---|---|
| Food & Nutrition | Metz Culinary (vendor-run) | Full Food & Nutrition card set for the Metz GM, who signs in with a Metz vendor account, leads it and sees only this Department. The ECMC Facility Administrator sees Summary cards marked "Vendor-run · Metz Culinary": counts and status, no links or people. |
| Facility Plant Operations | ECMC (self-operated) | Plant cards (requests, work orders, PM). The Plant head has Manage access. The Facility Administrator has View, or Manage if they name themselves head. Food & Nutrition's requests to Plant appear on the Food & Nutrition Dashboard as "Our requests to Maintenance" (DSH-05). The work orders are Plant's records. |
| Environmental Services | ECMC | The EVS Product is still DEVELOPMENT, so it does not appear on a customer Dashboard (R7). Releasing it is a separate decision. |

### Platform areas that are not Departments

These feed cards across every Department:
- **Employees and HR.** People alerts are a new aggregate in DSH-05. The CHRC report already exists.
- **Shared Assets.**
- **Records catalog.**
- **Audit / Reports.** Yesterday in review needs a day cache first.
- **Administration.** Setup, Departments, billing, read-only.

They follow the same rules (R3–R6).

## Adapters to build

| Adapter | Why | Phase |
|---|---|---|
| Department filter on `loadPresenceCallOffs` | It is facility-wide today (`src/lib/todays-work/load-presence-call-offs.ts`) | DSH-01 |
| Department filter inside `loadWorkspaceNonOperationalExtras` queries | It filters nothing and uses `take: 6`, so filtering afterwards would drop rows | DSH-01 |
| Plant attention mappers (PM, triage, work orders and asset exceptions) | Implemented. Plant work appears in Needs attention through those mappers. | Done |
| Records attention mapper with engine branch | Legacy vs canonical Records | DSH-01 |
| Capability resolver | One source of truth for eligibility | DSH-01 |
| Custom-Department Runtime Location State verification | Confirm `locations.runtime` derivation | DSH-01 |
| People alerts aggregate | No HR alert summary exists | DSH-05 |
| Day-level cache for `loadOperationalReviewDay` | Too heavy for a per-request card | DSH-05 |

## Dashboard contribution declarations

Each Department Product keeps one declaration here. Declarations list what the Product makes possible, not UI. The card catalog decides presentation.

### Food and Nutrition — declared October 20, 2026

| Item | Declaration |
|---|---|
| Capabilities it can produce | `locations.runtime`, `cycles.published`, `coverage.planned`, `people.roster`, `records.canonical` when canonical logs are on, `menus`, `maintenance.shared` |
| Attention sources | Runtime Location State, missed REQUIRED Key Points, coverage gaps, Records due, Menu applicability gaps |
| Primary drill-down homes | Locations, Operating Rhythm, People & Coverage, `/menus`, Records |
| "Not configured" states | No locations, no published Operating Rhythm, no coverage plan, no Menu assignment |
| Tests | Menu card hidden for Departments that do not offer Menus. `work.expected` and `meal.milestones` stay absent. |

### Facility Plant Operations — declared October 20, 2026

| Item | Declaration |
|---|---|
| Capabilities it can produce | `plant.maintenance`, `maintenance.shared`, `coverage.planned`, `people.roster`, Records when canonical logs are on. `cycles.published` and `locations.runtime` only when the facility configures them. |
| Attention sources | Requests awaiting triage, PM due or overdue, open work orders and asset exceptions |
| Cross-Department contribution | Other Departments with a request route get `plant.requests.filed` |
| Primary drill-down homes | `/assets`, `/repairs`, `/asset-issues`, `/preventive-maintenance` |
| "Not configured" states | Plant installed but not operable. No published PM plans show that reason on the PM card. |
| Tests | Plant attention mappers. Location cards stay ineligible without locations. Work-order authority is respected. |

### Environmental Services — declared November 23, 2026 (Product stays DEVELOPMENT)

| Item | Declaration |
|---|---|
| Capabilities it can produce | `locations.runtime`, `cycles.published`, `coverage.planned`, `people.roster`, `records.canonical` when canonical logs are on, `maintenance.shared`. `plant.requests.filed` only with a request route to Plant and Plant runtime on. Never `work.expected`, `meal.milestones`, `menus` or `plant.maintenance`. No Location Function. |
| Attention sources | The same platform attention as any rhythm Department: Runtime Location State (overdue REQUIRED Key Points arrive as milestone exceptions), coverage gaps and call-offs, Records due, and shared asset exceptions. No EVS-only event. |
| Primary drill-down homes | Locations, Operating Rhythm, People & Coverage (`/staffing`, `/staffing/assignments`), Records |
| "Not configured" states | No locations, no published Operating Rhythm, no coverage plan, legacy Records |
| Tests | `src/lib/dashboard/evs-release-gate.hermetic.test.ts` covers gate items 2, 3, 5, 6 and 7, and that a DEVELOPMENT EVS reaches only internal Dashboards. The EVS subtest in `src/lib/dashboard/dashboard-foundation.db.test.ts` covers item 4. |
| Release requirement | The gate passes. Release status is a separate product-owner decision; passing the gate does not change it. |

## Release gate

Add to every Department Product release certification, and to any change that gives a Product a new operational capability:

1. **Declaration.** The Dashboard contribution declaration is complete and reviewed.
2. **Capability tests.** Each declared capability is derived correctly and fails closed when its engine or flag is off.
3. **Attention tests.** Each attention source has a mapper with tests for severity and `departmentId`.
4. **Isolation tests.** Two-Department database tests show no data from another Department in any card model.
5. **Drill-down tests.** Every drill-down passes `authorizeRoute` for each authority band that can see the card.
6. **Calm-state tests.** An installed but unconfigured Department shows `not_configured` (leaders only), never empty tiles.
7. **Access-mode tests.**
   - With the Facility Administrator in View, the Product's cards show no change actions.
   - With the Department vendor-run and in Summary, only summary models render, with no links or people.

## What Departments do not do

- Build or ship dashboard screens, widgets or layouts.
- Choose card placement, sizes or default layouts.
- Add Department-specific branches to Dashboard code. Branching happens only through capabilities.
- Store facts for the Dashboard. The Dashboard is a projection.
