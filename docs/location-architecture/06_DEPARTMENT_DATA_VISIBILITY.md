# 06 — Department Data Visibility

## Core principle

A department's physical access to a location does not automatically expose unrelated domain data. Data visibility is the intersection of:

1. Department has responsibility at the location (doc 04/05)
2. Department has the relevant capability for the data domain
3. The active department lens matches

---

## Per-surface visibility rules

### Location rail (sidebar)

| Department | Shows |
|------------|-------|
| Dietary | Units where Dietary has PRIMARY or BACKUP responsibility |
| EVS | Units where EVS has PRIMARY, BACKUP, or SUPPORT responsibility |
| Plant | Units where Plant has any responsibility (including SUPPORT) |
| Facility Overview | All active units across departments |

Readiness chips reflect the active department's readiness profile for that unit.

### Location Workspace (Unit Workspace)

The physical identity (name, type, description) is shared across departments. Operational content is department-specific:

| Content | Dietary sees | EVS sees | Plant sees |
|---------|-------------|----------|-----------|
| Meal service / servery marks | Yes (where SERVICE_OPERATIONS) | No | No |
| Dietary logs | Yes (where COMPLIANCE) | No | No |
| Cleaning / room status | No | Yes (where CLEANING) | No |
| EVS assignments | No | Yes (where SERVICE_OPERATIONS) | No |
| EVS inspections | No | Yes (where INSPECTIONS) | No |
| Assets | No | No | Yes (where ASSET_MANAGEMENT or EQUIPMENT_MAINTENANCE) |
| Work orders / issues | Dept-owned only | Dept-owned only | Yes (where EQUIPMENT_MAINTENANCE) |
| Plant inspections | No | No | Yes (where INSPECTIONS) |
| Knowledge | Department-scoped articles | Department-scoped articles | Department-scoped articles |
| Readiness | Dietary profile | EVS profile | Plant profile |

### Dietary-specific rules

Meal-service data (ServeryMealServiceEvent, UnitMealTime, meal boards) appears only when:
- Active department is Dietary (or Facility Overview)
- Location has Dietary responsibility with SERVICE_OPERATIONS capability
- Location is SERVERY type or has a SERVICE_AREA child space

Dietary logs appear only when:
- Active department is Dietary (or Facility Overview)
- Location has Dietary responsibility with COMPLIANCE capability
- LogAssignment/LogSubmission exist for that unit

### EVS-specific rules

Room/area cleaning state appears only when:
- Active department is EVS (or Facility Overview)
- Location has EVS responsibility with CLEANING or SANITATION capability
- RoomAreaStatus exists for that location

EVS assignment and discharge/isolation data appears only when:
- Active department is EVS
- Location has EVS responsibility with SERVICE_OPERATIONS capability

### Plant-specific rules

Assets and work orders appear only when:
- Active department is Plant (or Facility Overview)
- Location has Plant responsibility with EQUIPMENT_MAINTENANCE, ASSET_MANAGEMENT, or BUILDING_MAINTENANCE capability

Plant inspections appear only when:
- Active department is Plant
- Location has Plant responsibility with INSPECTIONS capability

### Facility Overview (leadership)

Facility Overview may show:
- All departments' health summaries, labeled by department
- Cross-department issues and inspections
- Department-labeled staffing and assignment data
- No single flattened workspace mixing all departments' controls

---

## Capability-to-domain mapping

| Domain data | Required capability | Notes |
|-------------|-------------------|-------|
| Meal service events | SERVICE_OPERATIONS | Dietary only (model is ServeryMealServiceEvent) |
| Meal times | SERVICE_OPERATIONS | Dietary only |
| Dietary logs | COMPLIANCE | LogAssignment/LogSubmission |
| Room/area cleaning status | CLEANING | RoomAreaStatus |
| Discharge/isolation work | CLEANING or SANITATION | EVS workflows |
| Assets | ASSET_MANAGEMENT or EQUIPMENT_MAINTENANCE | |
| Work orders / repairs | EQUIPMENT_MAINTENANCE or BUILDING_MAINTENANCE | Cross-dept visibility for requesting dept |
| Inspections | INSPECTIONS | Department-scoped definitions |
| Knowledge | Any responsibility | Filtered by article department scope |
| Readiness | Any responsibility | Uses department-specific profile |
| Staffing / scheduling | SERVICE_OPERATIONS or any PRIMARY | |
| Operational assignments | SERVICE_OPERATIONS | Department-scoped |

---

## Implementation approach

Visibility filtering is applied in the existing application layer, not in the database:

1. **Loaders** check department responsibility and capabilities when loading data for a location
2. **Components** receive department-scoped view models — they do not filter themselves
3. **Workspace composition** already supports department-specific content through `scopeInputsForContext()`

No new middleware or policy engine is needed. The existing department-context pattern (active department from session/cookie) combined with responsibility capability checks provides the filtering.

---

## Backward compatibility

When capabilities are empty (legacy UnitDepartmentResponsibility rows), visibility defaults to current behavior: the department sees all domain data at that unit. This preserves existing functionality while the capability system is adopted.

Migration to capability-based visibility happens per-domain, per-surface, tested independently.
