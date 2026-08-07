# EVS Supervisor Guide

**Phase:** 11B — EVS Reference Implementation  
**Audience:** EVS Supervisor with password session (Quick PIN does not grant Supervisor management)

---

## Open Operations

Select **EVS** as the active Department → **Staffing → Operations**.

The Board projects shared Assignment, Work, Evidence, Asset, and offline signals — it does not invent a separate EVS task system.

---

## Questions the Board answers

### Staffing

- Who is scheduled / assigned / unassigned?  
- Call-offs and coverage gaps by Unit  

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
| Filter by Floor / Unit | Zone model deferred — use Floor/Unit filters |
| Open Employee Work / Room | Source links into Runtime |
| Create one-off Work | Spill, extra service, rework, restock |
| Reassign occurrence | Does not change the Operational Assignment |
| Mark Not Required | Requires reason; preserves history |
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
