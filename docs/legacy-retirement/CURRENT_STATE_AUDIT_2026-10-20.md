# Legacy Retirement — current-state audit

October 20, 2026. Read-only review of the working tree, starting from the [Legacy Surface Register](../product/LEGACY_SURFACE_REGISTER.md). Counts are approximate file counts. No database was queried. Every row today is test data ([CDA-D17](../contracted-departments/DECISIONS.md#cda-d17--nothing-legacy-at-the-first-real-customer--accepted-user-october-20-2026)).

## Summary

1. **The default is still legacy.**
   - `CANONICAL_LOGS_ENABLED` defaults to `false`.
   - New Departments get no `RecordEngineRollout` row, so they resolve to LEGACY even with the flag on.
   - Seeds create legacy log templates and assignments.
2. **There are two older Records engines, not one.**
   - Legacy logs: `LogTemplate` / `LogAssignment` / `LogSubmission`, at `/logs`.
   - The Phase 9C template engine: `OperationalTemplate`, at `/staffing/templates`.
   - Retiring `/logs` alone leaves the second.
3. **Plant depends on the template engine.**
   - Preventive-maintenance plans and work orders require Records through `PreventiveMaintenancePlanRecordRequirement` and `RepairRecordRequirement`, which pin an `OperationalTemplate` version.
   - There is no forward-engine replacement yet.
   - The Plant starter creates `OperationalTemplate` drafts.
4. **Schedules have two authoring paths on one table.** The legacy unit grid (`/staffing/legacy`) and canonical shifts both write `ScheduleEntry`. Call-offs and moves (`AssignmentOverride`) are still unit-based.
5. **Several projection flags still keep a legacy fallback.** Today's Work and Business Workspace are already scheduled for retirement by the [Dashboard program](../dashboard/README.md) (DSH-04).
6. **Dormant systems still have code and tables:**
   - Task Sync (`TASK_SYNC_ENABLED=false`)
   - the Operation Engine's `OperationDefinition` / `OperationInstance`, whose flag has already been removed
   - `ConsoleTicket`
7. **`/issues` is a facade with a live action file.** Its pages redirect to `/repairs`, but `src/app/(protected)/issues/actions.ts` still performs work-order changes for `/repairs/[id]`.
8. **The register has drifted.** It describes `loadDashboardQueries` as live. That loader has been deleted.

## 1. Records

### Flag and per-Department engine

| Piece | Where | Behavior |
|---|---|---|
| `CANONICAL_LOGS_ENABLED` | `src/lib/feature-flags.ts` (`isCanonicalLogsEnabled`), `.env.example` | Default `false`. About 63 files read it: shell, nav, proxy, BUILD and RUN Records, Log Book, legacy fences, offline, assets, Plant. |
| Engine per Department | `RecordEngineRollout` (`prisma/schema.prisma`), enum `RecordEngineMode { LEGACY, CANONICAL }` | Flag off: always LEGACY. Flag on: latest rollout on or before the service date wins. **No row: LEGACY.** |
| Switch | `scheduleRecordEngineAction` (`admin/departments/[departmentId]/record-engine-actions.ts`), `record-engine-panel.tsx` | Facility Administrator only. Cutover readiness always passes `pmUsesOperationalTemplate: true`, so it always warns about Plant. |
| Write fence | `src/lib/canonical-logs/record-engine.ts` (`assertLegacyRecordWriteAllowed`) | Blocks legacy writers once a Department is CANONICAL. No dual write. |

### Legacy logs (`/logs`)

- **Models:** `LogTemplate`, `LogTemplateField`, `LogAssignment`, `LogSubmission`, `LogSubmissionValue`, `KnowledgeArticleLogTemplate`.
- **Writers:** `src/app/(protected)/logs/actions.ts` (create template and field, create and toggle assignment, submit), all fenced.
- **Readers:**
  - `/logs`
  - `/reports?view=legacy` (`legacy-report.tsx`)
  - the units page loader (`src/lib/locations/load-units-page.ts`)
  - knowledge links
  - the Work adapter `log-task.ts`
- **Menus:** `/logs` is the only production caller of `loadFacilityMenuData` (temporary compatibility in `src/lib/menu-db.ts`).
- **Scale:** about 75 files and 25 tests. There is no offline path for legacy submissions.
- **Forward coverage:** the Catalog → Attachment → Record engine handles logs, checklists, inspections and repeating Records.
- **The forward Catalog has only Food & Nutrition forms.**
  - `src/lib/canonical-logs/catalog-seed.ts` publishes nine definitions: coolers, freezers, food temperature, receiving, two dish machine logs, three-bay sink, ice machine cleaning and an opening checklist.
  - There are no Plant or EVS definitions.
  - Legacy presets with no Catalog match: the EVS restroom sanitation round, the Plant generator weekly run log, and dry storage ambient.
  - Plant template presets with no Catalog match: equipment condition inspection, mechanical room inspection, generator inspection, basic equipment reading and post-work-order verification (`src/lib/operational-evidence/template-presets.ts`).
  - Attachments can already target an asset (`LogAttachmentTargetKind.ASSET`).
- **Gaps:**
  - no carry-over of history
  - facility-custom templates with no Catalog match stay unclassified
  - the per-meal temperature hints `/logs` builds from menus have no forward equivalent

### Legacy inspections (`/admin/inspections`)

- **Models:** `InspectionDefinition`, `InspectionDefinitionItem`, `InspectionOccurrence`, `InspectionSubmission`, `InspectionSubmissionItem`, `KnowledgeArticleInspectionDefinition`.
- **Code:** `src/lib/work/inspections/` (about 18 files) and `admin/inspections/actions.ts`. Writers are fenced when the flag is on.
- **Forward coverage:** Catalog purpose `INSPECTION`, plus scoring (`src/lib/canonical-logs/inspection-score.ts`).
- **Gaps:** no carry-over of definitions; knowledge links still point at `InspectionDefinition`.

### Template engine (`OperationalTemplate`, Phase 9C)

| Caller | Paths | Forward replacement |
|---|---|---|
| `/staffing/templates` builder | page, `actions.ts`, `src/lib/operational-evidence/template-service.ts` | Partial: Catalog and `/build/logs` cover Dietary-style Records |
| **Plant PM record requirements** | `PreventiveMaintenancePlanRecordRequirement`; `src/lib/preventive-maintenance/` (plan service, builder and run loaders, work-order creation) | **None** |
| **Work-order record requirements** | `RepairRecordRequirement`; `src/lib/asset-operations/work-order-closeout.ts` | **None** |
| Compatibility runtime when the flag is off | `resolve-requirements.ts`, `load-runtime-evidence.ts` | Only for Departments that are CANONICAL and have Attachments |
| Offline template sync | `src/lib/offline/process-sync-command.ts`, `build-runtime-bundle.ts` | Fenced for CANONICAL Departments |
| Template-backed `submitEvidenceRecord` | `src/lib/operational-evidence/submit-evidence.ts` | Forward submit is `submitCanonicalLogSubmission` |
| Plant starter and presets | `src/lib/department-products/plant-starter.ts`, `template-presets.ts` | None for Plant |

About 67 files and 24 tests mention it.

**How Plant requires Records today.**
- A preventive-maintenance plan version lists required templates. Each work order created from the plan copies them as `RepairRecordRequirement` rows.
- A supervisor can also add or remove a required template on any open work order.
- Each requirement is PENDING, SATISFIED or WAIVED. The assigned technician satisfies it with a Record from the same template. A supervisor can waive it with a written reason.
- A PENDING requirement blocks completion (`src/lib/asset-operations/work-order-closeout-gate.ts`).

**The forward Record shares parts of it.** `OperationalEvidenceRecord` is the forward fact store. It still has:
- an optional `templateId` relation to `OperationalTemplate`
- snapshot columns named `templateStableKey`, `templateVersion` and `templateName`
- the enums `OperationalTemplatePurposeType` and `OperationalTemplateScheduleKind`

Retiring the template engine removes the relation and template-backed writes. It does not remove the Record, its snapshot columns or those enums.

### Dietary meal timing

- **Legacy stores:** `ServeryMealServiceEvent`, `ServeryMilestoneEntry`, `UnitMealTime`.
- **Router:** `src/lib/dietary/route-meal-timing.ts` picks one writer: Key Points (`OperationalCycleKeyPointActual`), or the legacy store when the Department's Cycles still expect READY / SERVICE_STARTED milestones.
- **`UnitMealTime`:** no longer written by the Units builder, but still seeded and still read in a few places.

### Location matching by physical type

- **Still live:** Operational Cycles (`UNIT_TYPES` / `ROOM_TYPE` in `src/lib/operational-cycles/cycle-applicability.ts`) and template applicability (`SPACE_TYPE` / `ASSET_TYPE`).
- **Not used:** the forward Records engine does no physical-type matching.

### Seeds and provisioning

`prisma/seed.mjs`, `prisma/apply-log-template-presets.mjs` (9 presets for Dietary, EVS and Plant), `scripts/provision-facility.mjs`, `scripts/bootstrap-pilot-facility-admin.mjs` and `scripts/backfill-log-template-presets.mjs` create legacy log templates and assignments. The seed also creates the forward Catalog seeds, so every fresh database has both.

## 2. People & Coverage

| Surface | Detail |
|---|---|
| Legacy schedule grid | `/staffing/legacy`. Writers: `createScheduleEntryAction`, `deleteScheduleEntryAction` (`staffing/actions.ts`). Writes `ScheduleEntry` with unit, meal shift type and role. |
| Canonical shifts | `staffing/schedule/actions.ts` → `src/lib/scheduling/canonical-shift-service.ts`. The Department is required; the unit is optional. |
| Shared table | `ScheduleEntry` holds both. Retirement is behavior, not a table change. |
| Call-offs and moves | `createOverrideAction` → `AssignmentOverride`. Unit-based. Read by Today's Work call-offs, the assignment board and review facts. No canonical replacement. |
| Links into the old grid | `src/lib/todays-work/coverage-list.ts`; "Legacy unit staffing" in `src/components/scheduling/schedule-toolbar.tsx` |

## 3. Home surfaces (Dashboard program)

| Surface | Retired by |
|---|---|
| Today's Work (`/today*`, `TODAYS_WORK_ENABLED` default `true`) | DSH-04 |
| Business Workspace (`/workspace`) | DSH-04 (redirect from DSH-02) |
| `PROJECTION_TODAYS_WORK_ENABLED`, `PROJECTION_BUSINESS_WORKSPACE_ENABLED` (default `false`) | Go with those surfaces |
| `WorkspacePreference` | DSH-05 decision |
| `/dashboard`, `/operations` redirects | `/dashboard` becomes the new Dashboard (DSH-02) |

## 4. Maintenance and assets

| Surface | Detail |
|---|---|
| `/issues` facade | The pages redirect to `/repairs`. `issues/actions.ts` is still the work-order action file used by `src/components/issues/issue-detail-actions.tsx` on `/repairs/[id]`. Quick actions, nav prefixes and AI snapshots still link `/issues`. |
| `Repair.issueType`, `AssetIssue.workOrderId` | Compatibility fields. Authority is `Repair.issueId`. |
| `PreventiveMaintenanceSchedule`, `Repair.preventiveScheduleId` | Legacy read-only. No app writers. |
| `AssetStatus.ACTIVE` | Legacy synonym for OPERATIONAL, normalized on read and write |
| `Facility.managementCompanyName` | Legacy string. Still written by provisioning and onboarding. Read to seed maintainer names (`src/lib/asset-operations/responsibility.ts`). |

## 5. Dormant systems

| System | What remains |
|---|---|
| Task Sync | `TASK_SYNC_ENABLED=false`. `src/lib/work/run-guarded-task-sync.ts` and adapters, still called by repair, issue and inspection writers. |
| `Task` model | Written only by the Task Sync adapters (`log-task.ts`, `repair-task.ts`) and legacy inspection work. Read by the unit page task action, the work-order detail page and the AI operational snapshot. Not the Work Plans model. |
| Operation Engine | Engine code and flag deleted. `OperationDefinition` / `OperationInstance` tables remain, and about 30 files still carry `operationInstanceId`: staffing assignment actions and templates, the assignment board, inspection work, the Task adapters, servery milestones and the AI brief caches. |
| `ConsoleTicket` | Transitional tables, no runtime use. `SupportTicket` is the forward model. |

## 6. Platform leftovers

- **Projection fallbacks:** `PROJECTION_LOCATIONS_ENABLED` and `PROJECTION_SIDEBAR_ENABLED`, both default `true`. Turning them off brings back legacy unit lists.
- **Route mirror:** `AppRoute` / `RoleRoutePermission`, a non-authoritative mirror seeded from `prisma/legacy-route-mirror.json` (`src/lib/route-registry/legacy-mirror.ts`).
- **Legacy report:** `/reports?view=legacy`.
- **Old deep links:** quick actions still link `/dashboard`, `/issues` and `/admin/inspections` (`build-quick-actions.ts`).
- **Legacy hierarchy:** the `LEGACY_LOCATION` value of `UnitHierarchyRole` and its display mapping.
- **Old concept map:** `src/lib/experiences/compatibility.ts`.
- **Redirect-only routes:** `/settings` (to `/admin/organization`), `/build/knowledge` (to `/admin/knowledge`), `/operations`, `/issues`. Registered in `src/lib/route-registry/platform-routes.ts`.
- **Legacy work-order statuses:** `RepairStatus.CLOSED` and `WAITING_PARTS` are "retained for legacy rows" (schema comment). `Repair.resolution` is a compatibility note; the close-out summary is `workPerformed`.

## 7. Not legacy (keep)

| Item | Why it stays |
|---|---|
| `FacilityOrganization` | Forward maintainer model (CDA-D18) |
| `ScheduleEntry` table | Canonical shifts use it |
| `Repair` / `AssetIssue` persistence names | Register: persistence names under the Work Order and Issue nouns |
| `DepartmentRoomArchetype` persistence | Identity is the Product `functionKey` |
| Review-named internal modules | Naming only; the product surface is Audit / Reports |
| Partner access (`/partner`) | Not legacy. Its vendor-account future is CDA-05. |

## 8. Feature flags that are legacy switches

| Flag | Default | Legacy side |
|---|---|---|
| `CANONICAL_LOGS_ENABLED` | `false` | Off means legacy Records |
| `PROJECTION_LOCATIONS_ENABLED` | `true` | Off means legacy unit eligibility |
| `PROJECTION_SIDEBAR_ENABLED` | `true` | Off means legacy flat unit list |
| `PROJECTION_TODAYS_WORK_ENABLED` | `false` | Off means legacy Today's Work assembly |
| `PROJECTION_BUSINESS_WORKSPACE_ENABLED` | `false` | Off means legacy Workspace assembly |
| `TODAYS_WORK_ENABLED` | `true` | Gates a surface being retired |
| `TASK_SYNC_ENABLED` | `false` | Dormant dual-write |
| `DIETARY_OPERATIONAL_EVIDENCE_ENABLED` | `false` | Gates the template-engine runtime |

## 9. Register drift

- `loadDashboardQueries` is deleted; the register still describes it as live.
- `OPERATION_ENGINE_ENABLED` is gone from code ("Operations Engine is deleted" in `feature-flags.ts`); register row 10 still says it "remains false".
- Register row 3 and the August 9 amendment describe `/dashboard` and `/operations` redirecting to `/workspace` or `/today`. The Dashboard program reuses `/dashboard` (DSH-02).
