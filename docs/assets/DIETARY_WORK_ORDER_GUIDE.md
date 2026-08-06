# Dietary Work Order Guide

**Phase:** 10A — Dietary Asset Operations  
**Audience:** Supervisors (where policy allows) and Managers / GMs  
**Flag:** `DIETARY_ASSET_OPERATIONS_ENABLED=true`

## Issue vs Work Order

| | Asset Issue | Work Order (`Repair`) |
|--|-------------|------------------------|
| Owns | Reported problem / condition | Response / work performed |
| Created by | Frontline report or Supervisor | Supervisor / Manager from Issue or directly |
| Closes when | Explicit resolve / close | Explicit complete / cancel |

They remain separate rows. Completing a Work Order does **not** close the Issue or return the Asset to service.

## Create from an Issue

1. Open the Asset Issue.  
2. Acknowledge and triage (priority, impact, factual note).  
3. Optionally update Asset status (e.g. Degraded / Out of service).  
4. **Create Work Order** — links `AssetIssue.workOrderId` without merging records.  

## Lifecycle

Suggested states:

- Open → Assigned → In progress  
- Waiting on parts / Waiting on vendor / On hold  
- Completed or Cancelled  

Legacy `CLOSED` / `WAITING_PARTS` values remain for older rows.

## Vendor and responsible party

- Assign a Facility-scoped Vendor when needed. Foreign Vendor IDs fail safely.  
- Assign responsible Department / Employee where existing policy allows.  
- Unassigned queue is allowed.  
- No Plant Operations Department workflow and no Vendor portal in Phase 10A.

## Completion and return to service

1. Record work performed and resolution.  
2. Mark Work Order **Completed**.  
3. Optionally mark return-to-service ready on the WO (informational).  
4. **Explicitly** set Asset status to **Operational** on the Asset (reason: return to service).  

Never infer safety solely from Work Order completion or a later good Evidence reading.

## Authority reminders

- STAFF cannot manage Work Orders.  
- Quick PIN does not grant Work Order authority.  
- Facility Administrator alone (without Dietary operational relationship) is denied.  
- Cross-Facility / cross-Department identifiers fail safely.
