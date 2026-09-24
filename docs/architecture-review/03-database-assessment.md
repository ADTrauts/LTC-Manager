# 3. Database Assessment

**Source of truth:** `ltc-manager/prisma/schema.prisma`  
**Migrations:** 31 folders under `prisma/migrations/`

## Tenancy and hierarchy

```
Facility (tenancy root — one row typical per deployment)
├── User (email login accounts)
├── Employee (roster / PIN login)
├── Unit (locations / service nodes — hierarchical)
├── Department (DIETARY, EVS, PLANT, etc.)
├── JobTitle
├── WorkShift
├── LogTemplate → LogTemplateField
├── Vendor
├── MenuSettings + MenuItem
├── OnboardingManagerInvite
├── EmployeeHrAuditLog
├── EmployeeTerminationRecord
├── KioskUnitPinLoginEvent
├── Attachment (polymorphic)
└── PreventiveMaintenanceSchedule (via Asset)
```

All operational entities carry `facilityId` directly or through `Unit` / `Employee` / `Facility` relations.

## Every model (41)

### Identity, access, and routing

| Model | Purpose |
|-------|---------|
| `Role` | Permission tier lookup (`RoleKey` enum) |
| `AppRoute` | Registered app paths for nav and permission matrix |
| `RoleRoutePermission` | Role × route allow/deny |

### Facility and org

| Model | Purpose |
|-------|---------|
| `Facility` | Tenancy, billing, onboarding, branding, union handbook path |
| `OnboardingManagerInvite` | Captured manager emails during self-serve setup |
| `Department` | Operational departments per facility |
| `JobTitle` | Display job titles (separate from `RoleKey`) |
| `WorkShift` | Named shift blocks for scheduling |

### Physical / spatial

| Model | Purpose |
|-------|---------|
| `Unit` | Service locations (serveries, kitchens, EVS zones, etc.); self-referential hierarchy |
| `UnitMealTime` | Scheduled meal times per unit |
| `UnitDepartmentResponsibility` | Which departments own/clean/inspect each unit |
| `RoomAreaStatus` | Daily EVS operational status per unit |

### People

| Model | Purpose |
|-------|---------|
| `User` | Email/password app accounts |
| `Employee` | Roster record; PIN, HR fields, union, CHRC |
| `EmployeeDepartment` | Secondary department memberships (floaters) |
| `EmployeeWorkStation` | Kitchen station competencies |
| `EmployeeUnitAccess` | PIN session unit restrictions |
| `DisciplinePointEntry` | Union discipline points |
| `EmployeeHrAuditLog` | Field-level HR change audit |
| `EmployeeTerminationRecord` | Immutable separation snapshots |
| `KioskUnitPinLoginEvent` | Audit when PIN login on wrong unit tablet |

### Staffing

| Model | Purpose |
|-------|---------|
| `DefaultAssignment` | Standing employee ↔ unit ↔ role assignments |
| `ScheduleEntry` | Planned daily schedule rows |
| `AssignmentOverride` | Day-of unit reassignment with reason |

### Compliance logs

| Model | Purpose |
|-------|---------|
| `LogTemplate` | Checklist/form definitions |
| `LogTemplateField` | Fields within a template |
| `LogAssignment` | Which units must complete which templates |
| `LogSubmission` | Completed/missed/failed log instances |
| `LogSubmissionValue` | Per-field answers |

### Menus

| Model | Purpose |
|-------|---------|
| `MenuSettings` | Cycle length, anchor date, week start |
| `MenuItem` | Menu cycle grid (week × day × meal period × category) |

### Servery operations

| Model | Purpose |
|-------|---------|
| `ServeryMealServiceEvent` | Meal ready / started timestamps per unit per day |

### Assets and maintenance

| Model | Purpose |
|-------|---------|
| `Vendor` | Equipment/service vendors |
| `Asset` | Equipment registry |
| `Repair` | Work orders (corrective + preventive-linked) |
| `RepairUpdate` | Repair status notes |
| `PreventiveMaintenanceSchedule` | PM cadence per asset |
| `Attachment` | Files on log submissions or repairs |

## Key relationships

### Facility hub

- `Facility` → has many: `User`, `Unit`, `Employee`, `Department`, `LogTemplate`, `Vendor`, `MenuItem`, etc.
- `User.facilityId` and `Employee.facilityId` enforce single-facility scope per record.

### Unit graph

- `Unit.parentUnitId` → self-relation for floors/zones under buildings.
- `Unit` → `LogAssignment`, `LogSubmission`, `ScheduleEntry`, `Asset`, `Repair`, `ServeryMealServiceEvent`, `RoomAreaStatus`.
- Unique constraint: `@@unique([facilityId, name])`.

### Employee graph

- `Employee` → `primaryUnit`, `primaryDepartment`, `jobTitle`, `roleType` (RoleKey).
- `EmployeeDepartment` M:N for floaters with per-membership `roleType`.
- `EmployeeUnitAccess` M:N for PIN unit restrictions (empty = all units).
- `LogSubmission` can reference `submittedBy` (User) or `submittedByEmployee` (Employee).

### Log pipeline

```
LogTemplate
  └── LogTemplateField[]
        └── LogSubmissionValue[]
LogAssignment (unit + template + recurrence)
  └── LogSubmission (per serviceDate, optional mealType)
```

### Staffing pipeline

```
DefaultAssignment (standing)
ScheduleEntry (planned day)
AssignmentOverride (day-of change, optional link to schedule entry)
```

### Repair routing

```
Repair → Unit (required)
       → Asset? (optional)
       → Vendor? (optional)
       → requestingDepartment / responsibleDepartment
       → assignedEmployee
       → preventiveSchedule? (for PM-generated work)
       → RepairUpdate[], Attachment[]
```

### Permission matrix

```
Role ←→ RoleRoutePermission ←→ AppRoute
```

Seeded routes drive top nav visibility (`navVisible`, `navOrder`).

## Enums (selected)

| Enum | Values (summary) |
|------|------------------|
| `RoleKey` | FACILITY_ADMINISTRATOR, GM, MANAGER, SUPERVISOR, LEAD_TEAM_MEMBER, STAFF |
| `UnitType` | SERVERY, KITCHEN, RETAIL, RESIDENT_AREA, EVS_ZONE, MECHANICAL, etc. |
| `LogFieldType` | YES_NO, NUMBER, TEMPERATURE, DROPDOWN, SHORT_TEXT, LONG_TEXT, PASS_FAIL |
| `LogRecurrence` | DAILY, PER_MEAL, WEEKLY, CUSTOM |
| `RoomAreaOperationalStatus` | CLEAN, DIRTY, OCCUPIED, DISCHARGE, ISOLATION, TERMINAL_CLEAN_PENDING |
| `RepairStatus` | OPEN, IN_PROGRESS, WAITING_PARTS, CLOSED |
| `PreventiveMaintenanceCadence` | WEEKLY, MONTHLY, QUARTERLY, YEARLY |

## Data hierarchy (operational day)

1. **Facility** defines departments, units, templates, roster.
2. **Units** appear in sidebar; staff select **active unit** for context.
3. **ScheduleEntry** + **AssignmentOverride** determine who should be where.
4. **LogAssignment** defines what must be completed per unit.
5. **LogSubmission** records compliance; **ServeryMealServiceEvent** records meal timing separately.
6. **RoomAreaStatus** records EVS state; **Repair** tracks maintenance.
7. **MenuItem** grid drives dietary production visibility on unit dashboards.

## Missing entities (not in schema)

These concepts appear in product discussions or user examples but **have no first-class model**:

| Concept | Current representation / gap |
|---------|------------------------------|
| **Inventory** | Not modeled. No stock, par levels, or consumption tracking. |
| **Messaging / notifications** | Not modeled. No in-app messages, email queue, or push. |
| **Generic Task** | Partially covered by `LogSubmission` (compliance) and `Repair` (maintenance). No standalone task/checklist outside log framework. |
| **Inspection** | Partially via log templates and `RoomAreaStatus`; no dedicated inspection workflow entity. |
| **Location** (as distinct from Unit) | **Unit** is the location primitive. No building/floor/campus layer beyond `Unit` parent hierarchy. |
| **Resident / patient** | Not modeled. LTC resident data is out of scope. |
| **Customer / contract** | Not modeled beyond `Facility.managementCompanyName`. |
| **District / multi-site org** | Single `Facility` per deployment; no parent org aggregating facilities. |
| **Invitation tokens** | `OnboardingManagerInvite` stores email only; no tokenized invite flow in schema. |
| **Audit log (system-wide)** | HR-specific `EmployeeHrAuditLog` only; no general application audit trail. |
| **File storage metadata** | `Attachment` for logs/repairs; union handbook stored as path on `Facility`. |
| **Billing subscription** | Stripe customer + default payment method on `Facility`; no plan/tier/invoice models. |
| **Checklist (generic)** | Implemented as `LogTemplate` + fields — not a separate checklist entity. |

## Schema observations

- **Facility-scoped uniqueness** is consistent (`facilityId` + name/slug patterns).
- **Soft operational flags** use `isActive` on units, templates, departments, shifts.
- **Immutable history** for terminations (`EmployeeTerminationRecord`) and repair updates.
- **Dual submitter** pattern on logs supports both User and Employee sessions.
- **Department** is a first-class routing dimension for assets, repairs, logs, and nav scoping.
