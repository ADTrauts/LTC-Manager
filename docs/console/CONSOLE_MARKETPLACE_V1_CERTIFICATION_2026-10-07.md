# Console Marketplace V1 Certification

**Date:** 2026-10-07  
**Baseline:** `e0ab4bf` `feat(console): add marketplace product adoption detail`  
**Verdict:** CERTIFIED — CONSOLE MARKETPLACE V1 COMPLETE  
**Schema:** none. No migration.

This document is the authoritative current certification for the Harbor Console Marketplace. Historical Phase 6B–6D reports remain phase evidence and are not rewritten.

## Certification question

Can Harbor staff reliably use one Marketplace to understand what Vssyl distributes, what version/state each item is in, where it is installed, and how it is being used — while every number remains traceable to the authoritative source and no customer data leaks across authorization boundaries?

**Yes.** Evidence below.

## Supported sources and families

| Source type | Family | Canonical source |
|---|---|---|
| `DEPARTMENT_PRODUCT` | Departments | Department Product code registry |
| `CATALOG_RECORD` | Records | `CatalogLogDefinition` |
| `WORK_PRESET` | Work | Work preset registry + Facility `DepartmentWorkPlan` adoption |

Browse families: All, Departments, Records, Work.  
Record subtypes: All, Logs, Checklists, Inspections.

Not Marketplace sources: Procedures, KnowledgeArticle, OperationalTemplate, starter packages, Menus, reports, integrations, arbitrary Facility Work Plans, Facility-authored configuration.

There is no `MarketplaceItem` model, no catalog aggregation table, and no cached adoption row. Counts are live read projections.

## Department Products

| Product | Status | Version | Released |
|---|---|---|---|
| Facility Plant Operations (`PLANT`) | AVAILABLE | 1.0 | October 7, 2026 |
| Healthcare Food & Nutrition | AVAILABLE | — | — |
| Environmental Services (`EVS`) | DEVELOPMENT | — | — |

Version and release come only from registry `versionLabel` and `releasedOn`. They are not inferred from Git, migrations, or `Department.createdAt`.

**Installed** means a Department row exists on a Product lineage key (`departmentProductLineageKeys`). Name match does not count. Entitlement is not required. Food lineage includes `DIETARY` and `HEALTHCARE_FOOD_NUTRITION` as one Product. `DIETARY` is not a separate Marketplace item.

**Users with access** means the sum of per-Facility identity-set sizes for customer-operable installs. The same email at two Facilities counts twice. A disabled, revoked, or otherwise non-operable Department may remain installed while contributing `0` users. `DEVELOPMENT` Products never contribute customer users. Role buckets (GM, Manager, Supervisor, Staff including Lead Team Member, Facility Administrator) sum to the headline. Dedup is inside one Facility: employee operational role wins over a Facility Administrator with the same email.

Browse row and Product detail agree on name, version, status, Facility count, and user count.

## Catalog Records

Browse shows published version (`vN`), status (`Published`, `Published · Draft`, `Draft`, `Retired`), Facilities installed (`FacilityCatalogInstall` count), and Usage as active placements (`LogAttachment` status ACTIVE).

Detail keeps the existing editor and adds Published version, Draft version when present, Facilities installed, and Active placements. Draft successors do not change published adoption. Multiple placements in one Facility increase Usage without changing Facility count. Inactive attachments are excluded.

Authoring remains Records-only: create draft, save, publish, new version/successor, retire, delete eligible draft. Certified through Harbor create actions in the browser and `createCatalogDefinition` / `publishCatalogDefinition` / `createCatalogDraftSuccessor` / `retireCatalogDefinition` in the V1 SQL suite.

## Work presets

Mechanical Room Round ownership is `workPresetOwningProductKey` → Facility Plant Operations. Preset version and status are `—`.

**Facilities installed** is distinct Facilities with any derived Work Plan (`presetKey` or `stableKey`). Version rows do not increase install count.

**Published plans** is distinct published lineages (`facilityId` + `departmentId` + `stableKey`). Draft/retired versions do not add published usage.

The detail usage table may list multiple Facility plan versions without changing preset version or adoption totals. Arbitrary Facility Work Plans without a recognized preset identity do not become Marketplace Work items.

## Browse experience

One route: `/console/catalog`. Query-driven family, subtype, search, status, and category. Invalid values are dropped. Switching family removes incompatible subtype/status/category; search may remain.

Create actions: All and Records → New catalog record (or subtype-specific). Departments and Work → none.

Install cell copy: `None yet` / `1 facility` / `N facilities` (not `N installed`). Usage nouns stay source-specific: users, placements, published plans.

## Detail routes

| Source | Route |
|---|---|
| Department Product | `/console/catalog/products/[productKey]` |
| Catalog Record | `/console/catalog/[stableKey]` |
| Work preset | `/console/catalog/work/[presetKey]` |

These coexist with `/console/catalog/new`. Unknown Product and Work keys return 404 without querying arbitrary keys into catalog rows. Back to Marketplace returns to `/console/catalog`.

## Authorization and privacy

All Marketplace and detail routes call `requireHarborStaff()`. Harbor OWNER and MEMBER are equivalent for viewing. Facility customer sessions are redirected to `/console/login` and do not receive adoption data.

Detail may show Facility names, Organization names, aggregate counts, role totals, and Facility Work plan names. It does not show a cross-customer person directory or emails.

Customer Department Marketplace remains `/admin/departments?marketplace=1` and does not call `listConsoleCatalogItems`.

## Query strategy

| Surface | Shape |
|---|---|
| Marketplace list | Fixed batch queries per source family |
| Department detail | Batched Departments, entitlements/billing, then employees/FAs for operable installs |
| Record adoption | Two grouped/count queries |
| Work detail | One Work Plan query + in-memory aggregation |

No row-level N+1. No analytics tables, MAU store, or adoption cron.

## Test evidence

| Check | Result |
|---|---|
| Hermetic V1 locks + 6B/6C/6D hermetic | PASS — 18 tests |
| SQL V1 known-count fixture | PASS — list/detail/source agreement, lineage, decoy exclusion, cross-Facility email counting, Food lineage, EVS DEVELOPMENT users 0, Record draft/install/placement, Work succession, Procedure/Knowledge/OperationalTemplate/customer Work isolation, Record authoring service path |
| SQL 6B projection regression | PASS — 2 tests (alone) |
| SQL 6D detail regression | PASS — 1 test (alone) |
| Playwright `marketplace-release.spec.ts` | PASS — 6 tests (`@console-marketplace-release` `@ci-gate`) |
| Playwright 6C + 6D regression | PASS — 10 tests |
| `npx tsc --noEmit` | PASS |
| eslint on V1 certification files | PASS |
| `npx prisma validate` | PASS |
| `migration-integrity` | PASS — 120 migrations |
| test-discovery sentinel | PASS — 365 files, 45 SQL-backed suites |

Browser evidence ran against Next on port 3018 with `NEXT_DIST_DIR=.next-console-6e` and disposable database `ltc_verify_console_catalog_6b`.

Marketplace SQL suites must not share one `node --test` process: they insert lineage Departments and compare before/after counts on the same database.

## Accepted V1 deferrals

- Procedures catalog
- MAU
- Trend analytics / charts
- Product editing from Console
- Work preset editing from Console
- Customer-facing adoption UI
- Cross-customer person list
- Marketplace persistence table

## Release blockers

NONE

## Final gate

Is the Vssyl Console Marketplace now a reliable internal source-of-truth view for everything Vssyl currently distributes through Department Products, catalog Records, and Work presets?

**YES — CONSOLE MARKETPLACE V1 IS COMPLETE**
