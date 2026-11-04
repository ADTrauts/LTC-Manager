# Scheduling Architecture Contract (RUN Staffing Phase 2)

This document codifies canonical shift/scheduling semantics for LTC Manager.
It is the authoritative reference for RUN scheduling decisions going forward.

---

## ScheduleEntry — Field Classification

| Field         | Classification | Notes |
|---------------|----------------|-------|
| `id`          | A – canonical Shift fact | Primary key |
| `employeeId`  | A – canonical Shift fact | Who is working |
| `date`        | A – canonical Shift fact | Service date (facility timezone) |
| `plannedStart`| A – canonical Shift fact | Clock-time start (string HH:MM, legacy) |
| `plannedEnd`  | A – canonical Shift fact | Clock-time end (string HH:MM, legacy) |
| `departmentId`| A – canonical Shift fact | **Added in migration 81**; owner Department |
| `workShiftId` | A – canonical (optional) | Link to reusable BUILD WorkShift pattern |
| `shift`       | D – stored meal-slot label | BREAKFAST/LUNCH/DINNER/FULL_DAY for older presence views. Not placement. |
| `createdById` | D – audit | Who created the row |

`unitId` and `roleType` were removed in `20261104200000_retire_duplicate_workforce_roles`. A shift does not store where someone works or a platform role. Placement is `OperationalAssignment`. Authority is `Employee.roleType` and the facility role period.

### Classification legend
- **A**: Canonical Shift fact — keep and evolve.
- **B**: Legacy assignment fact — tolerate on existing rows; stop requiring for new canonical Shifts.
- **C**: Platform authority leakage — do not use for operational identity; keep for schema compatibility only.
- **D**: Compatibility-only — retain for historical reads; do not drive new behavior.

---

## Canonical Shift Definition

A **Shift** answers:

> Is this employee working, for which Department, and when?

Fields:
- `employeeId`
- `departmentId` ← now explicit
- service `date` (facility timezone)
- `plannedStart` / `plannedEnd` (actual clock times, HH:MM)
- optional `workShiftId` link

A Shift does **not** say:
- what Unit they work in (`OperationalAssignment`)
- what they are responsible for (`OperationalAssignment`)
- their platform authority (`Employee.roleType` and the facility role period)
- their operational role (`EmployeeOperationalRoleQualification` and the assignment snapshot)

The schedule shows the Employee name, Job Title, primary Team, Department, and the scheduled time.

---

## Department Ownership

**Problem:** ScheduleEntry has no direct `departmentId`. Department was inferred from `unitId` (via `UnitSpaceResponsibility`) — ambiguous, imprecise.

**Decision:** Add `departmentId` (nullable) to `ScheduleEntry` via migration 81.

**Backfill strategy:**
- Existing rows retain `null` departmentId (they remain legible as legacy).
- New Shift creation always requires explicit Department.
- Legacy consumers that don't know the department continue reading from `unitId`-derived context.

**Why nullable:** backfilling ambiguous historical rows safely is not possible without per-row analysis. Nullable transition is safer.

---

## ShiftType Disposition

`ShiftType` (BREAKFAST / LUNCH / DINNER / FULL_DAY) is **demoted from primary Shift semantics**.

### Current use
- **Servery scheduling:** one employee per meal slot (canonical legacy use — preserved).
- **Coverage list:** `missingShifts` gap detection for SERVERY units.
- **Call-down list:** meal-type context.
- **Assignment board:** exposed as `scheduledShift` for display context.

### Target
- Meal period overlap should derive from `plannedStart/End × operational meal period time window`.
- `ShiftType` becomes a compatibility annotation or servery-specific slot identifier.
- Do **not** delete `ShiftType` — servery staffing still uses it actively.
- Do **not** create multiple ScheduleEntry rows per day solely because of meal slots for non-servery employees.

---

## Unit and role on the shift — removed

`ScheduleEntry.unitId` and `ScheduleEntry.roleType` were legacy placement and platform-role copies. Phase 7B dropped both columns. PIN login uses `primaryUnitId` and `EmployeeUnitAccess`. Call-off labels name the shift, not a unit. The coverage list does not place a person on a unit from a shift. Today's place and operational role are the Assignment.

---

## WorkShift Disposition

`WorkShift` already exists as a BUILD-owned reusable shift pattern with:
- `name`
- `startLocal` / `endLocal`
- optional `departmentId`
- `isActive`

**WorkShift is BUILD. It is not a daily record.**

`ScheduleEntry.workShiftId` links a daily Shift to its template source (already exists, already nullable).

New Shifts created from WorkShift templates copy `startLocal`/`endLocal` into `plannedStart`/`plannedEnd`. Later WorkShift renames/changes do not mutate historical Shifts.

**No changes to WorkShift in this pass.** Its architecture is already correct.

---

## AssignmentOverride Disposition

`AssignmentOverride` currently:
- moves effective Unit placement for an employee on a given day/meal
- optionally links to a `ScheduleEntry`
- is used for "call-down" / coverage-override tracking

**It represents legacy Unit movement, not Daily Assignment responsibility.**

Daily Assignment responsibility changes belong to `OperationalAssignment`.

**Decision:**
- Preserve `AssignmentOverride` unchanged.
- Document it as **transitional** — covers legacy Unit movement semantics.
- Do not make it automatically create/mutate `OperationalAssignment`.
- Long-term direction: same-day responsibility changes belong to OA lifecycle; `AssignmentOverride` may eventually be retired, but not in this phase.

---

## Shift ↔ Daily Assignment Relationship

| State | Shift | OA |
|---|---|---|
| Scheduled + Assigned | ✅ | ✅ |
| Scheduled + Unassigned | ✅ | none |
| Assigned + Unscheduled | none | ✅ (valid: emergency coverage) |
| Neither | none | none |

**No automatic OA creation from Shift.**
**No DB foreign key added between ScheduleEntry and OperationalAssignment.**
Read-model only: see `EmployeeShiftProjection`.

---

## Transition Rule: ScheduleEntry Fallback

Phase 1 rule preserved:
- If meaningful OA local staffing truth exists → use OA staffing.
- Otherwise → ScheduleEntry fallback.

New Department-aware scheduling does not change this rule.

---

## OA Feature Flag Criteria

`OPERATIONAL_ASSIGNMENTS_ENABLED` should be considered for default-on when:
1. At least one Department has ≥1 active OA template configured.
2. All critical Today's Work paths have been validated with OA enabled.
3. No runtime exceptions in the last N deployment cycles with flag on.

Still not flipped by default in this phase. Phase 2 completes the prerequisite groundwork.
