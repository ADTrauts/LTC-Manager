# 10 — Location Model Certification

## 1. What is the canonical physical-location entity?

**Unit** remains the canonical physical-location entity for sections, wings, and operational zones. **UnitSpace** is the new entity for rooms, service areas, storage, and utility spaces within a unit.

Together they form a two-level hierarchy: Unit → UnitSpace. Unit also supports section-level hierarchy through the existing `parentUnitId` self-reference.

---

## 2. Does Unit remain, change meaning, or become compatibility-only?

**Unit remains and retains its current meaning.** It is the primary navigational and operational entity. All 19 existing FK references continue pointing to Unit. No renaming, no deprecation, no compatibility wrapper.

The only additive change is a new reverse relation (`childSpaces UnitSpace[]`) to support room-level children.

---

## 3. How are child rooms/spaces represented?

**UnitSpace** — a new model with a required FK to Unit and Facility. Each space has a `SpaceType` enum (SERVICE_AREA, PATIENT_ROOM, PRODUCTION_AREA, STORAGE, UTILITY, OFFICE, RESTROOM, MECHANICAL, PUBLIC_AREA, OTHER) and a human-readable name.

Spaces are always children of a Unit. They cannot exist independently or be nested within each other.

---

## 4. How is department access represented?

**UnitDepartmentResponsibility** (existing, extended with `capabilities`) expresses which departments have access to a unit and what kind of access they have (PRIMARY, BACKUP, or SUPPORT).

**UnitSpaceResponsibility** (new) expresses department access at the room/space level, supporting both additive and override patterns relative to the parent unit.

---

## 5. How is operational responsibility represented?

**Capabilities** — a string array on both UnitDepartmentResponsibility and UnitSpaceResponsibility. Capability keys (SERVICE_OPERATIONS, CLEANING, SANITATION, BUILDING_MAINTENANCE, EQUIPMENT_MAINTENANCE, ASSET_MANAGEMENT, INSPECTIONS, COMPLIANCE, SUPPORT) describe what a department does at a location.

Capabilities are department-agnostic — any department can hold any capability. The combination of department identity + capabilities determines what data is visible.

---

## 6. How does Plant receive broad maintenance access without seeing Dietary or EVS data?

Plant is assigned as `SUPPORT` to each unit with capabilities `[BUILDING_MAINTENANCE, EQUIPMENT_MAINTENANCE, ASSET_MANAGEMENT]`. These capabilities grant access to assets, work orders, PM schedules, and Plant inspections at that location.

Capabilities like SERVICE_OPERATIONS and CLEANING are absent from Plant's assignment, so meal-service data, dietary logs, EVS cleaning state, and EVS assignments do not appear for Plant users at that location.

---

## 7. How does Dietary retain meal-service functionality only where appropriate?

Dietary is assigned as `PRIMARY` to relevant units (serveries, kitchen sections) with capabilities including `SERVICE_OPERATIONS` and `COMPLIANCE`. Meal-service data (ServeryMealServiceEvent, UnitMealTime, dietary logs) is shown only at locations where Dietary has these capabilities.

At locations where Dietary has no responsibility (e.g., a mechanical room), no Dietary data appears.

---

## 8. How does EVS receive room-level cleaning responsibility?

EVS is assigned responsibilities at the unit level with capabilities like `CLEANING` and `SANITATION`. These inherit to all child UnitSpaces automatically.

When room-level UnitSpaces are configured (Stage 2+), EVS cleaning state (RoomAreaStatus) can be attributed to specific rooms. An explicit UnitSpaceResponsibility row can add or restrict EVS capabilities at individual rooms.

---

## 9. How are responsibilities inherited and overridden?

**Default inheritance:** Children inherit all parent department responsibilities and capabilities.

**Override:** If an explicit UnitSpaceResponsibility row exists for a department at a specific space, it replaces the inherited capabilities for that department-space pair. An empty capabilities array effectively removes access.

**Maximum depth:** 3 levels (Unit → child Unit via parentUnitId → UnitSpace). No deeper nesting.

See doc 05 for full inheritance rules.

---

## 10. How are existing routes and PIN devices preserved?

**Routes:** `/unit/[unitId]` remains unchanged. No route renaming, no redirects. Room-level workspaces (future) use `/unit/[unitId]/space/[spaceId]`.

**PIN/Tablet:** `activeUnitId` continues to function as-is. No changes to PIN login, locked-unit behavior, or EmployeeUnitAccess. Future enhancement adds optional `activeSpaceId` for room-level tablet locking.

---

## 11. Which domains migrate first?

1. **RoomAreaStatus** — highest value (EVS room-level cleaning state)
2. **Asset** — Plant equipment placement in specific rooms
3. **Repair** — Work orders targeting specific rooms
4. **InspectionOccurrence** — Room-level inspections

All migrations are additive (nullable `spaceId` FK) and happen independently per domain. See doc 07.

---

## 12. What must not be changed during the first implementation stage?

- No production application code
- No existing schema fields or FK changes
- No route changes
- No visible UI changes
- No readiness computation changes
- No Operations Center changes
- No Today's Work changes
- No Business Workspace changes
- No Unit Workspace changes
- No PIN/tablet behavior changes
- No data migration of existing records

Stage 1 is schema-only: add UnitSpace, SpaceType, UnitSpaceResponsibility, capabilities field, and SUPPORT kind. Everything else remains untouched.
