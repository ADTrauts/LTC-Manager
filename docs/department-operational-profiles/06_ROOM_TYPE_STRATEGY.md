# 06 — Room Type Strategy

## Decision

Keep **physical room classification** and **department operational room archetypes** separate.

Do not turn the Facility Builder's `SpaceType` into a universal operational template. Do not add one global operational Room Type shared by all departments.

## Two classifications with different owners

### Physical room classification

Owned by Facility Builder.

It describes what the space physically is:

- Service Area
- Patient/Resident Room
- Production Area
- Storage
- Utility
- Office
- Restroom
- Mechanical
- Public Area
- Other

It supports physical organization, suggestions, icons, and validation. It does not activate product Experiences.

### Department Room Archetype

Owned by the Department Operational Profile.

It describes how one Department operates in the Room:

- Dietary Servery
- EVS Food Service Area
- Plant Equipment Area

The archetype activates the Department's configured Experiences.

## Why one global operational type fails

For one physical Servery:

- Dietary sees a service-delivery room.
- EVS sees a cleanable food-service area.
- Plant sees a maintainable equipment area.

No single operational type can represent all three without containing every Experience and forcing projection to filter them again.

Department-scoped archetypes preserve one physical Room while allowing multiple legitimate operational interpretations.

## Default mapping strategy

Physical type may **suggest** a department archetype:

```text
Physical SERVICE_AREA
  Dietary suggestion: Servery or Dining Service Area
  EVS suggestion: Food Service Area or Public Area
  Plant suggestion: General Maintainable Space

Physical PATIENT_ROOM
  EVS suggestion: Resident Room
  Plant suggestion: General Maintainable Space

Physical MECHANICAL
  Plant suggestion: Mechanical Room
  EVS suggestion: Utility/Technical Area if assigned
```

Suggestions are setup aids. They are not runtime inheritance and never assign a Department.

## Defaults and inheritance

Use three controlled layers:

```text
System archetype baseline
  → Facility Department archetype
      → Room binding with sparse exception
```

### System baseline

Curated by LTC Manager. Provides safe defaults for common department families.

### Facility Department archetype

Adopted and configured by the facility. This is the active source for all rooms referencing it.

### Room binding

Selects one archetype for one assigned Department. It inherits the archetype's active Experiences by reference.

### Room exception

Records a justified difference. It does not fork the entire archetype.

## Facility customization

Facilities should be able to:

- choose among approved baseline archetypes;
- rename a local archetype label;
- add a custom archetype for the Department;
- enable or disable eligible Experiences at archetype level;
- configure Experience parameters;
- set default physical-type suggestions;
- define controlled room exceptions.

Facilities should not be able to:

- change physical Room identity from Department Administration;
- assign a Department from an operational profile;
- select Experiences in Facility Builder;
- attach another Department's restricted Experience;
- create arbitrary executable Experience IDs;
- silently alter every profile when a system baseline changes.

## Custom archetypes

Custom archetypes are valid because facilities differ. They must still:

- belong to one Department profile;
- use Experiences eligible for that Department;
- have a stable local identity;
- declare intended physical applicability;
- pass profile certification;
- remain distinct from physical `SpaceType`.

“Custom” must not mean an ungoverned raw capability bag.

## Archetype selection rules

1. A Room must already be assigned to the Department.
2. A Room has at most one active archetype per Department profile.
3. Different Departments may select different archetypes for the same Room.
4. An archetype can apply to many Rooms.
5. Room exceptions are sparse overlays.
6. Removing a Department assignment invalidates, but does not transfer, its operational binding.
7. Physical relocation of a Room preserves its Department archetype unless governance explicitly requires review.

## Plant facility-wide strategy

Plant's broad responsibility is a scope policy, not a physical assignment duplicated onto every Room and not a universal room type.

Conceptually:

```text
Plant policy identifies eligible placed Rooms
Plant profile maps them to:
  Mechanical Room
  Equipment Area
  Utility Area
  General Maintainable Space
Plant archetypes determine Experiences
```

Where no explicit Plant archetype selection exists, a certified facility default may resolve `General Maintainable Space`. That default belongs to Plant Department Administration, not Facility Builder or Projection.

## Terminology

Use:

- **Physical Room Type** for Facility Builder classification.
- **Department Room Archetype** for operational templates.

Avoid calling both “Room Type” in architecture and administration because the shared name conceals different ownership.
