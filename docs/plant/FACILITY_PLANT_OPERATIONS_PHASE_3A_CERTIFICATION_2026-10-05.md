# Facility Plant Operations — Phase 3A Certification

**Date:** 2026-10-05  
**Mode:** ACT complete — Issue generalization + Issue → many Work Orders  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Plan:** [Phase 3 Plan 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md)  
**Phase 2:** [Phase 2 certification 2026-10-05](./FACILITY_PLANT_OPERATIONS_PHASE_2_CERTIFICATION_2026-10-05.md)

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement Work Order domain extras (3B), PM, Plant marketplace visibility, billing, or registry AVAILABLE.

---

## Verdict

```text
PASS — READY FOR PHASE 3B
```

Canonical Issue persistence now supports location-only rows. `Repair.issueId` is the authoritative Issue → many Work Orders relation. Multiple Requests may link to one Issue. Completing a Work Order still does not resolve the Issue, close the Request, or restore the Asset.

---

## What changed

### A. AssetIssue is the Issue store (not renamed)

Prisma model and table remain `AssetIssue`. Domain language is **Issue**.

`AssetIssue.assetId` is optional. `unitId` remains required. `spaceId` remains optional.

Two valid shapes:

| Kind | Stored location |
|------|-----------------|
| Asset-backed | `unitId` + optional `spaceId` + `assetId` |
| Location-only | `unitId` + optional `spaceId` + `assetId = null` |

Location is a **snapshot** at create time. If the Asset later moves, the Issue stays on its original Unit/Space. Existing Dietary `reportAssetIssue` still requires an Asset at the service layer.

### B. Issue status projection

Stored `AssetIssueStatus` is unchanged. Canonical projection:

| Stored | Authority |
|--------|-----------|
| REPORTED, ACKNOWLEDGED, TRIAGED | OPEN |
| MONITORING | MONITORING |
| RESOLVED, CLOSED | RESOLVED |
| CANCELLED | CANCELED |

Historical rows are not rewritten. Resolve remains explicit (`resolvedAt`, `resolutionReason`, existing reopen). Completing a Work Order does not resolve the Issue.

### C. Request → Issue

`OperationalRequest.relatedAssetIssueId` uniqueness is removed. Index retained.

```text
many Requests → zero or one Issue
one Request   → zero or one Issue
```

Submitting a Request does not create an Issue. `createIssueFromRequest` and `linkRequestToIssue` are explicit Plant SUPERVISOR+ triage actions. Duplicate Requests are linked only by explicit action. Linking does not mutate Issue location or rewrite Request into Work Order status.

### D. Issue → Work Order

Authoritative FK: `Repair.issueId` (optional, **not unique**).

```text
one Issue      → zero to many Work Orders
one Work Order → zero or one Issue
```

No join table. No `PlantIssue` / `PlantWorkOrder`. Persistence remains `Repair`.

`AssetIssue.workOrderId` remains compatibility-only. `Repair.issueId` is the authoritative Issue → Work Order relation.

Compatibility **dual-write**: the first linked Work Order still writes `AssetIssue.workOrderId` so Phase 10A consumers that read the first pointer keep working. Subsequent Work Orders write only `Repair.issueId`. `workOrderId` is never used to determine cardinality.

### E. History

Asset History continues to include Asset-backed Issues. Location-only Issues do not appear there.

Location History uses stored Issue `unitId` / `spaceId`. Work Order entries still follow Phase 2 rules (Repair unit only; `Repair.spaceId` deferred to 3B).

### F. Routes / UI

No route migration. `/repairs` and `/issues` compatibility remain. `/asset-issues/[issueId]` accepts location-only Issues and lists Work Orders via `Repair.issueId`. Additive `/asset-issues` list uses Product copy **Issues**. `/issues` is not the canonical Issue queue.

---

## Schema result

| Object | Result |
|--------|--------|
| `AssetIssue.assetId` | optional (`String?`) |
| `Repair.issueId` | optional FK → `AssetIssue`, `ON DELETE SET NULL`, **no uniqueness** |
| `Repair_issueId_idx` | added |
| `AssetIssue.workOrders` | `Repair[]` relation `"RepairCanonicalIssue"` |
| `OperationalRequest.relatedAssetIssueId` | optional, **not unique**, indexed |
| `AssetIssue.workOrderId` | retained, still unique, compatibility first-WO pointer |
| Prisma model / table names | unchanged (`AssetIssue`, `Repair`) |

Deferred cleanup (not done): drop `workOrderId`, Prisma rename, table rename, enum cleanup.

---

## Migration

**Filename:** `prisma/migrations/20261005200000_issue_generalization_repair_issue_id/migration.sql`

**Additive:**

1. `ALTER TABLE "AssetIssue" ALTER COLUMN "assetId" DROP NOT NULL`
2. `Repair.issueId TEXT` + index + FK
3. `DROP INDEX IF EXISTS "OperationalRequest_relatedAssetIssueId_key"`

**Conflict guard:** fail closed if any `Repair.issueId` already points at a different Issue than `AssetIssue.workOrderId`.

**Backfill:**

```sql
UPDATE "Repair" AS r
SET "issueId" = ai.id
FROM "AssetIssue" AS ai
WHERE ai."workOrderId" = r.id
  AND r."issueId" IS NULL;
```

Does not create/delete Issues or Repairs. Does not replace IDs. Does not rewrite status history. Does not fabricate relationships.

Replay against representative legacy rows (Issue with `workOrderId` set, Repair `issueId` null) preserved Issue id, Repair id, and `workOrderId`, and populated `Repair.issueId`.

Applied on disposable database `ltc_verify_phase3a_plant_20261005` (115 migrations). Source name `ltc_manager` was never targeted.

---

## Tests

Disposable SQL mechanism: `scripts/verify/admin-database.mjs` prefixes `ltc_verify_`. Env:

```text
DATABASE_URL = ASSET_OPERATIONS_TEST_DATABASE_URL
             = PLANT_OPERATIONS_TEST_DATABASE_URL
             = DEPARTMENT_WORK_TEST_DATABASE_URL
             = postgresql://…/ltc_verify_phase3a_plant_20261005
```

`loadLocationHistory` uses the shared Prisma client, so certification set `DATABASE_URL` to the same disposable URL.

### Hermetic

```text
node --import tsx --test \
  src/lib/asset-operations/issue-semantics.hermetic.test.ts \
  src/lib/asset-operations/ownership.hermetic.test.ts \
  src/lib/asset-operations/location-lifecycle.hermetic.test.ts \
  src/lib/operational-requests/phase-12a-operational-requests.hermetic.test.ts \
  src/lib/operational-requests/request-issue-boundary.hermetic.test.ts \
  src/lib/operational-requests/request-semantics.hermetic.test.ts \
  src/lib/audit/location-history.hermetic.test.ts \
  src/lib/knowledge/knowledge-versions.hermetic.test.ts \
  src/lib/department-products/eligibility.hermetic.test.ts \
  src/lib/department-products/department-products.hermetic.test.ts \
  src/lib/department-products/customer-selection.hermetic.test.ts \
  src/lib/department-products/healthcare-food-nutrition-identity.hermetic.test.ts

  tests 98  pass 98  fail 0  skip 0
```

### SQL (isolated; not parallel — pre-existing `assetCode` generator race)

| Suite | Result |
|-------|--------|
| Phase 3A Issue generalization (2 tests, scenarios 1–6 + backfill replay) | PASS |
| Phase 10A Asset / Issue / Work Order (4 tests) | PASS |
| Phase 12A Operational Request (2 tests) | PASS |
| Phase 12A Plant operations (2 tests) | PASS |
| Location History (1 test) | PASS |

Phase 3A SQL proved: location-only Issue; unit required; many Work Orders; dual-write first `workOrderId` only; unlinked Work Order allowed; WO complete leaves Issue OPEN; explicit resolve + reopen; Request submit does not create Issue; two Requests → one Issue; staff denied create-from-Request; Asset-backed Issue survives Asset move; location-only in Location History not Asset History; backfill identities unchanged.

### Static

```text
pnpm exec prisma validate     PASS
pnpm typecheck                PASS
targeted eslint (Phase 3A files)  PASS (0 errors)
pnpm lint                     FAIL — 9 errors, 45 warnings
  classification: PRE-EXISTING
  none of these files were changed in Phase 3A
pnpm verify:migrations        PASS after staging the new migration directory
                              115 migrations; newest 20261005200000_issue_generalization_repair_issue_id
```

No INTRODUCED failures.

---

## Invariants preserved

```text
WO complete ≠ Issue resolved
WO complete ≠ Request resolved
WO complete ≠ Asset OPERATIONAL
```

`completeWorkOrder` updates only the Repair row. It does not call resolve Issue, mutate Request status, or change Asset status.

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"` — confirmed by registry source, Phase 3A SQL, and Department Product hermetic suites.

Customer marketplace catalog still filters with `isDepartmentProductCustomerVisible` (`AVAILABLE` only). Plant is not Marketplace-visible, not offered for sale, and not customer-installable or purchasable. No billing/entitlement/registry status changes.

---

## Explicitly not implemented (Phase 3B+)

- `Repair.spaceId`
- `Repair.procedureVersionId`
- `holdReason`
- maintenance category table
- Work Order priority changes / EMERGENCY
- Work Order status projection changes
- Work Order route redesign
- Procedure pinning
- Record evidence link to Repair
- Work Order closeout, parts, labor duration, costs, Vendor cost
- full manager / technician queues
- PM Plan, preventive generation, PM occurrences, PM Work Orders
- dropping `AssetIssue.workOrderId`
- Prisma/table rename
- Facility Plant Operations AVAILABLE

---

## Phase 3B gate

```text
READY FOR PHASE 3B
```

The Issue model now supports location-only conditions, many Requests per Issue, and many Work Orders per Issue without a second maintenance system. Phase 3B can add Work Order location grain (`Repair.spaceId`), procedure pin, hold reason, and category on top of `Repair` without changing Issue identity.

---

## Known limitations

1. **Repair space grain** still deferred. Location History for Work Orders remains unit-accurate only.
2. **`AssetIssue.workOrderId`** still exists. New reads should use `Repair.issueId`. Dual-write applies to the first Work Order only.
3. **Request stored enum** still contains WO-shaped values for compatibility. New Issue-link writes do not copy those values.
4. **`/asset-issues` list** is a small additive queue, not full Plant Run UX.
5. **Dietary Issue UX** still requires an Asset. That is intentional compatibility, not a schema limit.
