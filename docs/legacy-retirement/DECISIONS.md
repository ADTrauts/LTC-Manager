# Legacy Retirement — decisions

The decision record for retiring every legacy surface before the first real customer. Facts come from the [audit](./CURRENT_STATE_AUDIT_2026-10-20.md). Status words:
- **accepted (user):** the product owner decided it.
- **accepted (program default):** the program set it. The product owner can change it before the phase that needs it.
- **open:** must be answered before the phase named.

## LEG-D01 — A separate program for legacy retirement — accepted (user) October 20, 2026

**User wording:** "okay so log retirement needs a seperate decision record." Asked how wide, the product owner chose: "Write it now, covering every legacy surface: legacy /logs, the old template engine and the rest of the Legacy Surface Register."

**Recorded as:**
- This program uses `LEG-` identifiers. It is separate from the [Dashboard program](../dashboard/README.md) (`DSH-`), the [Contracted Department Authority program](../contracted-departments/README.md) (`CDA-`) and the [onboarding program](../onboarding/README.md) (`ONB-`).
- It covers every surface in the [audit](./CURRENT_STATE_AUDIT_2026-10-20.md): legacy logs, legacy inspections, the template engine, legacy meal timing, the legacy schedule grid, projection fallbacks, the `/issues` facade, dormant systems and the remaining leftovers.
- Today's Work and Business Workspace stay with the Dashboard program (DSH-04). This program tracks them as a dependency and does not plan them again.

## LEG-D02 — The goal: nothing legacy at the first real customer — accepted (user) October 20, 2026

**User wording ([CDA-D17](../contracted-departments/DECISIONS.md#cda-d17--nothing-legacy-at-the-first-real-customer--accepted-user-october-20-2026)):** "no one should be on legacy logs. Currently we have no real customers using vssyl. any account is just a test account by me. When we are ready to actually take a real customer, no one should be using anything legacy."

**Recorded as:**
- No real customer is onboarded until LEG-07 passes, unless the product owner makes an explicit, written exception.
- "Not using anything legacy" means:
  - no route renders a legacy surface
  - no action writes a legacy store
  - no feature flag can switch a facility back to a legacy path
  - no seed or provisioning step creates legacy rows
- CDA-07 production enablement requires LEG-07 (CDA-D17).

## LEG-D03 — Test data only, so no customer migration — accepted (user) October 20, 2026

**Basis:** "any account is just a test account by me" (LEG-D02).

**Product owner, later the same day:** "Any and all existing facilities need to be on the new data. nothing legacy."

**Recorded as:**
- Every existing facility ends up on forward data. None is left on a legacy path.
- No legacy history is carried into the forward engines. Each facility is kept, and its Records are set up again on the forward engine (LEG-Q03).
- No compatibility period is kept for customers' bookmarks or deep links. Old routes are removed, not redirected forever.
- The [register](../product/LEGACY_SURFACE_REGISTER.md) rule "no legacy data is migrated merely to simplify navigation" is kept: nothing is migrated.

## LEG-D04 — Retire behavior first, drop tables only with separate approval — accepted (program default) October 20, 2026

The register also says "No historical records are deleted." Dropping a legacy table deletes its rows, even test rows. This program does not override that rule silently.

**Decision.**
1. **LEG-01 to LEG-05 retire behavior.** Routes, actions, loaders, flags, seeds and tests go away. Tables stay, unread and unwritten.
2. **LEG-06 drops tables, in a separate phase that needs its own explicit approval:**
   - Before any drop, a row count per table is shown to the product owner, confirming test data only.
   - Every drop is a new, forward-only migration. No applied migration is edited.
   - `prisma migrate reset` and other database resets are never used.
3. **Amending the register.** At LEG-06 the register's "no historical records are deleted" rule is amended for pre-customer test data, recorded with the product owner's approval.

**Open:** whether to drop at all (LEG-Q02).

## LEG-D05 — One Records engine — accepted (user) October 20, 2026

**Basis:** "no one should be on legacy logs" (LEG-D02). The forward engine is Catalog definition → facility install → Attachment → derived requirement → `OperationalEvidenceRecord` (`AGENTS.md`).

**Decision.**
- `CANONICAL_LOGS_ENABLED` becomes always on, then is removed.
- The per-Department Records engine switch (`RecordEngineRollout`, `scheduleRecordEngineAction`, the Department panel) is removed. Every Department is on the forward engine. This settles [CDA-Q06](../contracted-departments/DECISIONS.md#cda-q06--records-engine-switch--answered-user-october-20-2026): the switch is not a Department rule because it no longer exists.
- Until removal (LEG-01), new Departments start on the forward engine instead of resolving LEGACY when they have no rollout row.
- Legacy logs (`/logs`), legacy inspections (`/admin/inspections`) and the legacy report (`/reports?view=legacy`) retire.
- `loadFacilityMenuData` retires with `/logs`. Menus stay read through `resolveApplicableMenus`.
- The [Dashboard](../dashboard/DECISIONS.md#dsh-d19--the-dashboard-reads-only-the-forward-records-engine--accepted-program-default-october-20-2026) reads only the forward engine (DSH-D19).

## LEG-D06 — The template engine retires, including for Plant — accepted (user) October 20, 2026; Plant scope approved (user) the same afternoon

**Basis:** the product owner chose to include "the old template engine". The register classes `OperationalTemplate` as compatibility, not the Catalog.

**Decision.**
- `/staffing/templates`, template-backed submits, the template runtime and template offline sync retire.
- **Plant moves to the forward engine.**
  - Preventive-maintenance plans and work orders keep requiring Records.
  - Their requirement rows stop pinning an `OperationalTemplate` and pin a forward Catalog definition instead.
  - The Plant starter installs Catalog definitions instead of drafting templates.
- **This is a Plant change.** `AGENTS.md` requires explicit scope for new Plant features or migrations.
  - **Approved (user), October 20 afternoon,** for this change only: moving Plant's preventive-maintenance and work-order Records onto the forward engine (LEG-D17, LEG-D18).
  - It adds no Plant features. Building still waits for LEG-01 exit and LEG-02 authorization.
- Facility Plant Operations stays AVAILABLE. Release status, sellability and billing packaging do not change.
- **No parallel model.**
  - The existing Plant requirement models are re-pointed, not duplicated.
  - Records are still `OperationalEvidenceRecord`.
  - The Record's template-named snapshot columns and enums stay (audit §1).

**How a plan or work order names its forward form:** answered in LEG-D18 (LEG-Q01).

## LEG-D07 — Food & Nutrition meal timing uses Key Points only — accepted (program default) October 20, 2026

**Decision.**
- The legacy servery stores (`ServeryMealServiceEvent`, `ServeryMilestoneEntry`) and `UnitMealTime` retire.
- Meal timing writes only Operational Cycle Key Points.
- Every Food & Nutrition Cycle model expecting READY / SERVICE_STARTED milestones is moved to Key Points. The router (`route-meal-timing.ts`) stops returning the legacy branch.
- Seeds stop creating `UnitMealTime`.
- The meal-time guess (`meal-daypart.ts`, used by `servery-meal-service.ts`) is removed. "What's happening now" is only the published Cycle and Phase (foundation round, user, October 20).

## LEG-D08 — Locations match by Location Function, not physical type — accepted (program default) October 20, 2026

**Decision.**
- Cycle applicability by `UNIT_TYPES` / `ROOM_TYPE` retires. Cycles apply by explicit Department locations and Location Functions, as Records and Menus already do.
- Template applicability by `SPACE_TYPE` / `ASSET_TYPE` retires with the template engine (LEG-D06).

## LEG-D09 — One schedule authoring path — accepted (program default) October 20, 2026

**Decision.**
- The legacy unit schedule grid (`/staffing/legacy`) and its writers retire.
- Canonical shifts are the only way to write `ScheduleEntry`. The table stays: canonical shifts use it.
- Call-offs mark the canonical shift. Moves change the day's Operational Assignment. `AssignmentOverride` retires (LEG-Q04, answered by the user in the foundation round).
- The toolbar and Today's Work links to `/staffing/legacy` go away.

## LEG-D10 — Projection fallbacks are removed — accepted (program default) October 20, 2026

**Decision.**
- `PROJECTION_LOCATIONS_ENABLED` and `PROJECTION_SIDEBAR_ENABLED` are removed. The projection path is the only path.
- `PROJECTION_TODAYS_WORK_ENABLED`, `PROJECTION_BUSINESS_WORKSPACE_ENABLED` and `TODAYS_WORK_ENABLED` go with their surfaces at DSH-04.

## LEG-D11 — Maintenance leftovers — accepted (program default) October 20, 2026

**Decision.**
- **The `/issues` facade:**
  - Work-order actions move from `issues/actions.ts` into the Repairs route.
  - The `/issues` routes are removed, and links, nav prefixes and AI snapshots point at `/repairs`.
  - `Repair.issueType` and `AssetIssue.workOrderId` stop being written. They are dropped at LEG-06.
- **`PreventiveMaintenanceSchedule` and `Repair.preventiveScheduleId`:** nothing reads them in the product. Dropped at LEG-06.
- **`AssetStatus.ACTIVE`:** existing rows are rewritten to OPERATIONAL by a forward data migration. The enum value is removed at LEG-06.
- **`Facility.managementCompanyName`:**
  - Provisioning and onboarding stop writing it.
  - Maintainer names come from `FacilityOrganization`, linked to the operator ([CDA-D18](../contracted-departments/DECISIONS.md#cda-d18--assets-are-facility-property-shared-with-plant--accepted-user-october-20-2026)).
  - Changing what onboarding writes needs ONB scope. Onboarding must not change release status or packaging.

## LEG-D12 — Dormant systems are removed, not kept dormant — accepted (program default) October 20, 2026

The register says "keep dormant" for Task Sync and the Operation Engine (row 10). This decision replaces that.

**Decision.**
- **Task Sync:** `TASK_SYNC_ENABLED`, its adapters and its writer calls are removed.
- **The `Task` model:**
  - Only the Task Sync adapters and legacy inspection work write it.
  - Its readers are removed or moved to Work: the unit page task action, the work-order detail page and the AI snapshot.
  - The table drops at LEG-06.
- **Operation Engine:** remaining `operationInstanceId` reads and writes are removed, including assignment forms, the board, inspection work, servery milestones and the AI caches. The tables drop at LEG-06.
- **`ConsoleTicket`:** dropped at LEG-06. `SupportTicket` stays.
- **Old profile and Experience editor** (added October 20, foundation review):
  - `DEPARTMENT_OPERATIONAL_PROFILES_ENABLED` and the actions it guards are removed: baseline drafts, separate certify / activate / retire, Experience areas and room exceptions.
  - They belong to the retired Experience catalog ([RETIRED](../platform-vision/RETIRED.md)).
  - Location Function binding and publishing do not use them, and stay.
  - Tables that only this editor uses are listed for LEG-06 after an inventory.

## LEG-D13 — Platform leftovers — accepted (program default) October 20, 2026

**Decision.**
- **Route mirror:** `AppRoute` / `RoleRoutePermission` and `prisma/legacy-route-mirror.json` are removed. Code route authority stays the only authority.
- **Old concept map:** `src/lib/experiences/compatibility.ts` is removed once nothing imports it.
- **Legacy hierarchy:** the `LEGACY_LOCATION` hierarchy role (`UnitHierarchyRole`) and its display mapping are removed after a forward data migration reassigns any rows.
- **Quick actions:** links to `/dashboard`, `/issues` and `/admin/inspections` are removed with Business Workspace (DSH-04). The ones that remain are re-pointed.
- **Redirect-only routes:** `/settings`, `/build/knowledge` and `/operations` are removed (LEG-D03: no customer bookmarks to keep). `/dashboard` is the Dashboard's (DSH-02).
- **Legacy work-order statuses:** `RepairStatus.CLOSED`, `WAITING_PARTS` and `Repair.resolution` are mapped onto the current statuses and `workPerformed` by a forward data migration. The values are removed at LEG-06.

## LEG-D14 — Seeds and provisioning create forward data only — accepted (program default) October 20, 2026

**Decision.**
- `prisma/seed.mjs`, `prisma/apply-log-template-presets.mjs` and the scripts that apply those presets stop creating legacy log templates, assignments and `UnitMealTime`.
- The nine presets are matched to Catalog definitions. A preset with no match becomes a Catalog definition, or is dropped.
- `scripts/backfill-log-template-presets.mjs` is removed.
- Fresh databases have only forward data from LEG-01 on. That keeps new test facilities from adding legacy rows during the program.

## LEG-D15 — What is not legacy — accepted (program default) October 20, 2026

These stay. See audit §7.
- `FacilityOrganization`
- the `ScheduleEntry` table
- the `Repair` / `AssetIssue` persistence names
- `DepartmentRoomArchetype` persistence
- Review-named internal modules
- partner access
- the forward Record's template-named columns and enums

Renaming them is optional cleanup and is not required for LEG-07.

## LEG-D16 — Guardrails — accepted October 20, 2026

- No applied migration is edited. Schema fixes are new, forward-only migrations.
- No `prisma migrate reset` and no database reset or drop, unless the product owner explicitly opts in to losing data.
- Any table drop or row deletion needs the product owner's explicit approval at that step (LEG-D04).
- Plant changes need explicit Plant scope (LEG-D06). Onboarding changes need ONB scope (LEG-D11).
- No Product release status, sellability or billing packaging changes as a side effect.
- No new parallel template, requirement or evidence model.
- Before writing code, read the relevant guide in `node_modules/next/dist/docs/`.
- The register is amended in the same change that retires a surface. The Product Constitution and language guide are amended only where they name a retired surface.

## LEG-D17 — Vssyl publishes standard Plant and EVS forms — accepted (user) October 20, 2026

**Situation.** The forward Catalog has only Food & Nutrition forms ([audit §1](./CURRENT_STATE_AUDIT_2026-10-20.md#legacy-logs-logs)). Catalog forms are written only by Vssyl staff in the VSSYL Console (`/console/catalog`).

**Decision.** Vssyl publishes standard Catalog forms that any facility can install:
- **Plant:**
  - equipment condition inspection
  - mechanical room inspection
  - generator inspection
  - generator weekly run log
  - basic equipment reading
  - post-work-order verification
- **EVS:** restroom sanitation round
- **Food & Nutrition:** dry storage ambient, the one legacy preset with no Catalog match (program default)

They are published before LEG-02 build, through the existing Console catalog. No new model is added.

**Facility-made forms:** facilities and vendors can still add their own (LEG-D19).

## LEG-D18 — How Plant requires Records on the forward engine — accepted (user) October 20, 2026

**Decision.**
1. **Preventive-maintenance plans.**
   - A plan names the Catalog forms it requires, for example the generator inspection.
   - Each work order the plan creates requires each form for that asset.
2. **Close-out rule kept from today.**
   - A work order cannot be completed while a required form is unfilled.
   - A supervisor can waive one with a written reason.
   - A supervisor can still add or remove required forms on an open work order.
3. **Checks with no repair work** (a daily mechanical room walk-through, a boiler gauge reading):
   - They are scheduled Records attached to the room or asset, shown in Records due.
   - They create no work order.
4. **Vendor-maintained assets.** When Metz maintains the dish machine and runs its work order:
   - The work order requires forms of the Department running it.
   - The Records belong to Metz's operator period ([CDA-D10](../contracted-departments/DECISIONS.md#cda-d10--data-belongs-to-the-operator-who-produced-it--accepted-user-october-20-2026)).
   - The Facility Administrator can still read compliance Records ([CDA-Q01](../contracted-departments/DECISIONS.md#cda-q01--a-survey-during-a-vendor-contract--answered-user-october-20-2026)).

**How it is built (no parallel model).**
- `PreventiveMaintenancePlanRecordRequirement` and `RepairRecordRequirement` stop pinning an `OperationalTemplate`. They pin a published Catalog form version installed for the facility.
- A requirement is satisfied by an `OperationalEvidenceRecord` of that form for that asset.
- Rounds use ordinary Attachments on the room (`SPACE`) or asset (`ASSET`).
- The migrations are additive in LEG-02. The old template columns drop at LEG-06.

**Ordering constraint.** Plant Departments stay on the current Records engine until LEG-02 lands.
- Once a Department is on the forward engine, template-backed Record submission is blocked (`submit-evidence.ts`).
- Moving Plant early would leave its work orders unable to close without a waiver.

## LEG-D19 — Departments and vendors can make their own forms — accepted (user) October 20, 2026

**Situation.** Both old engines let a facility build its own forms. The forward Catalog has only Vssyl-authored forms, written in the VSSYL Console. Retiring the old engines would remove facility-made forms.

**Decision.**
- **Who builds.** A Department head can build forms for their Department, as can the managers the head allows ([CDA-D03](../contracted-departments/DECISIONS.md#cda-d03--every-department-is-run-by-its-head--accepted-user-october-20-2026)).
- **Where.** The same Catalog as Vssyl's standard forms, with the same fields, sections, scoring and versioning. Facilities use them through ordinary installs and Attachments.
- **Who owns them.**
  - A form built in a self-operated Department belongs to the facility and stays with it.
  - A form built in a vendor-run Department belongs to the vendor. At Terrace View, a form the Metz GM builds is Metz's: usable at every facility Metz runs, and invisible to everyone else.
  - Vssyl's standard forms stay available to everyone.
- **Contract end.**
  - A vendor's forms leave with the vendor.
  - Records already filled out keep their own copy of the form, so the facility's copy of compliance Records stays readable ([CDA-D10](../contracted-departments/DECISIONS.md#cda-d10--data-belongs-to-the-operator-who-produced-it--accepted-user-october-20-2026)).

**How it is built (no parallel model).**
- `CatalogLogDefinition` gains an owner (Vssyl, a facility, or an organization) in one forward-only, additive migration, approved at its phase.
- Authoring reuses the Console's catalog service (`createCatalogDefinition`) behind Department authority.
- Owned forms appear only to their owner.

**When.**
- Facility-owned forms ship in LEG-02, before the old engines are removed (LEG-03).
- Vendor-owned forms ship with vendor operation (CDA-05), which brings vendor organizations and accounts.
- Both are required by LEG-07.

## LEG-D20 — Department capabilities come with the installed Department — accepted (user) October 20, 2026

**Situation.**
- Food & Nutrition and EVS capabilities are turned on by deployment-wide switches, not by install or license (`src/lib/department-operations.ts`).
- Defaults:
  - off: `DIETARY_JOB_FLOW_ENABLED`, `DIETARY_OPERATIONAL_EVIDENCE_ENABLED`, `DIETARY_ASSET_OPERATIONS_ENABLED`, `EVS_OPERATIONS_ENABLED`
  - on: `DIETARY_OPERATIONAL_CYCLES_ENABLED`, `DIETARY_WORK_PLANS_ENABLED`
- Plant's runtime check already follows install and license (`isPlantRuntimeEnabled`). `PLANT_OPERATIONS_ENABLED` is a development override there. Some synchronous checks still read it directly, such as Cycle authority (`cycle-authority.ts`).

**Decision** ([Foundation amendment](../product/01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026)).
- An installed Department gets everything its Product includes. When billing enforcement is on, its license must also be valid.
- The switches above are removed. Every capability check uses Plant's rule: installed, and either customer-operable or an internal facility.
- Each capability behind a switch either becomes part of its Product, on for every installed Department, or is retired by the foundation round. No switch survives.
- **Assignments are part of every Department** (foundation round, user). `OPERATIONAL_ASSIGNMENTS_ENABLED` is removed. Work no longer depends on it: without an Assignment, a person sees the Work for the place they are signed into.
- **Job Flow is the "my work" view in every Department** (foundation round, user). `DIETARY_JOB_FLOW_ENABLED` is removed.
- DEVELOPMENT Products stay hidden from customers by release status.
- Custom Departments are unchanged: they get the shared engines.

**Boundaries.**
- No change to price, release status, sellability or entitlements.
- The Dashboard reads capabilities through the same checks, so its cards follow without a Dashboard change (DSH-D16 still holds: the Dashboard turns nothing on).
- Plant's remaining switch reads move to the rule Plant already uses. This decision covers that change.

**When.** LEG-05, after the foundation round.

## Confirmation items

| ID | Question | Program default | Needed before |
|---|---|---|---|
| LEG-Q01 | How does a preventive-maintenance plan or work order name the forward Record it requires? | **Answered (user), LEG-D18:** the plan names Catalog forms. Each work order it creates requires them for that asset, with today's close-out and waiver rule. Checks with no repair work are scheduled Records on the room or asset. | — |
| LEG-Q02 | After behavior is retired, drop the legacy tables? | **Answered (user) October 20, evening: yes**, in LEG-06. Row counts must first confirm test data only, and the drops still need explicit approval at that step. | — |
| LEG-Q03 | How does each existing facility get onto forward data? | **Answered (user):** every existing facility, nothing legacy. Each facility is kept: rooms, people and assets stay. Its Records are set up again on the forward engine. Old legacy entries are not copied. | — |
| LEG-Q04 | How do call-offs and moves work without the legacy grid? | **Answered (user), foundation round:** call-offs mark the shift. Moves change the day's Assignment. `AssignmentOverride` retires and is dropped at LEG-06. | — |
| LEG-Q05 | Turn the forward engine on in shared test environments at LEG-01, before the legacy code is removed? | **Answered (user): yes.** Every existing facility moves to forward data. Plant Departments move at LEG-02 (LEG-D18 ordering constraint). | — |
| LEG-Q06 | After the old engines retire, can a facility or a vendor make its own forms? | **Answered (user), LEG-D19:** yes. Department heads build forms in the same Catalog. Facility-made forms stay with the facility; a vendor's forms belong to the vendor. | — |

## Revision history

| Date | Change |
|---|---|
| October 20, 2026 | Record written from the two inventories and the product owner's "every legacy surface" choice. |
| October 20, 2026, afternoon | The product owner accepted the record and answered LEG-Q05. Audit: the forward Catalog has no Plant or EVS forms. |
| October 20, 2026, Plant round | Plant scope approved (LEG-D06). Standard Plant and EVS forms (LEG-D17). How Plant requires Records (LEG-D18, answering LEG-Q01). Existing facilities kept and their Records set up again (LEG-Q03). Department- and vendor-made forms in the same Catalog (LEG-D19, answering LEG-Q06). |
| October 20, 2026, foundation review | Department capability switches retire (LEG-D20, user, from the [Foundation amendment](../product/01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026)). The old profile and Experience editor added to LEG-D12 (program default). |
| October 20, 2026, foundation round | LEG-Q04 answered (user): call-offs mark the shift, moves change the Assignment. Assignments are part of every Department, so `OPERATIONAL_ASSIGNMENTS_ENABLED` goes in LEG-D20. The meal-time guess goes with LEG-D07. Job Flow is the "my work" view in every Department, so its switch goes in LEG-D20. |
| October 20, 2026, evening | LEG-Q02 answered (user): yes, drop the legacy tables in LEG-06, after row counts and explicit approval at that step. Every LEG confirmation item is now answered. |
