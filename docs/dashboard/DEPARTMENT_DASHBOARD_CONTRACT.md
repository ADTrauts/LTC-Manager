# Department Dashboard Contract

New platform building rules for how every Department appears on the Dashboard. They apply to built Department Products, facility-created custom Departments and every future Product. They are part of the [Department Product blueprint](../product/13_DEPARTMENT_PRODUCT.md#department-product-blueprint) as the "Dashboard contributions" item.

## Short answer: does the new Dashboard work with every built Department?

**Yes, without restructuring any Department.** Every Department-level data source the Dashboard needs is already scoped by Department and already enforces its own authority. Coverage is uneven, though:

- **Healthcare Food & Nutrition (installed as Dietary)** fits fully today.
- **Facility Plant Operations** fits through its own services (requests, work orders, PM). It has no Operational Cycle or Location Function, so it needs a shared attention contract to show up in "Needs attention".
- **Environmental Services** is DEVELOPMENT and contributes nothing until it is released. When released it fits like Food & Nutrition.
- **Custom Departments** get the shared cards their configuration supports, and no product cards.

What is missing is a **rule** for how a Department appears. Without one, the Dashboard either hardcodes each Department (as `workspace-composition.ts` does today) or shows empty, misleading tiles. Plant would show "3 not programmed" locations, for example. This contract is that rule: **cards are platform-owned, and Departments contribute capabilities, not screens.**

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
- A facility-created Department (no Product) is eligible for any shared card its capabilities satisfy. No product cards (Menus, meal milestones, Plant).

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
| `locations.runtime` | The Department owns Locations that Runtime Location State resolves | Location Function bindings and spaces for the Department | "No locations are assigned to this Department." |
| `cycles.published` | A published Operational Cycle model applies today | Cycles engine admission plus published model | "No Operating Rhythm is published." |
| `work.expected` | Work Plans are admitted and at least one is published | Work Plans engine admission plus published plans | "No Work Plans are published." |
| `coverage.planned` | Coverage templates, or Operational Assignments, exist | Scheduling / coverage owners | "No coverage plan is set." |
| `people.roster` | The Department has active employees | `Employee` rows | "No employees are in this Department." |
| `records.canonical` | Record engine is CANONICAL for this Department and date | `resolveRecordEngine` plus `CANONICAL_LOGS_ENABLED` | n/a. The engine choice is not a setup step. |
| `records.legacy` | Record engine is LEGACY for this Department and date. Produces no cards, only a setup reason (DSH-D19). | `resolveRecordEngine` | "This Department still uses legacy Records." |
| `maintenance.shared` | Shared Asset and Repair operations are admitted | Asset engine admission | n/a |
| `plant.maintenance` | Plant runtime is enabled and this is the Plant Department | `isPlantRuntimeEnabled` | "Plant is installed but not enabled for operation." |
| `plant.requests.filed` | The Department has an active request route to Plant | `listActiveRoutesForRequestingDepartment` | n/a |
| `menus` | Product ships Menus and the Department has Menu applicability | Product registry `starters.menus` plus Menu applicability | "No Menu is assigned to this Department's locations." |
| `meal.milestones` | Food & Nutrition meal milestones apply | `hasDietaryDomainCapabilities` | n/a |

## Compatibility matrix

Status today with current flag defaults. ✓ means the card works from existing data. ◐ means it works after a DSH-01 adapter. ✗ means not applicable. Blank means not eligible until the named condition is true.

| Card | Food & Nutrition (Dietary) | Facility Plant Operations | Environmental Services | Custom Department |
|---|---|---|---|---|
| Needs attention | ✓ (Runtime Location State) | ◐ needs Plant attention mappers | Hidden (DEVELOPMENT) | ✓ when `locations.runtime` |
| Shift now / Today's timeline | ✓ | ✗ no cycle starter. Shows only if the facility builds a Plant cycle. | Hidden | ✓ when a cycle is published |
| Expected work | ✓ (Work Plans on by default) | ✓ for recurring rounds built as Work Plans | Hidden | ✓ when published |
| Coverage | ✓ | ✓ | Hidden | ✓ when planned |
| Call-offs & call-downs | ◐ needs Department filter | ◐ needs Department filter | Hidden | ◐ needs Department filter |
| Shift handoff / Rounds | ✓ | Only if Plant owns Locations | Hidden | ✓ when `locations.runtime` |
| Records due | ✓ legacy (`/logs`) today; canonical where the rollout applies | ✓ (Plant PM and work-order templates stay on legacy) | Hidden | ✓ when Records are attached |
| Work orders & issues | Only if `DIETARY_ASSET_OPERATIONS_ENABLED` | ✓ | Hidden | ✓ (shared engine admitted) |
| Preventive maintenance due | ✗ | ✓ | ✗ | ✗ |
| Requests to triage | ✗ | ✓ | ✗ | ✗ |
| Our requests to Maintenance (DSH-05) | ✓ when it has a route to Plant | ✗ | Hidden | ✓ when it has a route to Plant |
| Today's menu | ✓ | ✗ | ✗ | ✗ |
| Recent activity | ◐ needs query-level Department filter | ◐ | Hidden | ◐ |
| Department setup | ✓ | ✓ | Hidden | ✓ |

## Assessment by Department

### Healthcare Food & Nutrition (AVAILABLE, installed as Dietary)

**Fit: strongest.** It ships everything the Dashboard's location and timeline cards need:
- a Location Function (`food_service_area`)
- Breakfast / Lunch / Dinner Cycles with Prep, Service and Cleanup Phases and Key Points
- Work presets
- Menus
- meal milestones

Its engines are on by default for cycles and Work Plans.

**Watch-outs.**
- **Records.** The default Record engine is LEGACY (`CANONICAL_LOGS_ENABLED` is off). Records cards read only the forward engine ([DSH-D19](./DECISIONS.md)), so a legacy Department shows the setup reason instead of a count. Canonical applies only where a `RecordEngineRollout` row says so, until LEG-01.
- **Default-off engines.** Job flow, Dietary evidence, Dietary asset operations and Operational Assignments are off by default. Cards depending on them stay hidden until those flags are on. The Dashboard never turns them on. The switches retire in LEG-05 ([LEG-D20](../legacy-retirement/DECISIONS.md#leg-d20--department-capabilities-come-with-the-installed-department--accepted-user-october-20-2026)); after that, eligibility follows the installed Product.

**Work needed.** Department filter for call-offs and recent activity (DSH-01). Otherwise none.

### Facility Plant Operations (AVAILABLE V1, October 7, 2026)

**Fit: good, through its own services.** Plant's operating loop is request → issue → work order, plus preventive maintenance. Each piece has a Department-scoped service with its own authority check:
- `listPlantTriageQueue`
- `listWorkOrders` with `resolveWorkOrderActorAuthority`
- `loadPmRunBoard`
- `listIssuesForDepartment`

**Watch-outs.**
- **Location-centric cards.** Plant has no Location Function and no cycle starter. Location-centric cards (Shift now, Rounds, Handoff) are not eligible unless the facility builds those for Plant. R6 makes sure they are hidden, not shown empty.
- **Needs attention.** Plant work is invisible to Needs attention today, because it only reads Runtime Location State.

**Work needed (DSH-01).** Attention mappers for PM due or overdue, requests awaiting triage, and urgent open work orders. These are pure translations of existing outputs.

**Boundaries.** No Plant features, migrations or release changes (DSH-D16).

### Environmental Services (DEVELOPMENT)

**Fit: same as Food & Nutrition once released.** It defines `resident_care` and `service_support` Location Functions and Morning / Afternoon / Evening Operations, and uses the shared engines.

**Today.** It contributes nothing to customer Dashboards (R7). `EVS_OPERATIONS_ENABLED` is off and the Product is DEVELOPMENT.

**Work needed.** None now. Before EVS can become AVAILABLE, it must publish its Dashboard contribution declaration and pass the release gate below.

### Custom (facility-created) Departments

**Fit: shared cards only.** Shared engines admit any active custom Department without a flag. The Dashboard shows exactly the shared cards its configuration supports:
- coverage
- call-offs
- Work Plans
- cycles (if published)
- Records
- maintenance

Product cards (Menus, Plant, meal milestones) never appear (R8).

**Work needed.** Verify in DSH-01, with a custom-Department fixture, that Runtime Location State resolves Locations for a Department without a Product Location Function. If it does not, `locations.runtime` stays absent and location cards stay hidden. That is the correct, calm outcome.

### Worked example: Terrace View (ECMC) with vendor-run Food & Nutrition (Metz Culinary)

| Department | Operator | How it appears |
|---|---|---|
| Food & Nutrition | Metz Culinary (vendor-run) | Full Food & Nutrition card set for the Metz GM, who signs in with a Metz vendor account, leads it and sees only this Department. The ECMC Facility Administrator sees Summary cards marked "Vendor-run · Metz Culinary": counts and status, no links or people. |
| Facility Plant Operations | ECMC (self-operated) | Plant cards (requests, work orders, PM). The Plant head has Manage access. The Facility Administrator has View, or Manage if they name themselves head. Food & Nutrition's requests to Plant appear on the Food & Nutrition Dashboard as "Our requests to Maintenance" (DSH-05). The work orders are Plant's records. |
| Environmental Services | ECMC | The EVS Product is still DEVELOPMENT, so EVS product cards do not appear (R7). If Terrace View runs EVS as a facility-created Department, it gets shared cards (coverage, Work Plans, Records, cycles if published), like any custom Department (R8). Releasing the EVS Product is a separate decision; this program does not change it. |

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
| Plant attention mappers (PM, triage, urgent work orders) | Plant work must appear in Needs attention | DSH-01 |
| Records attention mapper with engine branch | Legacy vs canonical Records | DSH-01 |
| Capability resolver | One source of truth for eligibility | DSH-01 |
| Custom-Department Runtime Location State verification | Confirm `locations.runtime` derivation | DSH-01 |
| People alerts aggregate | No HR alert summary exists | DSH-05 |
| Day-level cache for `loadOperationalReviewDay` | Too heavy for a per-request card | DSH-05 |

## Dashboard contribution declarations

Each Department Product keeps one declaration here. Declarations list what the Product makes possible, not UI. The card catalog decides presentation.

### Healthcare Food & Nutrition — declared October 20, 2026

| Item | Declaration |
|---|---|
| Capabilities it can produce | `locations.runtime`, `cycles.published`, `work.expected`, `coverage.planned`, `people.roster`, `records.legacy` / `records.canonical`, `menus`, `meal.milestones`; `maintenance.shared` only with its asset flag |
| Attention sources | Runtime Location State interventions (missed Key Points, coverage gaps, Records due), Menu applicability gaps, call-offs |
| Primary drill-down homes | `/units`, `/staffing/cycles`, `/staffing/work-plans`, `/staffing`, `/menus`, `/logs` or `/staffing/log-book` |
| "Not configured" states | No locations, no published Operating Rhythm, no Work Plans, no coverage plan, no Menu assignment |
| Tests | Eligibility with each flag default; count parity with Locations; Menu card hidden for non-Food & Nutrition Departments |

### Facility Plant Operations — declared October 20, 2026

| Item | Declaration |
|---|---|
| Capabilities it can produce | `plant.maintenance`, `maintenance.shared`, `work.expected` (recurring rounds), `coverage.planned`, `people.roster`, `records.legacy`; not `cycles.published` or `locations.runtime` by default |
| Attention sources | Requests awaiting triage, PM due or overdue, urgent open work orders and asset exceptions |
| Cross-Department contribution | Other Departments with a request route get `plant.requests.filed` (Our requests to Maintenance, DSH-05) |
| Primary drill-down homes | `/repairs` (including triage), `/preventive-maintenance`, `/issues`, `/assets` |
| "Not configured" states | Plant installed but runtime not enabled; no PM plans published |
| Tests | Plant attention mappers; location cards not eligible without locations; work-order authority respected for Supervisor sessions |

### Environmental Services — draft, required before AVAILABLE

| Item | Declaration (draft) |
|---|---|
| Capabilities it can produce | `locations.runtime`, `cycles.published`, `work.expected`, `coverage.planned`, `people.roster`, Records |
| Attention sources | Runtime Location State interventions for `resident_care` and `service_support` locations |
| Release requirement | Complete this declaration and pass the release gate in the EVS release certification |

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
