# 04 — Department Responsibility Model

## Current state

`UnitDepartmentResponsibility` exists and maps departments to units:

```
UnitDepartmentResponsibility
  unitId              FK → Unit
  departmentId        FK → Department
  kind                PRIMARY | BACKUP
  riskLevel           String?
  cleaningFrequency   String?
  inspectionFrequency String?
```

### Limitations
1. `kind` (PRIMARY/BACKUP) describes organizational ownership, not operational capability
2. No way to express what the department does at that location
3. `riskLevel`, `cleaningFrequency`, `inspectionFrequency` are EVS-specific free-text fields baked into a generic model
4. No support for capability-based filtering (e.g., "Plant has maintenance access but not operational ownership")
5. No responsibility at the room/space level

---

## Recommended enhancement

### Extend UnitDepartmentResponsibility (not replace)

Add a `capabilities` field to express what the department is responsible for at that location:

```
UnitDepartmentResponsibility (extended)
  id                  String       PK
  unitId              String       FK → Unit
  departmentId        String       FK → Department
  kind                UnitDepartmentKind   (PRIMARY | BACKUP | SUPPORT)
  capabilities        String[]     array of capability keys
  riskLevel           String?      retained for EVS admin
  cleaningFrequency   String?      retained for EVS admin
  inspectionFrequency String?      retained for EVS admin
```

### Add UnitSpaceResponsibility (new, for room level)

```
UnitSpaceResponsibility
  id                  String       PK
  spaceId             String       FK → UnitSpace
  departmentId        String       FK → Department
  capabilities        String[]     array of capability keys

  @@unique([spaceId, departmentId])
```

---

## Capability keys

Capabilities describe what a department does at a location. They are stored as string arrays, not as a separate enum, to allow extension without schema migration.

### Initial capability set

| Key | Meaning | Typical departments |
|-----|---------|-------------------|
| `SERVICE_OPERATIONS` | Primary service delivery (meal ops, cleaning rounds) | Dietary, EVS |
| `CLEANING` | Room/area cleaning responsibility | EVS |
| `SANITATION` | Sanitation and infection control | EVS |
| `BUILDING_MAINTENANCE` | Building systems, HVAC, plumbing | Plant |
| `EQUIPMENT_MAINTENANCE` | Equipment repair and PM | Plant |
| `ASSET_MANAGEMENT` | Asset tracking and lifecycle | Plant |
| `INSPECTIONS` | Department-specific inspections | Any |
| `COMPLIANCE` | Regulatory compliance logs and audits | Any |
| `SUPPORT` | Support/advisory role, no primary ownership | Any |

### Why string array over enum
- New capabilities can be added without a schema migration
- Each department can have a different combination per location
- The application layer validates against a known set at runtime
- Avoids enum explosion as new department types are added

### Why not a separate relation table
- Capabilities are attributes of the department-location relationship, not independent entities
- A string array on the existing responsibility row is simpler than a join table
- PostgreSQL supports array querying (`@>`, `&&`) efficiently
- The cardinality is small (typically 1–4 capabilities per department-location pair)

---

## Extending UnitDepartmentKind

Current: `PRIMARY | BACKUP`

Recommended addition: `SUPPORT`

| Kind | Meaning |
|------|---------|
| PRIMARY | Department owns operations at this location |
| BACKUP | Department provides backup coverage |
| SUPPORT | Department has access for specific capabilities but does not own operations |

Example:
- Dietary is PRIMARY for a servery (capabilities: SERVICE_OPERATIONS, COMPLIANCE)
- Plant is SUPPORT for the same servery (capabilities: EQUIPMENT_MAINTENANCE)
- Plant sees assets and work orders at the servery but not meal-service data

---

## Department independence

The capability model is department-agnostic:
- No capability key mentions "Dietary", "EVS", or "Plant"
- Any department can hold any capability at any location
- Future departments (Nursing, Pharmacy, Laundry) use the same model
- Department-specific behavior comes from the combination of department identity + capabilities, not from hardcoded location types

---

## Backward compatibility

- Existing `UnitDepartmentResponsibility` rows remain valid
- `capabilities` defaults to empty array (interpreted as "full department access" for backward compatibility)
- Existing `kind` values (PRIMARY, BACKUP) remain
- `riskLevel`, `cleaningFrequency`, `inspectionFrequency` fields are retained
- No data migration required for existing responsibility rows — they continue working as today
- Empty capabilities = legacy behavior = department sees everything at that unit as before

---

## How responsibility controls data visibility

The responsibility model provides the data for filtering decisions, but does not itself enforce visibility. Filtering is handled by the data visibility layer (see doc 06).

The general rule:

```
Can department D see domain-data X at location L?
  → Does D have a responsibility row for L (or L's parent)?
  → Does D's capability set include the relevant capability for X?
  → If capabilities are empty (legacy): yes (backward compatible)
```
