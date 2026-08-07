# Plant Operations Reference — Phase 12A

**Date:** 2026-08-07  
**Branch:** `product/plant-operations-reference-phase-12a-2026-08-07`  
**Base tip:** `4cd5b890e4aab6caeb2a8f11a19fa17e392e2894` (Phase 11C sequential certification)  
**Frozen release:** `80353dfcc870f4bd53de95cad3fd91d93ba5056b` (`release/dietary-v1-pilot-certified-2026-08-05`)  
**Mode:** ACT — PRODUCT PHASE 12A

Companion ownership decision: [`PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md`](./PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md)

Guides: [Manager](./PLANT_MANAGER_SETUP_GUIDE.md) · [Technician](./PLANT_TECHNICIAN_GUIDE.md) · [Supervisor](./PLANT_SUPERVISOR_GUIDE.md) · [Cross-department requests](./CROSS_DEPARTMENT_SERVICE_REQUEST_GUIDE.md)

---

## Purpose

Prove that LTC Manager can support Plant Operations as a third operational Department using shared platform rails: cross-department **OperationalRequest** intake, Plant triage, explicit Work Orders on existing **Repair**, Assignment coverage, Assets / return-to-service, Work Plans / Procedures / Evidence — without inventing `PlantRequest`, `PlantWorkOrder`, or a full CMMS.

---

## Starting State

| Item | Value |
|------|-------|
| Phase 11C tip (base) | `4cd5b890e4aab6caeb2a8f11a19fa17e392e2894` |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Migrations after Phase 12A | **72** (`20260807140000_plant_operations_reference_phase_12a`) |
| `ltc_manager` | Untouched |
| Cloud | None authorized |
| `OPERATION_ENGINE_ENABLED` | false |
| `TASK_SYNC_ENABLED` | false |
| `PLANT_OPERATIONS_ENABLED` | **false** by default |

---

## Architecture Trace Summary

Full answers 1–25 live in the ownership decision. Implemented highlights:

- **Request routing** is configurable `DepartmentRequestRoute` (facility + requesting → responsible). Not a rules engine. Legacy `suggestRepairDepartmentIds` heuristics remain for WO defaults only.
- **AssetIssue** stays Asset-required. Non-Asset facility needs use **OperationalRequest** (optional `assetId`).
- **Repair** remains authoritative Work Order SoT. No `PlantWorkOrder`.
- **OperationalAssignment** = shift / zone coverage. **Repair.assignedEmployeeId** = ticket ownership.
- Dietary / EVS report into Plant via OperationalRequest with `responsibleDepartmentId = Plant` when a route exists. **No silent route-all-to-Plant. No auto-WO.**
- Plant Job Flow soft-skips meal/servery milestones (`includeMealMilestones` only for DIETARY) and surfaces assigned-WO / urgent-request attention.
- Offline Plant bundle may include **read-only** assigned open WOs (`plantWorkOrderContext`). No offline WO mutation commands.

```
Facility locations + Department responsibility + Zones
        ↓
Asset registry (shared) + OperationalRequest (shared — not PlantRequest)
        ↓  (if Asset known)
AssetIssue (asset-specific condition)
        ↓  (explicit, never automatic)
Repair as Work Order (assignee, vendor, lifecycle)
        ↓
Explicit Asset RETURN_TO_SERVICE + AssetStatusHistory
Parallel: OperationalAssignment | Work Plans | KnowledgeArticle | Evidence
Gate: PLANT_OPERATIONS_ENABLED; engine flags stay false
```

---

## Request Ownership

| Concept | Authoritative model | Notes |
|---------|---------------------|-------|
| Request (reported need; Asset optional) | **`OperationalRequest`** (shared) | Intake, routing, triage status, requester-visible summary |
| Asset-tied condition | **`AssetIssue`** | Remains Asset-required |
| Repair / Work Order | **`Repair`** | WO SoT; no `PlantWorkOrder` |
| Shift / zone coverage | **`OperationalAssignment`** | No `PlantAssignment` |
| Routine work | **`DepartmentWorkPlan`** | Distinct from WO; Plant has **no** dedicated Work Plan presets |
| Procedures | **`KnowledgeArticle`** | Viewing ≠ completion |

**Request does not own repair work.** Creating a WO from a Request is explicit (`createWorkOrderFromRequest` / `createWorkOrderFromOperationalRequest`). Completing a WO does **not** auto-close the Request or return an Asset to service.

---

## Request vs AssetIssue vs Repair

| | OperationalRequest | AssetIssue | Repair (WO) |
|--|-------------------|------------|-------------|
| Asset required? | No (optional) | Yes | Optional (copied from request when present) |
| Cross-dept requesting / responsible | Yes | No separate requesting/responsible | Yes (FKs on Repair) |
| Created automatically from report? | Yes (report creates Request) | Separate Asset Issue path | **Never** from Request/Issue |
| Completing closes others? | N/A | Completing WO does not auto-close Issue/Request | Completing does not RTS Asset |

Linked optionally: `OperationalRequest.relatedAssetIssueId`, `OperationalRequest.workOrderId` → `Repair`.

---

## Routing

- Model: `DepartmentRequestRoute` (unique per facility + requesting + responsible; `isActive`, `sortOrder`, optional `note`).
- Frontline **Report a Problem** lists only active routes for the requesting department (`listActiveRoutesForRequestingDepartment`).
- Server `validateRoute` rejects missing / inactive / cross-facility destinations and rejects Plant destinations when `PLANT_OPERATIONS_ENABLED` is false.
- Manager configures via `upsertRequestRoute` / `upsertRequestRouteAction` (Manager Plant authority) and the **Request routing** panel on Plant `/staffing/operations`. Synthetic pilot also seeds Dietary/EVS→Plant routes.
- Reroute (`rerouteRequest`) appends history; never rewrites requesting department, reporter, original location, or original asset.

---

## Plant Config

Activation:

```
PLANT_OPERATIONS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
```

`department-operations.ts` treats `PLANT` like Dietary/EVS under the umbrella flag (Job Flow, Work Plans feature gate, Asset Ops for Plant). Dietary (`DIETARY_*`) and EVS (`EVS_OPERATIONS_ENABLED`) remain independent.

Select **Plant** as the active operational Department for Staffing / Job Flow / Supervisor board Plant projections.

---

## Assignment Model

| Concern | Owner |
|---------|-------|
| Who covers floors / zones / windows | `OperationalAssignment` (+ locations / zones) |
| Who owns this repair ticket | `Repair.assignedEmployeeId` |

A WO may be assigned to an eligible Plant Employee outside their usual zone when authorized without rewriting their Assignment. Draft Assignments never produce frontline Work.

---

## Intake

- Shared `ReportProblemForm` on Unit Workspace when the active department has Job Flow enabled.
- Fields: destination (route), optional Asset, summary / description, observed time, priority, operational impact, equipment usable (when Asset set), workaround, duplicate confirm.
- Creates `OperationalRequest` status `REPORTED`; append-preserving first update (`requesterVisible: true`).
- Obvious duplicate detection (same unit + summary + open window ~48h); caller may `allowObviousDuplicate`.
- Idempotent create when `clientCommandId` already exists for facility + requesting department.

---

## Triage

Plant Supervisor/Manager (password; Plant department; flag on):

- Queue: `listPlantTriageQueue` / Supervisor board `plantOperations` + `PlantTriagePanel`.
- Actions: Acknowledge (`REPORTED`/`REOPENED` → `ACKNOWLEDGED`), Triage (priority / impact / internal `triageNote` / status toward `UNDER_REVIEW` / `MONITORING`), optional assignee when creating WO, Create Work Order (explicit).
- Service also supports resolve-without-WO, reopen, close, link Asset / AssetIssue, link Evidence, reroute.

**No auto-WO** from Request or AssetIssue.

---

## Work Order Lifecycle

Repair statuses used in Plant paths include: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_PARTS`, `WAITING_ON_VENDOR`, `ON_HOLD`, `COMPLETED`, …

`technicianUpdateWorkOrder` / `technicianWorkOrderAction` actions: `START`, `NOTE`, `WAITING_PARTS`, `WAITING_ON_VENDOR`, `COMPLETE`, `FOLLOW_UP`.

When a Request is linked:

- START / waiting transitions may sync Request to `WORK_IN_PROGRESS` / `WAITING_ON_VENDOR` / `WAITING_ON_PARTS` (requester-visible summary labels).
- **COMPLETE does not set Request to CLOSED/RESOLVED** and does **not** mutate Asset status.
- `RepairUpdate.requesterVisible` flag exists; default private unless explicitly set.

---

## Technician Runtime

- Shared Job Flow shell with Plant attention for assigned open WOs and urgent Plant-queue requests.
- Meal/servery milestones omitted for Plant (same soft-skip pattern as EVS).
- Assigned WO actions are authorized for Plant STAFF when they are the assignee and not on Quick PIN; Supervisor/Manager manage more broadly.
- Dedicated rich technician WO Job Flow panel UI is **not** a Phase 12A deliverable beyond attention + server actions + existing Asset WO listing. Browser automation for start/complete is **partial** (see Tests).

---

## Vendor

- Facility-scoped Vendor on Repair (`vendorId`). Foreign / wrong-facility Vendor IDs rejected at service boundary.
- STAFF cannot manage Vendors. Manager Plant authority required for Vendor management / Build.
- Requester status does **not** expose vendor internals.

---

## Return to Service

- Completing a WO ≠ RTS.
- `markReturnToServiceReady` is a flag only.
- `returnAssetToService` / `returnAssetToServiceFromPlantAction` is an explicit Manager (Plant) authorized action; writes Asset status + `AssetStatusHistory`.
- Browser RTS coverage is labeled **BROWSER-PARTIAL** in the CI scenario map; service/SQL coverage is the primary proof.

---

## Requester Status

`loadRequesterVisibleStatus` / `RequesterStatusPanel`:

- Scoped to requesting department + request id.
- Returns status label, summary, workaround, location/asset names, requester-visible updates only, WO code/status if linked.
- Strips triage notes, private updates, vendor details.

---

## Supervisor Ops

`/staffing/operations` when active department is Plant and flag enabled:

- `plantOperations` projection: new/untriaged/urgent counts, open/in-progress/waiting/overdue/unassigned WO counts, OOS assets, request rows, technician list for assignee select.
- `PlantTriagePanel` for acknowledge / triage / explicit Create WO.
- Shared staffing/coverage / work exceptions / offline / asset sections remain; Plant language is repair-queue-first.

---

## Work Plans / Procedures

- Plant may use shared Work Plans / one-offs / KnowledgeArticle Procedures under Plant department ownership.
- `listWorkPlanPresetSummaries("PLANT")` returns **no Plant-specific presets** (empty list). Managers create blank plans as needed.
- Viewing a Procedure ≠ WO completion. No auto-WO from Work Plans.

---

## Evidence

- Shared Evidence rails. `OperationalRequestEvidenceLink` links Evidence records to Requests (`linkEvidence`).
- Inspection / Evidence completion does not complete a WO or RTS an Asset.

---

## Asset History

- Shared Asset registry + AssetIssue + AssetStatusHistory remain append-preserving for status events.
- WO completion does not rewrite Asset operational status; RTS does.

---

## Offline Boundary

| Included when Plant + technician employee | Not included / not implemented |
|------------------------------------------|--------------------------------|
| `plantWorkOrderContext` with `readOnly: true`, `offlineMutationsSupported: false` | Offline START / NOTE / COMPLETE WO |
| Assigned open WO identity, title/summary, Asset name, location, priority, status | Offline Vendor, reroute, RTS |
| Existing Work / Evidence offline patterns where already certified | Any `START_WORK_ORDER` command type |

`OFFLINE_COMMAND_TYPES` remains: servery milestones, Evidence, Asset Issue report, operational task complete — **no** Work Order mutation commands.

---

## Authority

| Actor | May |
|-------|-----|
| Dietary / EVS STAFF (requester) | Report request; view own/scoped requester-visible status |
| Plant STAFF / Technician | Own Runtime; act on **assigned** WOs (password); Plant Work/Evidence; **no** Build / Vendor / route config / RTS |
| Plant SUPERVISOR | Triage; create/update WOs; one-off work; scoped history; **no** route config / Vendor / RTS |
| Plant MANAGER / GM-equivalent | Build; Vendors; routing upsert; Work Plans / Procedures; RTS; full scoped history |
| FA alone | Denied without Plant primary department operational relationship |
| Quick PIN | Frontline report + requester status only; no Build / triage / WO manage / Vendor / RTS |

Cross-Facility and cross-Department substitution fail closed.

---

## Feature Flag

| Flag | Default | Role |
|------|---------|------|
| `PLANT_OPERATIONS_ENABLED` | **false** | Plant Build / Runtime / Supervisor / routing validation to Plant / offline Plant WO context |
| `OPERATION_ENGINE_ENABLED` | false | Must stay off |
| `TASK_SYNC_ENABLED` | false | Must stay off |

Enabling Plant does not flip Dietary or EVS flags.

---

## Migrations

Migration **72**: `20260807140000_plant_operations_reference_phase_12a`

Additive:

- Enum `OperationalRequestStatus`
- Tables `DepartmentRequestRoute`, `OperationalRequest`, `OperationalRequestUpdate`, `OperationalRequestEvidenceLink`
- Column `RepairUpdate.requesterVisible` (default false)

Does not activate any feature flags. Safe on empty DB and existing data. Does not write `ltc_manager`.

---

## Synthetic Pilot

`scripts/verify/plant-browser-fixtures.mjs` + `npm run test:plant-browser`:

- Synthetic Plant / Dietary / EVS departments, floors/units, Dietary+EVS→Plant routes, zone, ~40 synthetic Assets (incl. OOS), Vendor, Employees/users (manager/supervisor/staff/dietary/FA), sample Request + assigned WO.
- No real Terrace View names, no resident PHI, no committed credentials (`SEED_DEMO_PASSWORD` / `AUTH_SECRET` required at run time).

---

## Performance Notes

- Triage queue and board loaders use relational batching with `take` limits (request queue default 100; offline WO context take 40).
- No Redis. No microservices. Avoid inventing N+1 WO fetchers in Job Flow — Plant attention uses `count` queries.
- Large Asset/WO CI scale is fixture-backed; full interactive browser matrix is not exhaustive (see Tests).

---

## Tests

| Layer | Location / command |
|-------|--------------------|
| Hermetic authority / flags | `src/lib/operational-requests/phase-12a-operational-requests.hermetic.test.ts` |
| Service / DB (opt-in URL) | `phase-12a-operational-requests.test.ts`, `src/lib/plant/phase-12a-plant-operations.test.ts` |
| Browser CI gate | `tests/plant-browser/ci-gate.spec.ts` via `npm run test:plant-browser` |

Scenario map in `ci-gate.spec.ts` uses honest labels: **BROWSER | SQL | HERMETIC | SERVICE | PRIOR GATE | DOCS | BROWSER-PARTIAL**.

Automated browser gate covers a **practical subset** (operations board triage presence, Dietary unit report form when routes exist, FA deny smoke, STAFF builder deny smoke, SQL ownership checks, Dietary login independence). Many ownership/authority/offline/WO lifecycle rows remain hermetic, SQL, service, or docs — not full end-to-end browser.

Notably:

- Offline WO read-only + mutations-not-implemented: hermetic / types contract (`offlineMutationsSupported: false`).
- Plant Job Flow WO emphasis: **BROWSER-PARTIAL**.
- Manager RTS: **SQL / BROWSER-PARTIAL**.

---

## Dietary / EVS Regression Stance

- Plant flag does not enable Dietary or EVS.
- Hermetic tests assert Dietary/EVS independence when Plant is on or off.
- Browser smoke: Dietary staff still reaches workspace when Plant fixtures run with Plant enabled.
- Do not revive `/issues` Repair façade or unit quick-issue as Plant Runtime. Keep legacy paths isolated.

---

## Retained Findings (#1–2)

1. Projected Unit Workspace does not have classic Asset-panel parity.  
2. Arbitrary foreign Vendor IDs are service / SQL rejected while the normal selector is Facility scoped.

Do not create unrelated work merely to close these.

---

## Known Limitations

- No dedicated Department Request Route Admin UI in Phase 12A (action/service + fixture seed).
- No Plant-specific Work Plan presets.
- Technician WO mutations are service/action-complete; Job Flow does not provide a full dedicated WO runtime board UI.
- Offline WO context is read-only; no `START_WORK_ORDER` (or any WO) offline command.
- Browser CI coverage is partial relative to the full scenario map.
- Completing a WO may sync in-progress/waiting Request statuses but never auto-closes Request or RTS Asset.
- `RequesterStatusPanel` is available as a component; wiring depends on having a request id in context.

---

## FINAL SEQUENTIAL CERTIFICATION

**Sequential verification date:** 2026-08-07  
**Branch:** `product/plant-operations-reference-phase-12a-2026-08-07`

### Gates

| Command | Result |
|---------|--------|
| `verify:static` | PASS — migrations=72; 0 lint warnings |
| `test:hermetic` | PASS — 1563 tests / 1470 pass / 0 fail / 93 skipped |
| `verify:build` | PASS |
| `verify:db` (disposable PG16) | PASS — migrations=72; 1563 pass / 0 skip |
| `test:plant-browser` | PASS — 7 passed |
| `test:dietary-pilot` | PASS — 5 |
| `test:evs-browser` | PASS — 9 |
| `test:evs-assignment-browser` | PASS — 10 |
| `test:assignment-browser` | PASS — 6 |
| `test:offline-browser` | PASS — 25 |
| `test:asset-operations-browser` | PASS — 1 |
| `test:job-flow-browser` | PASS — 13 |

Flags: `OPERATION_ENGINE_ENABLED=false`, `TASK_SYNC_ENABLED=false`. `ltc_manager` untouched. No cloud resources.

### Recommendation

**PASS WITH FINDINGS** — retained Unit Workspace Asset panel + Vendor arbitrary-ID findings; Plant browser CI covers critical path (7 automated tests) with remaining scenario matrix rows classified as SQL / hermetic / service / docs / prior-gate rather than full 80 live browser steps.


## Phase 12B Boundary

Suggested next phase (not in 12A):

- Advanced routing rules engine (panel is explicit destination allow-list only).
- Richer Plant technician Job Flow WO panel (online).
- Optional offline WO mutation commands with authority / conflict / history semantics (explicit product decision).
- Broader browser certification of start → complete → requester status → RTS.
- Deeper EVS/Dietary → Plant operational UX polish without a rules engine.

Still out of scope unless separately authorized: full CMMS, PM engine, parts, purchasing, Vendor portal, AI, IoT, clinical equipment.

---

## Explicit Non-Goals (Phase 12A)

- Full CMMS  
- Preventive-maintenance scheduling engine  
- Parts inventory / storeroom  
- POs / procurement / AP  
- Capital / depreciation  
- Vendor portal / login  
- Technician GPS / route optimization  
- BAS / IoT  
- Automatic diagnosis / AI suggestions  
- Automatic WO generation or automatic technician Assignment  
- Clinical equipment / medical device compliance  
- Resident / PHI  
- Hosted deployment / production launch  
- Real Terrace View Employee data  
- Operations Engine / Task sync  

---

## Certification Stance

Phase 12A may pass when: OperationalRequest is the shared request SoT; Repair remains WO SoT; routes fail closed; no auto-WO; complete ≠ close Request ≠ RTS; offline WO is read-only; Plant flag defaults false; Dietary/EVS stay independently gated; engine flags stay off; retained findings stay documented without drive-by fixes.
