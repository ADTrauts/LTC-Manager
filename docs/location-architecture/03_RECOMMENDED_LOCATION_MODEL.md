# 03 — Recommended Location Model

## Decision

**Option B: Preserve Unit as operational section; add UnitSpace for room-level granularity.**

Unit remains the canonical location entity for navigation, readiness, staffing, and operations. UnitSpace adds physical sub-location granularity for rooms, serveries, storage areas, and utility spaces within a unit.

---

## Physical hierarchy

```
Facility
  └── Unit (section / wing / zone)           ← existing, unchanged
        ├── Unit (child section, via parentUnitId) ← existing, unchanged
        └── UnitSpace (room / area / space)  ← new
```

Two-level nesting is sufficient for healthcare/LTC facilities. Three levels (Unit → Unit → Space) are supported through the existing `parentUnitId` self-reference on Unit combined with UnitSpace at the leaf level.

---

## Recommended UnitSpace model

```
UnitSpace
  id              String       PK, cuid
  unitId          String       FK → Unit (required, onDelete: Cascade)
  facilityId      String       FK → Facility (required, onDelete: Cascade)
  name            String       e.g. "Room 32A", "Servery", "Soil Hold"
  spaceType       SpaceType    enum
  code            String?      short identifier for admin/display
  isActive        Boolean      default true
  sortOrder       Int          default 100
  description     String?

  @@unique([unitId, name])
  @@index([facilityId])
  @@index([unitId, isActive, sortOrder])
```

---

## SpaceType enum (recommended)

Small enum plus custom label. Type classifies the physical nature; `name` carries the display identity.

```
SpaceType
  SERVICE_AREA       servery, tray line, dining area
  PATIENT_ROOM       individual patient/resident room
  PRODUCTION_AREA    kitchen, prep area
  STORAGE            dry storage, walk-in, supply closet
  UTILITY            soil hold, clean hold, linen room
  OFFICE             manager office, nurse station
  RESTROOM           restroom within a section
  MECHANICAL         mechanical/MEP room
  PUBLIC_AREA        lobby, hallway, elevator
  OTHER              anything not classified above
```

### Why enum over configurable data
- 10 values cover all observed healthcare facility spaces
- Enum provides type safety and query efficiency
- Admin configures the `name` and `description` for identity
- New types can be added via schema migration when genuinely needed
- "Servery" is a `name` on a SERVICE_AREA space, not a global type

### Relationship to existing UnitType
- UnitType remains for section-level classification (SERVERY as a section type is existing behavior)
- SpaceType classifies the room/area level
- Over time, UnitType values like SERVERY may become SpaceType SERVICE_AREA on a child space, but this is not required for the first stage

---

## Unit model changes (minimal)

No schema changes to Unit in Stage 1. The existing model remains:

```
Unit
  id, facilityId, name, unitType, parentUnitId, isActive, displayOrder, description
  + childSpaces  UnitSpace[]   ← new reverse relation
```

The only schema addition to Unit is the reverse relation field `childSpaces`.

---

## Existing UnitType guidance

The current UnitType enum stays. Values like SERVERY, KITCHEN, RESIDENT_AREA continue to work for section-level classification. When a unit represents a single servery (today's common pattern), the unit itself carries UnitType=SERVERY. When rooms are added beneath a section, they use UnitSpace with SpaceType.

No UnitType values are removed. No UnitType values are renamed.

---

## What "Unit" means going forward

| Term | Model | Level | Example |
|------|-------|-------|---------|
| Section / Wing / Zone | Unit | Navigation + operations | "1A — Naval Park" |
| Room / Area / Space | UnitSpace | Physical granularity | "Room 32A", "Servery", "Soil Hold" |
| Location (product term) | Either | UI-facing | "Naval Park" or "Room 32A" |

Product language continues to prefer "Location" in UI per the language guide. The model name `Unit` and `UnitSpace` remain in code.

---

## Domain adoption path

Each domain adopts `spaceId` (nullable FK → UnitSpace) at its own pace:

| Stage | Domains that adopt spaceId |
|-------|--------------------------|
| Stage 1 | None — model only |
| Stage 2 | Admin builder adds spaces to units |
| Stage 3 | RoomAreaStatus, Asset, Repair may optionally link to spaceId |
| Stage 4 | EVS cleaning state, inspections at room level |

Existing `unitId` FKs remain the primary operational link throughout. `spaceId` is always additive and nullable.
