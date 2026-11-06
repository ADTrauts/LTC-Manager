# 01 — Current Unit Model Audit

## Schema: Unit model

The `Unit` model already has hierarchical support via `parentUnitId`:

```
Unit
  id                        String       PK
  facilityId                String       FK → Facility
  name                      String       unique per facility
  unitType                  UnitType     enum
  parentUnitId              String?      FK → Unit (self-referential)
  isActive                  Boolean
  displayOrder              Int
  description               String?
```

**Key observation:** The Unit model already supports parent-child relationships. It is not flat.

---

## Schema: UnitType enum

```
SERVERY          ← Dietary-specific
KITCHEN          ← Dietary-specific
RETAIL           ← Dietary-specific
OFFICE           ← Generic
STORAGE          ← Generic
OTHER            ← Generic
RESIDENT_AREA    ← Added for EVS (Wave 13+)
COMMON_AREA      ← Added for EVS
MECHANICAL       ← Added for Plant
RESTROOM_CLUSTER ← Added for EVS
EVS_ZONE         ← Added for EVS
GROUND           ← Added for Plant
```

12 values. First 6 are original (Dietary-era). Last 6 were added for multi-department support.

**No room-level types exist** (PATIENT_ROOM, UTILITY, etc.).

---

## Schema: UnitDepartmentResponsibility

```
UnitDepartmentResponsibility
  id                  String       PK
  unitId              String       FK → Unit
  departmentId        String       FK → Department
  kind                UnitDepartmentKind   (PRIMARY | BACKUP)
  riskLevel           String?
  cleaningFrequency   String?
  inspectionFrequency String?
```

**Key observation:** This model already exists and maps departments to units. However:
- `kind` only distinguishes PRIMARY / BACKUP — no capability granularity
- `riskLevel`, `cleaningFrequency`, `inspectionFrequency` are EVS-oriented free-text fields
- No concept of responsibility type (CLEANING, MAINTENANCE, SERVICE, etc.)
- The model links departments to units but does not express what the department does there

---

## Foreign key impact map (19 models reference unitId)

| Model | unitId | Required | Domain |
|-------|--------|----------|--------|
| UnitDepartmentResponsibility | FK | Required | Administration |
| ServeryMealServiceEvent | FK | Required | Dietary |
| UnitMealTime | FK | Required | Dietary |
| EmployeeUnitAccess | FK | Required | HR/PIN |
| KioskUnitPinLoginEvent | FK | Required | HR/PIN |
| DefaultAssignment | FK | Required | Staffing |
| ScheduleEntry | FK | Required | Staffing |
| Asset | FK | Required | Plant |
| Repair | FK | Required | Issues/Plant |
| LogAssignment | FK | Required | Logs/Dietary |
| LogSubmission | FK | Required | Logs/Dietary |
| RoomAreaStatus | FK | Required | EVS |
| Task | FK | Required | Work Engine |
| KnowledgeArticleUnit | FK | Required | Knowledge |
| InspectionDefinition | FK | Nullable | Inspections |
| InspectionOccurrence | FK | Nullable | Inspections |
| InspectionSubmission | FK | Nullable | Inspections |
| OperationalAssignment | FK | Nullable | Scheduling |
| OperationalAssignmentTemplateItem | FK | Nullable | Scheduling |

**13 required, 6 nullable.** Renaming the column or changing the target table affects all 19.

---

## Dietary-specific models tied to Unit

| Model | Dietary assumption |
|-------|--------------------|
| ServeryMealServiceEvent | Explicitly meal + servery only |
| UnitMealTime | Meal time schedule per unit — only relevant for SERVERY type |
| LogAssignment / LogSubmission | Often meal-typed, tied to dietary units |

---

## Application-layer Unit usage

### Left sidebar / Location rail
- Renders all active units for the facility
- Shows readiness chips per unit
- Filters by department responsibility when department lens is active
- Routes to `/unit/[unitId]`

### Unit Workspace (`/unit/[unitId]`)
- Largest consumer of unitId
- Renders: readiness, work queue, logs, inspections, issues, servery marks, meal data
- PIN home destination
- Department-specific content already partially scoped

### Operations Center
- Unit cards with readiness and exception state
- Meal boards tied to SERVERY units
- Staffing gaps per unit

### Today's Work
- Walk list ordered by readiness per unit
- Coverage list per unit with staffing
- Call-down list references unit overrides

### Business Workspace
- Readiness computed per unit
- Staffing gaps per unit
- Department health aggregates readiness by unit profile

### Staffing / Assignment Board
- ScheduleEntry references unitId
- OperationalAssignment optionally references unitId
- Coverage list ties employees to units

### Admin / Unit management
- `/units` — CRUD for units
- Admin can set unitType, assign departments, configure meal times
- Parent-child hierarchy configurable through `parentUnitId`

### PIN / Tablet
- `activeUnitId` stored in session/cookie
- Employee locked to specific units via `EmployeeUnitAccess`
- `KioskUnitPinLoginEvent` logged per unit
- PIN home is Unit Workspace for the active unit

### Readiness profiles
- Computed per unit, per department profile key
- Profile keys map to department: DIETARY, EVS, PLANT
- Each unit evaluated against its department's readiness rules

---

## Hardcoded Dietary assumptions found

### In `unit-type-config.ts`
- `unitTypeUsesServingTimes()` returns true only for SERVERY
- `extendedUnitTypeLabels` only labels the non-Dietary types

### In UnitType enum
- SERVERY, KITCHEN, RETAIL are Dietary concepts encoded as global types
- No PATIENT_ROOM, UTILITY, EXTERIOR, or room-level types

### In schema models
- `ServeryMealServiceEvent` — name and structure assume servery + meal
- `UnitMealTime` — meal times only applicable to SERVERY type
- `MealType` enum (BREAKFAST, LUNCH, DINNER, SNACK_AM, SNACK_PM) — deeply integrated

### In Operations Center
- Meal boards show per-servery meal data
- Operation context defaults to meal-service patterns

### In readiness
- Dietary readiness profile checks meal-time violations, log compliance
- SERVERY-specific readiness rules exist

### In route language
- `/unit/[unitId]` — "unit" terminology throughout
- Product docs already prefer "Location" in UI but code uses `Unit`

---

## Summary of current state

**Strengths:**
1. Unit already has hierarchical support (`parentUnitId`)
2. `UnitDepartmentResponsibility` already maps departments to units
3. UnitType enum already includes non-Dietary types (EVS_ZONE, MECHANICAL, etc.)
4. Department-scoped readiness profiles already exist
5. Product language guide already prefers "Location" over "Unit" in UI

**Gaps:**
1. No room/space-level granularity (rooms are not modeled)
2. UnitType lacks room-level types (PATIENT_ROOM, UTILITY, etc.)
3. UnitDepartmentResponsibility has no capability/responsibility type — only PRIMARY/BACKUP
4. Dietary models (ServeryMealServiceEvent, UnitMealTime) are structurally coupled to Unit
5. No responsibility inheritance rules — each unit's responsibilities are independent
6. EVS RoomAreaStatus is tied to Unit level, not room level
7. Assets, repairs, and inspections link to units but cannot target rooms within units
