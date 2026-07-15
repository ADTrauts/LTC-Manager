# 09 — Migration and Rollout Plan

## Guiding principles

1. Every stage must leave the product fully functional
2. No stage removes existing Unit records, routes, or behaviors
3. Each stage is independently deployable and testable
4. Feature flags gate new UI until ready
5. Admin-facing changes come before frontline-facing changes

---

## Stage 1: Schema foundation (no visible behavior change)

### Goal
Add UnitSpace model, SpaceType enum, UnitSpaceResponsibility model, and capabilities field to UnitDepartmentResponsibility.

### Changes
- Add `SpaceType` enum to Prisma schema
- Add `UnitSpace` model with FK to Unit and Facility
- Add `UnitSpaceResponsibility` model with FK to UnitSpace and Department
- Add `capabilities String[] @default([])` to `UnitDepartmentResponsibility`
- Add `SUPPORT` value to `UnitDepartmentKind` enum
- Add reverse relation `childSpaces UnitSpace[]` to Unit
- Forward-only migration

### Preserves
- All existing Unit records unchanged
- All existing routes unchanged
- All existing Unit Workspace behavior unchanged
- All existing PIN/tablet behavior unchanged
- All 19 FK references unchanged
- Readiness computation unchanged
- Operations Center unchanged
- Today's Work unchanged
- Business Workspace unchanged

### Tests
- Migration applies cleanly
- Existing unit CRUD unchanged
- New UnitSpace CRUD operations work
- UnitSpaceResponsibility CRUD works
- capabilities array can be queried
- Empty capabilities = backward compatible behavior

---

## Stage 2: Admin hierarchy builder

### Goal
Allow administrators to add rooms/spaces within existing units.

### Changes
- Add space management UI within existing Admin → Units page
- Admin can create, edit, deactivate spaces within a unit
- Admin can assign department responsibilities to spaces
- Admin can configure capability keys per department-space pair
- Admin can view inherited responsibilities from parent unit
- Feature-flagged: `LOCATION_SPACES_ENABLED`

### Preserves
- All frontline and supervisor workflows unchanged
- Unit Workspace unchanged
- No new routes visible to non-admin users
- Readiness unchanged
- PIN/tablet unchanged

### Establishes
- Room/space data exists in the database
- Responsibility and capability data is populated
- Foundation for domain adoption in Stage 3

---

## Stage 3: Department-aware content at location level

### Goal
Unit Workspace and location navigation show department-specific content based on responsibility and capabilities.

### Changes
- Location rail filters by department responsibility capabilities (not just existence)
- Unit Workspace composition uses capabilities to show/hide domain sections
- Plant users at a servery see only asset/maintenance cards, not meal data
- EVS users at a section see only cleaning/room status, not dietary logs
- Add nullable `spaceId` FK to first adopter domains: RoomAreaStatus, Asset, Repair
- Room-level data appears in Unit Workspace when spaces exist
- Optional: `/unit/[unitId]/space/[spaceId]` route for dedicated room workspace

### Preserves
- All existing unit-level data continues to work
- Null `spaceId` = unit-level (current behavior)
- Readiness remains per-unit
- PIN behavior unchanged unless `activeSpaceId` is adopted
- Facility Overview continues to aggregate by department

### Risks
- Visibility filtering must not accidentally hide legitimate data
- Thorough testing required for each department × unit type combination
- Legacy responsibility rows (empty capabilities) must retain current behavior

---

## Stage 4: Domain migration to room level

### Goal
Migrate specific domains to room-level granularity where it adds value.

### Changes
- RoomAreaStatus primarily links to UnitSpace (EVS cleaning state per room)
- Asset records optionally specify `spaceId` (equipment in specific rooms)
- Repair/Issue records optionally specify `spaceId` (work order targeting a room)
- Inspection occurrences optionally target specific spaces
- Admin can reassign existing records from unit level to specific spaces

### Preserves
- All `unitId` FKs remain required and populated
- `spaceId` is always nullable and additive
- Queries by `unitId` continue to return all data (including space-specific data)
- No data loss from reassignment — both unitId and spaceId are populated

### Timing
- Each domain migrates independently
- RoomAreaStatus is the highest-priority candidate
- Asset/Repair migrate together (related workflows)
- Inspections and Knowledge are lower priority

---

## Stage 5: Compatibility cleanup (optional)

### Goal
Remove legacy patterns and optionally update terminology.

### Changes (all optional, each independently decidable)
- Update UnitType enum: remove Dietary-specific values no longer needed at section level
- Consider `/location/[id]` route alias with redirect from `/unit/[id]`
- Rename UI labels from "Unit" to "Location" in admin surfaces
- Remove unused unit-type-specific code paths
- Consolidate `unitTypeUsesServingTimes()` into capability checks

### Preserves
- If route alias is added, `/unit/[id]` continues to work via redirect
- If UnitType values are removed, existing data must be migrated first

### Assessment
- This stage is not required for functionality
- It is a cleanup opportunity, not a prerequisite
- Should only be pursued when Stages 1–4 are stable in production

---

## Timeline guidance

| Stage | Dependencies | Estimated scope |
|-------|-------------|-----------------|
| Stage 1 | None — can begin immediately | 1 milestone |
| Stage 2 | Stage 1 complete | 1 milestone |
| Stage 3 | Stage 2 complete, spaces populated | 2 milestones |
| Stage 4 | Stage 3 stable | 1–2 milestones per domain |
| Stage 5 | Stage 4 stable in production | Optional, unbounded |

---

## What must not change during Stage 1

- No production application code changes
- No route changes
- No visible UI changes
- No readiness computation changes
- No Operations Center changes
- No Today's Work changes
- No Business Workspace changes
- No Unit Workspace changes
- No PIN/tablet behavior changes
- No existing FK changes
- No data migration of existing Unit records
