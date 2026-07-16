# 09 — Migration Plan

## Scope

This is a conceptual, non-breaking migration plan.

It proposes no schema, migration file, production code, feature flag, route change, UI implementation, or data mutation.

## Starting state

Today:

- Rooms explicitly assign Departments.
- The same responsibility rows carry capability arrays.
- Facility Builder presets preselect common capability combinations.
- Operational surfaces largely do not consume those capabilities yet.
- Stage 3A documentation proposed using capabilities as Projection Engine input.

This creates an opportunity to correct the boundary before capabilities become widely operational.

## Target state

```text
Room-to-Department assignment
  remains physical ownership truth

Department Operational Profile
  becomes operational truth

Department Room Archetype
  defines common room behavior

Experiences
  replace configurable capabilities

Projection Engine
  consumes resolved profiles
```

## Migration principles

1. Never break existing Room or Department identity.
2. Never change physical hierarchy to represent operational behavior.
3. Preserve existing capability data until verified translation is complete.
4. Translate one way from capabilities to proposed Experiences.
5. Require human review for ambiguous mappings.
6. Keep legacy Unit compatibility explicit.
7. Do not implement projection before profile semantics are certified.
8. Separate physical assignment migration from operational profile adoption.

## Phase 0 — Architecture certification

Approve:

- Experience as the canonical operational primitive;
- retirement of configurable capabilities;
- Department Operational Profile ownership;
- department-scoped Room Archetypes;
- inheritance and exception rules;
- revised Projection Engine boundary.

No application changes.

## Phase 1 — Catalog and mapping design

Define, as documentation:

- canonical Experience catalog;
- department eligibility;
- baseline archetypes for Dietary, EVS, and Plant;
- legacy capability-to-Experience mappings;
- ambiguous combinations requiring review;
- department-wide versus room-scoped Experiences;
- profile validation and governance rules.

No schema design yet.

## Phase 2 — Facility assessment

Produce a read-only inventory conceptually grouping:

- Room-to-Department assignments;
- current capability combinations;
- repeated combinations that suggest archetypes;
- empty capability rows;
- unknown keys;
- Plant policy coverage;
- Rooms with no Department;
- staged/undesignated Rooms;
- legacy Unit-only responsibilities.

This assessment must not mutate data.

## Phase 3 — Proposed profile generation

For each Facility Department:

1. choose the system department baseline;
2. infer proposed archetypes from repeated capability combinations and physical characteristics;
3. translate known keys to Experiences;
4. separate department-wide Experiences;
5. map assigned Rooms to proposed archetypes;
6. identify sparse exceptions;
7. mark ambiguous Rooms for review.

Generated profiles are proposals, not operational truth until certified.

## Phase 4 — Human review and certification

Department leadership and Facility Administration review:

- Experience sets;
- archetype names and intent;
- Room mappings;
- Plant broad-scope defaults;
- exceptions;
- unavailable dependencies;
- impact on visibility, readiness, navigation, and work.

Only an approved profile revision becomes active in the future implementation.

## Phase 5 — Shadow resolution

After an authorized implementation design exists, compare:

```text
legacy capability interpretation
versus
profile Experience resolution
```

Compare by Facility, Department, Room, Experience, and affected domain scope.

Classify differences:

- intended correction;
- profile configuration gap;
- compatibility gap;
- invalid legacy data;
- product-model gap.

Shadow resolution must not change rendered behavior.

## Phase 6 — Consumer adoption

Only after profile and projection contracts are recertified:

1. Locations and Sidebar;
2. Room/Unit Workspace by Experience;
3. readiness and Today's Work;
4. Operations Center;
5. Business Workspace and navigation contributions.

Each consumer uses the same active profile resolution. No consumer reads legacy capabilities as a separate policy once migrated.

## Phase 7 — Compatibility retirement

After all consumers and facilities are certified:

- stop using raw capability arrays for operational decisions;
- stop exposing capability editing;
- retain historical audit meaning as needed;
- remove compatibility translation in a later authorized wave;
- update prior projection documents from “capability source” to “profile Experience source.”

Deletion or schema cleanup is explicitly outside this architecture wave.

## Legacy mapping guidance

Illustrative mappings:

```text
MEAL_SERVICE      → Meal Service; possibly Meal Times after review
SERVICE_LOGS      → Meal Logs or department-specific Logs
FOOD_SAFETY       → Food Safety
CLEANING          → Department Cleaning or Cleaning Lists/Logs after review
ROOM_STATUS       → Room Status
ASSET_MANAGEMENT  → Equipment or Assets depending on Department
INSPECTIONS       → Inspections
REPAIRS           → Repairs; possibly Work Orders after review
KNOWLEDGE         → Knowledge; Manuals for Plant only after review
WORK_QUEUE        → no direct Experience; derived output
SERVICE_OPERATIONS→ no direct Experience; requires decomposition
BUILDING_MAINTENANCE
                  → Plant archetype review; may imply Assets, PM,
                    Repairs, Work Orders, and Manuals
```

No ambiguous key should automatically activate multiple high-impact Experiences without review.

## Rollback principle

Before cutover, legacy data remains available. After a future cutover, rollback means reselecting the last certified profile/consumer behavior, not recreating physical hierarchy or rewriting Room assignments.

## Migration exit criteria

- every active Facility Department has a certified profile;
- every assigned operational Room resolves an archetype or an approved pending state;
- all active Experiences are eligible and configured;
- ambiguous legacy mappings are resolved;
- Plant facility-wide behavior is certified;
- projection parity differences are accepted;
- direct-link and data-scope regressions pass;
- no operational consumer depends on raw capability arrays.
