# 05 — Responsibility Inheritance Rules

## Problem

When a facility has hierarchical locations (Unit → child Unit → UnitSpace), departments need predictable rules about whether access and capability at a parent location propagates to children.

Example: Plant Operations has BUILDING_MAINTENANCE access to the entire facility. Does that mean Plant can see every room? Yes — but only for maintenance-related data.

---

## Recommended inheritance model

### Rule 1: Children inherit parent department access by default

If a department has a `UnitDepartmentResponsibility` row for a parent unit, all child units and child spaces are accessible to that department unless explicitly excluded.

```
Unit "1A — Naval Park" ← Dietary (PRIMARY), EVS (PRIMARY), Plant (SUPPORT)
  └── UnitSpace "Room 32A" ← inherits all three department associations
  └── UnitSpace "Servery" ← inherits all three department associations
```

### Rule 2: Children inherit parent capabilities by default

If a department's responsibility at the parent specifies capabilities `[BUILDING_MAINTENANCE, EQUIPMENT_MAINTENANCE]`, those same capabilities apply at all child locations.

### Rule 3: A child may add additional responsibilities

A `UnitSpaceResponsibility` row for a specific space can grant capabilities beyond what the parent provides.

Example:
- EVS has only CLEANING at the section level
- A specific space "Soil Hold" adds SANITATION capability for EVS

### Rule 4: A child may restrict inherited capabilities (explicit override)

If a `UnitSpaceResponsibility` row exists for a department at a specific space, it **replaces** (does not merge with) the inherited capabilities for that department at that space.

Example:
- Plant has [BUILDING_MAINTENANCE, EQUIPMENT_MAINTENANCE, ASSET_MANAGEMENT] at the section
- A specific "Office" space has a UnitSpaceResponsibility for Plant with only [BUILDING_MAINTENANCE]
- Plant sees only maintenance data in that office, not full asset management

### Rule 5: Explicit removal is expressed by an empty capability array

If an administrator explicitly assigns a department to a space with an empty capabilities array, that department has no operational access at that space (overriding inheritance).

This is the "exclude" mechanism — rare, but available when needed.

---

## Resolution algorithm

```
resolveDepartmentCapabilities(departmentId, location):
  if location is UnitSpace:
    explicit = findSpaceResponsibility(location.id, departmentId)
    if explicit exists:
      return explicit.capabilities    // override: use explicit, not parent
    parent = location.unit
  else:
    parent = location (Unit)

  unitResp = findUnitResponsibility(parent.id, departmentId)
  if unitResp exists:
    if unitResp.capabilities is non-empty:
      return unitResp.capabilities
    else:
      return ALL_CAPABILITIES          // legacy: empty = full access

  // Check parent unit (if section has a parent section)
  if parent.parentUnitId:
    return resolveDepartmentCapabilities(departmentId, parentUnit)

  // No responsibility found at any level
  return NONE
```

### Traversal depth limit

Maximum 3 levels: Facility → Unit → Child Unit → Space. No deeper nesting is supported. The algorithm walks at most 2 parent hops.

---

## Inheritance display for administrators

In the admin hierarchy builder, each location shows:

| Indicator | Meaning |
|-----------|---------|
| **Direct** | Department has an explicit responsibility row at this location |
| **Inherited** | Department access comes from a parent location |
| **Overridden** | This location has an explicit row that differs from the parent |

This makes the inheritance chain visible without requiring administrators to understand the algorithm.

---

## Edge cases

### Facility-wide department access

Some departments (Plant) need access throughout the facility. This is expressed by assigning Plant as SUPPORT to every top-level Unit with BUILDING_MAINTENANCE capability. All child locations inherit automatically.

There is no "facility-level responsibility" row — inheritance starts at Unit. This keeps the model simple and avoids a special Facility-level responsibility table.

For convenience, the admin builder may offer a "grant to all sections" bulk action, but the data model stores individual Unit responsibility rows.

### Department with no responsibility at a location

If a department has no responsibility row at a unit and no parent-inherited responsibility, the location does not appear in that department's navigation or data. This is the default — locations are opt-in per department.

### Backward compatibility with empty capabilities

Existing UnitDepartmentResponsibility rows have no `capabilities` field (it will be added as `String[] @default([])`). Empty array means "legacy full access" — the department sees everything at that unit as before, preserving current behavior.

---

## What this does NOT do

- Does not create a policy engine with rules, conditions, or expressions
- Does not support time-based responsibility (e.g., "EVS only during day shift")
- Does not automatically create responsibility rows — administrators configure them
- Does not enforce responsibility at the query level automatically — application code checks capabilities
- Does not replace RBAC role checks — responsibility is about department-location scope, not user permissions
