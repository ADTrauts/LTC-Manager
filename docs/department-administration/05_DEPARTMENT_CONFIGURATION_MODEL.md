# 05 — Department Configuration Model

## Purpose

This document defines the **layers** through which a department is configured, from the platform-wide standard down to a single room's exception. It is architecture, not UI. It describes what exists and how the layers compose into one active Operational Profile.

## The configuration stack

```text
Dietary (Department)
   ↓
Operational Areas          Service, Food Safety, Equipment, People, ...
   ↓
Experiences                Meal Service, Temperature Monitoring, Steam Tables, ...
   ↓
Room Archetypes            Servery, Tray Delivery Point, Production Kitchen, ...
   ↓
Operational Profile        the bound, certified, active configuration
```

The first four layers are the *authoring* layers. The Operational Profile is the *bound result* that everything downstream consumes.

## The four ownership layers of configuration

Configuration is resolved by merging four layers, from most general to most specific. Each layer may only refine what the layer above allows.

### Layer 1 — System Department Baseline (platform-owned)

The canonical model for a department type, published by the platform. It defines the standard Operational Areas, the standard Experiences within each, the standard Room Archetypes, and default behavior.

- **Owner:** platform / department template authors.
- **Purpose:** every facility of this department starts from a known-good, best-practice model.
- **Example:** the standard "Dietary" ships with Service, Food Safety, Equipment, People, Documentation, Production, Quality and their standard Experiences.

### Layer 2 — Facility Department Profile (facility-owned, bounded)

A specific facility's adjustments to the baseline, within limits the baseline allows.

- **Owner:** the facility's department director.
- **Purpose:** adapt the standard to local reality (this facility has no in-house production kitchen; this facility runs a café).
- **Bounds:** may enable/disable allowed Experiences, arrange them across the standard areas, and adjust archetype behavior. May **not** invent Experiences the baseline never published.

### Layer 3 — Room Archetype Assignment (facility-owned)

Mapping the facility's physical rooms to the department's archetypes.

- **Owner:** the facility's department director, referencing Facility Builder classifications.
- **Purpose:** declare that Room 214 is a Tray Delivery Point and Room 118 is a Servery for this department.
- **Note:** this reads Facility Builder's rooms and classifications; it never modifies them.

### Layer 4 — Sparse Room Exception (facility-owned, rare)

A per-room override on top of its archetype.

- **Owner:** the facility's department director.
- **Purpose:** handle the genuine one-off without polluting an archetype.
- **Discipline:** rare by design; repeated exceptions signal a missing archetype.

## Resolution

The active configuration for any (department, room) pair is resolved top-down:

```text
System Baseline
  ⊕ Facility Profile adjustments
    ⊕ Room's Archetype behavior
      ⊕ Sparse Room Exception (if any)
= effective operational configuration for that room
```

The **Operational Profile** is the certified snapshot of layers 1–4 for a facility department. Projection consumes the profile; it never re-derives from the raw layers.

## Worked example — Dietary at one facility

```text
Layer 1 (Baseline): standard Dietary
  Areas: Service, Food Safety, Equipment, People, Documentation, Production, Quality
  Archetypes: Servery, Tray Delivery Point, Production Kitchen, Dry Storage, Dining Room

Layer 2 (Facility Profile): "Maplewood" adjustments
  - Disable "Production Kitchen" archetype (meals are trucked in)
  - Enable "Café" behavior on Dining Room archetype
  - Keep all standard areas

Layer 3 (Archetype Assignment):
  - Rooms 118, 220 (Serveries)           → Servery
  - Resident rooms on 2 West              → Tray Delivery Point
  - Room 101 (Dining Room)                → Dining Room + Café
  - Room B12 (Storage)                    → Dry Storage

Layer 4 (Exception):
  - Room B14 (Storage) also holds the nourishment cart
    → add Nourishments to this one room
```

Result: a certified Dietary Operational Profile for Maplewood that Projection can consume without knowing any of the merge logic.

## Lifecycle

```text
Draft → Certify → Activate → (Version on change)
```

- **Draft:** authored, not yet valid for Projection.
- **Certify:** validated against the baseline's rules and the department's constitution (`01`).
- **Activate:** becomes the single active profile for that facility department.
- **Version:** changes produce a new version; the prior version is retained for audit and rollback.

## Rules

1. Exactly one active Operational Profile per facility department.
2. Lower layers refine, never contradict, higher layers.
3. A facility cannot introduce Experiences the baseline did not publish.
4. Archetype assignment references Facility Builder rooms read-only.
5. Projection consumes the certified profile, not the raw layers.
6. Every activation is versioned and reversible.
