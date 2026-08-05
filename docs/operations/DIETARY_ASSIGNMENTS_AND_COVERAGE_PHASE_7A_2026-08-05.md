# Dietary Assignments and Coverage — Phase 7A

**Date:** 2026-08-05  
**Branch:** `pilot/dietary-assignments-coverage-phase-7a-2026-08-05`  
**Integration base:** `pilot/dietary-v1-integration-2026-08-05` @ Phase 6A closeout  

## Scope

Make Dietary daily Assignments operational for the first pilot:

Staffing Availability → Supervisor Daily Assignment Board → Employees Assigned to Units and Responsibility Windows → Coverage Gaps Identified → Supervisor Confirms → Employees See Current Assignment → GM Sees Facility Coverage Status → Changes Remain Auditable.

This phase does **not** implement:

- Automatic scheduling
- Automatic Assignment generation / suggestions as product workflow
- Job Flow
- Operations Engine
- Supervisor Coverage as a generalized engine
- Offline Assignment editing
- Payroll or timekeeping
- Split-task optimization
- EVS Assignments

## Schedule versus Assignment

| Concept | Meaning |
|---------|---------|
| **Schedule** | Who is expected to work and during what hours (`ScheduleEntry` / staffing grid). |
| **Assignment** | Where the Employee is responsible during a specific operational window (`OperationalAssignment`). |

An Employee may be scheduled but not yet assigned. An unscheduled Employee may cover with an explicit source and reason.

## Assignment-plan states

`OperationalAssignmentPlan` per Facility + Department + operational date:

| Status | Meaning |
|--------|---------|
| `DRAFT` | Supervisors may edit. Not frontline-visible. |
| `CONFIRMED` | Official frontline plan. Employees see Assignments. |
| `REOPENED` | Confirmed plan reopened for material changes (reason required). |
| `CLOSED` | Operational day formally closed; records retained. |

Confirmation records actor and time. Coverage risks may remain at confirmation when acknowledged.

## Responsibility windows

Each Assignment may carry `startsAt` / `endsAt` parsed in **Facility local time** against the operational date (not browser timezone).

Rules:

- Start must precede end
- Sequential Assignments for one Employee are allowed
- Overlapping active Assignments for one Employee are rejected at write time
- Two Employees may share a Unit

## Staffing availability

The Assignment Board builds from scheduled staffing plus call-down state:

- Scheduled Employees appear in the pool
- Called-off Employees remain visible but unavailable
- Call-off does **not** erase Assignment history
- Unscheduled coverage requires source + reason
- Terminated Employees cannot receive new Assignments
- `EmployeeStatus.OFF` means off-shift, not deactivated

## Call-off behavior

Call-offs continue to use `AssignmentOverride` / call-down projections. They create coverage risk (`AT_RISK` / uncovered requirement) without deleting prior Operational Assignments. Replacement uses `CALL_OFF_REPLACEMENT` (or coverage modes) with a reason.

## Coverage requirements

Reuse `OperationalAssignmentTemplate` / template items (`requiredCount`, Unit, role) with effective dating (`effectiveFrom` / `effectiveTo`). Runtime uses currently effective published requirements. Department Build owns configuration.

## Coverage states

Canonical vocabulary (do not use “Blocked”):

- **COVERED** — Confirmed-eligible Assignments meet requirement
- **AT_RISK** — Coverage exists with unresolved concern (partial, call-off, near-gap)
- **UNCOVERED** — Below requirement after confirm path
- **NOT_YET_ASSIGNED** — Draft / no Assignment entered
- **NOT_CONFIRMED** — Data exists but plan not confirmed
- **NOT_APPLICABLE** — No requirement applies

Coverage is operational staffing risk, not proof of meal-service success.

## Authority

| Role | View own | View Department | Create/Change | Confirm | Reopen | Override |
|------|----------|-----------------|---------------|---------|--------|----------|
| STAFF / LEAD_TEAM_MEMBER | Yes (confirmed) | No | No | No | No | No |
| SUPERVISOR | Yes | Yes (scope) | Yes | Yes | Yes | Yes |
| MANAGER / GM | Yes | Yes (scope) | Yes | Yes | Yes | Yes |
| Facility Administrator alone | Own only | No* | No* | No* | No* | No* |

\* FA requires an operational Dietary department relationship (`primaryDepartmentId`) in addition to the administrative role.

Authentication method (password vs Quick PIN) does not escalate Assignment management. Quick PIN remains frontline under Phase 1 policy.

## Confirmation and overrides

- Confirm publishes the current Assignments to employees
- Reopen requires a reason
- Post-confirmation edits require a reason and append history
- Plans cannot confirm with hard overlap errors
- Uncovered requirements require acknowledgment, not automatic prohibition

## History

`OperationalAssignmentEvent` is append-only. Plan-level events may omit `assignmentId` and set `planId` (`PLAN_CONFIRMED`, `PLAN_REOPENED`, `COVERAGE_ACKNOWLEDGED`, …). Events retain actor, role, auth method, prior/new values, and reason where required. No raw session tokens.

## Employee Runtime view

Employees see confirmed Unit/duty/window (and next sequential Assignment when present). Draft plans are hidden. Neutral language when unconfirmed: “Assignment not confirmed. Check with your Supervisor.”

## GM and Supervisor views

- **Assignment Board** (`/staffing/assignments`) — prepare, cover, confirm, reopen
- **Today → Coverage** — Dietary coverage summary with links to the board
- Coverage cards do not claim operational meal success from staffing alone

## Offline read-only Assignment context

When `OPERATIONAL_ASSIGNMENTS_ENABLED=true`, the offline Runtime bundle may include `assignmentContext` for the **current actor only**. Display is read-only. No offline Assignment writes. User change and Unit rebind isolation from Phase 6A remain intact.

## Feature activation

```bash
OPERATIONAL_ASSIGNMENTS_ENABLED=true
```

Defaults **false**. Disabled UI redirects `/staffing/assignments` → `/staffing`. Server Actions refuse writes when disabled. Do **not** set `OPERATION_ENGINE_ENABLED` as a side effect.

Seed does not silently activate Assignments for every Facility.

## Known limitations / Phase 7B boundary

- No automatic scheduling or Assignment suggestions as the pilot path
- No generalized Supervisor Coverage engine
- No offline Assignment editing
- Floor grouping uses Unit hierarchy when present; otherwise Unit name grouping
- Call-off → OA automatic replacement is still supervisor-driven
- Projection Unit Workspace controls remain out of scope
- Production deployment is out of scope for this certification

## Supervisor operating note

1. **Prepare** — Open Assignment Board for the operational date; assign scheduled Employees to Units and windows.
2. **Call-offs** — Called-off Employees stay visible; replace with coverage + reason; history is preserved.
3. **Confirm** — Review coverage chips; acknowledge remaining risks if needed; Confirm plan.
4. **Reopen** — Enter a reason; edit; re-confirm when ready.
5. **Urgent override** — After confirmation, edit or reassign with a reason; audit event is appended.
6. **Coverage statuses** — Covered / At Risk / Uncovered describe staffing risk only—not meal timing.
