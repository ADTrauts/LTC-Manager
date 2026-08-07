# Plant Technician Guide

**Phase:** 12A — Plant Operations Reference  
**Audience:** Plant Staff / Lead technicians using Unit Job Flow (password preferred for WO actions)  
**Companion:** [`PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md`](./PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md)

---

## Sign in

- Use password session for Work Order actions.  
- **Quick PIN** can reach frontline Runtime / report paths but does **not** grant Work Order manage, Build, Supervisor triage, Vendor, or return-to-service.  
- You land on Unit **Job Flow** for Plant — not Department Builder, not route config.

---

## Job Flow emphasis

Plant Job Flow reuses the shared shell and **skips Dietary meal/servery milestones**.

What matters first:

| Question | Where it appears |
|----------|------------------|
| Which Work Orders are assigned to me? | Attention / assigned WO signals; offline bundle lists assigned open WOs (read-only) |
| Where am I covering today? | Assignment / location scope (coverage — not the same as WO assignee) |
| What routine Work is due? | Work requirements from published Work Plans / one-offs |
| Which Procedure helps? | Procedure link on the Work item |
| Urgent Plant requests? | Attention when urgent requests sit in the Plant queue |

Job Flow attention may say that assigned Work Orders need attention or that urgent operational requests are in the Plant queue. That is a projection — it does not invent a separate Plant task engine.

---

## Assigned Work Orders

Ticket ownership lives on the **Work Order** (`Repair.assignedEmployeeId`).

Online technician actions (authorized when you are the assignee, Plant department, password):

- **START** → In progress  
- **NOTE** (optional requester-visible when explicitly marked)  
- **WAITING_PARTS** / **WAITING_ON_VENDOR**  
- **COMPLETE** (with work performed / resolution as required by the action)  
- **FOLLOW_UP** flag when needed  

These are exposed as server actions (`technicianWorkOrderAction`). Phase 12A does not add a large dedicated technician WO board UI beyond Job Flow attention, Supervisor WO counts, and existing Asset Work Order listings.

---

## Coverage vs assignee

| Concept | Meaning |
|---------|---------|
| Assignment coverage | Floors / Units / Spaces you are responsible for on a window (`OperationalAssignment`) |
| WO assignee | The Employee named on that Repair ticket |

You can be covering a zone without owning every WO there. A Supervisor may assign a WO to you outside your usual zone without rewriting your Assignment.

---

## Procedures

Open the Procedure when you need guidance.

**Viewing a Procedure ≠ completing Work and ≠ completing a Work Order.**

---

## Notes

- Internal notes stay private unless marked requester-visible.  
- Requesters in Dietary/EVS do not see private triage notes or Vendor internals.  
- Prefer clear, factual notes for anything marked visible to the requester.

---

## Waiting states

Use waiting statuses when work is blocked:

- Waiting on parts  
- Waiting on vendor  

Linked Requests may show matching requester-facing labels (Work in progress / Waiting on parts / Waiting on vendor). That sync does **not** close the Request.

---

## Complete ≠ return to service

When you **COMPLETE** a Work Order:

- The Repair is completed.  
- The Operational Request is **not** auto-closed.  
- The Asset is **not** returned to service.

Managers perform explicit return-to-service when the Asset should be operational again.

---

## Offline

If the tablet loses network:

- Plant offline bundle may include **read-only** assigned open Work Orders (`plantWorkOrderContext`: `readOnly: true`, `offlineMutationsSupported: false`).  
- You can review identity, title/summary, Asset, location, priority, status from the last sync.  
- **You cannot START / NOTE / COMPLETE Work Orders offline in Phase 12A.** There is no `START_WORK_ORDER` offline command.  
- Existing certified offline Work / Evidence patterns (where available for your department bundle) still apply; never assume a pending local WO action reached the server.

Reconnect and perform WO mutations online.

---

## What you cannot do

- Configure Dietary/EVS→Plant routes  
- Manage Vendors or Department Builder  
- Return Assets to service  
- Open Supervisor triage as management via Quick PIN  
- See other Departments’ private operational Work  

If Assignment or WO ownership looks wrong, tell your Supervisor.
