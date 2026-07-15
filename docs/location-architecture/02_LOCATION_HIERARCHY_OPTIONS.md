# 02 — Location Hierarchy Options

## Option A — Generalize Unit into hierarchical Location

### Concept

Rename/replace Unit with a canonical `Location` model:

```
Location
  id                  String       PK
  facilityId          String       FK → Facility
  parentLocationId    String?      FK → Location (self-referential)
  type                LocationType
  name                String
  code                String?
  sortOrder           Int
  isActive            Boolean
```

Existing Unit data migrates into Location. All 19 FK references change target.

### Advantages
- Clean, forward-looking model
- No dual-model complexity
- Single source of truth for physical hierarchy
- Natural support for arbitrary nesting

### Risks and costs
- **19 FK references must be renamed** from `unitId` to `locationId` across schema
- **Every query, loader, action, component, and test referencing `unitId` must change**
- Estimated 100+ file changes in application layer
- Routes change from `/unit/[unitId]` to `/locations/[locationId]`
- All PIN/tablet sessions using `activeUnitId` must be migrated
- Readiness profile keys, readiness code, and Operations Center code all reference units
- **High regression risk** — effectively a codebase-wide rename
- Would require a data migration to move all Unit rows to Location
- Existing bookmarks, AI snapshots, and external references break

### Assessment: **Not recommended**

The cost is a full codebase rename with no behavioral improvement. The current `Unit` model with `parentUnitId` already supports hierarchy. Renaming to "Location" is a cosmetic improvement that carries severe regression risk for zero new capability.

---

## Option B — Preserve Unit as section and add child Space

### Concept

Unit remains the primary physical entity (section, wing, operational zone). A new `UnitSpace` model represents rooms, serveries, storage, and other sub-unit physical spaces.

```
Unit (unchanged)
  = section, wing, department area, operational zone
  → existing 19 FK references remain valid

UnitSpace (new)
  id                  String       PK
  unitId              String       FK → Unit
  facilityId          String       FK → Facility
  type                SpaceType    enum
  name                String
  code                String?
  sortOrder           Int
  isActive            Boolean
```

### Advantages
- **Zero existing FK changes** — all 19 models continue pointing to Unit
- Unit Workspace, routes, PIN, readiness all remain unchanged
- New room-level granularity is purely additive
- Clear conceptual boundary: Unit = where you navigate; Space = where you work within
- `parentUnitId` on Unit still works for section-level hierarchy
- Domains can optionally adopt `spaceId` as a nullable FK when ready
- Admin can configure rooms within units
- EVS cleaning state can move to room level when desired

### Risks
- Two-level hierarchy is rigid — no arbitrary nesting beyond Unit→Space
- Some future use cases may want Space→SubSpace (unlikely in LTC/healthcare)
- Domain migration to Space-level links happens per-domain over time
- "Space" is a new concept that must be explained to administrators
- Existing Unit-level data (RoomAreaStatus, Assets) must eventually be attributed to Spaces

### Assessment: **Recommended**

This option delivers room-level granularity without touching the existing 19-model FK surface. The risk is bounded, the migration is additive, and the existing product remains stable.

---

## Option C — Add canonical Location layer while temporarily mapping Unit

### Concept

A new `Location` model becomes the canonical physical hierarchy. Unit remains as a compatibility wrapper, with a mapping table connecting them.

```
Location (new canonical hierarchy)
  id, facilityId, parentLocationId, type, name, ...

UnitLocationMapping (bridge)
  unitId → locationId

Unit (frozen, compatibility only)
  All 19 FKs remain
  Gradually deprecated
```

### Advantages
- Clean long-term model
- No immediate disruption to existing Unit consumers
- Gradual migration path

### Risks
- **Dual source of truth** during migration — which is authoritative?
- Every query must decide: query via Unit or Location?
- Admin must maintain both Unit configuration and Location hierarchy
- Mapping table adds complexity with no user-facing value
- Migration may never complete — "temporary" compatibility layers become permanent
- Higher cognitive load for developers maintaining two parallel models
- The bridge table itself becomes a coordination risk

### Assessment: **Not recommended**

Dual-model complexity is worse than the problem it solves. The existing Unit model with `parentUnitId` already supports the hierarchy that Location would provide. Adding a parallel model creates more confusion than it resolves.

---

## Comparison summary

| Factor | Option A (Rename) | Option B (Unit + Space) | Option C (Dual Model) |
|--------|-------------------|------------------------|-----------------------|
| FK changes required | 19 models, 100+ files | 0 existing | 0 immediate, unclear later |
| New capability | None (rename only) | Room-level granularity | Room-level granularity |
| Regression risk | Very high | Low | Medium (dual truth) |
| Migration complexity | Big-bang rename | Additive, per-domain | Ongoing bridge management |
| Route changes | Mandatory | Optional, deferred | Optional, deferred |
| PIN/tablet impact | Full rework | None | None initially |
| Arbitrary nesting | Yes | Two levels (Unit→Space) | Yes |
| Developer clarity | High (one model) | High (clear boundary) | Low (two models) |
| Time to first value | Longest | Shortest | Medium |

---

## Recommendation

**Option B — Preserve Unit as section, add child UnitSpace.**

Rationale:
1. Zero disruption to the 19-model FK surface
2. The existing `parentUnitId` on Unit already supports section-level hierarchy
3. Room-level granularity is the actual missing capability
4. The new model is purely additive — no data migration required for existing rows
5. Each domain can adopt `spaceId` at its own pace
6. The risk profile matches the principle of preserving the stable operational product
