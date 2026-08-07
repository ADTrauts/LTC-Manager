# EVS Supervisor Guide

**Phase:** 11C — EVS Assignment Scope, Zones, and Scale  
**Audience:** EVS Supervisor with password session (Quick PIN does not grant Supervisor management)

---

## Open Operations

Select **EVS** as the active Department → **Staffing → Operations**.

The Board projects shared Assignment, Work, Evidence, Asset, and offline signals — it does not invent a separate EVS task system.

---

## Assignment Board (Room / Space responsibility)

Open **Staffing → Assignments**.

For EVS you can:

- Choose Employee, window, and Unit  
- Narrow to selected Rooms / Spaces (multi-select; Select all in view / Clear)  
- Optionally apply a **Zone** as create-time convenience (membership is snapshotted onto the Assignment)  
- See location coverage: Covered / At Risk / Unassigned / Overlapping  

Temporary coverage after a call-off: create a new Assignment with `CALL_OFF_REPLACEMENT` / coverage source and an explicit window. The original Assignment remains in history.

---

## Zones

Zones are named groupings (Floor 1 East, Public Areas). They help selection and filters.

Zones are **not** Assignments and do **not** grant authority. Editing Zone membership later does not rewrite existing Assignments.

---

## Questions the Board answers

### Staffing

- Who is scheduled / assigned / unassigned?  
- Call-offs and coverage gaps by Unit  

### Location coverage (Assignment — not Work completion)

- Locations Covered / At Risk / Unassigned / Overlapping  
- Filter by Floor, Unit, Zone, Employee  

### Current Work

- Locations due / in progress / complete  
- Past Due / Not Confirmed (neutral — not “Failed”)  
- Urgent and one-off Work  

### Quality / Inspection

- Needs Review  
- Rework Required  
- Reinspection is a **new** inspection — never silently rewrite the original  

### Offline

- Retry required / conflicts / stale devices when the server knows enough  

### Assets / Issues

- Out-of-service EVS-relevant Assets  
- Open equipment Issues  

### Configuration

- Location lacks Work Plan  
- Assignment ambiguity  
- Missing Procedure or Inspection configuration  

---

## Common actions

| Action | Notes |
|--------|-------|
| Filter by Floor / Unit / Zone / Employee | Zone is optional convenience |
| Assign Rooms / Spaces | Multi-select on Assignment Board |
| Temporary coverage | New Assignment + window; preserve history |
| Open Employee Work / Room | Source links into Runtime |
| Create one-off Work | Spill, extra service, rework, restock |
| Reassign occurrence | Does not change the Operational Assignment |
| Mark Not Required | Requires reason; preserves history |

---

## What not to expect

- No optimized walking routes  
- No automatic rebalancing when someone calls off  
- Zone membership is not security scope  
- Incomplete Work does not mark a Room “Uncovered” for Assignment coverage  

| Reopen | Prior completion remains historical |
| Record Inspection | Pass / Needs Attention + comments |
| Create rework after Needs Attention | Separate Work occurrence; original inspection unchanged |
| Report Asset Issue | Shared Asset system; not Plant WO management |

Use **source actions** only. Do not expect board-only shortcuts that bypass authority.

---

## Inspection + rework history rule

1. Record Needs Attention on the Inspection (Evidence preserved).  
2. Room/Space surfaces as Needs Review.  
3. Create **separate** rework (one-off Work).  
4. Employee completes rework.  
5. Original inspection stays Needs Attention until a **follow-up inspection** is recorded.

Never mutate Evidence to look “clean.”

---

## Log Book

Filter by Department = EVS, date, Floor/Unit, Room/Space, Work Plan, Template, status, Needs Attention, offline/sync. Historical rows keep original plan/template versions.

---

## Authority limits

- Quick PIN cannot perform Supervisor management.  
- Facility Administrator alone does not get EVS authority.  
- Cross-Facility / cross-Department IDs fail closed.  
- Named Supervisor zones are deferred — Floor/Unit filters are the Phase 11B scope.
