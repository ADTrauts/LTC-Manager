# 08 — Projection Impact

## Implementation remains stopped

The Location Projection Engine must not be implemented from the capability-based Stage 3A contract.

The engine boundary remains valid. Its operational input changes from raw room capabilities to resolved Department Operational Profiles.

## Previous model

```text
Physical hierarchy
+ Room responsibility capabilities
+ facility policy
+ department lens
+ user access
→ capability resolution
→ Experience registry interpretation
→ projection
```

This forced the engine to decide what a Department does.

## Revised model

```text
Physical hierarchy
+ Room-to-Department assignment
+ Department active Operational Profile
+ Department Room Archetype binding
+ resolved Experiences
+ certified scope policy
+ user access and authorization
→ projection
```

Department Administration decides what the Department does. Projection only derives where and how that already-defined model appears.

## Simplified engine responsibilities

### Physical eligibility

- Room is active and placed.
- structural ancestors are valid.
- staged and undesignated nodes are excluded.
- physical identity and vocabulary remain canonical.

### Department scope

- Room is assigned to the Department, or included by a certified department scope policy such as Plant facility-wide coverage.
- user/employee location access can only narrow scope.

### Profile resolution

- the Department has one active profile revision;
- the Room resolves to one Department Room Archetype;
- the archetype resolves to active Experiences;
- sparse room exceptions are applied;
- missing configuration produces diagnostics, not guessed behavior.

### Projection

- mark actionable nodes from resolved Experiences;
- retain physical ancestors as structural context;
- create Experience-specific data query scopes;
- contribute navigation, readiness, and work descriptors;
- preserve department ownership;
- compose facility mode from labeled department projections.

The engine no longer:

- interprets capability strings;
- maps mixed capability abstraction levels;
- decides which Experiences a Department should have;
- owns profile defaults;
- expands physical room types into operational modules;
- copies Plant grants into rooms.

## Revised conceptual contract

```text
Projection request
  Facility
  Department lens or Facility lens
  Principal access context
  Surface purpose

Projection source
  placed physical graph
  room-to-department assignments
  active Department Operational Profiles
  room archetype bindings and exceptions
  certified scope policies

Projection output
  actionable and structural locations
  resolved Experiences by location and Department
  Experience-specific domain query scopes
  readiness/work/navigation descriptors
  diagnostics and provenance
```

This is an architecture contract, not a code type.

## Query scopes

Each Experience owns the rule that converts its resolved activation into domain scope.

Examples:

- Meal Service scopes Dietary meal records to Servery rooms and their compatibility Unit links.
- Cleaning Logs scopes EVS records to EVS archetypes that include Cleaning Logs.
- Preventive Maintenance scopes Plant PM records through Plant archetypes and asset links.
- Knowledge scopes department-owned articles and applicable room associations.

Projection assembles those scopes; it does not invent them from a generic capability matrix.

## Navigation impact

Navigation asks:

```text
Which Experiences are resolved for this Department and principal?
Which destinations does each Experience contribute?
Which physical ancestors are needed for orientation?
```

Top-level route authorization remains separate. A navigation contribution never grants access.

## Readiness impact

Each Experience declares which readiness signals it can contribute. The Department Profile activates those Experiences; projection supplies the eligible Rooms; readiness evaluates current signals.

This eliminates Unit-type heuristics as the long-term source of department behavior.

```text
Profile says what should matter
Projection says where it matters
Readiness says current state
```

## Workspace impact

All operational homes consume the same resolved projection:

- Locations and Sidebar: projected physical tree.
- Room/Unit Workspace: local resolved Experiences.
- Today's Work: projected work and readiness ranked for supervision.
- Operations Center: projected exception and pulse aggregates.
- Business Workspace: projected manager signals and destinations.

Each surface keeps its own purpose and composition.

## Facility mode

Facility mode composes separately resolved Department projections:

```text
Room
  Dietary profile Experiences and state
  EVS profile Experiences and state
  Plant profile Experiences and state
```

It does not resolve one merged facility profile.

## Caching and revisions

Projection stability should conceptually depend on:

- physical hierarchy revision;
- Room-to-Department assignment revision;
- active Operational Profile revision;
- room archetype binding/exception revision;
- scope policy revision;
- principal access class.

Experience implementation and profile revisions become explicit invalidation boundaries. No implementation strategy is authorized here.

## Revised prerequisite order

Before Projection Engine implementation:

1. certify the Experience catalog;
2. certify Operational Profile semantics;
3. certify Department Room Archetypes and inheritance;
4. decide profile governance and active revision behavior;
5. design compatibility translation from capabilities;
6. then recertify the Projection Engine contract.

The previous Stage 3B implementation plan is paused until these prerequisites are complete.
