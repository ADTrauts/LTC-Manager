# 04 — Room Archetype Model

## The problem archetypes solve

A department behaves differently depending on the *kind* of room it is in. Dietary in a Servery does Meal Service, plating, and hot-well temperature checks. Dietary in a Dry Storage room does inventory and pest logs, but no plating. The physical room record cannot carry this — it is not Facility Builder's job to know that Dietary plates food in serveries.

A **Room Archetype** captures "how this department operates in this kind of room" without duplicating the physical room and without teaching Facility Builder anything operational.

## Two different notions of "room type" — keep them apart

There are two distinct concepts that are easy to conflate:

| Concept | Owner | Answers | Example |
|---|---|---|---|
| **Physical room classification** | Facility Builder | *What is this space?* | "Room 214 is a Resident Room." |
| **Department Room Archetype** | Department Administration | *How does my department operate in this kind of space?* | "Dietary treats resident rooms as a Tray Delivery archetype." |

Facility Builder owns the physical classification. It is objective and department-neutral. Department Administration owns the archetype. It is operational and department-specific.

The same physical room can map to different archetypes for different departments:

```text
Physical: Room 214 = Resident Room
  Dietary archetype:  Tray Delivery Point
  EVS archetype:      Occupied Resident Room (daily clean + turnover)
  Plant archetype:    Serviceable Space (reactive + PM)
```

## Definition

> A **Department Room Archetype** is a department-owned template describing how the department's Operational Areas and Experiences behave in a category of room.

Properties:

- Owned by Department Administration, part of the Operational Profile.
- Named operationally: Servery, Tray Delivery Point, Occupied Resident Room, Mechanical Room.
- Binds a subset of the department's Experiences with per-Experience behavior.
- Reusable across every physical room that maps to it.

## Example archetypes

Physical classifications (Facility Builder, department-neutral):

```text
Resident Room, Patient Room, Dining Room, Kitchen, Servery,
Mechanical Room, Office, Storage, Public Area, Utility,
Restroom, Loading Dock, Laundry
```

Department archetypes (Department Administration, department-specific):

```text
Dietary
  Servery                → Meal Service, Tray Accuracy, Temperature Monitoring, Hot Wells
  Tray Delivery Point    → Meal Service (deliver), Nourishments
  Production Kitchen      → Production, Recipes, Batch Records, Sanitation
  Dry Storage            → Inventory, Pest Logs, Temperature Monitoring
  Dining Room            → Meal Service (dine-in), Satisfaction

EVS
  Occupied Resident Room → Room Cleaning, Room Status
  Discharge Room         → Turnover, Terminal Clean
  Public Area            → Project Cleaning, Rounding
  Restroom               → Cleaning, Cleaning Lists

Plant
  Mechanical Room        → Utilities, PM Rounds, Life Safety
  Serviceable Space      → Reactive Repairs, Requests
  Generator Room         → Generators, PM Schedules, Inspections
```

## Should departments configure behavior per archetype?

**Yes.** This is the central purpose of the archetype layer. A department:

1. Defines its archetypes.
2. Maps each physical room classification (or specific room) to an archetype.
3. Tunes, per archetype, which of the department's Experiences are active and how they behave.

This is what lets one department run consistently across hundreds of rooms while behaving correctly in each kind of space. Configure the archetype once; every room of that kind inherits it.

## How archetypes interact with Operational Profiles

The archetype is a component of the Operational Profile, sitting below Experiences:

```text
Department
   ↓
Operational Area
   ↓
Experiences            ← the department's full set of active Experiences
   ↓
Room Archetypes        ← per-archetype selection + tuning of those Experiences
```

The profile answers, in order:

1. **What does this department do?** → Operational Areas and Experiences.
2. **How does it do it in each kind of room?** → Room Archetypes.
3. **Which rooms are which kind?** → archetype ↔ classification mapping (still department-owned; it references Facility Builder classifications but does not change them).

Projection later combines this with Facility Builder's real rooms: it takes Room 214, reads its physical classification, finds the department's archetype for that classification, and resolves the active Experiences.

## Sparse exceptions

Most rooms follow their archetype. A few need a one-off adjustment (a specific storage room that also holds an emergency nourishment cart). The profile supports a **sparse room exception**: a per-room override on top of the archetype, used rarely and explicitly. Exceptions are the escape hatch, not the norm — if many rooms need the same exception, that is a signal to define a new archetype.

## Rules

1. Physical classification is owned by Facility Builder and is department-neutral.
2. Archetypes are owned by Department Administration and are department-specific.
3. Archetype behavior is defined once and inherited by every room of that kind.
4. A room maps to exactly one archetype per department.
5. Sparse per-room exceptions are allowed but discouraged at volume.
6. Defining an archetype never modifies a physical room.
