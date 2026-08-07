# Plant Operations Reference — Phase 12A Ownership Decision

**Date:** 2026-08-07  
**Branch:** `product/plant-operations-reference-phase-12a-2026-08-07`  
**Base tip:** `4cd5b890e4aab6caeb2a8f11a19fa17e392e2894` (Phase 11C sequential certification)  
**Mode:** ACT — PRODUCT PHASE 12A

This document records the architecture trace and ownership decisions required before Phase 12A implementation. Implementation must not begin until these decisions are recorded in-repo.

---

## Starting verification

| Item | Value |
|------|-------|
| Phase 11C branch | `product/evs-assignment-zones-scale-phase-11c-2026-08-07` |
| Local / remote Phase 11C tip | `4cd5b890e4aab6caeb2a8f11a19fa17e392e2894` (match) |
| Frozen release | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` (`release/dietary-v1-pilot-certified-2026-08-05`) |
| Local main | `704adc72abb46705a4451608a2fadf84215f42be` |
| origin/main | `6380b661a64e8f020d16813342945797a50bc0e0` |
| Migrations at start | 71 |
| Working tree at branch | Clean; synchronized with origin Phase 11C |
| `ltc_manager` | Untouched; disposable PG16 only |
| Cloud resources | None authorized |
| `OPERATION_ENGINE_ENABLED` | false |
| `TASK_SYNC_ENABLED` | false |

---

## Architecture Trace (answers 1–25)

1. **What current Request Routing was intended to do**  
   Heuristic defaults in `src/lib/repair-routing.ts` (`suggestRepairDepartmentIds`) for `Repair.requestingDepartmentId` / `Repair.responsibleDepartmentId` from issue type, trade, unit responsibility, and asset owning department. Documented as cross-department repair destination *suggestions*, not a configurable product. No Request Routing Admin UI or config tables exist.

2. **Whether it is active**  
   Partially: suggestion helpers are used by legacy unit quick-issue, `/repairs`, and Phase 10A Work Order create. There is **no** routing admin, rules engine, escalations product, or `ServiceRequest` / `DepartmentRequest` / `OperationalRequest` model. Phase 10A Asset Ops remain gated by `DIETARY_ASSET_OPERATIONS_ENABLED`; EVS thin assets by `EVS_OPERATIONS_ENABLED`. **No `PLANT_OPERATIONS_ENABLED` yet.**

3. **Whether AssetIssue can represent non-Asset Facility problems**  
   **No.** `AssetIssue.assetId` is required. `reportAssetIssue` fails without an Asset.

4. **Whether Phase 12A needs a broader OperationalRequest concept**  
   **Yes.** Cross-department intake with optional Asset, distinct requesting vs responsible departments, affected location, Plant triage queue, and non-Asset facility problems do not fit `AssetIssue`. No reusable generic request model exists.

5. **Whether AssetIssue should remain Asset-specific**  
   **Yes.** Keep Phase 10A SoT for equipment conditions. Link Request → AssetIssue when an Asset is known. Do not stretch AssetIssue into generic facility requests.

6. **How requesting Department is currently stored**  
   - AssetIssue: `departmentId` (reporting / owning department for the issue row; no separate requesting field).  
   - Repair: optional `requestingDepartmentId`.

7. **How responsible Department is currently stored**  
   - AssetIssue: **none**.  
   - Repair: optional `responsibleDepartmentId` (often suggested by heuristics).

8. **Whether affected Department differs from requesting Department**  
   **Not modeled.** Location is `unitId` / optional `spaceId`. No `affectedDepartmentId`. Phase 12A adds optional affected department where meaningful.

9. **Whether Repair already has appropriate Department ownership**  
   **Mostly yes for Work Orders:** requesting + responsible FKs exist. Gaps: no first-class Request link, AssetIssue→WO create currently same-department scoped, no requester-visible note channel on updates.

10. **Whether Repair can safely remain authoritative Work Order**  
    **Yes.** Do **not** create `PlantWorkOrder`. Status lifecycle, assignee, vendor, work performed, return-to-service-ready flag already exist. Completing a WO does not mutate Asset status.

11. **Whether technician responsibility belongs on Repair or Assignment**  
    Individual WO → `Repair.assignedEmployeeId`. Shift / zone coverage → `OperationalAssignment`.

12. **Whether OperationalAssignment should represent Plant shift / zone coverage while Repair owns WO responsibility**  
    **Yes.** Do not create one Assignment per repair ticket. Do not create `PlantAssignment`.

13. **Whether individual Work Order assignee already exists**  
    **Yes:** `Repair.assignedEmployeeId`.

14. **How Plant should receive issues reported by Dietary or EVS**  
    Dietary/EVS create **OperationalRequest** with configured/explicit `responsibleDepartmentId = Plant`, preserving requesting department. Plant triage queue filters on responsible department. Do **not** silently route all AssetIssues to Plant. Do **not** auto-create Work Orders.

15. **How explicit routing should work without a rules engine**  
    Smallest config: `DepartmentRequestRoute` (facility + requesting department → allowed responsible department destinations). Reporter picks destination or uses sole configured default. Server rejects unauthorized / cross-facility destinations. Keep repair heuristics for WO defaults only.

16. **How non-Asset facility requests should work**  
    Via OperationalRequest with optional `assetId`, required location, summary / impact / priority. May later link AssetIssue if Asset identified, and/or Repair as WO. Isolate legacy Repair-as-Issue façade (`/issues`, unit quick-issue) from Plant Runtime.

17. **Whether Issue history is append-preserving**  
    **Yes** for `AssetIssueUpdate` rows (append-create). Status fields on the issue row mutate. `AssetStatusHistory` is append-preserving.

18. **Whether Repair history is append-preserving**  
    **Yes** for `RepairUpdate` (append-create). Status fields mutate. Completing WO does not auto-close AssetIssue or mutate Asset status.

19. **How Work and Procedure fit without duplicating Work Order state**  
    Routine / one-off operational work stays on `DepartmentWorkPlan` / occurrences. Procedures = `KnowledgeArticle`. Reactive repairs stay on `Repair`. Viewing Procedure ≠ WO completion. No auto-WO from Work Plans.

20. **What Plant-specific assumptions are genuinely needed**  
    Feature flag `PLANT_OPERATIONS_ENABLED`; Plant Job Flow / Supervisor composition (repair-queue-first); cross-dept request intake + Plant triage authority; technician WO emphasis + Assignment coverage; extend `department-operations.ts` so PLANT is no longer always-false.

21. **Which existing components can be generalized**  
    Asset registry, AssetIssue (asset path), Repair WO services, Facility-scoped Vendor, OperationalAssignment + Zones, Work Plans, KnowledgeArticle, Evidence, Supervisor Operations shell, Job Flow resolver shell, offline command patterns, Department Builder location responsibility.

22. **Which must remain Department-specific**  
    Dietary meals/servery/menus; EVS room-round language; Plant repair-queue / technician WO language; flag names (`DIETARY_*`, `EVS_OPERATIONS_ENABLED`, `PLANT_OPERATIONS_ENABLED`); presets.

23. **Whether schema changes are required**  
    **Yes (additive):** OperationalRequest + history + evidence links + DepartmentRequestRoute; Request↔Issue / Request↔Repair links; requester-visible flags on request/repair updates. Do **not** duplicate Asset / AssetIssue / Repair / Vendor / OperationalAssignment / WorkPlan / Procedure.

24. **What legacy repair paths must remain isolated**  
    `/issues/[issueId]` Repair façade; `createUnitIssueAction` → Repair; `/repairs/[id]` redirect; `IssueType` + `suggestRepairDepartmentIds`; Task dual-write when `TASK_SYNC_ENABLED` (stays false). Plant/Dietary/EVS Runtime must not build on the façade.

25. **The smallest coherent Plant architecture**

```
Facility locations + Department responsibility + Zones
        ↓
Asset registry (shared) + OperationalRequest (new, shared)
        ↓  (if Asset known)
AssetIssue (asset-specific condition)
        ↓  (explicit, never automatic)
Repair as Work Order (assignee, vendor, lifecycle)
        ↓
Explicit Asset RETURN_TO_SERVICE + AssetStatusHistory
Parallel: OperationalAssignment coverage | Work Plans routine | KnowledgeArticle | Evidence
Gate: PLANT_OPERATIONS_ENABLED; engine flags stay false
```

---

## Canonical Request Ownership Decision

| Concept | Authoritative model | Notes |
|---------|---------------------|-------|
| Request (reported need; Asset optional) | **`OperationalRequest`** (new, shared — not `PlantRequest`) | Owns intake, routing, triage status, requester-visible summary |
| Asset-tied condition | **`AssetIssue`** | Remains Asset-required |
| Repair / Work Order | **`Repair`** | Remains WO SoT; no `PlantWorkOrder` |
| Shift / zone coverage | **`OperationalAssignment`** | No `PlantAssignment` |
| Routine work | **`DepartmentWorkPlan`** | Distinct from WO |
| Procedures | **`KnowledgeArticle`** | Viewing ≠ completion |

**Request does not own repair work.** Creating a Work Order from a Request is explicit. Completing a Work Order does **not** auto-close the Request or return Asset to service. Returning Asset to service remains an explicit authorized action (Phase 10A).

### OperationalRequest required fields (Phase 12A)

- Facility  
- Requesting Department  
- Responsible Department  
- Optional Affected Department  
- Location (`unitId`, optional `spaceId`)  
- Optional Asset  
- Reporter (user / employee / label)  
- Summary, description  
- Operational impact, priority  
- Observed / requested time  
- Status  
- Optional linked AssetIssue  
- Optional linked Work Order (`Repair`)  
- Append-preserving history  
- Requester-visible status summary / notes (explicit visibility)

---

## Cross-Department Routing Decision

- Introduce **`DepartmentRequestRoute`**: facility-scoped allowed destinations from a requesting department to a responsible department.  
- Frontline sees configured destinations only (or single auto-default when exactly one active route exists).  
- Server validates route; foreign / cross-facility / disabled-Plant destinations fail closed.  
- Do **not** assume Plant is always responsible.  
- Do **not** build a workflow/rules engine.  
- Reroute appends history; never rewrites origin requesting department / reporter / original location / original asset.

---

## Assignment Model Decision

| Concern | Owner |
|---------|-------|
| Who covers floors / zones / windows | `OperationalAssignment` (+ locations / zones) |
| Who owns this repair ticket | `Repair.assignedEmployeeId` |

A Work Order may be assigned to an eligible Plant Employee outside their usual zone when authorized without rewriting their Assignment.

---

## Offline Boundary Decision

**Phase 12A offline Plant Runtime is read-context first.**

Offline bundle (Technician-scoped when Plant enabled) may include:

- Operational Assignment + assigned locations  
- Assigned open Work Orders (identity, title/summary, Asset, location, priority, status)  
- Procedure content where safely cacheable  
- One-off / Work Plan work  
- Bundle revision + last synchronized time  

**Offline Work Order mutations are NOT implemented in Phase 12A** (START / NOTE / COMPLETE would require new command types, authority, conflict, and history semantics that materially expand scope). Work Orders remain **read-only offline**. Offline Asset Issue / Request creation may reuse certified command patterns where already safe; never pretend pending work reached the server.

No offline Vendor management, rerouting, or return-to-service.

---

## Feature Activation

| Flag | Default | Role |
|------|---------|------|
| `PLANT_OPERATIONS_ENABLED` | **false** | Plant Build / Runtime / Supervisor / routing / offline Plant context |
| `OPERATION_ENGINE_ENABLED` | false | Must stay off |
| `TASK_SYNC_ENABLED` | false | Must stay off |

Dietary and EVS remain independently gated. Plant activation does not flip Dietary/EVS flags.

---

## Authority Summary

| Actor | May |
|-------|-----|
| Dietary / EVS STAFF (requester) | Report request; view own/scoped requester-visible status |
| Plant STAFF / Technician | Own Runtime; assigned WOs; certified technician actions; Plant Work/Evidence; no Build / global Vendor |
| Plant SUPERVISOR | Triage; assign technician; create/update WOs; one-off work; Asset Issue workflows; scoped history |
| Plant MANAGER / GM-equivalent | Build; Vendors; Assets (policy); Work Plans / Procedures / Templates; routing; full scoped history; return to service |
| FA alone | Denied without applicable Plant operational relationship |
| Quick PIN | Eligible frontline Runtime only; no Build / Supervisor escalation |

Cross-Facility and cross-Department substitution fail closed.

---

## Retained findings (unchanged)

1. Projected Unit Workspace does not have classic Asset-panel parity.  
2. Arbitrary foreign Vendor IDs are service / SQL rejected while the normal selector is Facility scoped.

Do not create unrelated work merely to close these.

---

## Explicit non-goals (Phase 12A)

Full CMMS; preventive-maintenance scheduling engine; parts inventory; storeroom; POs / procurement / AP; capital / depreciation; Vendor portal / login; technician GPS / route optimization; BAS / IoT; automatic diagnosis / AI suggestions; automatic WO generation or technician Assignment; clinical equipment / medical device compliance; resident / PHI; hosted deployment; production launch; real Terrace View Employee data.

---

## Implementation may proceed

Ownership decisions above are authoritative for Phase 12A. Schema and product work must follow this document.
