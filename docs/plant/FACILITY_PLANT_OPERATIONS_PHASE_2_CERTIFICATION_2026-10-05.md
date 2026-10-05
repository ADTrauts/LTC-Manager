# Facility Plant Operations — Phase 2 Certification

**Date:** 2026-10-05  
**Mode:** ACT complete — Platform prerequisites only  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Plan:** [Phase 2 Plan 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_2_PLAN_2026-10-05.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement Work Orders, PM, Plant UI, billing, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 3
```

Phase 3 (canonical Work Order / Issue Product slice) may begin on this Platform. See remaining documented limitations below — they are intentional deferrals, not blockers for starting that slice.

---

## What changed

### A. Asset lifecycle vs operating condition

No schema split. Shared helpers remain the application API:

- `presentAssetLifecycleAndCondition`
- `assetNotRetiredWhere` / `assetLifecycleActiveWhere`
- `isAssetOperationalCondition` (legacy stored `ACTIVE` counts as operational)
- `isAssetStatusHistoryLifecycleEvent`

Stored `ACTIVE` presents as lifecycle ACTIVE + condition OPERATIONAL. Stored `RETIRED` presents as retired with no operating condition. RUN `/assets` and other Phase 2 consumers use `assetNotRetiredWhere` instead of inventing predicates. Completing a Repair still does not restore the Asset.

### B. Request authority and requester projection

`OperationalRequest` stays the intake envelope. Conceptual authority is derived (`presentRequestAuthority`); it is not a new Prisma enum.

`technicianUpdateWorkOrder` no longer copies Repair execution onto `OperationalRequest.status`. Creating a Work Order leaves Request authority in an accepted/under-review compatible stored status (`UNDER_REVIEW` or an already-accepted triage status). Requester-visible `IN_PROGRESS` is projected from linked Repair. Completing a Work Order does not close the Request. Legacy WO-shaped stored statuses remain readable.

### C. Issue ≠ Request

Comments, contracts, and tests now state:

- Request = someone is asking for attention
- AssetIssue = a known undesirable condition (Asset-required until the later Issue slice)
- Repair = Work Order persistence, including the legacy `/issues` façade

No `PlantIssue`. No `AssetIssue` schema change. Location-only conditions existing only as Requests today is an implementation limit, not Product meaning.

### D. Knowledge article versions

Additive `KnowledgeArticleVersion` with statuses `DRAFT | PUBLISHED | SUPERSEDED | ARCHIVED`. `KnowledgeArticle.id` remains the stable identity. Categories (SOP / REFERENCE / TRAINING / …) stay on the article; versioning is not a Plant Procedure table.

Published version title/summary/body are immutable. Editing published content creates a successor DRAFT. Publishing supersedes the previous published version and leaves it readable. Existing articles receive version 1 via backfill (copy of current content; no fabricated earlier versions). Restore no longer clears `publishedAt`.

Article head `title` / `body` / `status` remain a compatibility projection of current published (or draft) truth.

### E. Location History

`loadLocationHistory` projects source facts. No history ledger table. Phase 2 sources: Records/work/assignment/key-point/place-name plus `OperationalRequest`, `AssetIssue`, and `Repair`. Stored `unitId` / `spaceId` win over live Asset location. Repair is unit-accurate only (`Repair.spaceId` deferred).

---

## Migration

**Filename:** `prisma/migrations/20261005180000_knowledge_article_version/migration.sql`

**Additive objects:**

- enum `KnowledgeArticleVersionStatus`
- table `KnowledgeArticleVersion`
- unique `(articleId, version)`
- indexes on `(articleId, status)` and `createdFromVersionId`
- FKs to `KnowledgeArticle`, `User`, and self (`createdFromVersionId`)

**Backfill:** insert version `1` from current `KnowledgeArticle` title/summary/body/status/`publishedAt`/`archivedAt`. Mapping:

| Article status | Version 1 status | publishedAt |
|----------------|------------------|-------------|
| PUBLISHED | PUBLISHED | copied |
| ARCHIVED | ARCHIVED | copied (may be null if never published) |
| DRAFT (and any other current head) | DRAFT | copied (normally null) |

The migration does **not** `UPDATE` or `DELETE` `KnowledgeArticle` rows. No AssetStatusHistory, OperationalRequest, AssetIssue, or Repair history rewrite.

---

## Compatibility behavior

- Asset `ACTIVE` remains stored; presentation maps it to operational condition.
- Request enum values including `WORK_IN_PROGRESS` remain stored and readable; they are no longer written by technician WO progress.
- `/issues` remains a Repair compatibility path.
- Knowledge list/runtime still reads article head fields projected from versions.
- Pre-Phase-2 Work completions still have title snapshot only; body-at-the-time was never stored.

---

## Intentional deferrals

- Facility Plant Operations Work Order Product fields and UI
- PM Plan / generator / preventive Work Orders
- Plant starter content, Manager/Technician/intake UI
- Registry AVAILABLE, billing, pricing
- AssetStatus schema split / new lifecycle or condition columns
- `AssetIssue` generalization, nullable `assetId`, Issue → many Work Orders
- Request enum replacement or historical Request/AssetStatusHistory rewrites
- `Repair.spaceId`
- Request/Issue Attachment parents
- QR/barcode, Asset hierarchy, meters, inventory
- Technician trades/skills, SLA
- Harbor Procedure catalog
- Asset relocation ledger
- Repair → `KnowledgeArticleVersion` FK

---

## Tests

### Disposable test database

Mechanism: repository `scripts/verify/admin-database.mjs` + `scripts/verify/lib/database-target.mjs`.

Created `ltc_verify_phase2_plant_20261005` on local Postgres `127.0.0.1:5432` using the maintenance database `postgres`. Connection credentials were templated from the developer `.env` `DATABASE_URL` whose **source name** is `ltc_manager`; that source database was never targeted for migrate, seed, tests, or drop.

Allowed prefix: `ltc_verify_`. Forbidden name `ltc_manager` is rejected by `assertDisposableDatabaseUrl`.

`prisma migrate deploy` applied the full chain (**114** finished migrations). Newest: `20261005180000_knowledge_article_version`.

`KnowledgeArticleVersion` table, `KnowledgeArticleVersionStatus` enum, and unique `(articleId, version)` exist after deploy.

`prisma db seed` **failed** on this empty database with pre-existing Unit unique `facilityId_name` drift (seed still uses a dropped constraint). That is **not** a Phase 2 defect. Minimal fixtures (SERVERY + second unit, Dietary/Plant responsibilities, MANAGER/STAFF/SUPERVISOR users, employees, vendor, three Knowledge articles without versions) were inserted on the disposable database only. The Knowledge backfill `INSERT` was then replayed against those rows.

Env used for SQL suites (all the same disposable URL):

- `DATABASE_URL` / `DIRECT_URL` / `VERIFY_DATABASE_URL` (required so `loadLocationHistory`’s shared Prisma client hits the disposable DB)
- `ASSET_OPERATIONS_TEST_DATABASE_URL`
- `PLANT_OPERATIONS_TEST_DATABASE_URL`
- `DEPARTMENT_WORK_TEST_DATABASE_URL`

`PLANT_OPERATIONS_TEST_DATABASE_URL` is not in `SQL_BACKED_DATABASE_ENV_KEYS`; Phase 12A / Knowledge / Location History fall back to `DEPARTMENT_WORK_TEST_DATABASE_URL`.

### Migration chain + verifier

```text
pnpm exec prisma validate
  PASS — schema valid

pnpm verify:migrations
  PASS — 114 migrations
  newest: 20261005180000_knowledge_article_version
  oldest: 20260325004459_phase1_units_builder
```

The verifier initially failed only because the Knowledge migration directory was untracked. Staging that directory made it PASS. No historical migrations were edited.

### Knowledge version backfill (disposable SQL)

Existing articles inserted **without** version rows, then the migration `INSERT` replayed:

| Article status | Version 1 status | publishedAt | article id preserved |
|----------------|------------------|-------------|----------------------|
| PUBLISHED | PUBLISHED | `2026-01-15T12:00:00.000Z` copied | yes |
| ARCHIVED | ARCHIVED | `2026-01-15T12:00:00.000Z` copied | yes |
| DRAFT | DRAFT | null | yes |

No versions other than `1` were created. Duplicate `(articleId, version)` insert is rejected (`P2002` on `articleId,version`). Counts for `AssetStatusHistory`, `OperationalRequest`, `AssetIssue`, and `Repair` remained `0` after backfill (no unrelated history rewrite). `KnowledgeArticle` rows were not deleted.

### SQL-backed suites

Command (required Phase 2 suites):

```text
node --import tsx --test \
  src/lib/asset-operations/phase-10a-asset-operations.test.ts \
  src/lib/operational-requests/phase-12a-operational-requests.test.ts \
  src/lib/knowledge/knowledge-versions.test.ts \
  src/lib/audit/location-history.test.ts
```

Result: **8 pass / 0 fail / 0 skip**

| Suite | Result | Notes |
|-------|--------|--------|
| Phase 10A Asset / Repair (4 tests) | PASS | Completing a Repair leaves Asset `OUT_OF_SERVICE`; return-to-service is explicit |
| Phase 12A Operational Request (2 tests) | PASS | Repair START / WAITING_ON_VENDOR / COMPLETE do not write `WORK_*` onto Request; requester projection `IN_PROGRESS`; completion does not close Request |
| Knowledge versions (1 test) | PASS | v1 publish → successor draft → v2 publish supersedes v1 (body unchanged) → archive/restore keeps `publishedAt` |
| Location History (1 test) | PASS | After Asset move Unit A → Unit B, Request / Issue / Repair remain on stored Unit A; Repair `spaceId` is null |

Additional SQL (changed Phase 2 WO/RTS path):

```text
node --import tsx --test src/lib/plant/phase-12a-plant-operations.test.ts
```

Isolated: **2 pass / 0 fail / 0 skip** (Request ownership preserved; complete does not return Asset to service).

When this file ran **in parallel** with Phase 10A it failed once on `Asset.assetCode` unique (`nextAssetCode` uses `count()+1`). That is a pre-existing generator race under parallel SQL tests, not a Phase 2 semantic defect. Isolated re-run passed.

Those two SQL files were added to `SQL_BACKED_TEST_FILES` so future `test:db` discovery recognizes them.

### Hermetic / static

```text
node --import tsx --test \
  src/lib/asset-operations/ownership.hermetic.test.ts \
  src/lib/asset-operations/location-lifecycle.hermetic.test.ts \
  src/lib/operational-requests/phase-12a-operational-requests.hermetic.test.ts \
  src/lib/operational-requests/request-issue-boundary.hermetic.test.ts \
  src/lib/operational-requests/request-semantics.hermetic.test.ts \
  src/lib/knowledge/knowledge-versions.hermetic.test.ts \
  src/lib/audit/location-history.hermetic.test.ts \
  src/lib/department-products/eligibility.hermetic.test.ts \
  src/lib/department-products/department-products.hermetic.test.ts \
  src/lib/department-products/customer-selection.hermetic.test.ts \
  src/lib/department-products/healthcare-food-nutrition-identity.hermetic.test.ts

  tests 97  pass 97  fail 0  skip 0

pnpm typecheck
  PASS

targeted eslint on Phase 2 changed source files
  PASS (0 errors)

pnpm lint
  FAIL — 9 errors, 45 warnings
  classification: PRE-EXISTING
  files: facility-builder-client.tsx, harbor-support-notifications.tsx,
         support-ticket-work-panel.tsx, verify-email-client.tsx,
         cycle-timeline.hermetic.test.ts (require())
  none of these files were changed in Phase 2
```

---

## Known limitations

1. **Repair space grain.** Location History cannot attach a Repair to a room. Space-filtered Location History omits Repairs rather than inferring live Asset space.
2. **AssetIssue still requires an Asset.** Location-only Issues wait for the later Issue slice.
3. **Request stored enum** still contains WO-shaped values for compatibility. New writes should use intake/outcome statuses; projection hides the rest from requester UI.
4. **Key-point unit membership** uses current `UnitSpace.unitId` because Key Point actuals store `spaceId` only.
5. **No operational FK** from Repair/Work to `KnowledgeArticleVersion` yet.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"` — confirmed by registry source and Department Product hermetic suites (`eligibility`, `department-products`, `customer-selection`, Healthcare Food & Nutrition identity).

Customer marketplace catalog filters with `isDepartmentProductCustomerVisible` (`AVAILABLE` only). Plant is not Marketplace-visible, not offered for sale, and not customer-installable or purchasable. Harbor/internal DEVELOPMENT access is unchanged. No registry metadata was modified in this closure pass.
