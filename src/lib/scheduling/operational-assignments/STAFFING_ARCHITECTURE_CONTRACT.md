# Staffing Architecture Contract (RUN staffing reconciliation)

This module codifies the canonical semantics for the LTC Manager staffing system.

## ScheduleEntry (RUN: shift presence)

**Meaning:** date-specific employee working / presence.

**Canonical questions answered:**
- “Is this employee working today, and when?”

**Transitional implementation notes:**
- `ScheduleEntry` may still contain legacy/transitional fields such as:
  - unit placement
  - meal `ShiftType`
  - platform `roleType` (historical)
- **Do not treat** platform `RoleKey` as the canonical operational identity.

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

## Department Job Role (BUILD operational identity; not daily location)

**Meaning:** enduring BUILD operational role + capabilities package.

**Not:** a daily location assignment model.

## Coverage (derived RUN interpretation; not a new truth table)

**Meaning:** whether expected staffing is covered.

**Rule:** Coverage is computed from:
- present people (Daily responsibility / Schedule presence, per transition rules)
- expected staffing requirements (where defined by OA templates)
- derived attribution (e.g., presentStaffingFact(assigned, expected))

**Do not:** persist `covered = true` as additional truth.

## Transition rule: ScheduleEntry fallback

During migration, Daily responsibility truth may be incomplete.

- Prefer OA-derived daily responsibility where local OA data exists.
- Fallback to `ScheduleEntry` staffing count where local OA data is absent.

This is a local-grain rule: OA data in one location must not suppress ScheduleEntry fallback in another location.

