# Plant Supervisor Guide

**Phase:** 12A — Plant Operations Reference  
**Audience:** Plant Supervisor with password session (Quick PIN does not grant triage / WO management)  
**Companion:** [`PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md`](./PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md)

---

## Open Operations

Select **Plant** as the active Department → **Staffing → Operations**.

Requires `PLANT_OPERATIONS_ENABLED=true`. The board projects shared Assignment / Work / Evidence / Asset signals plus **Plant request triage** (`plantOperations` / `PlantTriagePanel`).

---

## Triage queue

The Plant triage section shows requests where **responsible department = Plant**.

Summary counts include:

- New / untriaged / urgent requests  
- Open / in-progress / waiting vendor / waiting parts Work Orders  
- Overdue and unassigned WOs  
- Out-of-service Assets  

Select a request to see requesting department, location, status, and any linked WO code.

---

## Acknowledge

Use **Acknowledge** for `REPORTED` (or `REOPENED`) requests.

- Moves status to `ACKNOWLEDGED`.  
- Updates requester-visible status summary (“Received”).  
- Does **not** create a Work Order.

---

## Priority and triage

Use **Triage** to set internal triage note, adjust priority / impact, and move toward under review / monitoring as supported by the action.

- Internal triage notes are **not** requester-visible by default.  
- Optionally set a requester-visible status summary when you want the reporter to see a clearer public message.  
- Reroute (service) preserves requesting department, reporter, location, and original asset.

---

## Create Work Order (explicit)

Use **Create Work Order** only when Plant will perform repair work.

- Never automatic from Request or Asset Issue.  
- Optional technician assignee at create time (`ASSIGNED` vs `OPEN`).  
- Links `OperationalRequest.workOrderId` → `Repair`.  
- Button disables when a WO already exists on that request.

Completing that WO later does **not** auto-close the Request or return the Asset to service.

---

## Filters and exceptions

Use the shared Supervisor board filters (Floor / Unit / Employee / Zone where configured) for coverage and Work exceptions.

Plant-specific queue filters on the service layer support status, requesting department, and priority (`listPlantTriageQueue`). The triage panel itself is a practical Phase 12A surface — not a full CMMS filter studio.

Watch for:

- Unassigned WOs  
- Waiting vendor / parts  
- Urgent requests without a WO  
- OOS Assets that still need explicit RTS after repair  

---

## Exceptions you should expect

| Situation | Expected behavior |
|-----------|-------------------|
| Request resolved without repair | Resolve without WO (service) with reason — still no auto-WO |
| WO complete, Asset still OOS | Correct — Manager must RTS |
| WO complete, Request still open | Correct — close/resolve Request separately |
| Coverage gap on Assignment | Create/adjust Assignment — does not invent WO assignee |
| Dietary reports without route | Report form shows no Plant destination until Manager configures route |

---

## No auto-WO

Phase 12A will not:

- Auto-create a Work Order when a Request is reported  
- Auto-create a Work Order from an Asset Issue  
- Auto-assign a technician from zone coverage  
- Auto-close Requests when a WO completes  
- Auto-return Assets to service  

Triage is a human decision path.

---

## Authority limits

- Quick PIN cannot triage or manage WOs.  
- STAFF cannot triage or create WOs (unless separately acting only as assigned technician on their own WO with password).  
- Supervisor cannot configure request routes or manage Vendors / RTS (Manager).  
- FA alone without Plant primary department is denied.  
- Cross-facility IDs fail closed.

Use source actions only — the board does not bypass authority.

---

## Browser coverage note

CI browser gate checks that the operations board loads and that the triage panel appears when Plant is the active operational department. Full click-through of every triage → WO → complete path is **not** fully automated; SQL/hermetic tests own several ownership invariants.
