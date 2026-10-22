# Legacy Retirement — phased plan

Phases `LEG-00` through `LEG-07`. Each phase needs explicit authorization in the [phase tracker](./PHASE_TRACKER.md) before it starts. Stop at every phase boundary.

Guardrails for every phase ([LEG-D16](./DECISIONS.md#leg-d16--guardrails--accepted-october-20-2026)):
- Schema changes are new, forward-only migrations, each approved explicitly. Applied migrations are never edited. No `prisma migrate reset` and no database reset.
- No table drop or row deletion before LEG-06, and none without explicit approval at that step.
- Plant changes need explicit Plant scope. Onboarding changes need ONB scope.
- No change to release status, sellability, entitlements or billing.
- No parallel template, requirement or evidence model.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- Each phase amends the [Legacy Surface Register](../product/LEGACY_SURFACE_REGISTER.md) rows for the surfaces it retires.
- Preserve unrelated uncommitted work.

## Order with the other programs

| This program | Other program | Why |
|---|---|---|
| LEG-01 forward by default | with or before DSH-01 | Dashboard Records cards read only the forward engine (DSH-D19) |
| LEG-03 Records cutover | before CDA-04, preferred | Fewer write actions to classify; legacy writes disappear instead of being marked class Legacy |
| LEG-05 platform leftovers | after DSH-04 | Today's Work and Business Workspace are removed by DSH-04. Their quick actions and projection flags go with them. |
| LEG-05 `managementCompanyName` | with CDA-05 | Maintainers come from `FacilityOrganization` linked to the operator (CDA-D18) |
| LEG-05 capability switches | — | Decided in the foundation round: Assignments and Job Flow are part of every Department (LEG-D20). |
| LEG-07 gate | before CDA-07 and before the first real customer | CDA-D17, LEG-D02 |

---

## LEG-00 — Decision record (docs only)

**Deliverables.**
- This record.
- Pointers in `AGENTS.md`, the root `README.md`, `docs/product/README.md`, `memory-bank/README.md` and the Legacy Surface Register.
- Cross-links from CDA-D17 and DSH-D19.

**Exit gate.**
- The product owner accepts the record. Done October 20.
- LEG-Q03 and LEG-Q05 are confirmed. Done October 20.
- LEG-01 is authorized.

---

## LEG-01 — Forward by default (no legacy growth)

**Deliverables.**
1. **Departments start on the forward Records engine.** A missing `RecordEngineRollout` row resolves CANONICAL when the flag is on.
   - **Exception: Plant Departments** stay on the current engine until LEG-02 lands.
   - Template-backed Record submission is blocked for forward-engine Departments, so moving Plant early would stall its work-order close-out (LEG-D18).
2. **Forward data only from seeds and provisioning:** seeds, `apply-log-template-presets.mjs`, `provision-facility.mjs` and `bootstrap-pilot-facility-admin.mjs` (LEG-D14).
   - The nine presets are matched to Catalog definitions.
   - `backfill-log-template-presets.mjs` is removed.
   - Seeds stop creating `UnitMealTime`.
3. **`CANONICAL_LOGS_ENABLED=true` in shared test environments (LEG-Q05).** `.env.example` documents it on.
4. **A legacy inventory test.** A hermetic test lists every known legacy entry point (routes, actions, models read, flags). It fails when a new reference to a legacy store appears outside the list. The list shrinks each phase and is empty at LEG-07.
5. **Register drift fixed:** `loadDashboardQueries`, `OPERATION_ENGINE_ENABLED`, `/dashboard`.
6. **Existing facilities moved to forward data (LEG-Q03).**
   - Every facility is kept: rooms, people and assets stay.
   - Food & Nutrition Records are set up again from the Catalog. Old legacy entries are not copied.
   - EVS and Plant follow in LEG-02, once their standard forms exist.

**Tests.** The inventory test; seed tests asserting no legacy rows; Records engine resolution tests.

**Exit gate.**
- A fresh database has no legacy log, inspection, template or meal-time rows.
- The full suite passes.

**Schema.** None.

---

## LEG-02 — Records parity

**Plant scope approved (user) October 20, 2026 (LEG-D06).** LEG-Q01 answered (LEG-D18). Still needs LEG-02 authorization.

**Deliverables.**
1. **Standard forms published (LEG-D17).**
   - The six Plant forms, the EVS restroom round and dry storage ambient are published in the Console Catalog.
   - EVS Departments then move to the forward engine and set up their Records.
2. **Plant on the forward engine (LEG-D18).**
   - Preventive-maintenance plans name Catalog forms. Each work order they create requires those forms for that asset.
   - Close-out (`work-order-closeout-gate.ts`) checks forward Records and keeps the supervisor waiver.
   - Checks with no repair work become scheduled Records on the room or asset.
   - Vendor-run work orders require the running Department's forms.
   - The Plant starter installs Catalog forms instead of drafting templates.
   - Cutover readiness drops `pmUsesOperationalTemplate`.
   - Plant Departments move to the forward engine last, and their Records are set up again.
3. **Department-made forms (LEG-D19).**
   - Department heads, and the managers they allow, build forms in the same Catalog. The forms belong to the facility.
   - `CatalogLogDefinition` gains an owner in one additive migration, approved at this phase.
   - Vendor-owned forms follow with CDA-05.
4. **Inspections.**
   - Each legacy inspection pattern is covered by a Catalog `INSPECTION` definition, including scoring and follow-up.
   - Knowledge links point at Catalog definitions.
5. **Food & Nutrition meal timing.**
   - Every Cycle model expecting legacy milestones is moved to Key Points.
   - The router stops returning the legacy branch (LEG-D07).
6. **Menus.** The per-meal temperature hints that `/logs` builds from menus get a forward home in Records capture, or are dropped by product-owner decision.
7. **Location matching.** Cycle applicability by physical type is replaced by explicit Department locations and Location Functions (LEG-D08).

**Tests.**
- A Plant preventive-maintenance and work-order close-out flow on the forward engine.
- A Department-made form: built, installed, attached, filled out, and invisible to other facilities.
- An inspection scoring test.
- Meal-timing router tests with no legacy branch.
- Cycle applicability tests.

**Exit gate.** Every Department Product runs its Records, inspections and meal timing on forward paths with the legacy code still present but unused.

**Schema.** Forward-only, additive migrations, each approved at this phase:
- re-pointing the Plant requirement models at Catalog forms (LEG-D18)
- an owner on `CatalogLogDefinition` (LEG-D19)

Old template columns stay until LEG-06.

---

## LEG-03 — Records cutover

**Needs facility-made forms live (LEG-D19, from LEG-02).** Removing the old engines removes the only way facilities make their own forms today.

**Deliverables.**
1. **`CANONICAL_LOGS_ENABLED` removed.** Forward behavior is unconditional. The fences that only existed to block legacy writes go with it.
2. **The Records engine switch removed:** `scheduleRecordEngineAction`, the Department panel and `RecordEngineRollout` reads.
3. **Routes and writers removed:**
   - `/logs` and its actions
   - `/admin/inspections` and its actions
   - `/staffing/templates` and its actions
   - `/reports?view=legacy`
   - template-backed submit and offline template sync
   - the compatibility runtime
4. **`loadFacilityMenuData` removed.**
5. **Task adapters that read legacy stores removed:** `log-task.ts` and the legacy inspection task code. The units page loader no longer reads legacy templates.
6. **Navigation, proxy and shell branches for the old Records surfaces removed.**

**Tests.**
- Legacy tests are deleted with their code.
- Forward tests cover what they covered (the audit counts about 25 for legacy logs and 24 for templates).
- The inventory test shrinks.

**Exit gate.**
- No route or action reads or writes a legacy Records store.
- `rg` for the legacy model names in `src/` finds only the generated Prisma client types and the LEG-06 list.

**Schema.** None. Tables stay until LEG-06.

---

## LEG-04 — People & Coverage

**LEG-Q04 answered (user), foundation round:** a call-off marks the shift, and a move changes the day's Assignment.

**Deliverables.**
1. `/staffing/legacy` removed, along with `createScheduleEntryAction` and `deleteScheduleEntryAction`.
2. Call-offs mark the canonical shift. Moves change the day's Operational Assignment. Readers of `AssignmentOverride` move to the new source: call-offs, the assignment board and review facts.
3. Links into the old grid removed: the schedule toolbar, and Today's Work coverage if DSH-04 has not removed it yet.

**Tests.** Canonical call-off and move flows; Dashboard coverage facts; review facts.

**Exit gate.** No action writes `ScheduleEntry` outside canonical shifts. Nothing writes `AssignmentOverride`.

**Schema.** Forward-only and additive, if a call-off needs a field on the canonical shift.

---

## LEG-05 — Platform leftovers

**Requires DSH-04 exit** for the items that touch home surfaces.

**Deliverables.**
1. `PROJECTION_LOCATIONS_ENABLED` and `PROJECTION_SIDEBAR_ENABLED` removed, with their legacy branches (LEG-D10).
2. **The `/issues` facade:**
   - Work-order actions moved into the Repairs route.
   - `/issues` routes removed; links, nav prefixes and AI snapshots re-pointed.
   - `Repair.issueType` and `AssetIssue.workOrderId` no longer written.
3. **Asset leftovers:**
   - `AssetStatus.ACTIVE` rows rewritten to OPERATIONAL by a forward data migration.
   - `managementCompanyName` no longer written (with ONB scope). Maintainer names come from `FacilityOrganization` (with CDA-05).
4. **Dormant systems (LEG-D12):**
   - Task Sync removed.
   - `Task` readers moved off: the unit page task action, the work-order detail page and the AI snapshot.
   - The AI snapshot's placeholder "Current operation" replaced by the published Cycle and Phase, or no window (foundation round).
   - `operationInstanceId` reads and writes removed.
   - `ConsoleTicket` code removed, if any remains.
   - The old profile and Experience editor and `DEPARTMENT_OPERATIONAL_PROFILES_ENABLED` removed. Location Function binding stays.
5. **Platform (LEG-D13):**
   - Route mirror, old concept map and legacy hierarchy role removed.
   - Redirect-only routes removed.
   - Legacy work-order statuses mapped by a forward data migration.
   - Remaining quick actions re-pointed.
6. **Department capability switches (LEG-D20).** Job Flow becomes the "my work" view in every Department.
   - `DIETARY_JOB_FLOW_ENABLED`, `DIETARY_OPERATIONAL_EVIDENCE_ENABLED`, `DIETARY_ASSET_OPERATIONS_ENABLED`, `DIETARY_OPERATIONAL_CYCLES_ENABLED`, `DIETARY_WORK_PLANS_ENABLED`, `EVS_OPERATIONS_ENABLED` and `PLANT_OPERATIONS_ENABLED` removed.
   - Every capability check uses Plant's install rule.
   - `OPERATIONAL_ASSIGNMENTS_ENABLED` removed. Assignments are part of every Department. A person's Work list no longer needs an Assignment: without one, it shows the place they are signed into.

**Tests.**
- Repairs actions after the move; status normalization; sidebar and Locations without fallbacks.
- Capability resolution:
  - installed and operable: on
  - not installed: off
  - DEVELOPMENT: internal facilities only
  - custom Department: shared engines on

**Exit gate.**
- The legacy inventory test lists only tables waiting for LEG-06.
- No feature flag can switch a facility to a legacy path.
- No deployment switch turns a Department capability on or off.

**Schema.** Forward data migrations only (status values, hierarchy roles). No drops.

---

## LEG-06 — Schema cleanup (separate approval)

**LEG-Q02 answered (user): yes. Still needs explicit approval at this step (LEG-D04).**

**Deliverables.**
1. A row count per legacy table, shown to the product owner, confirming test data only.
2. Forward-only migrations that drop:
   - **Legacy logs:** `LogTemplate`, `LogTemplateField`, `LogAssignment`, `LogSubmission`, `LogSubmissionValue`, `KnowledgeArticleLogTemplate`.
   - **Legacy inspections:** `InspectionDefinition`, `InspectionDefinitionItem`, `InspectionOccurrence`, `InspectionSubmission`, `InspectionSubmissionItem`, `KnowledgeArticleInspectionDefinition`.
   - **Template engine:** `OperationalTemplate`, `OperationalTemplateField`, `OperationalTemplateApplicability`, `OperationalTemplateSchedule`, `OperationalTemplateEvent`. Also the `templateId` relation on `OperationalEvidenceRecord`, and the old template columns on the Plant requirement models.
   - **Records engine switch:** `RecordEngineRollout` and `RecordEngineMode`.
   - **Meal timing:** `ServeryMealServiceEvent`, `ServeryMilestoneEntry`, `UnitMealTime`.
   - **Schedules:** `AssignmentOverride` (retired by LEG-Q04).
   - **Dormant systems:** `OperationDefinition`, `OperationInstance` and every `operationInstanceId` column; `Task`; `ConsoleTicket`, `ConsoleTicketMessage`.
   - **Maintenance:** `PreventiveMaintenanceSchedule`, `Repair.preventiveScheduleId`, `Repair.issueType`, `AssetIssue.workOrderId`, `AssetStatus.ACTIVE`, `RepairStatus.CLOSED` and `WAITING_PARTS`, and `Repair.resolution`.
   - **Platform:** `AppRoute`, `RoleRoutePermission`, `UnitHierarchyRole.LEGACY_LOCATION`.
   - **Kept:** the forward Record's template-named columns and enums (LEG-D15).
3. The register's "no historical records are deleted" rule amended for pre-customer test data, with the approval recorded.

**Tests.** The migration applies on a copy of the test database. The full suite passes on the new schema.

**Exit gate.** `prisma migrate deploy` applies cleanly to every test environment. The legacy inventory test is empty.

**Schema.** The drops above, one migration per area, each approved.

---

## LEG-07 — First-customer gate

**Deliverables.**
1. The legacy inventory test is empty.
2. Every register row is RETIRED, or is a kept persistence name (LEG-D15).
3. DSH-04 has exited. Today's Work and Business Workspace are gone.
4. The Product Constitution and language guide no longer name a retired surface as current.
5. The product owner signs the gate in the tracker.

**Exit gate.**
- A real customer may be onboarded.
- CDA-07 may be enabled (CDA-D17).

**Schema.** None.

---

## Risks

| Risk | Mitigation |
|---|---|
| Plant is AVAILABLE, and its preventive-maintenance and work-order Records move engines | Plant scope approved for this change only; additive migrations first; a full close-out flow test before LEG-03 |
| Plant moves to the forward engine before its forms do, and work orders cannot close | Plant Departments stay on the current engine until LEG-02 lands (LEG-D18) |
| Facilities lose the ability to make their own forms | Facility-made forms ship in LEG-02, before LEG-03 removes the old engines (LEG-D19) |
| A forward gap is found after legacy code is removed | LEG-02 proves parity with the legacy code still present. LEG-03 removes it only after the parity exit gate. |
| Test facilities hold configuration someone wants to keep | LEG-Q03: facilities are kept and their Records set up again. A form worth keeping is recreated as a Catalog form before LEG-03. |
| Dropping tables loses data someone later wants | LEG-06 is separate, shows row counts and needs explicit approval. Behavior retirement does not depend on it. |
| The program runs long and a customer arrives first | LEG-D02: no customer before LEG-07 without an explicit, written exception |
