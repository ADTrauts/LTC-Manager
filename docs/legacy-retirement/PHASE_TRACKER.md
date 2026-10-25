# Legacy Retirement — phase tracker

Updated October 25, 2026 (LEG-07 accepted). This is the single status and authorization record for the [Legacy Retirement program](./README.md). Scope is in the [phased plan](./PHASED_PLAN.md). Decisions are in [DECISIONS.md](./DECISIONS.md).

| Phase | Status | Gate / dependency |
|---|---|---|
| LEG-00 — Decision record | **Accepted (user) October 20, 2026** | Docs only. |
| LEG-01 — Forward by default | **Accepted (user) October 23, 2026.** | Product owner accepted the forward default, the seed change, and the green hermetic suite. [Record](#leg-01-record--october-23-2026). |
| LEG-02 — Records parity | **Accepted (user) October 23, 2026.** | Product owner accepted the forward Records paths, including facility-made forms. [Record](#leg-02-record--october-23-2026). |
| LEG-03 — Records cutover | **Accepted (user) October 23, 2026.** | Product owner approved the Records cutover. Tables stay until LEG-06. [Record](#leg-03-record--october-23-2026). |
| LEG-04 — People & Coverage | **Accepted (user) October 24, 2026.** | A call-off marks the shift, and a move changes the day's Assignment. The override table stays until LEG-06. [Record](#leg-04-record--october-23-2026). |
| LEG-05 — Platform leftovers | **Accepted (user) October 24, 2026.** | Product owner accepted the platform leftovers. Columns and tables stay until LEG-06. [Record](#leg-05-record--october-24-2026). |
| LEG-06 — Schema cleanup | **Accepted (user) October 24, 2026.** | Product owner approved the row counts, then accepted the drops. Migration `20261025010000_leg06_schema_cleanup` is on local `ltc_manager` and staging `neondb`. [Record](#leg-06-record--october-24-2026). |
| LEG-07 — First-customer gate | **Accepted (user) October 25, 2026.** | Product owner signed the first-customer gate. The legacy inventory is empty, and the retired homes are gone. [Record](#leg-07-record--october-24-2026). |

## LEG-00 record — October 20, 2026

### Delivered

- [x] Program record: [README](./README.md), [audit](./CURRENT_STATE_AUDIT_2026-10-20.md), [decisions](./DECISIONS.md), [phased plan](./PHASED_PLAN.md), this tracker.
- [x] Built from two code inventories (Records engines, then every other register surface). Load-bearing claims were checked against the code.
- [x] Cross-links:
  - CDA-D17 now points here.
  - The Dashboard reads only the forward Records engine (DSH-D19). This corrects the earlier Dashboard docs, which named a forward-engine loader as the legacy one.
- [x] Pointers in `AGENTS.md`, the root `README.md`, `docs/product/README.md`, `memory-bank/README.md` and the Legacy Surface Register.
- [x] Accepted by the product owner, October 20 afternoon.
- [x] Every existing facility moves to forward data. Each is kept, and its Records are set up again (LEG-Q03, LEG-Q05).
- [x] Plant round (5 answers):
  - Plant scope approved for this change (LEG-D06).
  - Vssyl publishes standard Plant and EVS forms (LEG-D17).
  - Plans require forms on each work order, with today's close-out and waiver rule. Checks with no repair work are scheduled Records. Vendor-run work orders use the vendor's forms (LEG-D18).

- [x] Department heads and vendors can make their own forms in the same Catalog (LEG-D19, answering LEG-Q06).
- [x] Foundation review: Department capability switches retire (LEG-D20). The old profile and Experience editor joins LEG-D12.
- [x] Foundation round: LEG-Q04 answered. Assignments and Job Flow are part of every Department. Removal of the meal-time guess (LEG-02, with LEG-D07) and the AI placeholder (LEG-05) is scheduled.

Every confirmation item is answered. LEG-Q02 was answered on October 20, evening: drop the tables in LEG-06, which still needs row counts and explicit approval at that step.

## LEG-01 record — October 23, 2026

Started when the product owner accepted DSH-05 and said to start LEG-01.

- [x] A Department with no rollout row uses the forward engine when `CANONICAL_LOGS_ENABLED` is on. Plant stays on the previous engine. An explicit rollout row still wins.
- [x] Seeds, provisioning, and the pilot bootstrap install the matched Catalog Records. They do not create log templates, assignments, or meal times. The backfill script is removed. Three presets with no Catalog definition wait for LEG-02.
- [x] `.env.example` documents the forward engine on. The code default stays off, so an unset production environment does not change.
- [x] The legacy inventory test fails when a new file reads a legacy Records store.
- [x] The Legacy Surface Register no longer describes `/dashboard` as a redirect or `loadDashboardQueries` as the live loader. `OPERATION_ENGINE_ENABLED` is recorded as not a live switch.

- [x] The matched Catalog Records are installed on the staging facilities and on the local test database. No Food & Nutrition department had a LEGACY rollout that still governed today, so none needed a new rollout row. Old submissions were not copied. Plant and EVS rollouts were left as they were.
- [x] Hermetic tests run with the Records and authority flags forced off, so a developer shell cannot change the result. The Facility home expectation is `/dashboard`. The Locations page may import the Rounds screen. The hermetic suite passed on October 23, 2026: 3891 tests, 0 failures.

Accepted by the product owner October 23, 2026.

## LEG-02 record — October 23, 2026

Started when the product owner accepted LEG-01 and said to start LEG-02. Plant scope was already approved.

- [x] Vssyl's standard forms are in the Catalog: six Plant forms, the EVS restroom round, and dry storage ambient. The three presets that had no match now install those forms. They are installed on the local test database and on both staging facilities.
- [x] A Department with no rollout row uses the forward engine, including Plant. An explicit rollout row still wins.
- [x] Meal timing writes no longer take the legacy milestone branch. A Cycle that still expects those milestones is not configured until it has Key Points. Historical milestone facts stay readable.
- [x] A self-operated Department head, and a manager the head allows, can build a facility-owned form in the same Catalog. Publishing it installs the form at that facility. A facility form is visible only at that facility.

- [x] A maintenance plan names a published Catalog form. The work order copies that form. A supervisor adds a required Record from those forms. A completed Record of that form for the asset satisfies it. The old template columns stay and can be empty.
- [x] A Work plan links a step to a Catalog Record when the Department is on the forward engine. Opening that step goes to the Record. An asset profile does not read template bindings for that Department.
- [x] Inspections admin opens Records when the forward engine is on. Operational Templates opens Records for a Department on the forward engine. Both pages remain for a Department on the previous engine.
- [x] Audit / Reports for a forward Department does not open the legacy report. The legacy report remains for a Department on the previous engine.
- [x] The old Logs page for a forward Department shows earlier submissions only. It does not load templates, assignments, or the menu.
- [x] The Plant starter installs those published forms. Work examples stay drafts.

- [x] Cycles no longer match a location by unit type or physical room type. They match the whole Department, an explicit location, or a Location Function. New Cycles cannot be saved in the retired modes.
- [x] Draft and published Cycles that still used those modes now name the explicit Department locations that match. A Cycle with no matching location is left unchanged.
- [x] The legacy Logs page no longer builds a temperature checklist from the menu. Food temperatures are the Food Temperature Record.
- [x] Kitchen sanitation audit is a scored Catalog inspection. A critical miss fails it. A failed inspection is out of standard, so the Record can be rechecked.
- [x] Knowledge articles link published Catalog forms. The Record being filled shows those articles. Older log-template and inspection links stay until those tables drop.
- [x] A maintenance requirement names the Catalog form its template already matches, when that form belongs to the Department running the work. A vendor-run work order requires that vendor's forms, plus Vssyl's standard forms.
- [x] A Cycle that still expects Ready or Service Started moves onto that meal's Key Points, and those milestones are cleared. A new Cycle cannot be saved with them. The meal-time guess is removed. What is happening now comes from the published Cycle and Phase. The local test database and both staging facilities had no Cycles left in that shape.
- [x] The unit meal controls and the offline bundle do not read servery meal events when the published Cycle is the current period model. A Department that still uses those milestones still reads them. Review and the earlier Logs screen can still show the historical events.
- [x] The supervisor Cycle board and the location board do the same. They read servery meal events only when a published Cycle still expects those milestones.
- [x] An offline Ready command records the Breakfast Ready Key Point. The same command accepted again is already accepted. A second command for that moment is a conflict.
- [x] The old inspection generator creates no work when every Department is on the forward engine. A Department still on the previous engine still gets its occurrences. A definition with no Department is left alone. Due inspections for a forward Department come from Catalog Records.
- [x] On `ltc_verify_dsh03`, a Plant head built a facility form, published it, filled the due Record, and another facility could not see the form. One work order closed because that Record matched. A second closed because a supervisor waived it. A technician could not waive it.
- [x] Cutover readiness no longer takes a template-backed maintenance flag.
- [x] A check with no repair work is a scheduled Record on the room or asset: mechanical room inspection, boiler or gauge reading, restroom round, and dry-storage temperature. No work order is created. Neither test database had a matching room or piece of equipment.

Accepted by the product owner October 23, 2026.

## LEG-03 record — October 23, 2026

Started when the product owner accepted LEG-02 and said to move to LEG-03. Tables stay until LEG-06.

- [x] `/logs` no longer reads submissions, templates, assignments, or the menu. It sends bookmarks to Records.
- [x] `/admin/inspections` sends the Facility Administrator to Records. It does not load inspection definitions.
- [x] `/staffing/templates` sends a manager to Records and a supervisor to due Logs. It does not load Operational Templates.
- [x] Audit / Reports does not open the legacy report. A `view=legacy` bookmark returns to Audit / Reports.
- [x] A Work plan links a step to a Catalog Record.
- [x] The old Logs, Inspections, and Operational Templates actions are removed. Locations no longer reads or assigns log templates.
- [x] The menu compatibility loader is removed. Menus are read with the menu list, one menu, and the runtime resolver.
- [x] The inspection generator creates no occurrences. Submitting an old inspection returns the person to a Catalog Record. Log submissions are no longer copied onto tasks.

Approved by the product owner October 23, 2026. Tables stay until LEG-06.

The flag, the Department engine switch, inspection task sync, and template evidence submit are still in the code.

## LEG-04 record — October 23, 2026

Started when the product owner said to start LEG-04.

- [x] `/staffing/legacy` opens the Schedule. Adding or deleting a shift from the old grid is removed. The Schedule toolbar and Daily Assignments no longer link to that grid. Coverage links open Daily Assignments.
- [x] A call-off marks the shifts on that date. A reassignment moves that day's Assignment. The call-off action does not write `AssignmentOverride`. Presence, the assignment board, and review read the shift mark.
- [x] The seed and the dietary, evidence, and job-flow fixtures no longer create an `AssignmentOverride`. A call-off marks the shift. Tara's sample move is that day's Assignment. Sample shifts carry a Department and clock times.
- [x] No product action creates a `ScheduleEntry` except the canonical shift service.

Accepted by the product owner October 24, 2026.

The `AssignmentOverride` table stays until LEG-06. Deleting a location still clears leftover override rows. The owner resolver can still read one. Browser fixtures can still attach a location to a sample shift.

## LEG-05 record — October 24, 2026

Started when the product owner said to proceed after accepting LEG-04.

- [x] Location and sidebar projection are the only paths. `PROJECTION_LOCATIONS_ENABLED` and `PROJECTION_SIDEBAR_ENABLED` are gone, along with the flat unit list and the old Units page.
- [x] `/issues` is no longer a route. Repair actions live under Repairs. Links, handoffs, and the morning brief point at `/repairs`.
- [x] New assets are stored as OPERATIONAL. Existing ACTIVE rows are rewritten by `20261024180000_leg05_asset_status_operational`. The enum value stays until LEG-06.
- [x] Provisioning and onboarding no longer store `managementCompanyName` on the Facility. Existing values stay readable. Billing and release status are unchanged.
- [x] Task Sync no longer copies Repairs, Logs, or inspections onto Task. `TASK_SYNC_ENABLED` is gone. The Task table stays until LEG-06.
- [x] The unit follow-up action, the repair page, and the morning brief no longer read or update Task.
- [x] Assignments no longer attach an Operation. The form, the board, template preview, and a meal-service milestone do not read or write `OperationInstance`. The column stays until LEG-06.
- [x] The morning brief and recovery guidance use the published Cycle and Phase. When none is underway, they show no operation window.
- [x] `ConsoleTicket` has no product reads or writes. The support screens use `SupportTicket`. The old tables stay until LEG-06.
- [x] The old profile and Experience editor is gone, including `DEPARTMENT_OPERATIONAL_PROFILES_ENABLED`. Location Function binding and publishing stay. Profile tables stay until LEG-06.
- [x] The route mirror is no longer seeded. `AppRoute` and `RoleRoutePermission` stay until LEG-06. `/settings`, `/build/knowledge`, and `/operations` are not routes. `/dashboard` stays the Dashboard. Procedures stay at `/admin/knowledge`.
- [x] Legacy work-order statuses are rewritten by `20261024220000_leg05_repair_status_current`. CLOSED is COMPLETED. WAITING_PARTS is ON_HOLD for parts. A completion note moves into the work summary when that summary is empty. The enum values stay until LEG-06.
- [x] `LEGACY_LOCATION` rows are neighborhoods (`20261024230000_leg05_legacy_location_neighborhood`). Builder shows that role as a neighborhood. The enum value stays until LEG-06.
- [x] The old concept map is gone. Projection shadow reads experience keys directly.
- [x] Department capability switches are gone (LEG-D20). Cycles, Job Flow, evidence, Work Plans, and assets are on for any Department key. Plant still follows install plus Harbor or customer access, with no env override. Assignments are part of every Department. Without an Assignment, Job Flow keeps the Work for the signed-in place. `CANONICAL_LOGS_ENABLED` stays.
- [x] New work orders do not write `Repair.issueType`. Existing values stay readable for repair copy, routing history, and the morning brief. New issues link through `Repair.issueId`. `AssetIssue.workOrderId` is no longer written. Both columns stay until LEG-06.

Accepted by the product owner October 24, 2026. Columns and tables stay until LEG-06.

## LEG-06 record — October 24, 2026

Started when the product owner accepted LEG-05 and said to move to the next step. This step is the row count. No drop has been written.

Counted October 24, 2026 on local `ltc_manager` and staging `neondb`. Every facility is a test facility. Local: Terrace View Long Term Care (two facilities with that name) and Test Facility. Staging: LTC Manager Staging — synthetic data, and Terrace View.

Rows that are not zero:

| Store | Local | Staging |
|---|---:|---:|
| LogTemplate | 9 | 0 |
| LogTemplateField | 39 | 0 |
| LogAssignment | 4 | 0 |
| OperationalTemplate | 1 | 2 |
| OperationalTemplateField | 2 | 0 |
| OperationalTemplateSchedule | 1 | 0 |
| OperationalTemplateEvent | 2 | 0 |
| OperationalEvidenceRecord with a template | 1 | 2 |
| RepairRecordRequirement with a template | 1 | 0 |
| RecordEngineRollout | 3 | 2 |
| UnitMealTime | 6 | 0 |
| AssignmentOverride | 1 | 1 |
| AppRoute | 15 | 15 |
| RoleRoutePermission | 90 | 90 |
| Repair rows, all EQUIPMENT | 2 | 1 |

Empty on both: log submissions and values, inspection definitions and submissions, operation definitions and instances, Task, console tickets, preventive schedules, meal-service events, and the leftover status values (ACTIVE, CLOSED, WAITING_PARTS, LEGACY_LOCATION). No repair still points at a preventive schedule. No issue still stores the old work-order pointer. No repair has a leftover resolution note.

Location Function profiles stay. They are not on the drop list. Local has 1 profile, 7 areas, 24 area experiences, 6 room archetypes, 25 archetype experiences, and 1 room binding. Staging has none.

The product owner approved this count on October 24, 2026. Migration `20261025010000_leg06_schema_cleanup` is applied on local `ltc_manager` and staging `neondb`. Location Function profiles were not dropped.

Accepted by the product owner October 24, 2026.

## LEG-07 record — October 24, 2026

Started when the product owner accepted LEG-06 and said to start the next step.

- [x] DSH-04 has exited. Today's Work and Business Workspace are not homes. Their addresses redirect.
- [x] The legacy inventory test is empty. Product code, seeds, and verify scripts do not read or write the dropped log, inspection, template, or meal-time stores.
- [x] Retired register rows are marked RETIRED. `Repair` and `AssetIssue` stay as kept persistence names (LEG-D15). Current product routes in the historical table stay.
- [x] The Constitution and language guide no longer describe `/logs`, operational templates, or Business Workspace as the current record or home.
- [x] The product owner signs this gate.

Accepted by the product owner October 25, 2026.
