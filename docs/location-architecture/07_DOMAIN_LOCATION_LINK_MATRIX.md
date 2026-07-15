# 07 — Domain Location Link Matrix

## Current state: everything links to Unit

All 19 FK references point to Unit. This document recommends which level each domain should ultimately target.

---

## Link recommendations

| Domain | Current link | Recommended level | Timing | Notes |
|--------|-------------|-------------------|--------|-------|
| **ServeryMealServiceEvent** | Unit (required) | Unit or Space | Stage 3+ | Servery may become a UnitSpace; backward compatible via unitId |
| **UnitMealTime** | Unit (required) | Unit or Space | Stage 3+ | Meal times on servery units; may target SERVICE_AREA space |
| **ScheduleEntry** | Unit (required) | Unit | Keep | Staffing is section-level |
| **DefaultAssignment** | Unit (required) | Unit | Keep | Staffing defaults are section-level |
| **AssignmentOverride** | Unit (required) | Unit | Keep | Coverage changes are section-level |
| **OperationalAssignment** | Unit (nullable) | Unit or Space | Stage 3+ | May target specific room/area for EVS/Plant |
| **OperationalAssignmentTemplateItem** | Unit (nullable) | Unit or Space | Stage 3+ | Template positions may specify room |
| **Asset** | Unit (required) | Unit + optional Space | Stage 3 | Assets belong to units; may specify room/space |
| **Repair** | Unit (required) | Unit + optional Space | Stage 3 | Issues at unit level; may specify room |
| **LogAssignment** | Unit (required) | Unit | Keep | Log assignments are section-level |
| **LogSubmission** | Unit (required) | Unit | Keep | Log submissions reference the unit |
| **InspectionDefinition** | Unit (nullable) | Unit or Space | Stage 4 | Some inspections target rooms |
| **InspectionOccurrence** | Unit (nullable) | Unit or Space | Stage 4 | |
| **InspectionSubmission** | Unit (nullable) | Unit or Space | Stage 4 | |
| **RoomAreaStatus** | Unit (required) | Space (preferred) | Stage 3 | EVS room-level status belongs at space level |
| **KnowledgeArticleUnit** | Unit (required) | Unit or Space | Stage 4 | May link to specific rooms |
| **Task** | Unit (required) | Unit + optional Space | Stage 3+ | Work projections may reference room |
| **EmployeeUnitAccess** | Unit (required) | Unit | Keep | Access controls are section-level |
| **KioskUnitPinLoginEvent** | Unit (required) | Unit | Keep | PIN events logged at section level |
| **UnitDepartmentResponsibility** | Unit (required) | Unit | Keep | Section-level responsibility (spaces use UnitSpaceResponsibility) |

---

## Migration strategy for domains adopting Space

For domains that will eventually support `spaceId`:

1. **Add nullable `spaceId` FK** to the existing model (no breaking change)
2. **Retain `unitId`** as the primary operational link (never nullable-ify it)
3. **Populate `spaceId` only when the admin has configured spaces**
4. **Query by `unitId` for broad queries; use `spaceId` for room-level specificity**

Example for Asset:

```
Asset
  unitId    String    FK → Unit    (required, existing)
  spaceId   String?   FK → UnitSpace (nullable, new)
```

When `spaceId` is set, the asset is in a specific room. When null, the asset is at the unit level (or room is not yet configured).

---

## Domains that stay at Unit level

These domains have no need for room-level granularity:

| Domain | Reason |
|--------|--------|
| ScheduleEntry | Staffing is organized by section/wing, not by room |
| DefaultAssignment | Same as ScheduleEntry |
| AssignmentOverride | Coverage changes are section-level staffing decisions |
| LogAssignment / LogSubmission | Compliance logs are unit-level activities |
| EmployeeUnitAccess | Access control is section-level |
| KioskUnitPinLoginEvent | Security event at the section level |
| UnitDepartmentResponsibility | Section-level responsibility (spaces have their own model) |

---

## Domains that benefit most from Space

| Domain | Benefit |
|--------|---------|
| RoomAreaStatus | EVS cleaning state should be room-specific, not section-wide |
| Asset | Equipment is physically located in specific rooms |
| Repair/Issue | Work orders may target a specific room or mechanical space |
| InspectionOccurrence | Room-level inspections (e.g., patient room compliance) |

---

## Priority order for Space adoption

1. **RoomAreaStatus** — highest value, EVS room-level cleaning state
2. **Asset** — Plant equipment placement in specific rooms
3. **Repair** — Issues targeting specific rooms or spaces
4. **InspectionOccurrence** — Room-level inspections
5. **Task** — Work projections with room context
6. **KnowledgeArticleUnit** — Room-specific SOPs (lower priority)
7. **OperationalAssignment** — Room-level assignment for EVS/Plant (lower priority)
