# 02 — Operational Profile Model

## Recommended model

```text
Department
  └── Operational Profile
        ├── Department Room Archetypes
        │     └── Experiences
        ├── Department-wide Experiences
        ├── Defaults and configuration
        └── Governance metadata

Room
  └── assigned Department
        └── selected Department Room Archetype
              └── resolved Experiences
```

This is a product model, not a schema proposal.

## Department

A Department is the operational owner already present in the Facility.

Examples:

- Dietary
- Environmental Services
- Plant Operations

Department identity answers **who** owns work and data. It does not by itself specify which Experiences appear in every room.

## Operational Profile

An Operational Profile is the department's authoritative definition of how it operates in one Facility.

It contains:

- supported department Room Archetypes;
- Experiences active for each archetype;
- department-wide Experiences;
- Experience configuration;
- default mappings from physical room characteristics;
- allowed facility and room exceptions;
- lifecycle state and revision;
- provenance from system defaults or facility customization.

One department has one active Operational Profile per Facility. Draft and historical revisions may exist conceptually, but only one revision is effective for projection at a time.

The profile is not a user preference, page layout, role permission set, or copy of a room tree.

## Department Room Archetype

A Department Room Archetype describes how one department operates in a class of rooms.

Examples:

- Dietary: Servery, Production Kitchen, Dining Service Area, Dietary Storage, Dietary Office.
- EVS: Resident Room, Public Area, Restroom, Soiled Utility, Food Service Area.
- Plant: Mechanical Room, Equipment Area, General Maintainable Space, Utility Area.

The same physical room may resolve to different archetypes for different departments:

```text
Physical room: Kensington Servery
  Dietary archetype: Servery
  EVS archetype: Food Service Area
  Plant archetype: Equipment Area
```

This is not hierarchy duplication. Each archetype is a department-owned operational interpretation referencing the same room.

## Experience assignment

Each archetype activates a coherent set of Experiences.

Example:

```text
Dietary / Servery
  Meal Service
  Meal Times
  Meal Logs
  Food Safety
  Department Cleaning
  Equipment
  Knowledge
  Inspections
```

An Experience assignment may include configuration, but it does not redefine the Experience itself. For example:

- Meal Service may choose supported meal periods.
- Cleaning Lists may choose a facility-approved list template.
- Inspections may choose applicable inspection programs.
- Equipment may select department-owned equipment categories.

## Department-wide Experiences

Some Experiences are not room-specific:

- Menus
- Recipes
- Production planning
- department knowledge library;
- department reporting;
- department staffing overview.

They belong to the Operational Profile but not to a Room Archetype. Projection may expose them in department-level navigation and workspaces without pretending they are properties of every room.

## Resolution model

For one room and department:

```text
1. Verify the Room is active, placed, and assigned to the Department.
2. Resolve the Department's active Operational Profile.
3. Resolve the Room's department-specific Room Archetype.
4. Load Experiences assigned to that archetype.
5. Apply approved facility defaults and sparse room exceptions.
6. Intersect user authorization and operational context.
7. Emit projected Experiences and data scopes.
```

If no archetype is configured, projection returns a visible configuration gap rather than guessing from raw capabilities or exposing every department Experience.

## Profile inheritance

Use controlled inheritance:

```text
System Department Baseline
  ↓ copied/version-pinned as defaults
Facility Department Operational Profile
  ↓ referenced by room-archetype selection
Sparse Room Exception
```

Rules:

1. System baselines provide recommended starting models, not hidden runtime behavior.
2. Facility profiles are the effective operational truth.
3. Rooms reference an archetype; they do not copy its Experience list.
4. Room exceptions are sparse, explicit, and governed.
5. A system baseline update never silently changes an active facility profile.

## Why this is better than raw capabilities

- Departments own their operational language and standards.
- Common room behavior is configured once.
- Exceptions are visible rather than accidental checkbox drift.
- Projection receives product-meaningful Experiences.
- Facility Builder remains stable when modules evolve.
- Department-wide Experiences have a proper home.
- Governance and audit can distinguish physical ownership from operational configuration.
- Future departments use the same model without expanding Facility Builder.

## Identity and source-of-truth rules

- Physical Room identity always comes from Facility Builder.
- Department identity always comes from Department administration.
- Operational Profile identity belongs to the Facility Department.
- Room Archetype identity is department-scoped.
- Experience identity comes from the canonical product Experience catalog.
- Projection identity remains derived and non-persisted.

No model owns another model's truth.
