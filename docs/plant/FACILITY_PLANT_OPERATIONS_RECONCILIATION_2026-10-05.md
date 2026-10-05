# Facility Plant Operations — Phase 0 + Phase 1 Reconciliation

**Date:** 2026-10-05  
**Mode:** PLAN / AUDIT ONLY — no runtime, migrations, or model/route renames  
**Canonical Product architecture:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Classification of this file:** SUPPORTING (repository audit). It does not override [14](../product/14_FACILITY_PLANT_OPERATIONS.md).

This record answers: **what the current Vssyl repository needs to change in order to become the approved Facility Plant Operations Product, while preserving certified Platform architecture and historical truth.**

---

## A. Phase 0 documentation changes

See the Git diff for the exact patch. Intended lock:

| Action | File | Class after this phase |
|--------|------|-------------------------|
| Created | `docs/product/14_FACILITY_PLANT_OPERATIONS.md` | CURRENT CANONICAL Product architecture |
| Created | this file | SUPPORTING audit |
| Modified | `docs/product/README.md` | Index — points to 14 |
| Modified | `docs/product/01_PRODUCT_CONSTITUTION.md` | Platform map — Plant designed, DEVELOPMENT |
| Modified | `docs/product/13_DEPARTMENT_PRODUCT.md` | Contract filled by 14; still DEVELOPMENT |
| Modified | `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md` | Product name + Request / Issue / Work Order |
| Modified | `docs/product/07_PRODUCT_BOUNDARIES.md` | Assets/repairs vs Product |
| Modified | `docs/product/10_PRODUCT_ROADMAP.md` | Historical; no longer “design has not started” |
| Modified | `docs/product/03_PRODUCT_DOMAIN_MODEL.md` | Issue / Repair / Work Order language |
| Modified | `docs/product/05_OPERATIONAL_PHILOSOPHY.md` | Cycles not required for Plant |
| Modified | `AGENTS.md` | Agent pointer to 14 |
| Modified | `memory-bank/project-overview.md` | Pointer only |
| Bannered | `docs/plant/PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md` | HISTORICAL / SUPERSEDED for Product architecture |
| Bannered | `docs/plant/PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md` | HISTORICAL |
| Bannered | `docs/plant/PLANT_MANAGER_SETUP_GUIDE.md` | LEGACY operational guide for Phase 12A |
| Bannered | `docs/plant/PLANT_SUPERVISOR_GUIDE.md` | LEGACY operational guide for Phase 12A |
| Bannered | `docs/plant/PLANT_TECHNICIAN_GUIDE.md` | LEGACY operational guide for Phase 12A |
| Bannered | `docs/plant/CROSS_DEPARTMENT_SERVICE_REQUEST_GUIDE.md` | LEGACY operational guide for Phase 12A |

**Canonical source established:** `docs/product/14_FACILITY_PLANT_OPERATIONS.md`.

**Product remains DEVELOPMENT.** No registry `status` change. No Marketplace exposure. No `PLANT_OPERATIONS_ENABLED` default change. Registry display name remains `Plant Operations` in code until a later implementation phase.

### Older Plant / Maintenance documentation classification

| Document | Classification | Notes |
|----------|----------------|-------|
| `docs/product/14_FACILITY_PLANT_OPERATIONS.md` | CURRENT CANONICAL | Target Product architecture |
| `docs/product/01_PRODUCT_CONSTITUTION.md` | CURRENT CANONICAL (platform map) | Defers Plant Product design to 14 |
| `docs/product/13_DEPARTMENT_PRODUCT.md` | CURRENT CANONICAL (install/release contract) | Does not override 14’s domain model |
| `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md` | CURRENT CANONICAL (vocabulary) | Updated for Facility Plant Operations |
| This reconciliation | SUPPORTING | Current-state audit |
| `docs/plant/PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md` | HISTORICAL | 2026-08 ownership trace; conflicts (AssetIssue stays asset-required; Repair is WO SoT by existence) are superseded by 14 |
| `docs/plant/PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md` | SUPERSEDED for Product architecture; HISTORICAL for Phase 12A implementation | Useful for what shipped behind `PLANT_OPERATIONS_ENABLED` |
| `docs/plant/PLANT_*_GUIDE.md` + cross-department request guide | LEGACY | Flag-gated how-to for the reference layer |
| `docs/assets/DIETARY_ASSET_OPERATIONS_*` and Dietary asset/WO/issue guides | SUPPORTING for Platform Assets / repairs | Not the Facility Plant Operations Product |
| `docs/product/07_PRODUCT_BOUNDARIES.md` | CURRENT CANONICAL (non-ownership) | Updated so Assets/repairs are not mistaken for the Product |
| `docs/product/10_PRODUCT_ROADMAP.md` | HISTORICAL | Wave record |
| `docs/department-operational-profiles/*` Plant / PM mentions | LEGACY / compatibility | Experience-catalog era |
| `docs/architecture-review/*` PM/schema notes | HISTORICAL | Snapshot of earlier schema |
| `docs/reference-capabilities/05_ASSET_AND_LOCATION.md` | SUPPORTING / historical capability notes | Not Product authority |
| `docs/platform-vision/*` | HISTORICAL | Earlier target-state sketches |
| Manufacturing/fleet/biomedical maintenance | UNRELATED | Outside Product boundary |

---

## B. Current repository map

### Models (`prisma/schema.prisma`)

| Model | Role today |
|-------|------------|
| `Asset` | Single facility Asset registry. Required `unitId`. Optional space, department, responsible organization, vendor, manufacturer/model/serial, facility tag, warranty, `retiredAt`. `status` mixes lifecycle and condition. |
| `AssetStatusHistory` | Append-only status changes with optional issue/repair provenance. |
| `AssetIssue` | Asset-required reported condition. Optional 1:1 `workOrderId` → `Repair`. |
| `AssetIssueUpdate` / `AssetIssueEvidenceLink` | Issue history and Record links. |
| `OperationalRequest` | Cross-department intake. Asset optional. Optional 1:1 WO and 1:1 related AssetIssue. |
| `OperationalRequestUpdate` / `OperationalRequestEvidenceLink` | Request history and Record links. |
| `DepartmentRequestRoute` | Configurable requesting → responsible department routes. |
| `Repair` | Persistent work-order row. `assetId` optional; `unitId` required; no `spaceId`. `workOrderKind` CORRECTIVE/PREVENTIVE. |
| `RepairUpdate` | WO history; `requesterVisible` flag. |
| `PreventiveMaintenanceSchedule` | Asset-required cadence + `nextDueAt`. No procedure/record/version/lead-time/occurrence table. |
| `Vendor` | Facility-scoped contact. Linked from Asset and Repair. |
| `FacilityOrganization` | Responsible organization for maintaining Assets (not Vendor, not platform Organization). |
| `Attachment` | Parents: LOG_SUBMISSION, REPAIR, ASSET. Not Request or Issue. |
| `InspectionDefinition` / `Occurrence` / `Submission` | Legacy inspection engine. |
| `LogTemplate` / `LogSubmission` | Legacy log engine. |
| `CatalogLogDefinition` / `LogAttachment` / `OperationalEvidenceRecord` | Canonical Records. |
| `KnowledgeArticle` / `KnowledgeArticleAsset` | Procedures/resources. No version column. |
| `DepartmentWorkPlan` / `DepartmentWorkItem` / `DepartmentWorkOccurrence` | Shared Work. Plant has no presets. |
| `OperationalAssignment*` | Daily coverage. Distinct from `Repair.assignedEmployeeId`. |
| `Task` | Optional dual-write projection over logs/repairs/inspections. Dormant unless `TASK_SYNC_ENABLED`. |
| `Employee` / `EmployeeDepartment` | People. No Technician model. |

### Enums (current)

- `AssetStatus`: ACTIVE, OPERATIONAL, DEGRADED, OUT_OF_SERVICE, RETIRED
- `AssetCriticality`: CRITICAL, IMPORTANT, ROUTINE
- `RepairPriority`: LOW, MEDIUM, HIGH, URGENT
- `RepairStatus`: OPEN, ASSIGNED, IN_PROGRESS, WAITING_PARTS, WAITING_ON_VENDOR, ON_HOLD, COMPLETED, CANCELLED, CLOSED
- `WorkOrderKind`: CORRECTIVE, PREVENTIVE
- `RepairTrade`: EQUIPMENT, PLUMBING, ELECTRICAL, GENERAL
- `IssueType` (on Repair): EQUIPMENT, SUPPLY_SHORT, ENVIRONMENT, SAFETY, SERVICE_DISRUPTION, OTHER
- `OperationalRequestStatus`: REPORTED, ACKNOWLEDGED, UNDER_REVIEW, WORK_ASSIGNED, WORK_IN_PROGRESS, WAITING_ON_VENDOR, WAITING_ON_PARTS, MONITORING, RESOLVED, CLOSED, CANCELLED, REOPENED
- `AssetIssueStatus`: REPORTED, ACKNOWLEDGED, TRIAGED, MONITORING, RESOLVED, CLOSED, CANCELLED
- `PreventiveMaintenanceCadence`: WEEKLY, MONTHLY, QUARTERLY, YEARLY

### Services / actions

| Area | Paths |
|------|--------|
| Assets | `src/lib/asset-operations/asset-service.ts`, `ownership.ts`, `history.ts`; `src/app/(protected)/assets/actions.ts` |
| Issues | `src/lib/asset-operations/issue-service.ts`; `src/app/(protected)/asset-issues/actions.ts` |
| Work Orders | `src/lib/asset-operations/work-order-service.ts`; `src/app/(protected)/repairs/actions.ts` |
| Requests | `src/lib/operational-requests/request-service.ts`, `authority.ts`, `routing-service.ts`; `src/app/(protected)/operational-requests/actions.ts` |
| Legacy Repair-as-Issue | `src/lib/work/issues/`; `src/app/(protected)/issues/actions.ts`; unit `createUnitIssueAction` |
| Shared Work | `src/lib/department-work/` |
| Records | `src/lib/canonical-logs/`; `src/lib/audit/` |
| Knowledge | `src/lib/knowledge/` |
| Registry | `src/lib/department-products/registry.ts` (`PLANT`, DEVELOPMENT, Healthcare / Hospital + LTC) |

### Routes / views

| Route | Current class |
|-------|----------------|
| `/assets` | ACTIVE RUN Maintenance (Assets) |
| `/assets/builder` | ACTIVE BUILD Asset Builder |
| `/assets/[assetId]` | ACTIVE; page gated by `DIETARY_ASSET_OPERATIONS_ENABLED` (Plant flag does not open this page) |
| `/asset-issues/[issueId]` | ACTIVE Phase 10A Issue detail (no list route) |
| `/repairs`, `/repairs/[id]` | ACTIVE RUN Maintenance (Repairs / WO queue) |
| `/issues`, `/issues/[issueId]` | REDIRECT → `/repairs` |
| `/admin/inspections` | LEGACY hidden |
| `/staffing/operations` | ACTIVE supervisor board; Plant triage/routing composed here when flag + PLANT dept |
| `/admin/knowledge` | ACTIVE BUILD Procedures & Resources |
| `/build/departments/:id` | Department Builder; Plant Work tab usually hidden (no presets) |
| No `/operational-requests` page | Actions exist; `ReportProblemForm` is **not mounted** on app routes |

RUN top nav: one **Maintenance** item with Assets / Repairs / Vendors sub-tabs. That label is a capability grouping, not the Product name.

### Jobs / schedulers

No application job generates Work Orders from `PreventiveMaintenanceSchedule.nextDueAt`. PM is schema + presentation only.

### Tests (representative)

- `src/lib/department-products/department-products.hermetic.test.ts` — PLANT DEVELOPMENT, no work presets, customer-hidden
- `src/lib/department-products/eligibility.hermetic.test.ts` / `customer-selection.hermetic.test.ts`
- `src/lib/asset-operations/phase-10a-asset-operations.test.ts` — WO complete ≠ return to service
- `src/lib/operational-requests/phase-12a-operational-requests*.ts`
- `src/lib/plant/phase-12a-plant-operations.test.ts`
- `src/lib/canonical-logs/record-engine.hermetic.test.ts`
- `tests/plant-browser/ci-gate.spec.ts`

### Feature flags

| Flag | Default | Effect |
|------|---------|--------|
| `PLANT_OPERATIONS_ENABLED` | **false** | Single Plant engine gate (job flow, assets authority, work plans admission, request routing/triage) |
| `DIETARY_ASSET_OPERATIONS_ENABLED` | false | Dietary asset ops **and several pages** (asset profile) |
| `CANONICAL_LOGS_ENABLED` | false | Canonical Records; fences legacy log/inspection writes |
| `TASK_SYNC_ENABLED` | false | Dormant Task projection |
| `OPERATIONAL_ASSIGNMENTS_ENABLED` | false | Coverage assignments |

**Visibility:** `isDepartmentProductCustomerVisible` requires AVAILABLE. Tests assert PLANT is DEVELOPMENT, excluded from Marketplace catalog, rejected by `resolvePublishedDepartmentProductKeys`, and not customer-operable. Harbor staff can still see DEVELOPMENT rows. Internal `installDepartmentProductForInternalDevelopment` may materialize PLANT for local/dev.

---

## C. Reconciliation table

| Existing object | Current meaning | Target meaning | Classification | Recommended disposition |
|---|---|---|---|---|
| `Asset` | Shared equipment registry; `status` mixes condition + retirement | Shared Platform Asset; separate lifecycle and condition | CANONICAL PLATFORM PRIMITIVE | Keep as the only Asset identity. Split lifecycle vs condition in a later Platform migration. Do not create `PlantAsset`. |
| `AssetStatusHistory` | Append-only status change facts | Asset History source | CANONICAL PLATFORM PRIMITIVE | Keep. Extend reasons if lifecycle/condition split. |
| `Asset.departmentId` | Operating/owning department on the Asset | Operating ownership vs maintenance responsibility should be distinguishable | NEEDS SEMANTIC CHANGE | Keep field; document vs `FacilityOrganization` and Plant WO responsibility. Do not invent a second Asset. |
| `FacilityOrganization` | Who is responsible for maintaining/repairing the Asset | Shared ownership/responsibility metadata | CANONICAL PLATFORM PRIMITIVE | Keep. Not a Plant-only org. |
| `Asset.vendorId` | Preferred repair/service Vendor | Shared preferred Vendor | CANONICAL PLATFORM PRIMITIVE | Keep. |
| `Asset` manufacturer/model/serial/tag/warranty | Optional identity fields already present | Shared Asset identity completeness | CANONICAL PLATFORM PRIMITIVE | Fill UI/validation gaps later; fields exist. |
| `AssetIssue` | Asset-required problem; at most one WO | Canonical Issue (location-capable; many WOs allowed) | NEEDS SEMANTIC CHANGE | Evolve toward canonical Issue: make `assetId` optional; drop 1:1 WO uniqueness. Do not add `PlantIssue`. Preserve historical AssetIssue rows. |
| `AssetIssueUpdate` | Issue chronology | Issue history source | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep as Issue history once Issue is generalized. |
| `AssetIssueEvidenceLink` | Issue ↔ Record | Shared evidence link | CANONICAL PLATFORM PRIMITIVE | Keep. |
| `OperationalRequest` | Cross-dept intake; Asset optional; statuses include WO execution | Canonical Request envelope | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Adopt as shared Request. Narrow statuses so Request does not mirror WO lifecycle. Wire decline/duplicate/resolve-without-work. |
| `DepartmentRequestRoute` | Requesting → responsible dept | Shared request routing | CANONICAL PLATFORM PRIMITIVE | Keep. |
| `Repair` | Persistent WO (`repairCode`, kinds, optional Asset) | Canonical Work Order foundation | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Evolve `Repair` into the Work Order foundation. Persistence name may remain `Repair` until a later rename. Add space, procedure version, required Records, parts lines, labor duration, costs. |
| `RepairUpdate` | WO chronology | Work Order history | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep. |
| `Repair.issueType` | Legacy operational classification on the WO | Not canonical Issue | LEGACY / COMPATIBILITY | Stop using as the Issue noun. Keep column until unused. |
| `/issues` façade (`src/lib/work/issues`) | Product “Issue” over the same Repair row | Request ≠ Issue ≠ WO | LEGACY / COMPATIBILITY | Keep redirects. Do not revive Repair-as-Issue as Product UX. |
| `WorkOrderKind` | CORRECTIVE / PREVENTIVE on Repair | MVP WO kinds | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep. |
| `RepairStatus` | OPEN…CLOSED including WAITING_* and CLOSED | Target OPEN/ASSIGNED/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELED | NEEDS SEMANTIC CHANGE | Map WAITING_* into ON_HOLD+reason; treat CLOSED as legacy synonym of COMPLETED; keep unused enum values for old rows. |
| `RepairPriority` | LOW/MEDIUM/HIGH/URGENT | Target ROUTINE/HIGH/URGENT/EMERGENCY | NEEDS SEMANTIC CHANGE | Do not change enum in Phase 2. Document mapping. |
| `AssetCriticality` | CRITICAL/IMPORTANT/ROUTINE | Shared criticality | CANONICAL PLATFORM PRIMITIVE | Keep distinct from WO priority. |
| `PreventiveMaintenanceSchedule` | Cadence + nextDueAt on an Asset; no generation | Canonical PM Plan + occurrence + WO | NEEDS SEMANTIC CHANGE | Too thin to be the PM Plan. Treat as LEGACY around a correct PM model, or evolve only if versioning/occurrence/idempotency can be added without corrupting `nextDueAt` semantics. **Recommendation: new PM Plan model; keep schedule rows readable.** |
| `Vendor` | Facility vendor contact | Shared Vendor identity | CANONICAL PLATFORM PRIMITIVE | Keep. Do not build procurement. |
| `InspectionDefinition` / Occurrence / Submission | Legacy inspection engine | Shared Record form Inspection | SUPERSEDED | Fence writes when canonical Records on. Historical read remains. |
| `/admin/inspections` | Legacy inspection admin | Records in Department Builder / catalog | LEGACY / COMPATIBILITY | Keep hidden. |
| `LogTemplate` / `LogSubmission` | Legacy logs | Shared Records | SUPERSEDED | Same fence. |
| `OperationalEvidenceRecord` + catalog + `LogAttachment` | Canonical Records | Canonical Records | CANONICAL PLATFORM PRIMITIVE | Target engine for Plant readings/inspections/checklists. |
| `KnowledgeArticle` | SOP/reference; publish/archive; no version | Versioned Procedure | NEEDS SEMANTIC CHANGE | Platform gap: historical procedure identity/version. Work snapshots title only. Repair/PM have no procedure FK. |
| `KnowledgeArticleAsset` | Article ↔ Asset link | Procedure applicability | CANONICAL PLATFORM PRIMITIVE | Keep as a link table, not a Procedure engine. |
| `Attachment` | Files on log/repair/asset | Shared attachments including Request/Issue | NEEDS SEMANTIC CHANGE | Extend parent kinds (Platform) rather than Plant files. |
| `Task` / repair-source adapters | Optional Work Engine projection | Not canonical WO | LEGACY / COMPATIBILITY | Keep dormant. Do not route Plant WO through Task. |
| Shared Work models | Product preset → plan → derived requirement → sparse occurrence | Rounds / walkthroughs | CANONICAL PLATFORM PRIMITIVE | Use for Plant rounds. Add optional presets later; none required now. |
| `OperationalAssignment` | Shift/zone coverage | Coverage, not WO assignment | CANONICAL PLATFORM PRIMITIVE | Keep distinct from WO assignee. |
| `Repair.assignedEmployeeId` | WO ticket owner | Technician assignment on WO | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep; Person is Employee. |
| Plant registry entry (`PLANT`, name “Plant Operations”, HEALTHCARE, Hospital/LTC, DEVELOPMENT) | Internal Department Product stub | Facility Plant Operations, cross-industry facility applicability, DEVELOPMENT until release | NEEDS SEMANTIC CHANGE (metadata only) | Later: display name, industry/facility-type tags. **Do not change status.** |
| Plant capabilities / starters | Roles + responsibility presets; no cycles, work, records, PM | Zero required cycles; optional starter pack later | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Leave empty cycles/work. Do not auto-publish. |
| `domainCapability: "plant"` | Exact-key Plant module hook | Product domain module | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep. |
| Location Functions for PLANT | Empty in product registry | None required | CANONICAL PLATFORM PRIMITIVE (empty set) | Keep empty until a Work preset needs a key. |
| Baseline Plant archetypes (`mechanical_room`, …) | Experience-catalog compatibility | Not Product functionKeys | LEGACY / COMPATIBILITY | Do not treat as Location Functions. |
| `PLANT_FACILITY_WIDE_POLICY` | Facility-wide maintenance policy without cloning rooms | Shared facility tree usage | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep; aligns with “no second location tree.” |
| `/assets`, `/assets/builder` | Platform Asset BUILD/RUN | Platform Asset surfaces | CANONICAL PLATFORM PRIMITIVE | Keep. Align page gates so Plant authority can load profiles when intended. |
| `/repairs` | WO queue (labeled Repairs; nav “Maintenance”) | Plant Work Order queue | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep route until a later rename. Product copy should say Work Order. |
| `/asset-issues/[issueId]` | AssetIssue detail | Future Issue detail | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep; generalize with Issue. |
| `/issues` | Redirect to repairs | Must not be canonical Issue | LEGACY / COMPATIBILITY | Keep redirect. |
| Plant manager/supervisor panels on `/staffing/operations` | Phase 12A triage/routing | Manager view foundation | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Keep behind DEVELOPMENT/flag. Mount requester intake. |
| Current PM signals | Schema only; experience keys in baseline | Due/overdue PM | OPEN as product UX; schema is NEEDS SEMANTIC CHANGE | No runtime PM to classify as canonical. |
| Asset history/timeline | Merges status, issues, repairs, evidence | Asset History projection | CANONICAL PLATFORM PRIMITIVE | Keep. Add PM facts when they exist. |
| Location history | Evidence, Work occurrence, key-point actuals, assignments — **not** Request/Issue/Repair | Location maintenance chronology | NEEDS SEMANTIC CHANGE | Add maintenance source facts to the projection; do not create a ledger. |
| `returnToServiceReady` / `returnAssetToService` | Explicit; WO complete does not mutate Asset | Locked recovery rule | CANONICAL PLATFORM PRIMITIVE / USEFUL FOUNDATION | Keep this invariant. |
| `ReportProblemForm` | Built, not routed | Requester intake | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Mount on real Run surfaces later. |
| `resolveWithoutWorkOrder` | Service exists; no UI | Request resolved without maintenance work | USEFUL FACILITY PLANT OPERATIONS FOUNDATION | Wire later. |
| RoomAreaStatus | EVS cleanliness states | Unrelated to Plant WO | UNRELATED | Ignore for this Product. |
| Dietary menus / meal Key Points | Healthcare Food & Nutrition | Unrelated | UNRELATED | Plant is not forced through meal rhythm. |

---

## D. Platform gap report

| Need | Current Platform support | Gap? | Correct owner | MVP/NEXT/LATER | Reason |
|---|---|---|---|---|---|
| Asset lifecycle vs condition | One `AssetStatus` enum mixes ACTIVE/OPERATIONAL/DEGRADED/OUT_OF_SERVICE/RETIRED; `retiredAt` exists; `ownership.ts` already documents the split | **Yes** | Platform | MVP (schema later; not Product) | Multiple products need Assets that can be ACTIVE and OUT_OF_SERVICE. |
| Asset manufacturer/model/serial/tag | Fields exist on `Asset` | Partial (UI/completeness) | Platform | MVP | Identity is Platform; do not copy into Plant. |
| Asset classification | `equipmentType` string; no normalized category/subcategory | Yes for NEXT | Platform | NEXT | Explicitly out of MVP unless a hard PM-target dependency appears (it does not; MVP PM is specific Asset). |
| Parent/child Assets | Not modeled | Yes | Platform | NEXT | |
| QR/barcode Asset identity | Not modeled | Yes | Platform | NEXT | |
| Generic Issue | `AssetIssue` requires Asset; unique 1:1 WO | **Yes** | Platform | MVP | Location-only undesirable conditions are not Plant-specific. Dietary already reports Issues. |
| Generic Request intake | `OperationalRequest` exists, Asset optional, routing exists | Partial (status mixing; UI unmounted; CANCELLED unused) | Platform | MVP | Other Departments request work from Plant (and potentially each other). |
| Attachment behavior | Asset/Repair/Log only | **Yes** | Platform | MVP | Request and Issue photos are shared intake, not Plant files. |
| Vendor identity | `Vendor` exists | Sufficient for MVP | Platform | MVP | Optional cost is Product closeout, not a new Vendor system. |
| Persistent Asset Meter | None | Yes | Platform | LATER | |
| Procedure versioning | `KnowledgeArticle` has no version; Work snapshots title; Records pin catalog version | **Yes** | Platform | MVP | PM and WO must preserve the procedure that applied historically. Multiple products need this. |
| Location History including maintenance | Location sources omit Request/Issue/Repair | **Yes** | Platform | MVP | Projection gap, not a new ledger. |
| Work History in Audit/Reports | `unsupported_work_history` | Yes | Platform | MVP (rounds) / can trail WO | Shared Work already exists; review does not project it. |
| Work Order | `Repair` is close | Product capability on a Platform-adjacent row | **Product** | MVP | Richer persistent maintenance lifecycle. Do not expand shared Work into CMMS. |
| PM Plan | `PreventiveMaintenanceSchedule` is not a plan/version/occurrence engine | **Yes — Product** | Product (Asset target is Platform Asset) | MVP | Exists only because facility maintenance needs scheduled service. |
| Maintenance category | `RepairTrade` / `IssueType` are not this | Yes | Product | MVP | |
| Maintenance triage | Plant panels exist behind flag | Partial | Product using shared Request | MVP | |
| Maintenance closeout (labor/parts/vendor cost) | `estimatedLaborMinutes`, `partsNote`, `vendorId`; no money/lines | Partial | Product | MVP | |
| Asset meters / type PM / inventory / trades / SLA | Absent | Yes | Mix (mostly NEXT) | NEXT/LATER | Do not implement now. |

---

## E. Request / Issue / Work Order verdict

### A. Request — `OperationalRequest` **can** serve as the canonical shared Request envelope

**Verdict: adopt `OperationalRequest` as the shared Request.** Do not invent `PlantRequest` or a second Request concept.

**What already fits**

- Cross-department requesting vs responsible departments
- Location required (`unitId`); Asset optional
- Requester identity, description, reported priority/impact
- Requester-visible status summary vs internal triage note
- Explicit WO link (Request does not own repair work)
- Duplicate detection helper; `resolveWithoutWorkOrder` in the service layer
- Configurable `DepartmentRequestRoute`

**Semantics that conflict**

- Status enum mixes **intake** with **Work Order execution** (`WORK_ASSIGNED`, `WORK_IN_PROGRESS`, `WAITING_ON_VENDOR`, `WAITING_ON_PARTS`). Canonical Request outcomes are accepted / declined / duplicate / resolved without maintenance work.
- `CANCELLED` exists but is not written by services. Decline is not a first-class intake outcome in UI.
- `relatedAssetIssueId` is 1:1 unique — a Request can relate to at most one AssetIssue.
- `workOrderId` is 1:1 unique — acceptable if a Request yields at most one WO; canonical Issue (not Request) needs many WOs.
- `ReportProblemForm` is not mounted; requester path is incomplete.
- Priority uses `RepairPriority` (LOW–URGENT), not a distinct reported-urgency vocabulary.

**Required later changes (not this phase)**

- Treat WO-mirroring statuses as derived/projection or map them to requester-safe summaries; keep Request status as intake/triage.
- Wire decline / duplicate / resolve-without-work in actions and UI.
- Extend attachments to Request.
- Keep DEVELOPMENT/flag gating.

### B. Issue — `AssetIssue` **cannot** remain the canonical Issue without generalization

**Verdict: evolve `AssetIssue` into canonical Issue. Do not create a new Issue model in the next phase. Do not keep Asset-required Issue as Product truth.**

Phase 12A intentionally kept AssetIssue asset-specific and used OperationalRequest for non-asset facility needs. That **collapses Request and Issue**. Canonical architecture forbids that: Request ≠ Issue, and Issue may exist without an Asset.

**Conflicts**

- `assetId` required
- `workOrderId` unique → at most one WO per Issue; canonical Issue may need many
- No first-class location-only Issue
- Naming (`AssetIssue`) encodes the old constraint

**Why not a new model**

- Dietary and Plant already persist problem rows here
- Evidence links, status history provenance, and issue updates would fork
- Historical foreign keys (`AssetStatusHistory.sourceIssueId`, `OperationalRequest.relatedAssetIssueId`) should remain valid

**Migration implication (later):** nullable `assetId`; replace 1:1 WO FK with a join (or non-unique `workOrderId` plus additional links). Old rows stay Asset-linked. Product noun becomes **Issue**; persistence may keep `AssetIssue` until rename is safe.

There is **no** other generic Issue primitive. The `/issues` façade is a Repair row and is LEGACY.

### C. Work Order — `Repair` **should** become the canonical Work Order foundation

**Verdict: yes — evolve `Repair` as the Facility Plant Operations Work Order foundation. Do not create `PlantWorkOrder`. Do not fold WO into shared Work.**

| Concern | Fit |
|---------|-----|
| Naming | Persistence `Repair` / routes `/repairs`; product language should be Work Order. Rename later, not now. |
| Schema | Title, description, optional Asset, required unit, kinds CORRECTIVE/PREVENTIVE, assignment, vendor, source request/issue, PM FK, labor minutes, parts note, resolution, return-to-service flag. |
| Statuses | Broader than target; mappable. |
| Location-only | Supported (`assetId` optional) in schema, services, and create UI. Missing `spaceId` on Repair. |
| Request/Issue | Explicit FKs; WO complete does **not** auto-close Request/Issue or set Asset OPERATIONAL. **Keep this invariant.** |
| Procedure / Records | **Missing** on the WO row. |
| Parts / labor / cost | Notes and estimated minutes only; no lines or money. |
| History | `RepairUpdate` + asset timeline. |

Shared Work cannot express persistent diagnosis, parts, vendor cost, PM relationship, and multi-day WO state without becoming a CMMS. That is disallowed.

**Do not** treat existing Repair as already-correct Product UX. It is the closest foundation.

---

## F. Asset verdict

| Concern | Current state | Mismatch vs target |
|---------|---------------|-------------------|
| **Physical identity** | `assetCode`, name, `equipmentType`, manufacturer, model, serial, `facilityAssetNumber`, photos via `Attachment` | Fields exist; classification is a free string; no QR/barcode. |
| **Lifecycle** | `RETIRED` lives in the same enum as condition; `retiredAt`/`retiredReason` exist; returning to OPERATIONAL clears retirement | Target: ACTIVE/RETIRED separate from condition. `ACTIVE` is a **legacy synonym for OPERATIONAL**, not lifecycle ACTIVE. |
| **Condition** | OPERATIONAL / DEGRADED / OUT_OF_SERVICE on `Asset.status` | Correct values exist but share the enum with lifecycle. |
| **Operating ownership** | `departmentId` | Used as RUN department filter; mixed with “who maintains.” |
| **Maintenance responsibility** | `responsibleOrganizationId` (`FacilityOrganization`) plus Plant as WO responsible department | Split is started (org vs department vs vendor) but not presented as the target triad. |
| **Location** | Required `unitId`, optional `spaceId` | Matches shared facility tree. No Plant location copy. |
| **History** | `loadAssetTimeline` merges status history, issues, repairs, evidence | Good Asset History foundation. PM occurrences absent. |
| **Metadata** | Warranty, in-service date, notes, procedure **text** on Asset | Procedure-as-text is not versioned Procedure. Warranty workflows are NEXT. |
| **Completion vs recovery** | `completeWorkOrder` does not mutate Asset; `returnAssetToService` is explicit | **Matches the locked rule.** Preserve. |

**Exact mismatch:** one `Asset.status` column is both lifecycle and condition; `ACTIVE` means operational, not “in lifecycle.” Code comments in `ownership.ts` already describe the target split without implementing it.

---

## G. PM verdict

`PreventiveMaintenanceSchedule` is **not** a Preventive Maintenance Plan.

| Canonical PM Plan need | Present? |
|------------------------|----------|
| Name / cadence / specific Asset / active flag | Yes |
| Description, maintenance category | No |
| Published version | No |
| Procedure version | No |
| Required Record templates | No |
| Fixed calendar cadence (e.g. Jan/Apr/Jul/Oct) | Only WEEKLY/MONTHLY/QUARTERLY/YEARLY + `intervalCount` + `nextDueAt` — rolling next-due, not named fixed months |
| Start/effective date, lead time, due window/tolerance | No (only `nextDueAt`) |
| Default priority/assignment | No |
| Due occurrence identity | No |
| Deterministic/idempotent WO generation | **No generator exists** |
| Missed PM historically visible | No occurrence rows |
| `Repair.preventiveScheduleId` / `PREVENTIVE` kind | Schema only |

`nextDueAt` plus `intervalCount` is compatible with **shifting** the next due after work, which is the **opposite** of locked fixed cadence (late April must not move July).

**Verdict:** do **not** treat this model as Product-defining. Safer path: new PM Plan + version + occurrence tables in a later Product phase; keep `PreventiveMaintenanceSchedule` readable as LEGACY. Do not implement now.

---

## H. Shared Work / Records / Procedures verdict

### Shared Work — **yes, for rounds, as intended**

The engine (plan → derived requirement → sparse occurrence) exists. Plant is admitted when `PLANT_OPERATIONS_ENABLED` is on. The Product correctly has **no** required Work presets and **no** required cycles.

**Gaps (integration, not a new engine)**

- No Plant presets yet (allowed; starter pack is later and unpublished)
- Department Builder hides Work when there are no presets/plans
- Technician attention is Repair/Request-centric, not Work-occurrence-centric
- Audit/Reports marks work history unsupported
- Optional cycles (morning round, etc.) are facility configuration, not Product starters

Do not put corrective/preventive WO through this engine.

### Records — **target `OperationalEvidenceRecord`**

Canonical: catalog definition → facility `LogAttachment` segment → derived slot → `OperationalEvidenceRecord`. Forms: Reading, Checklist, Inspection, Acknowledgement, On-demand Record.

**Legacy:** `InspectionDefinition` / Occurrence / Submission; `LogTemplate` / `LogSubmission`; `/admin/inspections`. Fenced when `CANONICAL_LOGS_ENABLED`.

Plant has **no** Record catalog yet. That is Product starter work later, not a new engine.

WO/PM do not yet require Records on the domain row.

### Procedures — **Platform versioning gap**

`KnowledgeArticle` is the Procedure/resource store (draft/published/archived). There is **no** version identity. Work items snapshot **title** only. `Repair` and `PreventiveMaintenanceSchedule` have no procedure FK. Catalog definitions version **Record** forms, not knowledge articles.

Facility Plant Operations cannot yet preserve “the procedure version that applied to this WO/PM occurrence.” That is a Platform gap to close before PM runtime, not a Plant Procedure table.

---

## I. Legacy disposition

| Surface | Disposition |
|---------|-------------|
| `/issues`, `/issues/[id]` | Keep redirects to `/repairs`. Not canonical Issue. |
| `/repairs` | Keep as WO queue until a later route rename. Product language: Work Order. Nav “Maintenance” is a RUN capability label, not the Product name. |
| `/asset-issues/[issueId]` | Keep as Issue detail foundation; generalize off Asset. |
| Unit quick issue (`createUnitIssueAction`) | Creates **Repair**, not Issue. Treat as LEGACY; prefer Request or Issue report paths. Action appears unwired in current UI. |
| Unit `AssetIssueReportPanel` | Valid Issue report when Asset is known; gated with Dietary asset flag on some pages. |
| Legacy inspections | Read-only/hidden; canonical Inspection is a Record form. |
| Old Plant documentation | HISTORICAL / SUPERSEDED / LEGACY as classified in §A. |
| Registry metadata (`name: "Plant Operations"`, HEALTHCARE-only tags) | Leave in this phase. Eventual display name **Facility Plant Operations** and broader facility-type applicability. **Status stays DEVELOPMENT.** |
| Competing vocabulary | Stop using Repair-as-Issue façade copy. Request ≠ Issue ≠ Work Order. “Maintenance” nav ≠ Product name. |
| Phase 12A “AssetIssue stays Asset-required; non-asset needs are OperationalRequest” | **Superseded** by 14. Non-asset problems can be Issues; Requests remain intake. |
| `ReportProblemForm` unmounted | Legacy gap in the reference implementation, not a reason to skip shared Request. |

---

## J. Data migration risks

Do not migrate now. Expected later risks:

| Risk | Why it matters |
|------|----------------|
| `AssetStatus` split | Existing `ACTIVE` rows mean OPERATIONAL, not lifecycle ACTIVE. `RETIRED` must remain lifecycle. History `fromStatus`/`toStatus` will need a compatibility map. |
| `RepairStatus` | `CLOSED`, `WAITING_PARTS`, `WAITING_ON_VENDOR`, `CANCELLED` spelling vs target CANCELED. |
| `RepairPriority` vs ROUTINE/EMERGENCY | `LOW`/`MEDIUM` have no target twin. |
| Repair persistence name | FKs from Issue, Request, PM, Attachment, AssetStatusHistory, Task adapters. Rename is high-cost; delay. |
| AssetIssue generalization | Required `assetId`; unique `workOrderId`; unique Request↔Issue. Location-only Issues and multi-WO Issues need constraint changes, not row destruction. |
| `PreventiveMaintenanceSchedule` | If `nextDueAt` was ever interpreted as rolling, it must not be rewritten into fixed-cadence history. Prefer new tables + readable old rows. |
| OperationalRequest statuses | WO-mirroring values are already stored; narrowing must preserve requester-visible history. |
| Historical FKs | Do not null out `sourceIssueId` / `sourceRepairId` / `workOrderId` to “simplify.” |
| Route compatibility | `/issues` → `/repairs`, `/asset-issues`, `/repairs` bookmarks. Prefer redirect over delete. |
| Dual page gates | `DIETARY_ASSET_OPERATIONS_ENABLED` vs `PLANT_OPERATIONS_ENABLED` on asset profile — behavioral split, not a data migration, but will confuse Plant enablement. |
| Knowledge without versions | Cannot backfill historical procedure versions that were never snapshotted. |

---

## K. Recommended Phase 2 scope

**Platform prerequisites only.** Do not implement Plant Work Orders, PM generation, starter packs, registry AVAILABLE, or billing.

Phase 2 should make the **shared facility truth** correct enough that Facility Plant Operations can later sit on it without copying engines.

### 1. Documented Asset lifecycle vs condition (design + tests; optional additive columns later)

- **Why:** Locked target; current enum conflates lifecycle and condition; `ACTIVE` is a false friend.
- **Owner:** Platform
- **Likely files:** `prisma/schema.prisma` (if additive), `src/lib/asset-operations/ownership.ts`, `asset-service.ts`, Asset Builder / RUN Assets UI, `AssetStatusHistory` writers, `phase-10a-asset-operations.test.ts`, `ownership.hermetic.test.ts`
- **Migration:** If implemented, forward-only: new columns or documented mapping; do **not** rewrite `AssetStatusHistory` meaning. Prefer a compatibility layer first.
- **Compatibility:** RUN Assets must still show OPERATIONAL/DEGRADED/OUT_OF_SERVICE; retirement remains explicit.
- **Tests:** Create ACTIVE+OUT_OF_SERVICE (once representable); RETIRED excluded from operational lists; return-to-service still explicit.

**Phase 2 recommendation:** start with **compatibility helpers + UI copy + tests** that treat `RETIRED` as lifecycle and condition values as condition, without a breaking enum rewrite. A schema split can follow once writers are isolated.

### 2. Issue generalization design (no new Product tables)

- **Why:** Canonical Issue is location-capable and multi-WO. `AssetIssue` is the only Issue store.
- **Owner:** Platform
- **Likely files:** `issue-service.ts`, `AssetIssue` schema (later), asset-issue pages, Dietary report panel, history timeline
- **Migration:** Later nullable `assetId` + non-unique WO relation. Phase 2 should specify the mapping and stop new product copy that says “Issue requires Asset.”
- **Compatibility:** All existing Issues keep their Asset.
- **Tests:** Location-only Issue acceptance tests once schema allows; until then, hermetic tests that encode the target invariant as documentation-adjacent fixtures **or** skip schema change and only lock service comments/docs.

**Phase 2 recommendation:** **do not migrate AssetIssue yet** if it can wait for Product Issue UX. Do **lock** that Request is not the location-only Issue substitute (docs already do). If Phase 2 includes any Issue code, it must be Platform-shaped (optional Asset), not PlantIssue.

### 3. Request envelope cleanup (behavior-preserving)

- **Why:** Shared Request is the right envelope; statuses currently impersonate WO.
- **Owner:** Platform
- **Likely files:** `operational-requests/types.ts`, `request-service.ts`, `plant-triage-panel.tsx`, `report-problem-form.tsx` (mounting is Product/Run — defer mount to a later Plant UI phase)
- **Migration:** None if statuses are projected rather than rewritten.
- **Compatibility:** Existing `WORK_IN_PROGRESS` rows remain readable.
- **Tests:** Requester-visible mapping; decline/resolve-without-work remain unused in UI until Plant UI phase.

**Phase 2 recommendation:** **projection/types only**, not UI mount, unless needed to prevent further status-enum growth.

### 4. Procedure version identity (Platform)

- **Why:** PM/WO must pin the procedure that applied. Articles have no version.
- **Owner:** Platform
- **Likely files:** `KnowledgeArticle` schema (later), `src/lib/knowledge/`, Work item snapshot fields
- **Migration:** Additive version rows; do not rewrite published bodies in place as if they were always versioned.
- **Compatibility:** Existing articles become version 1 conceptually.
- **Tests:** Publishing creates an immutable version; WO/PM can later store `procedureVersionId`.

**Phase 2 recommendation:** design the additive version model; implement only if it is clearly a hard dependency before any WO/PM work. If scoped tightly, **additive `KnowledgeArticleVersion` (or equivalent) is in bounds for Phase 2**. Linking it to Repair/PM is Phase 3+.

### 5. History projection sources (Platform, no ledger)

- **Why:** Location History omits Repair/Issue/Request; Audit work history is unsupported.
- **Owner:** Platform
- **Likely files:** `src/lib/audit/history-boundaries.ts`, location history loaders, `compose-operational-review-day.ts`
- **Migration:** None (projection only).
- **Compatibility:** Historical rows unchanged.
- **Tests:** Location chronology includes a Repair at that unit; work history no longer `unsupported` for shared Work if that projection is in scope.

**Phase 2 recommendation:** extend **source lists and tests**; implement full Audit Work History only if small. Do not add PlantHistory.

### 6. Attachment parent kinds (Platform)

- **Why:** Request/Issue photos are MVP intake.
- **Owner:** Platform
- **Likely files:** `Attachment` / `AttachmentParentKind`, `src/lib/attachments.ts`
- **Migration:** Additive enum values; no rewrite of existing files.
- **Tests:** Exactly one parent still holds; Request/Issue parents allowed.

**Phase 2 recommendation:** include if Issue/Request generalization is in the same slice; otherwise defer to the first Request UI phase.

### Explicitly out of Phase 2

- Work Order closeout fields, PM Plan tables, starter packs
- Registry name/industry expansion (optional tiny metadata-only change is **not** required; avoid if tests churn)
- `PLANT` → AVAILABLE
- Route renames
- Inventory, meters, QR, parent/child Assets
- Mounting `ReportProblemForm` as full Plant intake (Product UI)

---

## L. Stop / Go verdict

```text
GO WITH GAPS
```

**Why not STOP.** There is no architecture conflict that requires throwing away certified Platform mechanisms. One Facility tree, one Asset registry, shared Work, shared Records, shared People, projected history, and DEVELOPMENT-hidden `PLANT` already match the locked principle. `Repair` is a viable Work Order foundation. `OperationalRequest` is a viable Request envelope. Completing a WO already does not restore the Asset or close the Issue.

**Why not unconditional GO TO PHASE 2 without naming gaps.** Three Platform mismatches would corrupt the Product if ignored:

1. **Issue is Asset-shaped and 1:1 with WO** — Phase 12A treated non-asset problems as Requests. 14 forbids that collapse.
2. **Asset lifecycle and condition share one enum** — Product closeout and return-to-service need explicit condition while retirement stays lifecycle.
3. **`PreventiveMaintenanceSchedule` is a rolling next-due, not a versioned fixed-cadence PM Plan** — using it as-is would implement the wrong scheduler.

Phase 2 should close **Platform** gaps (lifecycle/condition semantics, Issue/Request meaning, procedure version identity, history projections) and must **not** implement Plant WO/PM product slices until those meanings are stable.

Facility Plant Operations remains **DEVELOPMENT** and customer-hidden until certification and an explicit AVAILABLE change.
