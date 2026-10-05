# Facility Plant Operations — Phase 2 Plan

**Date:** 2026-10-05  
**Mode:** PLAN (implemented 2026-10-05 — see [Phase 2 certification](./FACILITY_PLANT_OPERATIONS_PHASE_2_CERTIFICATION_2026-10-05.md))  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Phase 1 audit:** [Reconciliation 2026-10-05](./FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md)

This plan answers:

> What is the smallest set of shared Vssyl Platform changes that makes Facility Plant Operations safe to build without encoding temporary Plant-specific workarounds into Request, Issue, Asset, Procedure, Attachment, or History?

**Verdict:** `READY WITH CONSTRAINTS`

Facility Plant Operations remains **DEVELOPMENT**. This plan does not change registry status, implement Work Orders, or implement PM.

---

## A. Executive verdict

```text
READY WITH CONSTRAINTS
```

The repository already has presentation helpers that separate Asset lifecycle from condition, a viable Request envelope, a viable Issue store, a viable Work Order row (`Repair`), canonical Records, and Asset History projection. Phase 2 must lock **Platform meaning** so Plant implementation cannot teach the wrong semantics.

**Constraints**

1. Do **not** split `AssetStatus` into two columns in Phase 2.
2. Do **not** generalize `AssetIssue.assetId` / 1:1 `workOrderId` in Phase 2.
3. Do **not** replace `OperationalRequestStatus` enum values or rewrite stored rows.
4. Procedure versioning **is** in Phase 2 (additive), because a mutable published `KnowledgeArticle` would force Plant to snapshot bodies privately.
5. Request/Issue photo `Attachment` parent kinds are **deferred** to intake UI.
6. `Repair.spaceId` is **deferred** to the Work Order slice (Location History in Phase 2 projects at the grain each source already stores).

---

## B. Asset lifecycle / condition — Option B

### Current truth

One column `Asset.status` (`ACTIVE` | `OPERATIONAL` | `DEGRADED` | `OUT_OF_SERVICE` | `RETIRED`) plus `retiredAt` / `retiredReason`. `AssetStatusHistory` stores `fromStatus` / `toStatus` / `reason`.

- Enum `ACTIVE` is a **legacy synonym for OPERATIONAL** (backfilled in `20260806200100`). UI lifecycle `"ACTIVE"` means **not retired**.
- `RETIRED` is lifecycle; `changeAssetStatus` sets `retiredAt` and blocks return except via “correction.”
- Presentation already exists: `presentAssetLifecycleAndCondition` in `src/lib/asset-operations/lifecycle-presentation.ts` (“Persisted enum is unchanged — no migration”).
- Writes are mostly centralized in `changeAssetStatus` / `createAsset` / `retireAsset` / `returnAssetToService`. Legacy bypasses remain when Dietary/Plant asset-ops flags are off (`assets/actions.ts`, bulk import).
- Filters are inconsistent: some use `status: { not: "RETIRED" }`, some `retiredAt: null`, RUN `/assets` lists retired rows.

### Target truth

| Question | Values |
|----------|--------|
| Lifecycle | ACTIVE \| RETIRED |
| Operating condition | OPERATIONAL \| DEGRADED \| OUT_OF_SERVICE |

An ACTIVE Asset may be OUT_OF_SERVICE. A RETIRED Asset has no day-to-day condition in product language. Completing a Work Order still does not set OPERATIONAL.

### Recommended transition — Option B (compatibility)

**Source of truth (Phase 2):** remain `Asset.status` + `retiredAt`, interpreted by **authoritative helpers** that every new consumer must use.

**Not Option A now.** Immediate `lifecycleStatus` + `operatingCondition` columns would require enum replacement, history backfill, and dual-write across ≥15 read sites plus import and two legacy write paths. Historical `AssetStatusHistory.toStatus` cannot be rewritten “to make the architecture cleaner.” Option A is **DEFERRED CLEANUP** after helpers own all writers/readers.

**History:** keep **one** append-only `AssetStatusHistory`. Interpret:

- `reason === RETIREMENT` or `toStatus === RETIRED` → lifecycle event
- otherwise → condition event (`ACTIVE` reads as OPERATIONAL)

Do not split history tables in Phase 2.

**Import:** when asset-ops enabled, keep mapping CSV `ACTIVE` → stored `OPERATIONAL`; reject creating as `RETIRED`. Align ops-off import to the same mapping if touched; do not revive storing `ACTIVE`.

**Queries:** add `assetLifecycleActiveWhere` / `assetNotRetiredWhere` (prefer `status not RETIRED` **and** treat `retiredAt` as derived, not a second truth). Supervisor OOS counts must use normalized condition, not raw enum only.

**Return-to-service:** remains `returnAssetToService` → condition OPERATIONAL, reason `RETURN_TO_SERVICE`. Still forbidden from RETIRED without correction.

### Schema impact

**None in Phase 2.** Classification: COMPATIBILITY TRANSITION (code), DEFERRED CLEANUP (future columns).

### Tests

- Hermetic: `presentAssetLifecycleAndCondition`, `ACTIVE` → lifecycle ACTIVE + condition OPERATIONAL, RETIRED → condition null, `isAssetOperationalCondition("ACTIVE")` aligned with presentation.
- DB: `changeAssetStatus` writes history; WO complete does not change condition (existing Phase 10A).
- Compatibility: leftover `ACTIVE` rows behave as OPERATIONAL.
- Query helper tests: retired excluded from operational pickers; RUN list policy documented (include vs exclude retired).
- No migration tests (no migration).

---

## C. Request semantics

### Current truth

`OperationalRequestStatus` includes WO execution: `WORK_ASSIGNED`, `WORK_IN_PROGRESS`, `WAITING_ON_VENDOR`, `WAITING_ON_PARTS`. `technicianUpdateWorkOrder` **writes** those onto the Request. `createWorkOrderFromOperationalRequest` writes `WORK_ASSIGNED`. `CANCELLED` and `resolveWithoutWorkOrder` exist but are unwired in UI. `types.ts` still comments “AssetIssue remains Asset-specific.”

### Authoritative Request state (conceptual — not a new Prisma enum in Phase 2)

```text
RECEIVED              REPORTED, ACKNOWLEDGED
ACCEPTED              UNDER_REVIEW, MONITORING, REOPENED
DECLINED              CANCELLED (unused today)
DUPLICATE             not a stored status; create-time rejection / allowObviousDuplicate
RESOLVED_WITHOUT_WORK RESOLVED when workOrderId is null
CLOSED                CLOSED
```

`WORK_*` / `WAITING_*` stored values are **legacy execution cache**, not future Request authority.

### Requester projection (derived at read)

```text
RECEIVED
ACCEPTED
IN_PROGRESS     linked Repair in OPEN/ASSIGNED/IN_PROGRESS/ON_HOLD/WAITING_*
RESOLVED        Request RESOLVED or CLOSED (and/or linked WO COMPLETED — display only; do not auto-close)
DECLINED        CANCELLED
```

`IN_PROGRESS` is **not** stored Request execution state.

### Compatibility

- Do **not** UPDATE historical Request rows to new enum values.
- Read path: `presentRequestAuthority(status, workOrderId)` + `presentRequesterStatus(request, repair?)`.
- Write path Phase 2: **stop** `technicianUpdateWorkOrder` from copying Repair status onto `OperationalRequest.status`. Optionally still set `requesterVisibleStatusSummary` from the **projection helper** (cache) or compute only at read (`loadRequesterVisibleStatus`). Prefer **read-time derivation** so Request status stays intake/triage.
- `createWorkOrderFromRequest`: keep Request in `UNDER_REVIEW` (ACCEPTED). Do not promote to `WORK_ASSIGNED` as future authority. Existing `WORK_ASSIGNED` rows remain valid via the map.
- Schema: **no enum replace**. Adding conceptual values as Prisma enums later is DEFERRED CLEANUP.

### Tests

- Hermetic mapping of every stored status → authority + requester projection.
- DB: technician START/WAITING no longer mutates Request.status; projection still shows IN_PROGRESS; COMPLETE still does not RESOLVE/CLOSE Request (existing invariant).
- Update `phase-12a-operational-requests.test.ts` assertions that currently expect `WORK_IN_PROGRESS` on the Request row.

---

## D. Issue ≠ Request boundary

### A. Writers encoding “non-Asset problem = Request = the problem”

| Writer | Verdict |
|--------|---------|
| `createRequest` | Correct **intake**. Optional Asset. Does **not** create an Issue. Dangerous only if product copy/tests treat the Request as the Issue. |
| `reportAssetIssue` | Correct Issue writer; **requires Asset**. |
| `linkAsset` / `relatedAssetIssueId` | Unused by UI. Does not auto-create Issue. |
| `createUnitIssueAction` | LEGACY: creates **Repair**, noun “issue”. Not Request, not AssetIssue. |
| `/issues` façade | LEGACY Repair-as-Issue. |
| Failed Record → Issue | **None**. |
| Phase 12A comments in `operational-requests/types.ts` | Still teaches AssetIssue stays Asset-specific as **architecture**. Must be corrected in Phase 2. |

No current writer creates a location-only `AssetIssue`. The collapse is **documentary and type-comment**, plus the absence of an Issue for location-only conditions (those rows live only as Requests until Issue UX).

### B. Phase 2 without schema

**Yes.** Establish the boundary with:

- Service contracts / comments: Request = intake; Issue = condition; Repair = Work Order.
- Helpers: `isOperationalRequest`, never named `isIssue`.
- Tests: creating a Request does not create AssetIssue; reporting an Issue requires Asset **today** (compatibility) while tests **document** that location-only Issues are deferred, not that Request is the Issue.
- Copy: Plant triage / repairs pages must not call a Request an Issue.
- Do not auto-create AssetIssue from Request (that would invent Issues the user did not confirm).

### C. Schema now?

**No.** Nullable `assetId` and multi-WO are required for canonical Issue, but Phase 1 allowed waiting until the Issue/WO slice if writers stop teaching the wrong meaning. Schema generalization now would be the Product Issue slice, not a Platform prerequisite.

### D. Eventual relationship

```text
Request ──optional──► Issue
                         │
                         ├── Work Order
                         ├── Work Order
                         └── Work Order
```

Issue.assetId optional; Issue.unitId required; space optional. Replace unique `workOrderId` with `IssueWorkOrder` (or non-unique links). Persistence may remain `AssetIssue` until a later rename. No `PlantIssue`.

### Phase 2 changes now

Code/docs/tests only. `reportAssetIssue` stays Asset-required.

### Waits for WO/Issue implementation

Nullable Asset, multi-WO, location-only Issue UI, Request→Issue accept flow, Record-failure → Issue.

---

## E. Procedure version architecture

### Problem

`KnowledgeArticle` is one mutable row. `upsertKnowledgeArticleAction` edits published articles **in place**. `publishedAt` is first-publish time. Work stores `knowledgeArticleId` + **title** snapshot only. Repair/PM store **nothing**. Viewing uses **live body**.

That cannot support: “WO/PM performed under Procedure version X after the Procedure changed.”

This is Platform. Dietary Work, EVS, and Plant all need historically stable how-to content.

### Procedure vs Knowledge

**Do not** turn all knowledge into Procedures.

| Concept | Meaning | Persistence |
|---------|---------|-------------|
| **Knowledge article** | Facility-scoped published operational content (SOP, equipment notes, training, reference) | `KnowledgeArticle` identity |
| **Procedure** | Knowledge used as **how work should be performed** | Same identity; category often `SOP`; linked from Work / future WO/PM |
| **Resource / reference** | Knowledge that is not a work method | Same table; other categories |
| **Harbor PROCEDURE catalog** | Future published catalog purpose; not implemented | Out of Phase 2 |

Versioning applies to **published Knowledge content**, not only SOP. Versioning ≠ relabeling everything as Procedure. WO/PM will pin a **version id** of an article used as a Procedure.

### Target model (Catalog / Work Plan precedent)

Follow `CatalogLogDefinition` (`stableKey` + `version`, immutable published, `createCatalogDraftSuccessor`) and `DepartmentWorkPlan` (successor draft), not in-place mutation.

```text
KnowledgeArticle          stable identity (id remains)
  category, department, contextual links (Unit/Asset/…)
  currentDraftVersionId? / currentPublishedVersionId?  (optional convenience)
        │
        └── KnowledgeArticleVersion
              articleId
              version            Int
              status             DRAFT | PUBLISHED | SUPERSEDED | ARCHIVED
              title, summary, body
              publishedAt, archivedAt
              createdFromVersionId?
              @@unique([articleId, version])
```

**Stable identity:** existing `KnowledgeArticle.id`. Do not mint a second Procedure table.

**Immutable published version:** once `PUBLISHED`, title/summary/body on that version row never update.

**Draft/edit:** editing published content creates a DRAFT successor (version+1). Publish successor sets it PUBLISHED and marks previous PUBLISHED as SUPERSEDED (or leave prior PUBLISHED readable like Catalog attachments pin version — **prefer keep prior PUBLISHED rows readable**; “current” = highest published version). Catalog does not auto-retire prior versions; pin by id. Same here.

**Retirement:** archive article identity and/or archive versions. Restore must not clear historical `publishedAt` on old versions (`restoreKnowledgeArticleAction` today clears `publishedAt` — fix as part of this work).

**Historical references:** Work/WO/PM store `knowledgeArticleVersionId` (WO/PM FK **not** in Phase 2). Until then, Work may keep `knowledgeArticleId` + title snapshot; Phase 2 may add **optional** `knowledgeArticleVersionId` on `DepartmentWorkItem` / `DepartmentWorkOccurrence` (ADDITIVE) so Dietary Work can start pinning without Plant WO.

**Current article row:** may keep denormalized `title`/`body`/`status` as **head projection** of current published or draft for list UI, updated only through the version service (COMPATIBILITY TRANSITION). Do not let UI update `body` except via version service.

### Migration

| Step | Class |
|------|--------|
| Add `KnowledgeArticleVersion` | ADDITIVE |
| Backfill version `1` from current title/summary/body/status/publishedAt | DATA BACKFILL (copy, do not rewrite article meaning) |
| New publishes/edits go through versions | COMPATIBILITY TRANSITION |
| Rewrite historical Work occurrences’ bodies | **Forbidden** |
| `Repair.knowledgeArticleVersionId` | DEFERRED (WO slice) |

Existing articles become version 1. Past Work completions remain title-snapshot only; documented ambiguity for body-at-the-time is accepted for pre-Phase-2 rows.

### Exact Phase 2 scope (Procedure)

**In**

- Prisma model + forward migration + generate
- `src/lib/knowledge/` version service: create draft, publish, successor, read current published, read version by id
- Change `admin/knowledge/actions.ts` so published body cannot mutate in place
- BUILD Procedures UI: successor draft (minimum: reject in-place save on published and require “new draft” — full editor polish allowed if small)
- Hermetic + DB tests; one browser check that publish → edit creates v2 and v1 body unchanged
- Docs: 08/constitution note that Procedures are versioned knowledge, not Records

**Out**

- Harbor PROCEDURE catalog
- Repair/PM procedure FK
- Splitting REFERENCE into another model
- Rewriting `Asset.procedureInstructions` into Knowledge

---

## F. Location History

### Current truth

- **Canonical Location History projector does not exist.** `LOCATION_HISTORY_SOURCES` in `history-boundaries.ts` is **unused**.
- Asset timeline `loadAssetTimeline` merges status, issues, repairs, evidence **by assetId**.
- Location-related facts exist: evidence (`unitId`/`spaceId`/`placeLabelSnapshot`), work occurrences (snapshotted unit/space), assignments, key-point actuals, `PlaceNameChange`.
- Maintenance facts **omitted** from any location merge: Request, AssetIssue, Repair.
- Repair has `unitId` only (**no `spaceId`**). Issue/Request snapshot unit + optional space at create. Repair UI mixes `repair.unit` with **live** `asset.space`.
- Asset move (`updateAssetIdentity`) does **not** append location history. If an Asset moves, Asset timeline stays on the Asset; location-at-event for WOs without space is the snapshotted `unitId` only.
- Operational Review work history is `unsupported_work_history` (shared Work — not Phase 2 Plant WO).

### Phase 2 recommendation

Implement **`loadLocationHistory`** as a projection (no `LocationHistoryEntry` table), mirroring `loadAssetTimeline`.

**Authoritative sources (extend the constant and actually use it):**

```text
OperationalEvidenceRecord
DepartmentWorkOccurrence
OperationalCycleKeyPointActual
OperationalAssignment
AssetIssue          (unitId + spaceId at report)
Repair              (unitId at create; space only if later column exists)
OperationalRequest  (unitId + spaceId at report)
PlaceNameChange     (label resolution, optional events)
```

**Snapshot behavior:** use the **stored** location on each source row. Do not join live `Asset.unitId` for historical placement.

**Missing fields:** `Repair.spaceId` / `placeLabelSnapshot` on Request/Issue/WO — **defer** to WO/intake slices. Phase 2 location history is **unit-accurate**; space-accurate when the source already has `spaceId`.

**Asset relocation:** defer a move ledger. Document that condition events on Asset History are asset-scoped; location chronology for moved assets uses snapshotted Issue/Request/WO unit, not the Asset’s current room.

**Audit work history:** defer replacing `unsupported_work_history` unless it falls out of the same projector cheaply (occurrences are already a source).

### Tests

- Hermetic: source list includes Request/Issue/Repair; no LocationHistory model.
- DB: request at unit A appears in location history for A after asset moved to unit B; evidence with spaceId appears at that space.
- No browser required unless a UI surface is wired; Phase 2 may ship loader + tests without a new page (Asset profile already has timeline; location consumers can wait). Prefer a small loader used by tests first.

---

## G. Attachments

`AttachmentParentKind` = `LOG_SUBMISSION` | `REPAIR` | `ASSET`. Exactly one parent FK. Photos: `photo-attachments.ts` Asset/Repair only. Request/Issue already have **EvidenceRecord** links.

**Phase 2: defer** Request/Issue `Attachment` parents.

Not required to unlock WO semantics. Intake UI will need additive enum values + nullable FKs + auth (pattern: `20260916180000_asset_and_repair_photos`). Doing it now without UI is unused surface. Evidence links remain the structured-evidence path.

---

## H. Proposed Phase 2 change set

| Change | Owner | Files/models affected | Migration? | Risk | Tests | In Phase 2? |
|---|---|---|---|---|---|---|
| Authoritative Asset lifecycle/condition helpers + unify filters | Platform | `ownership.ts`, `lifecycle-presentation.ts`, `types.ts`, `asset-service.ts`, list/runtime loaders, builder/RUN selects, import parseStatus | No | Low | hermetic + existing Phase 10A DB | **Yes** |
| Align `isAssetOperationalCondition` with `ACTIVE` synonym | Platform | `ownership.ts`, `location-lifecycle.hermetic.test.ts` | No | Low | hermetic | **Yes** |
| Document Option A as deferred | Platform | `14` pointer / this plan | No | None | none | **Yes** (docs) |
| Request authority + requester projection helpers | Platform | `operational-requests/types.ts`, `request-service.ts` `loadRequesterVisibleStatus` | No | Low | hermetic | **Yes** |
| Stop copying Repair status onto Request.status | Platform | `work-order-service.ts` `technicianUpdateWorkOrder`, `createWorkOrderFromOperationalRequest` | No | Medium (Phase 12A tests) | DB Phase 12A | **Yes** |
| Issue≠Request contract comments + tests | Platform | `issue-service.ts`, `request-service.ts`, `types.ts`, hermetic tests; Plant copy if it says Issue=Request | No | Low | hermetic | **Yes** |
| `KnowledgeArticleVersion` + backfill v1 | Platform | `schema.prisma`, new migration, `src/lib/knowledge/*`, `admin/knowledge/actions.ts`, editor | **Yes ADDITIVE + DATA BACKFILL** | Medium (BUILD Procedures) | hermetic, DB, 1 browser | **Yes** |
| Optional `DepartmentWorkItem.knowledgeArticleVersionId` | Platform | schema, work-plan-service snapshot | Additive optional | Low | work-plan hermetic | **Yes if cheap; else defer** |
| `loadLocationHistory` projector | Platform | `history-boundaries.ts`, new `src/lib/audit/location-history.ts` (or adjacent), tests | No | Low | hermetic + DB | **Yes** |
| `Repair.spaceId` | Platform/Product | Repair, WO create | Additive | Medium | WO tests | **No** |
| Request/Issue Attachment parents | Platform | Attachment enum + FKs | Additive | Medium | photo tests | **No** |
| AssetIssue nullable asset / multi-WO | Platform | AssetIssue | Breaking-ish constraints | High | Issue/WO | **No** |
| Asset schema split lifecycle/condition | Platform | Asset, history | Breaking enum | High | migration | **No** |
| WO closeout / PM / starter / AVAILABLE | Product | — | — | — | — | **No** |

---

## I. Migration sequence

```text
1. Semantic helpers (Asset lifecycle/condition, Request projection, Issue≠Request contracts)
     → no migration
     → tests first / with helpers
2. Stop Request←WO status writes
     → update Phase 12A DB tests
3. Additive KnowledgeArticleVersion
     → prisma migrate (new file only)
     → backfill version 1 (same migration SQL COPY, no meaning rewrite)
     → version service + BUILD actions
     → tests
4. Location History projector
     → no migration
     → tests against existing source rows
5. Consumers (filters, loadRequesterVisibleStatus, knowledge read current published version)
6. Certification suite
```

Never: edit applied migrations; `migrate reset`; rewrite `AssetStatusHistory` or Request statuses in place.

---

## J. Explicit deferrals

- Facility Plant Operations Work Order fields, closeout, labor, parts, vendor cost
- PM Plan / generator / preventive WO
- Starter pack, Plant Manager/Technician/intake UI
- Registry name/industry, Marketplace, pricing, AVAILABLE
- QR, Asset hierarchy, taxonomy, meters, inventory
- `Asset.lifecycleStatus` / `operatingCondition` columns
- `AssetIssue` generalization
- `OperationalRequestStatus` enum replacement
- `Repair.spaceId`, Request/Issue photos
- Harbor PROCEDURE catalog
- Asset relocation ledger
- Replacing Operational Review `unsupported_work_history` as a required gate

---

## K. Phase 2 certification criteria

Before Facility Plant Operations **Work Order implementation** may start:

1. `PLANT` registry status is still **DEVELOPMENT**.
2. Asset helpers are the only approved way to ask lifecycle vs condition; `ACTIVE` enum means OPERATIONAL; RETIRED has no operational condition; WO complete still does not return-to-service.
3. Request projection treats WO-shaped stored statuses as compatibility; **new** WO progress does **not** persist as Request execution authority.
4. Tests prove Request create does not create an Issue; Issue report does not create a Request; comments no longer say “AssetIssue is the non-asset problem substitute.”
5. Published Knowledge cannot change version N’s body; version N+1 is a new row; existing articles have version 1.
6. `loadLocationHistory` returns Request, Issue, and Repair facts for a unit using **snapshotted** location, without a new ledger table.
7. No PlantAsset / PlantIssue / PlantRequest / PlantProcedure / PlantHistory / PlantAttachment.
8. Hermetic + relevant DB tests green; knowledge publish browser gate green if UI changed.

---

## L. Recommended Phase 2 ACT prompt scope

```text
Implement Facility Plant Operations Phase 2 Platform prerequisites only,
following docs/plant/FACILITY_PLANT_OPERATIONS_PHASE_2_PLAN_2026-10-05.md.

IN SCOPE
- Asset lifecycle vs condition helpers, query unification, tests (no schema split)
- Request authority + requester projection; stop writing Repair status onto OperationalRequest.status
- Issue ≠ Request contracts, comments, tests (no AssetIssue schema change)
- Additive KnowledgeArticleVersion + v1 backfill + stop in-place published edits
- loadLocationHistory projection including Request, AssetIssue, Repair (no new ledger)

OUT OF SCOPE
- Work Order product fields, PM Plan, starter content, Plant UI, registry AVAILABLE
- AssetStatus column split, AssetIssue generalization, Attachment new parent kinds
- Repair.spaceId, Harbor procedure catalog, billing

Keep PLANT DEVELOPMENT. Forward-only new migration for Knowledge versions only.
Do not rewrite historical Request or AssetStatusHistory rows.
```
