# Dietary Supervisor Operations Board — Guide

Phase 9B adds a Dietary **Operations Board** that combines Assignments, Operational Cycles, meal readiness, coverage, and offline conflict signals into one exception-first surface.

It coordinates existing workflows. It does not replace the Assignment Board, Cycle overview, or Unit Workspace.

## Before you start

1. Enable:
   - `DIETARY_OPERATIONAL_CYCLES_ENABLED=true`
   - `DIETARY_JOB_FLOW_ENABLED=true`
   - `OPERATIONAL_ASSIGNMENTS_ENABLED=true`
   - Keep `OPERATION_ENGINE_ENABLED` off.
2. Sign in with a **Supervisor+ password** session (Quick PIN cannot open the board).
3. Dietary Managers must publish Operational Cycles; meal times must exist on Units.

## Open the board

**Staffing → Operations Board** (`/staffing/operations`).

You should see:

- Current and next Operational Cycle
- Assignment plan status
- Summary chips (scheduled, assigned, unassigned, call-offs, coverage, Ready / Started counts)
- Exception groups
- Expandable **View all Units**

## Working exceptions

Exception groups appear in this order:

1. **Staffing** — call-offs, unassigned scheduled Employees  
2. **Coverage** — At Risk / Uncovered Units  
3. **Readiness** — Ready Not Confirmed  
4. **Service timing** — Started late / Started without Ready  
5. **Offline / sync** — pending conflicts  
6. **Configuration** — missing cycle configuration  

Each row links to a certified source action (Assignment Board, Unit Workspace, or Department Builder). Use those tools to fix the underlying fact — the board does not offer “fix everything” shortcuts.

## Reading Ready / Started / Not Confirmed

- **Ready Not Confirmed** and **Not Confirmed** mean evidence is missing, not that service never occurred.
- **Started Late** is a timing confirmation relative to the Unit meal target / cycle — investigate with Milestone history when needed.
- Employees see the same neutral language on Job Flow.

## Authority

- STAFF and LEAD cannot open the Operations Board.
- Facility Administrator role alone is denied; Dietary `primaryDepartmentId` is required for FA.
- Quick PIN never grants board access.

## What Phase 9B does not do

- Automatic task generation or full checklists
- Unified Logs / Inspections
- Operations Engine
- Automatic scheduling or automatic Assignment generation
- Offline Assignment editing
- A generalized multi-department Supervisor platform
