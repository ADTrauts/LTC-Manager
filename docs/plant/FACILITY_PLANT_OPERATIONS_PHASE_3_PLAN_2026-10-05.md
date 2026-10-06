# Facility Plant Operations — Phase 3 Plan

**Date:** 2026-10-05  
**Mode:** PLAN ONLY — do not implement in this pass  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Phase 1 audit:** [Reconciliation 2026-10-05](./FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md)  
**Phase 2 certification:** [Phase 2 certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_2_CERTIFICATION_2026-10-05.md)

This plan answers:

> What is the safest way to evolve `AssetIssue` and `Repair` into canonical Issue + Work Order semantics while preserving all existing maintenance history and leveraging Vssyl Platform capabilities rather than building another CMMS inside Vssyl?

Facility Plant Operations remains **DEVELOPMENT**. This plan does not change registry status, implement PM, or make the Product AVAILABLE.

---

## A. Executive verdict

```text
READY WITH CONSTRAINTS
```

Phase 2 certified the shared Platform meanings. The repository already has the right rows: `AssetIssue` is the only Issue store, `Repair` is the only persistent Work Order row, `OperationalRequest` is intake, Records already link by evidence tables, People are `Employee`, and history is projected.

Phase 3 should **evolve those rows**, not invent `PlantIssue` / `PlantWorkOrder`.

**Constraints (locked for ACT)**

1. Persistence names stay `AssetIssue` and `Repair`. Product language is Issue and Work Order.
2. Do **not** rename the `Repair` table or Prisma model in Phase 3.
3. Do **not** steal `/issues` — it remains a Repair compatibility redirect.
4. Do **not** rewrite stored `AssetIssueStatus`, `RepairStatus`, `RepairPriority`, or Request rows. Project canonical meaning the way Phase 2 did for Request.
5. Completing a Work Order still does **not** resolve Issue, close Request, or restore Asset.
6. `PLANT` stays **DEVELOPMENT**. `PLANT_OPERATIONS_ENABLED` stays the Plant engine gate.
7. Closeout cost/parts lines and required-Record enforcement wait for **3D** (later MVP, before AVAILABLE). They are not a PM-architecture blocker.
8. Dietary Asset Issues remain valid. Location-only Issue is additive; existing rows keep their Asset.

No architecture revision of [14](../product/14_FACILITY_PLANT_OPERATIONS.md) is required.

---

## Safest evolution (answer to the final question)

Keep one Issue identity and one Work Order identity.

```text
OperationalRequest          intake (already certified)
        many ──optional──►
AssetIssue                  canonical Issue (generalize; do not fork)
        1 ── 0..n ──────►
Repair                      canonical Work Order foundation (do not fork)
```

**Do this**

- Make `AssetIssue.assetId` optional; keep `unitId` required; keep `spaceId` optional; snapshot location at write.
- Add `Repair.issueId` as the authoritative Issue → many Work Orders relation.
- Keep `AssetIssue.workOrderId` as a compatibility pointer to the **first** linked Work Order.
- Drop uniqueness only where cardinality actually requires it (`OperationalRequest.relatedAssetIssueId`).
- Put Product nouns in domain types/services/UI (`Issue`, `WorkOrder`) while Prisma stays `assetIssue` / `repair`.
- Add `Repair.spaceId` now; never fabricate space on old rows.
- Pin Procedure by `KnowledgeArticleVersion.id`, not article head.
- Link Records with a Repair evidence link table matching Request/Issue. Do not create a Plant inspection engine.

**Do not do this**

- New `Issue` / `WorkOrder` tables beside the existing ones.
- `@@map("Repair")` Prisma rename in this phase.
- Folding Work Orders into shared Work.
- Automatic resolution/recovery.
- Inferring historical room from live Asset.

---

## B. Canonical Issue model

Persistence remains `AssetIssue`. Domain type: `Issue`.

### Meaning

A known undesirable operational condition. Not intake. Not work. Not Asset condition.

### Location authority — Option A (snapshot)

Issue **requires Location**. Asset is optional.

| Field | Required | Authority |
|-------|----------|-----------|
| `facilityId` | yes | already present |
| `departmentId` | yes | **responsible** department (Plant for Plant-owned conditions; Dietary for Dietary Asset Issues) |
| `unitId` | yes | occurrence Location; snapshotted at create |
| `spaceId` | no | occurrence Room when known; snapshotted at create |
| `assetId` | no | optional subject; **not** location authority |

If an Asset is supplied and the actor does not override Location, copy the Asset’s current `unitId` / `spaceId` **once** onto the Issue. Later Asset moves must not rewrite those columns.

**Reject Option B** (derive Location from live Asset). Phase 2 Location History already proved stored unit/space must win.

Validation:

- Location-only Issue: `assetId` null, `unitId` required.
- Asset Issue: Asset must belong to the facility and not be RETIRED; `unitId` defaults to Asset unit; override remains explicit (`allowUnitScopeOverride`).
- Space, when set, must belong to the facility and be attachable to that unit (same rule as today’s `reportAssetIssue`).

### Proposed fields (conceptual)

Keep existing useful fields. Change only what cardinality/location require.

| Field | Phase 3 | Notes |
|-------|---------|-------|
| `id`, `issueCode` | KEEP | Codes may stay `AI-#####`. UI says Issue. |
| `facilityId`, `departmentId` | KEEP | Responsible department owns the Issue. |
| `unitId`, `spaceId` | KEEP | Snapshot truth. |
| `assetId` | CHANGE | Nullable. |
| `summary`, `description` | KEEP | |
| `status` | KEEP stored enum | Project canonical status (below). |
| `priority` | KEEP stored | Intake/triage signal on Issue is **not** Work Order priority and **not** a new Issue-severity concept. Do not add severity. |
| `operationalImpact`, `equipmentRemainsUsable`, `workaroundInstruction` | KEEP | Useful condition facts. `equipmentRemainsUsable` is meaningful when Asset is present; may be null for location-only. |
| `observedAt`, `reportedAt` | KEEP | |
| `reportedBy*` | KEEP | Technician observation uses the acting Person; no fake Request. |
| `triageNote` | KEEP | Internal. |
| `resolvedAt`, `resolutionReason` | KEEP | Explicit resolution. |
| `closedAt` | KEEP | Compatibility; see status projection. |
| `workOrderId` | COMPATIBILITY | First linked WO only. Not the many-WO authority. |
| `relatedFromOperationalRequest` | CHANGE | Inverse of many Requests. |
| `originEvidenceRecordId` | ADDITIVE | Optional failed Record source. No auto-escalation. |
| updates / evidence links | KEEP | |

Do not add `sourceType` enum on Issue. Relationships are the source.

### Canonical Issue status (projection)

Stored `AssetIssueStatus` stays:

```text
REPORTED | ACKNOWLEDGED | TRIAGED | MONITORING | RESOLVED | CLOSED | CANCELLED
```

Canonical Issue authority:

```text
OPEN
MONITORING
RESOLVED
CANCELED
```

| Stored | Canonical |
|--------|-----------|
| REPORTED, ACKNOWLEDGED, TRIAGED | OPEN |
| MONITORING | MONITORING |
| RESOLVED, CLOSED | RESOLVED |
| CANCELLED | CANCELED |

**Keep MONITORING.** It is a problem-state (“the condition still exists; we are watching”), not a Work Order state. Do **not** put assigned / in progress / waiting-on-vendor on Issue.

New writes should prefer:

- create → `REPORTED` (presents OPEN)
- optional acknowledge/triage may remain for Dietary compatibility; Plant MVP may leave Issue OPEN until MONITORING / RESOLVED / CANCELED
- resolve → `RESOLVED` + `resolvedAt` + `resolutionReason`
- cancel → `CANCELLED`
- reopen → `REPORTED`, clear `resolvedAt` / `closedAt` (keep `resolutionReason` on updates, not as current truth)

Do not backfill stored statuses.

### Resolution

Explicit only. Completing Work Orders never resolves Issue.

Who may resolve / cancel / reopen: Plant (or owning department) SUPERVISOR+ using existing triage/manage authority. Technicians may report Issues; they do not resolve unless they already hold triage authority.

Resolution records `resolvedAt`, `resolutionReason`, and an `AssetIssueUpdate`.

Asset condition is **not** changed by Issue resolution. UX on Asset-backed Issues should **prompt** “Review Asset condition?” and route to existing `changeAssetStatus` / `returnAssetToService`. Prompt is orchestration, not a silent write.

Reopen is allowed from RESOLVED / CLOSED / CANCELLED (already implemented).

---

## C. AssetIssue migration strategy

No second Issue table. No row deletion. No identity change.

| Step | Class | Action |
|------|-------|--------|
| 1 | ADDITIVE | `assetId` nullable |
| 2 | ADDITIVE | `originEvidenceRecordId` nullable FK → `OperationalEvidenceRecord` |
| 3 | ADDITIVE | `Repair.issueId` nullable FK → `AssetIssue` |
| 4 | DATA BACKFILL | `UPDATE "Repair" SET "issueId" = ai.id FROM "AssetIssue" ai WHERE ai."workOrderId" = "Repair".id AND "Repair"."issueId" IS NULL` |
| 5 | COMPATIBILITY TRANSITION | New links write `Repair.issueId`. If Issue has no `workOrderId`, set it to the first WO. Never overwrite a populated `workOrderId`. |
| 6 | COMPATIBILITY TRANSITION | `createWorkOrderFromIssue` must **stop** returning early as “already has a WO” when additional WOs are requested |
| 7 | DEFERRED CLEANUP | Drop `AssetIssue.workOrderId` only after all readers use `Repair.issueId` |

Existing Asset Issues keep Asset, unit, space, updates, evidence, and the historical WO link. They become one Issue with zero or one initial Work Order inside the new 0..n model.

Dietary `reportAssetIssue` stays Asset-required at the **service/UI** layer until Dietary UX wants location-only. Schema allows location-only for Plant.

Prisma model name stays `AssetIssue` in Phase 3. Domain exports should speak `Issue`.

---

## D. Request → Issue model

Cardinality for MVP:

```text
many Requests  →  0 or 1 Issue
one Request    →  never more than one Issue
```

`OperationalRequest.relatedAssetIssueId` already exists but is **`@unique`**. That uniqueness **must be dropped** (keep the column and index). That is the duplicate-report model:

```text
Request A ─┐
           ├──► Issue X
Request B ─┘
```

Triage behavior:

```text
Request RECEIVED
  → accept (UNDER_REVIEW / ACCEPTED authority)
      → create Issue from Request snapshot, or
      → link existing Issue (duplicate)
  → decline (CANCELLED / DECLINED)
  → resolve without work (RESOLVED, no Issue required)
```

Accepting a Request **should** create or link an Issue. A Request may remain valid with no Issue (still in triage, declined, or resolved without work).

Do **not** auto-create Issue on Request submit. That would invent conditions the Plant user has not confirmed.

### Request.workOrderId

Keep the column and its uniqueness for Phase 12A rows where a Request was linked directly to one Repair.

New Plant happy path does **not** need to write `Request.workOrderId` once the Request has an Issue. Requester `IN_PROGRESS` projection should be extended:

1. linked Issue has any open Work Order, else
2. linked `Request.workOrderId` Repair (compatibility), else
3. legacy stored WO-shaped Request statuses

Do not copy Work Order status onto `OperationalRequest.status` (Phase 2 lock).

One Request creating multiple Issues is **out of MVP**.

---

## E. Issue → Work Order model

Cardinality:

```text
one Work Order → 0 or 1 Issue
one Issue      → 0..n Work Orders
```

**No many-to-many.** A Work Order is one defined job. If two conditions need the same visit, that is two Issues and (usually) two Work Orders, or one Issue if Plant judged them the same condition.

**Option A (recommended):** `Repair.issueId` is authoritative. Migrate from `AssetIssue.workOrderId`. Keep the old unique FK as first-WO compatibility.

**Reject Option B (join table)** unless a real “one WO repairs two Issues” case appears. It has not.

**Direct Work Order without Issue — firm recommendation: ALLOW.**

[14](../product/14_FACILITY_PLANT_OPERATIONS.md) already allows an authorized Plant user to create a Work Order when the action is known. Do not force fake Issues for “replace ceiling tile,” “hang whiteboard,” or other simple known work.

Rules:

- Request-originated corrective work → create/link Issue, then Work Order from Issue.
- Technician-discovered **problem** → Issue, then optional Work Order (same transaction allowed).
- Manager/technician **known job** with no undesirable-condition framing → direct Work Order, `issueId` null.

---

## F. Canonical Work Order model

Persistence remains `Repair`. Domain type: `WorkOrder`. Identity remains `id` + `repairCode` (display as Work Order number).

### Field map

| Existing Repair field | Current meaning | Canonical Work Order | Disposition |
|-----------------------|-----------------|----------------------|-------------|
| `id` | Row identity | Work Order identity | KEEP |
| `repairCode` | `R-#####` | Work Order number | KEEP persistence; UI “Work Order” |
| `title` | Job title | Title | KEEP |
| `description` | Job description | Description | KEEP |
| `workOrderKind` | CORRECTIVE / PREVENTIVE | Kind | KEEP. Phase 3 writes CORRECTIVE. Schema already allows PREVENTIVE. |
| `status` | Broad execution enum | Canonical status via projection | KEEP stored; see §H |
| `priority` | LOW/MEDIUM/HIGH/URGENT | Canonical priority via projection | KEEP stored; see §I |
| `repairTrade` | EQUIPMENT/PLUMBING/ELECTRICAL/GENERAL | Not maintenance category | COMPATIBILITY default until category exists |
| `issueType` | Legacy Repair-as-Issue class | Not Issue | KEEP column; stop using as Product Issue |
| `assetId` | Optional Asset | Optional Asset | KEEP |
| `unitId` | Required unit | Occurrence Location | KEEP snapshot |
| `spaceId` | **missing** | Optional Room | **ADD Phase 3** |
| `facility` | via unit | Facility | KEEP (no extra column required) |
| `requestingDepartmentId` | Requesting dept | Requesting context | KEEP |
| `responsibleDepartmentId` | Responsible dept | Plant (or owning dept) | KEEP |
| `assignedEmployeeId` | Ticket owner | Technician assignment | KEEP MVP |
| `vendorId` | External vendor | Vendor | KEEP |
| `preventiveScheduleId` | Legacy PM FK | Future PM — do not use as Plan | KEEP; do not generate from it |
| `dueAt` / `targetDate` | Due / target | Due window | KEEP |
| `requestedAt` | Created | Created | KEEP |
| `startedAt` | Started | Started | KEEP |
| `completedAt` | Completed | Completed | KEEP |
| `estimatedLaborMinutes` | Estimate | Estimate | KEEP; actual duration is 3D |
| `partsNote` | Free-text parts | Placeholder | KEEP; line items are 3D |
| `workPerformed` / `resolution` | Closeout notes | Closeout notes | KEEP; required on complete in 3C if already easy, else 3D |
| `followUpRequired` / `followUpNote` | Follow-up | Follow-up | KEEP |
| `returnToServiceReady` | WO-side RTS flag | Still does not mutate Asset | KEEP |
| `reportedById` | Creator user | Created by | KEEP |
| `sourceAssetIssue` via `AssetIssue.workOrderId` | 1:1 reverse | Compatibility first WO | KEEP until deferred cleanup |
| `issueId` | missing | Authoritative Issue FK | **ADD** |
| `sourceOperationalRequest` via Request.workOrderId | 1:1 reverse | Compatibility | KEEP |
| `procedureVersionId` | missing | Pin `KnowledgeArticleVersion` | **ADD** |
| `holdReason` | missing (WAITING_* statuses) | ON_HOLD reason | **ADD** |
| `maintenanceCategoryId` | missing | Product category | **ADD** |
| `updates` | Chronology | Work Order history | KEEP |
| `attachments` | Files | Shared attachments | KEEP |
| `assetStatusHistoryLinks` | Provenance | Keep | KEEP |

### Source — relationships, not enum

Do **not** add `sourceType` in Phase 3. It duplicates FKs and will drift.

| Origin | How it is known |
|--------|-----------------|
| Issue | `Repair.issueId` |
| Request (legacy/direct) | `OperationalRequest.workOrderId` |
| Request (canonical) | Request → Issue → Work Order |
| Direct | both FKs null |
| Failed Record | `AssetIssue.originEvidenceRecordId` then WO from Issue |
| Shared Work escalation | LATER — optional `originWorkOccurrenceId` not in 3A |
| PM | NEXT phase; `preventiveScheduleId` stays unread as Plan |

### Closeout slicing

| Fact | Slice |
|------|-------|
| start / complete timestamps | PHASE 3 |
| status lifecycle | PHASE 3 |
| work performed / resolution note | PHASE 3 (encourage on complete; harden in 3D if UI-heavy) |
| assignment | PHASE 3 |
| Procedure version pin | PHASE 3 |
| Vendor on WO | PHASE 3 (already exists) |
| explicit Asset condition review prompt | PHASE 3 |
| incidental Record links | PHASE 3 (link table) |
| required Records / completeness gate | LATER MVP (3D) |
| actual labor duration | LATER MVP (3D) |
| parts lines + optional cost | LATER MVP (3D) |
| vendor/external cost | LATER MVP (3D) |
| payroll / inventory | NEXT — out |

---

## G. Repair → Work Order strategy

**Option A — firm recommendation.**

- Prisma/database model stays `Repair`.
- Domain module (`work-order-service`, types, UI copy) speaks **Work Order**.
- Do **not** `model WorkOrder { @@map("Repair") }` in Phase 3. That is a client-wide rename across services, tests, Task adapters, attachments, and Dietary queues with no historical gain.
- Do **not** migrate the table name.

Option B (`@@map`) is deferred cleanup after domain types own all new code. Option C (table rename) is high-risk and out.

Legacy `/issues` façade (`src/lib/work/issues`) remains Repair-as-Issue compatibility. Do not revive it as Product UX.

---

## H. Work Order status strategy

**Option B — preserve stored enum; project canonical status; add hold reason.** Same compatibility strategy as Phase 2 Request.

Canonical:

```text
OPEN
ASSIGNED
IN_PROGRESS
ON_HOLD
COMPLETED
CANCELED
```

| Stored `RepairStatus` | Canonical | Hold reason |
|-----------------------|-----------|-------------|
| OPEN | OPEN | — |
| ASSIGNED | ASSIGNED | — |
| IN_PROGRESS | IN_PROGRESS | — |
| ON_HOLD | ON_HOLD | `OTHER` / existing note |
| WAITING_PARTS | ON_HOLD | `WAITING_ON_PARTS` |
| WAITING_ON_VENDOR | ON_HOLD | `WAITING_ON_VENDOR` |
| COMPLETED | COMPLETED | — |
| CLOSED | COMPLETED | legacy synonym (already in `COMPLETED_WORK_ORDER_STATUSES`) |
| CANCELLED | CANCELED | — |

New field `holdReason` (nullable enum or stable string):

```text
WAITING_ON_PARTS
WAITING_ON_VENDOR
WAITING_ON_ACCESS
SCHEDULED_LATER
OTHER
```

New writes: prefer `ON_HOLD` + `holdReason` instead of new WAITING_* writes. Technician/API may still accept WAITING_* as aliases that persist compatibility values **or** normalize to ON_HOLD+reason. Prefer **normalize on new writes**, keep old WAITING_* rows readable.

Do not delete enum values. Do not UPDATE historical statuses.

Transitions stay in `ALLOWED_WO_TRANSITIONS`, extended so ON_HOLD with reason covers waiting. COMPLETED / CANCELLED / CLOSED remain terminal. Completing still does not touch Issue, Request authority, or Asset condition.

---

## I. Priority strategy

Do **not** add Issue severity.

Three distinct concepts remain:

| Concept | Owner | Storage |
|---------|-------|---------|
| Reported urgency | Request | `OperationalRequest.priority` (`RepairPriority` today) |
| Work Order priority | Work Order | `Repair.priority` |
| Asset criticality | Asset | `Asset.criticality` |

Canonical WO priority:

```text
ROUTINE
HIGH
URGENT
EMERGENCY
```

Stored `RepairPriority`: `LOW | MEDIUM | HIGH | URGENT`

| Stored | Canonical |
|--------|-----------|
| LOW | ROUTINE |
| MEDIUM | ROUTINE |
| HIGH | HIGH |
| URGENT | URGENT |
| *(new)* EMERGENCY | EMERGENCY |

**ADDITIVE:** add `EMERGENCY` to `RepairPriority` for new writes. Do not rewrite LOW/MEDIUM rows.

Request reported urgency stays the existing enum; Plant triage copies it as a **suggestion** into WO priority, then Plant may change WO priority. Asset CRITICAL does not auto-set EMERGENCY.

Issue `priority` remains a triage hint, not a fourth scale. UI should not label it “severity.”

---

## J. Maintenance category model

Work Order owns maintenance category. Issue may **suggest** category at triage; it is not required.

**Not** `RepairTrade` and **not** `IssueType`. Those stay compatibility.

MVP:

- Facility-scoped `MaintenanceCategory` (or `PlantMaintenanceCategory` **table name is fine only if Product-owned**; prefer `MaintenanceCategory` with `departmentProductKey`/`departmentId` so it is not a second Asset class).
- Stable `key` + display `label` + `sortOrder` + `isArchived`.
- Vssyl-authored starter keys seeded per Plant department (not auto-published as customer content; internal DEVELOPMENT seed is allowed).
- Facility may rename labels and archive. Do not delete keys in use.
- Work Order `maintenanceCategoryId` optional in 3A, **required on new Plant WOs in 3C**. Historical Repairs get a backfill to `GENERAL_REPAIR` or map from `repairTrade`:

| RepairTrade | Starter key |
|-------------|-------------|
| EQUIPMENT | KITCHEN_EQUIPMENT or GENERAL_REPAIR (prefer GENERAL_REPAIR unless Asset equipmentType is kitchen — do not over-guess; **GENERAL_REPAIR**) |
| PLUMBING | PLUMBING |
| ELECTRICAL | ELECTRICAL |
| GENERAL | GENERAL_REPAIR |

Starter keys:

```text
HVAC
PLUMBING
ELECTRICAL
LIFE_SAFETY
KITCHEN_EQUIPMENT
CARPENTRY_BUILDING
GROUNDS
GENERAL_REPAIR
```

Configurable data, not a frozen Prisma enum, so facilities can add “Elevators” later without a migration. Enum would be cheaper but would force migrations for every facility-specific trade.

---

## K. Assignment model

**Direct `Repair.assignedEmployeeId` for MVP.**

`OperationalAssignment` is coverage (who is on the board / zone / shift). Work Order assignment is “this Person owns this job.” Do not merge them because both say assignment.

MVP: one assigned technician. Multi-technician is NEXT.

Rules already present and to keep:

- Assigning from OPEN → ASSIGNED.
- Plant STAFF may `canActOnAssignedWorkOrder` only when `assignedEmployeeId === session.uid`.
- SUPERVISOR+ may assign/reassign.
- Quick PIN does not manage Work Orders.
- Assignee must be a facility `Employee` (optionally Plant membership check in 3C).

Do not create a Technician identity table.

---

## L. Procedure version integration

Phase 2 delivered `KnowledgeArticleVersion`. Repair still has **no** procedure FK.

MVP: **zero or one** Procedure per Work Order.

```text
Repair.procedureVersionId  →  KnowledgeArticleVersion.id
```

Pin the version, never the article head. Historical WO keeps that body after later publishes.

Multiple procedures per WO are unnecessary for corrective MVP.

Create/update may copy current published version of a chosen article. Completing a WO must not retarget the pin to “latest.”

No PM procedure requirement in this phase.

---

## M. Record / evidence integration

Do **not** create WorkOrderChecklist, RepairInspection, PlantLog, or a parent kind that makes Records belong to Work Orders.

`OperationalEvidenceRecord` has no `repairId`. Request and Issue already use link tables. Match that:

```text
RepairEvidenceLink
  repairId
  evidenceRecordId
  linkedByUserId
  linkedAt
  note
  @@unique([repairId, evidenceRecordId])
```

MVP:

- Technicians may link completed Records as **incidental evidence**.
- Required vs incidental: all Phase 3 links are incidental unless a later requirement table exists.
- Do **not** add `WorkOrderRecordRequirement` in 3A–3C.
- Procedure may later imply required Record templates; that is 3D / PM.
- Failed Record → Issue uses `AssetIssue.originEvidenceRecordId`. No automatic Issue creation in Phase 3.

Attachments on Repair already exist. Request/Issue photo `Attachment` parents remain deferred (Phase 2).

---

## N. Location / historical truth

Phase 3 **adds `Repair.spaceId`** (nullable FK `UnitSpace`, `onDelete: SetNull`).

Write behavior:

- From Issue: copy Issue `unitId` / `spaceId` (Issue snapshot, not live Asset).
- From Request (legacy direct WO): copy Request `unitId` / `spaceId`.
- Direct WO with Asset: default Asset’s current unit/space, allow override, then persist snapshot.
- Direct location-only WO: require `unitId`; `spaceId` optional.

**No backfill of space** for existing Repairs. `spaceId` stays null. Location History remains unit-accurate for those rows.

After `spaceId` exists, `loadLocationHistory` must use stored Repair space (same as Request/Issue). Space-filtered history includes new WOs with that space and still omits old null-space Repairs.

Asset move still does not rewrite Issue or Repair location. Asset History stays asset-scoped.

Do not infer Repair room from live Asset in UI (today’s mix of `repair.unit` + live `asset.space` is a known defect to stop in Phase 3 reads).

---

## O. Authorization model

Reuse Platform role + Department membership + existing flags. No `TECHNICIAN` identity.

| Actor | May |
|-------|-----|
| Any authorized facility user in a requesting department (job-flow / asset-ops / Plant flag as today) | Submit Request |
| Dietary (asset-ops) STAFF+ | Report Asset Issue against Dietary Assets (unchanged) |
| Plant STAFF (not Quick PIN for manage) | Report Issue; act on **assigned** Work Order (start/hold/complete/notes/evidence); not triage queue; not assign others; not return-to-service |
| Plant SUPERVISOR | Triage Requests; create/link Issue; create/assign Work Orders; set priority/category; resolve/cancel Issue |
| Plant MANAGER / GM with Plant primary dept | Above + Vendors + Asset return-to-service + route configuration |
| Facility Administrator | Only if `primaryDepartmentId` matches scope (existing lock) |

`PLANT_OPERATIONS_ENABLED` remains the Plant engine gate. Do not default it on. DEVELOPMENT Product remains customer-hidden.

Dietary Work Order manage stays on `resolveAssetOperationsAuthority` (non-Plant). Plant WO manage stays on `resolvePlantOperationsAuthority` when `department.key === "PLANT"` (already branched in `work-order-service`).

---

## P. Route / UX transition plan

Do not redesign Plant UI. Do not do a naming-purity route migration.

| Route | Phase 3 | Later |
|-------|---------|-------|
| `/repairs`, `/repairs/[id]` | KEEP. Labels/copy → **Work Orders**. Nav “Maintenance” stays a capability label. | Optional `/work-orders` alias/redirect |
| `/asset-issues/[issueId]` | KEEP as Issue detail. Generalize for location-only. | Optional `/issues/[id]` only after `/issues` is no longer Repair |
| `/asset-issues` (index) | **ADD** small Issue list/queue for Plant/Dietary | |
| `/issues`, `/issues/[issueId]` | KEEP redirect → `/repairs`. **Not** canonical Issue. | Dedicated compatibility phase required before reuse |
| `/operational-requests` page | Still absent. Triage stays on `/staffing/operations` Plant panel. | Mount intake later |
| `ReportProblemForm` | Mounting full intake is **not** required to certify 3A schema; 3C may mount if small | |

Unit `createUnitIssueAction` remains LEGACY (creates Repair). Do not wire it as Issue.

Minimum query surfaces for a future manager view (implement as services, not a dashboard):

- `listRequestsForTriage` (exists)
- `listIssues` open / monitoring (exists; extend location-only)
- `listWorkOrders` by canonical status / unassigned / assigned / hold / completed (queue exists)

---

## Q. Migration plan

Forward-only new migration(s). Never edit applied migrations. Never `migrate reset` on non-disposable DBs.

Recommended one or two migrations for 3A+3B schema (services can land in the same ACT slice or immediately after):

```text
1. ADDITIVE schema
     AssetIssue.assetId drop NOT NULL
     AssetIssue.originEvidenceRecordId
     Repair.issueId + index
     Repair.spaceId
     Repair.procedureVersionId
     Repair.holdReason
     MaintenanceCategory + Repair.maintenanceCategoryId
     RepairEvidenceLink
     drop UNIQUE OperationalRequest.relatedAssetIssueId
     (keep indexes)
     add RepairPriority.EMERGENCY
2. DATA BACKFILL
     Repair.issueId from AssetIssue.workOrderId
     optional MaintenanceCategory seed + map repairTrade → category
     do not set Repair.spaceId
     do not rewrite statuses/priorities/Request rows
3. COMPATIBILITY TRANSITION (code)
     Issue/WO services, projections, Location History space, stop live-Asset room on historical WO
     createWorkOrderFromIssue allows additional WOs
     Request accept → create/link Issue
4. DEFERRED CLEANUP (not Phase 3)
     drop AssetIssue.workOrderId
     Prisma rename Repair → WorkOrder
     enum replacements
     /issues route reuse
```

`AssetIssue.workOrderId` UNIQUE **can remain** while it means “first WO only.” Many WOs live on `Repair.issueId`.

---

## R. Phase 3 subphases

Do not make each column its own phase. Certifiable slices:

### 3A — Issue generalization

**Schema:** nullable `assetId`; `Repair.issueId` + backfill; drop Request↔Issue uniqueness; `originEvidenceRecordId`.  
**Services:** `reportIssue` (asset or location); many Requests → one Issue; many WOs per Issue; explicit resolve; WO complete does not resolve.  
**UI:** Issue detail accepts location-only; Issue list at `/asset-issues`; copy not “Asset required.”  
**Tests:** location-only; multi-WO; duplicate Requests; Asset move does not move Issue; Dietary Asset Issue still works.  
**Gate:** SQL Issue tests pass on disposable DB; no PlantIssue.

### 3B — Work Order canonical domain

**Schema:** `spaceId`, `procedureVersionId`, `holdReason`, category table + FK, `EMERGENCY` priority.  
**Services:** domain types/projection for status/priority; snapshot space; pin procedure version; category on create.  
**UI:** `/repairs` says Work Order; stop live-Asset space in historical display.  
**Tests:** location-only WO; space snapshot; Asset move; WAITING_* present as ON_HOLD; procedure pin survives article v2.  
**Gate:** Location History includes new WO space; old Repairs still unit-only.

### 3C — Corrective execution + triage

**Status:** CERTIFIED 2026-10-05 — [Phase 3C certification](./FACILITY_PLANT_OPERATIONS_PHASE_3C_CERTIFICATION_2026-10-05.md).

**Schema:** optional `AssetIssue.originEvidenceRecordId` landed in 3C.  
**Services:** accept Request → Issue; duplicate link; technician-discovered Issue+WO; assign/start/hold/resume/complete; requester projection from Issue WOs; Asset condition prompt without auto-RTS.  
**UI:** Plant triage: accept/link Issue, create WO, decline, resolve-without-work. Minimal assigned-WO technician actions on existing detail.  
**Tests:** Request authority unchanged by WO progress; complete ≠ Issue resolve ≠ Asset OPERATIONAL; auth matrix.  
**Gate:** Phase 3 certification (below). **PM architecture may begin after 3C.**

### 3D — Closeout / evidence requirements / cost facts

**Later MVP, before AVAILABLE.** Not required to start PM **architecture**.  
Required Records gate, labor duration, parts lines, vendor cost.

3A and 3B may ship as **one ACT** if migrations stay additive and tests are included. 3C is the Product behavior slice. Do not bundle 3D.

---

## S. Files likely affected

| Area | Paths |
|------|--------|
| Schema | `prisma/schema.prisma`, new `prisma/migrations/*` |
| Issue | `src/lib/asset-operations/issue-service.ts`, `types.ts`, `src/app/(protected)/asset-issues/**` |
| Work Order | `src/lib/asset-operations/work-order-service.ts`, `repair-presentation.ts`, `src/app/(protected)/repairs/**` |
| Request | `src/lib/operational-requests/request-service.ts`, `request-semantics.ts`, `src/components/operational-requests/plant-triage-panel.tsx` |
| Authority | `src/lib/asset-operations/authority.ts`, `src/lib/operational-requests/authority.ts` |
| History | `src/lib/asset-operations/history.ts`, `src/lib/audit/location-history.ts`, `history-boundaries.ts` |
| Knowledge | `src/lib/knowledge/version-service.ts` (read-by-id only) |
| Records | new Repair evidence link helper beside Issue/Request links |
| Category | new small `src/lib/asset-operations/maintenance-category.ts` (or plant-owned module that still uses shared Location/Asset) |
| Compatibility | `src/lib/work/issues/*` (copy only; keep redirect) |
| Tests | Phase 10A, 12A, plant 12A SQL; new Issue/WO SQL + hermetic; Location History SQL |
| Discover | `scripts/verify/discover-tests.mjs` if new SQL files |
| Docs | this plan; later certification; not 14 rewrite |

Do not include unrelated Vercel worktree files.

---

## T. Explicit deferrals

- PM Plan, schedule generator, preventive runtime, due/overdue PM
- Starter pack auto-publish
- Inventory, parts catalog, storerooms, QR/barcode
- Asset hierarchy, meters, AssetStatus column split
- Advanced Vendor contracts, warranties
- Labor costing / payroll / SLA / trades/skills
- Predictive / IoT / capital planning / billing / AVAILABLE
- Full Plant Manager dashboard polish
- `WorkOrder` table rename / Prisma `@@map`
- `/issues` as canonical Issue list
- Request/Issue `Attachment` parent kinds
- `sourceType` enums
- Issue severity
- Many-to-many WO↔Issue
- Multi-technician assignment
- `WorkOrderRecordRequirement`
- Automatic failed-Record → Issue
- Fake Requests for internal findings
- PlantIssue / PlantWorkOrder / PlantAsset / PlantLocation / PlantEmployee / PlantInspection / PlantRecord / PlantHistory / PlantProcedure

---

## U. Phase 3 certification criteria

Before **PM architecture** may begin:

1. `getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"` and customers still cannot see/install/purchase it.
2. Location-only Issue persists; Asset Issue still persists; Issue ids unchanged.
3. Many Requests can link to one Issue; one Request cannot create many Issues.
4. One Issue can have multiple Work Orders via `Repair.issueId`; first WO still readable via compatibility `workOrderId`.
5. Direct Work Order without Issue is allowed; Request-originated corrective work creates/links Issue.
6. Completing a Work Order does not resolve Issue, does not write WO status onto Request, does not set Asset OPERATIONAL.
7. Issue resolution is explicit (`resolvedAt` / reason).
8. Historical Issue/WO location survives Asset move; new WOs snapshot `spaceId`; old Repairs remain `spaceId` null.
9. Procedure pin is `KnowledgeArticleVersion`; publishing v2 does not change completed/open WO pin.
10. No prohibited Plant* engines.
11. Disposable SQL suites: Issue, Request, Work Order, Location History, Phase 10A, Phase 12A. Parallel `nextAssetCode` races are not semantic failures; isolate those files if needed.
12. Hermetic + `prisma validate` + `verify:migrations` pass. Targeted lint on changed files pass. Full-repo lint PRE-EXISTING failures stay classified, not expanded.

3D closeout/cost is **not** this gate.

---

## V. Recommended Phase 3A ACT scope

Copy into the next ACT prompt:

```text
Implement Facility Plant Operations Phase 3A only, following
docs/plant/FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md.

IN SCOPE
- Evolve AssetIssue into canonical Issue: nullable assetId; required unitId;
  optional spaceId snapshot; location-only Issues; no PlantIssue.
- Add Repair.issueId; backfill from AssetIssue.workOrderId; keep workOrderId as
  first-WO compatibility; allow one Issue → many Work Orders.
- Drop uniqueness on OperationalRequest.relatedAssetIssueId so many Requests
  can link to one Issue. Do not rewrite Request statuses.
- Explicit Issue resolve/cancel/reopen; Work Order completion must not resolve
  Issue, close Request, or restore Asset.
- Optional originEvidenceRecordId on Issue (no auto-escalation).
- Domain types/copy: Issue / Work Order. Prisma stays AssetIssue / Repair.
- SQL + hermetic tests on a disposable ltc_verify_* database.
- Keep PLANT DEVELOPMENT.

OUT OF SCOPE
- 3B spaceId/procedure/category/holdReason if not needed for 3A tests
  (prefer include Repair.issueId only in 3A if slicing tightly).
- 3C full Plant triage UI / ReportProblemForm mount unless required to test
  Request→Issue services.
- 3D closeout cost/parts/required Records.
- PM, starter pack, AVAILABLE, table renames, /issues route reuse.
- Unrelated Vercel files.

If 3A and 3B are combined, still do not start 3C UI polish or 3D.

Do not push unless explicitly asked.
```

**Tighter 3A-only schema** if ACT should be smaller than 3A+3B: Issue generalization + `Repair.issueId` + Request uniqueness drop + tests. Leave `Repair.spaceId` / category / procedure / holdReason for 3B immediately after.

---

## Direct Work Order recommendation (locked)

Allow Work Orders without an Issue for simple known work.

Require or link an Issue when:

- a Request is accepted as a real condition, or
- a technician reports an observed problem, or
- a failed Record is later escalated.

Never create a fake Request to start internal maintenance.
