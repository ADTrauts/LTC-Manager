# Console Marketplace — Phase 6B Certification

**Date:** 2026-10-07  
**Verdict:** PASS — ready for Phase 6C  
**Schema:** none. No migration.

Phase 6B adds a Harbor read projection over the sources that already own Department Products, catalog Records, and Work presets. It does not add a Marketplace table, and it does not change the current Marketplace page.

## Projection

`listConsoleCatalogItems` in `src/lib/harbor-console/console-catalog.ts` returns `ConsoleCatalogItem`.

| Field | Department Product | Catalog Record | Work preset |
|---|---|---|---|
| `sourceType` | `DEPARTMENT_PRODUCT` | `CATALOG_RECORD` | `WORK_PRESET` |
| `catalogFamily` | `DEPARTMENTS` | `RECORDS` | `WORK` |
| Identity | `productKey` | headline `CatalogLogDefinition.id` and `stableKey` | `presetKey` |
| Category | industry (`HEALTHCARE` → Healthcare) | `CatalogLogCategory` | owning product's official name |
| Version | `versionLabel`, or `—` | `v{published}` or `v{draft}` | `—` |
| Status | registry token (`AVAILABLE`, `DEVELOPMENT`, `RETIRED`) | `Published`, `Published · Draft`, `Draft`, `Retired` | `—` |
| Installed | distinct facilities with a lineage Department row | `FacilityCatalogInstall` facilities | distinct facilities with a derived Work Plan |
| Usage | users who can enter a customer-operable install | active `LogAttachment` placements | distinct published Work Plan lineages |
| Detail | `/console/catalog/products/[productKey]` | `/console/catalog/[stableKey]` | `/console/catalog/work/[presetKey]` |
| Author | no | yes | no |

`PROCEDURE` catalog rows are not loaded. `KnowledgeArticle` and `OperationalTemplate` are not read. Customer Work Plans without a known preset key do not become catalog rows.

The product and work detail URLs are two path segments under `/console/catalog/`. The existing record route is one segment, `/console/catalog/[stableKey]`, so it does not capture those URLs. The pages themselves are not implemented in this phase.

## Department release metadata

Registry-only fields on `DepartmentProduct`: `versionLabel` and `releasedOn`.

| Product | Status | Version | Released |
|---|---|---|---|
| Facility Plant Operations | `AVAILABLE` (unchanged) | `1.0` | `2026-10-07` |
| Healthcare Food & Nutrition | `AVAILABLE` | null → `—` | null |
| Environmental Services | `DEVELOPMENT` | null → `—` | null |

No git SHA. No product release table.

## Adoption

**Facilities installed** for a Department Product is `COUNT(DISTINCT facilityId)` on `Department` where `key` is in `departmentProductLineageKeys`. Healthcare Food & Nutrition counts `DIETARY` and `HEALTHCARE_FOOD_NUTRITION` as one product. A Department named Plant Operations with any other key is not an install. Disabled, unentitled, and internal DEVELOPMENT rows still count.

**Users with access** is 0 unless that facility's matched Department is customer-operable (`resolveCommercialEntitlement` + `evaluateCustomerDepartmentOperability`). Counted people are active employees with `primaryDepartmentId` or `EmployeeDepartment` membership, plus active email-verified Facility Administrators. The same email is one person. DEVELOPMENT products stay at 0 users. Harbor staff are not customer users.

**Work install** is distinct `facilityId` on `DepartmentWorkPlan` where `presetKey` or `stableKey` is the preset. Version rows in one facility count once. **Work usage** is distinct `(facilityId, departmentId, stableKey)` among `PUBLISHED` rows. A draft-only copy is an install and not a published plan.

**Record install** reuses `listFacilityCatalogInstallCounts`. **Record usage** is active attachment rows for that `catalogStableKey`. The version column is the current catalog version, not a facility pin.

Work category comes from `WORK_PRESET_PRODUCT_KEYS`. Renaming a preset's display name does not change the owning product.

## Query strategy

One live read, no metrics table.

- Departments: one `Department` query for every lineage key, then one entitlement query and one billing query for those facilities, then at most one employee query and one Facility Administrator query for operable departments.
- Records: one definition query (`LOG`, `CHECKLIST`, `INSPECTION` only), one install `groupBy`, one active-attachment `groupBy`.
- Work: one `DepartmentWorkPlan` query for every known preset key.

Counts are attached in memory. The hermetic fixture asserts each of those calls happens once for a multi-facility catalog.

## Authorization

`listConsoleCatalogItems` does not open a session. `/console/catalog` still calls `requireHarborStaff()` and still renders `listHarborCatalogLines`. Customer routes do not import the projection. OWNER and MEMBER are unchanged.

## Tests

| Check | Result |
|---|---|
| Hermetic projection, presentation, and registry tests | PASS |
| SQL projection tests on disposable `ltc_verify_console_catalog_6b` | PASS |
| `npx tsc --noEmit` | PASS |
| eslint on Phase 6B files | PASS |
| `prisma validate` | PASS |
| `migration-integrity` | PASS — 120 migrations, no new migration |
| test-discovery sentinel | PASS — 360 files, 43 SQL-backed suites |

SQL coverage: Plant install ignores a same-name decoy; Food & Nutrition lineage counts two keys as one product; user access is the operable roster (manager, secondary supervisor, verified administrator) with terminated, unrelated, inactive, unverified, duplicate-email, disabled-department, and DEVELOPMENT rows excluded; Cooler Temperature Log install and placement counts match the tables; published v1 plus draft v2 displays `v1` and `Published · Draft`; catalog `PROCEDURE`, Knowledge, Operational Template starters, and customer Work Plans do not become catalog rows; Mechanical Room Round counts a facility once across versions and does not count a draft-only copy as a published plan.

## Deferred

Phase 6C: family tabs, unified table, search, filters, context-aware create, browse redesign.

Phase 6D: Department Product detail, installed-facility list, role breakdown, record adoption polish, Work detail.

Procedures stay deferred until a distributable catalog exists.
