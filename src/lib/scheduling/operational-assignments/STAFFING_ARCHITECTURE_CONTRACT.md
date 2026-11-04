# Staffing Architecture Contract (RUN staffing reconciliation)

This module codifies the canonical semantics for the LTC Manager staffing system.

## ScheduleEntry (RUN: shift presence)

**Meaning:** date-specific employee working / presence.

**Canonical questions answered:**
- “Is this employee working today, and when?”

**Not on the shift:** unit, platform `RoleKey`, or an operational role. The stored meal-slot label (`shift`) remains for older presence views. Identity shown beside the time is Job Title and primary Team.

## OperationalAssignment (RUN: daily responsibility)

**Meaning:** date-specific operational responsibility (who owns what responsibility surface today).

**Canonical questions answered:**
- “What is this employee responsible for today?”

**Expected fields / contract:**
- employee
- Department (enduring organizational context for the responsibility)
- service date
- optional time window (if applicable)
- what operational scope they own today
- provenance (manual/template/plan/etc.)
- optional daily-function override only when truly needed

## Team (BUILD home; not daily responsibility)

**Meaning:** enduring BUILD organizational home and viewer scope.

**Not:** a daily assignment truth table.

## Operational eligibility (Employee Builder; not daily location)

**Meaning:** `EmployeeOperationalRoleQualification` for one `OPERATIONAL_ROLE_REGISTRY` key in one Department.

**Not:** a permission catalog, a Team child, a Job Title, or RoleKey. Department Job Role and its capability keys are removed. An assignment exception records one authorization and does not create a qualification.

## Coverage (derived RUN interpretation; not a new truth table)

**Meaning:** whether expected staffing is covered.

**Rule:** Coverage is computed from:
- present people (Daily responsibility / Schedule presence, per transition rules)
- expected staffing requirements (where defined by OA templates)
- derived attribution (e.g., presentStaffingFact(assigned, expected))

**Do not:** persist `covered = true` as additional truth.

## Shift and Assignment stay separate

A shift is presence in time. It does not fill a location slot. Coverage of a place uses the Assignment and the coverage template. Do not restore `ScheduleEntry.unitId` as a fallback placement.

