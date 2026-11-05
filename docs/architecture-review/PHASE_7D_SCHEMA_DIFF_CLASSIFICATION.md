# Phase 7D schema diff classification

Checked on 2026-11-04 against a disposable database, `ltc_verify_phase7d_schema_20261104`. The database was created with the repository verify helpers, received `prisma migrate deploy` (175 migration directories, deploy exited 0), then `prisma migrate diff --from-url <disposable> --to-schema-datamodel prisma/schema.prisma --script --exit-code`. Exit code 2. The database was dropped afterward. `ltc_manager` was not used.

The earlier certification summarized this as 29 changed tables. The script contains 44 statements because several of those tables have more than one index or default. Every statement is classified below. None is category C or D.

PostgreSQL limits identifiers to 63 bytes. Prisma’s desired name includes the `_idx` or `_key` suffix inside that budget, so it shortens a different part of the name than the migration that created the object. `migrate diff` reports a rename. The indexed columns and the constraint kind are unchanged. A `map` on each `@@index` / `@@unique` / relation would make Prisma expect the stored name and would silence these lines. That edit is not applied here: a wrong map would turn the next diff into a real rename migration. The stored names already enforce the same columns.

## A — identifier truncation

These statements are renames only.

| Object | Kind | What differs |
| --- | --- | --- |
| `DepartmentOperationalCycle` | two indexes | `departmentId, status, displaySequence…` and `facilityId, departmentId, effectiveFrom…` |
| `DepartmentOperationalCycleEvent` | index | `facilityId, departmentId, created…` |
| `DepartmentOperationalCycleKeyTimeGroup` | index | `cycleId, displaySequence…` |
| `DepartmentOperationalCycleKeyTimeGroupRoom` | unique index | `keyTimeGroupId, space…` |
| `DepartmentOperationalCycleMilestoneTime` | unique index | `cycleId, unitId, milestone` |
| `DepartmentRequestRoute` | index and unique index | requesting department active flag; requesting/responding unique |
| `EmployeeOperationalRoleQualification` | unique index and index | unique `(employeeId, departmentId, roleKey)`; index `(facilityId, departmentId)` |
| `FacilityDepartmentEntitlement` | unique index | `(facilityBillingId, departmentKey)` |
| `FacilityPartnerDepartmentScope` | foreign key | `facilityPartnerOrganizationId` |
| `FacilityPartnerRoleCeilingPeriod` | foreign key | `facilityPartnerOrganizationId` |
| `FacilityPartnerStaffingPolicyPeriod` | foreign key | `facilityPartnerOrganizationId` |
| `FacilityPartnerUserRestrictionPeriod` | foreign key | `facilityPartnerOrganizationId` |
| `KnowledgeArticleCatalogDefinition` | unique index | `(articleId, catalogDefinitionId)` |
| `MenuItem` | index | `(facilityId, weekNumber, dayIndex, mealPeriodKey, category)` |
| `OperationalAssignmentEligibilityException` | two indexes | `(assignmentId, createdAt)` history index; `(facilityId, departmentId)` |
| `OperationalAssignmentPlan` | unique index | `(facilityId, departmentId, serviceDate)` |
| `OperationalAssignmentTemplate` | index | `(facilityId, departmentId, effective…)` |
| `OperationalCycleDayExpectation` | index and unique index | facility/department/service date; `(serviceDate, cycleId, unitId, milestone)` |
| `OperationalCycleKeyPointActual` | index | facility/department/service date |
| `OperationalCycleKeyTimeDayExpectation` | index, unique index, and foreign key | facility/department; `(serviceDate, cycleId, space…)`; `completedByEmployeeId` |
| `OperationalCycleTimingAdjustment` | index | facility/department/service date |
| `OperationalEvidenceFieldValue` | unique index | `(recordId, fieldKey, groupKey, rowKey)` |
| `OperationalRecordWaiver` | index | facility/department/operational date |
| `OperationalRequest` | unique index and index | client command unique; responsible department/status |
| `OrganizationMemberInvitation` | index | `(organizationId, targetEmailNormalized)` |
| `PartnerUserFacilityAccess` | unique index | `(userId, facilityPartnerOrganizationId)` |
| `PreventiveMaintenancePlanRecordRequirement` | foreign key, index, and unique index | `catalogDefinitionId`; plan version plus catalog unique |

The qualification unique key is present. It is not missing. The exception history index is `(assignmentId, createdAt)`. There is no unique constraint on `assignmentId` alone, so a later role change can insert a second exception row. That was also proven by the qualification SQL test.

## B — historical migration artifact

| Object | Statement | Why it is acceptable |
| --- | --- | --- |
| `DepartmentOperationalCycleMilestoneTime.updatedAt` | drop default | The column is Prisma `@updatedAt`. The client writes it. The database default is leftover from the creating migration and does not change a Prisma write. |
| `OperationalCycleDayExpectation.updatedAt` | drop default | Same `@updatedAt` case. |
| `MenuItem.mealPeriodKey` | drop default | `20260430110000_menu_period_builder` added the column `NOT NULL DEFAULT 'BREAKFAST'` and backfilled it. The current field is a required string with no `@default`. Application writes always send `mealPeriodKey`. The leftover default only affects a raw insert that omits the column. |
| `Attachment` | create indexes on `createdByUserId` and `createdByEmployeeId` | The schema declares `@@index` on those foreign keys. `20260514180000_evs_plant_operations` created the foreign keys and did not add these secondary indexes. PostgreSQL does not index foreign keys automatically. Lookups by creator can scan. Uniqueness and delete behavior are unchanged. |
| `RoomAreaStatus` | drop `facilityId, statusDate`; create `facilityId`, `unitId, statusDate`, and `updatedByEmployeeId` | `20260514180000_evs_plant_operations` created `(facilityId, statusDate)`. The model now declares `@@unique([unitId, statusDate])`, `@@index([facilityId])`, `@@index([unitId, statusDate])`, and `@@index([updatedByEmployeeId])`. The unique constraint is already present, so it is absent from the diff. The compound facility/date index still serves facility-scoped reads. Replacing it would only match the current secondary-index list. |

## C — genuine schema drift

None. No statement changes a unique rule, a required column, a foreign-key action, or a check that the running product depends on.

## D — uncertain

None.

## Resolution

No forward migration is added. Renaming truncated identifiers, dropping the historical `MenuItem` default, or swapping the `RoomAreaStatus` secondary indexes would not change a product rule. The qualification unique key and the exception history index already match the intended workforce model.
