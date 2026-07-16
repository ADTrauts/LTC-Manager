# 01 — Current Architecture

**Stage:** Wave 13B — Stage 3A  
**Scope:** Discovery only; no production behavior is changed by this package.

## Executive finding

The repository already has one physical hierarchy and the data needed to derive department experiences. What it does not have is one shared projection boundary. Each operational surface currently loads a broad facility or unit data set and applies its own partial department logic.

The missing architecture is therefore not another location model. It is a reusable, derived projection of the existing model.

## Frozen physical source of truth

The Facility Builder owns the physical structure:

```text
Facility
  └── Unit(hierarchyRole = FLOOR)
        └── Unit(hierarchyRole = NEIGHBORHOOD)
              └── UnitSpace (Room)
```

Compatibility records may use `LEGACY_LOCATION`. `STAGED` Units and rooms with `unitId = null` are builder-only and must not enter operational projections.

The implementation is intentionally split across:

- `Unit`: floor, neighborhood, legacy operational location, and hierarchy links.
- `UnitSpace`: room/space identity and placement.
- `Facility` vocabulary fields: presentation labels for the three physical levels.
- `UnitSpaceResponsibility`: explicit room-to-department capabilities.
- `UnitDepartmentResponsibility`: existing Unit-level compatibility responsibilities.
- Facility-wide Plant maintenance policy: broad maintenance scope without copied room rows.

Rooms do not inherit department responsibilities from floors or neighborhoods. Older architecture documents that proposed parent-to-child responsibility inheritance are superseded by the implemented Facility Builder rule: room responsibility is explicit, while broad Plant access is policy-derived.

## Current subsystem behavior

### Facility Builder

`loadFacilityHierarchy()` loads the complete builder tree, staged nodes, undesignated rooms, vocabulary, departments, and responsibility rows. It is the administrative representation of physical truth, not an operational navigation model.

`operationalUnitWhere()` provides one narrow shared rule: exclude builder-only `STAGED` Units. It does not project rooms or capabilities.

The capability registry currently includes:

- `SERVICE_OPERATIONS`
- `SERVICE_LOGS`
- `MEAL_SERVICE`
- `FOOD_SAFETY`
- `CLEANING`
- `ROOM_STATUS`
- `BUILDING_MAINTENANCE`
- `ASSET_MANAGEMENT`
- `INSPECTIONS`
- `REPAIRS`
- `KNOWLEDGE`
- `WORK_QUEUE`

Department presets are authoring conveniences only. Preset identity is not persisted; department plus capabilities remain authoritative.

### Locations and sidebar

The sidebar loads every active, non-staged `Unit` in display order. It does not load `UnitSpace`, physical ancestry, responsibility, or capability. PIN employee Unit access is applied afterward.

The sidebar therefore represents a flat compatibility list, not the completed hierarchy and not a department operational projection.

### Unit Workspace

The Unit Workspace accepts an active department key, but its loader fetches logs, staffing, repairs, meal service, EVS status, assets, PM, menus, inspections, and work records before composition. Department context currently influences readiness more than data loading or module composition.

The same Unit can consequently carry unrelated domain inputs in one view model even when some cards are not useful to the active department.

### Today's Work

The walk list reuses Operations Center queries and computes readiness with an active department profile. It still builds items from the full Unit-card set. Coverage and call-downs remain Unit-oriented and have separate scoping rules.

### Operations Center

The dashboard loader queries all active Units and a broad set of Dietary, EVS, Plant, staffing, and repair data. Active department changes the readiness profile, but does not first constrain the location and domain query plan.

### Business Workspace

Business Workspace has the strongest existing composition seam:

1. load one coordinated facility input bundle;
2. call `scopeInputsForContext()`;
3. run pure section builders;
4. filter links with department navigation rules.

However, scoping is based on readiness profile keys and domain department metadata, not room responsibilities plus capabilities. Route visibility and operational data visibility remain separate, duplicated decisions.

### Readiness, assignments, and capabilities

Readiness is already department-profile aware, but Unit identity is its aggregation key and profile selection can fall back from Unit type/responsibility metadata. It does not consume a canonical department location set.

Operational assignments are department-scoped and primarily Unit-linked. They must remain the source of assignment truth; a projection may constrain and present them but must not reinterpret fulfillment.

Capabilities are persisted as strings on responsibility relationships. They describe what a department does in a room. They are not user permissions and are not feature flags.

### Navigation

Top-level navigation combines:

- RBAC route permissions;
- hard-coded department-to-route rules;
- zone grouping;
- active department context.

This is useful for module entry points but cannot answer which physical rooms are operationally relevant or which room-local experience modules should exist.

## Architectural gaps

1. No shared definition of an operational location.
2. No shared resolution of explicit room responsibilities plus facility-wide policy.
3. No single capability-to-experience mapping.
4. Broad loaders can fetch unrelated department data.
5. Composition, navigation, readiness, and workspace code can disagree about location scope.
6. Facility Builder staging exclusion is not consistently applied to every operational query.
7. Unit-level compatibility and room-level physical truth are not yet represented through one stable reference type.

## Required direction

Keep the Facility Builder and persistence model unchanged. Add one application-layer projection engine that turns physical truth, department context, facility policy, and access constraints into an immutable operational projection consumed by every operational surface.
