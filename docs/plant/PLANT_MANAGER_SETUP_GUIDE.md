# Plant Manager Setup Guide

**Phase:** 12A — Plant Operations Reference  
**Audience:** Plant Manager / GM-equivalent with Plant operational authority  
**Companion:** [`PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md`](./PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md)

---

## Before you begin

1. Confirm Facility Builder has Floors, Units/Neighborhoods, and Spaces as needed.  
2. Confirm **Plant** Department exists and is active.  
3. Confirm Plant location responsibilities cover Units Plant operates (Department Builder).  
4. Apply migration **72** (`20260807140000_plant_operations_reference_phase_12a`) on a disposable DB.  
5. Local activation:

```
PLANT_OPERATIONS_ENABLED=true
OPERATION_ENGINE_ENABLED=false
TASK_SYNC_ENABLED=false
```

6. Select **Plant** as the active Department in the app shell for Plant Staffing / Operations.

Enabling Plant does **not** turn on Dietary or EVS flags, Operations Engine, or Task sync.

---

## 1. Enable the flag locally

Set `PLANT_OPERATIONS_ENABLED=true` in the env used by `npm run dev` / verify runners. Restart the Next server after changing flags so server bundles pick up the value.

Confirm:

- Plant appears in staffing operational department resolution.  
- With flag **off**, routing a request to Plant fails closed and Plant Job Flow / Asset Ops for Plant stay disabled.

---

## 2. Department Builder — locations

Open Department Builder for Plant.

- Attach Unit (and Space, where used) responsibilities Plant owns or supports.  
- Moving a Unit between Departments does not rewrite historical Requests / Repairs / Evidence.  
- Zones (if used) are convenience groupings for Assignments — not a substitute for WO assignee.

---

## 3. Employees and roles

Ensure Plant Employees exist with appropriate roles:

| Role | Typical Plant use |
|------|-------------------|
| STAFF / Lead | Technician Runtime; assigned WO actions (password); report |
| SUPERVISOR | Triage queue; create/update WOs; one-offs |
| MANAGER / GM | Routes, Vendors, Assets policy, Work Plans / Procedures, RTS |

Facility Administrator alone does **not** get Plant authority unless primary department is Plant.

Quick PIN is frontline-only — not for Build, triage, Vendor, or return-to-service.

---

## 4. Routing Dietary / EVS → Plant

Cross-department reporting requires active `DepartmentRequestRoute` rows:

- requesting = Dietary (or EVS) department id  
- responsible = Plant department id  
- same facility; `isActive: true`

**Phase 12A:** Manager-authorized `upsertRequestRoute` / `upsertRequestRouteAction` plus **Request routing** panel on `/staffing/operations` when Plant is the active department (`data-testid="plant-request-routing-panel"`). Synthetic pilot also seeds Dietary→Plant and EVS→Plant via fixtures.

Without an active route, Report a Problem shows no destinations (or rejects unauthorized destinations server-side). Plant is never assumed responsible.

Do **not** silently route all AssetIssues to Plant.

---

## 5. Assets

Use shared Assets (`/assets`) for Plant equipment.

- Register Facility-scoped Assets on Units Plant cares about.  
- Out-of-service / degraded status is authoritative on the Asset row.  
- Asset Issues remain Asset-required (separate from OperationalRequest).  
- Completing a Work Order does **not** return an Asset to service.

---

## 6. Work Plans

Open **Staffing → Work Plans** with Plant active.

- Plant has **no** built-in Work Plan presets in Phase 12A — create blank Draft plans as needed.  
- Publish only after review. Draft Work never appears to Employees.  
- Work Plans are routine / one-off operational work — **not** Work Orders. No auto-WO from plans.

---

## 7. Procedures

Open Knowledge / Procedures.

- Create Plant Procedures (lockout guidance, filter change, etc.) as `KnowledgeArticle` content.  
- Link to Work Items when useful.  
- **Viewing a Procedure never completes a Work Order or Work item.**

---

## 8. Vendors

Assets → Vendors (Facility scoped).

- Manager Plant authority required. STAFF cannot manage Vendors.  
- Attach Vendor on a Work Order only with a Vendor that belongs to this Facility.  
- Foreign Vendor IDs fail at the service boundary even if someone tampers with the client.

---

## 9. Return to service

After repair work is done:

1. Technician / Supervisor completes the Work Order (Repair → COMPLETED).  
2. Request may still be open — close / resolve Request separately if appropriate.  
3. Manager explicitly **returns Asset to service** (`returnAssetToService`) — writes Asset status + history.

Complete ≠ RTS. Ready-for-RTS flags on a WO do not mutate Asset status by themselves.

---

## 10. Verify Runtime

With routes, Plant Employees, and at least one Asset:

- Dietary/EVS Staff → Unit Workspace → **Report a Problem** → destination Plant.  
- Plant Supervisor/Manager → **Staffing → Operations** → Plant triage panel.  
- Acknowledge / Triage → **Create Work Order** (explicit).  
- Technician acts online on assigned WO (service actions).  
- Manager RTS when Asset should be operational again.  
- Requester sees limited status only (no private triage / vendor internals).

Offline Plant WO context is **read-only** — do not expect offline START/COMPLETE.

---

## Important limits

- Not a full CMMS / PM engine / parts / purchasing product.  
- No Vendor portal.  
- No automatic Work Order or Assignment generation.  
- Browser CI covers a subset of flows; treat SQL/hermetic proofs as first-class for ownership invariants.
