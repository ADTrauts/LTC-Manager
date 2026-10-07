# Console Marketplace — Phase 6D Certification

**Date:** 2026-10-07  
**Verdict:** PASS — ready for Phase 6E  
**Schema:** none. No migration.

Phase 6D adds Harbor-only detail for Department Products and Work presets, and adoption counts on the existing catalog Record editor. Marketplace browse stays one projection. Detail totals use the same operability, identity, lineage, and Work-adoption helpers as `listConsoleCatalogItems`.

## Routes

| Source | Route |
|---|---|
| Department Product | `/console/catalog/products/[productKey]` |
| Catalog Record | `/console/catalog/[stableKey]` |
| Work preset | `/console/catalog/work/[presetKey]` |

`products` and `work` are static segments, so they do not collide with `/console/catalog/new` or `/console/catalog/[stableKey]`. Both new routes are `HARBOR_STAFF` in the platform route registry. An unknown product key or preset key returns `notFound()` before any database query. An arbitrary Facility Work stable key is not a Marketplace preset.

## Department Product detail

`loadConsoleDepartmentProductDetail` reads the code registry. The page is read-only. There is no edit, status change, version change, or capability editor.

Displayed identity: official name, product key, installation key, version, status (`AVAILABLE`, `DEVELOPMENT`, or `RETIRED`), and release date. Description is `shortDescription`, or an em dash when the registry has none. Industry and Facility types come from `facilityIndustryLabel` and `facilityTypeLabel`. Capabilities are `customerCapabilities` copied from the registry. Environmental Services has none, so the page shows an em dash. Facility Plant Operations shows the certified capability list from the registry, not a page-local copy.

Facility names link to the existing Harbor customer page `/console/customers/[facilityId]`.

## Version and release

`versionLabel` is shown as written. Null or blank is `—`. The page does not invent `1.0`.

`releasedOn` is a registry calendar date (`YYYY-MM-DD`), formatted in UTC as a long date (`October 7, 2026`). Null, blank, or a non-date is `—`. The date is not taken from Git or from `Department.createdAt`.

Facility Plant Operations: version `1.0`, status `AVAILABLE`, released `October 7, 2026`. Healthcare Food & Nutrition and Environmental Services: version `—`, released `—`. Environmental Services status remains `DEVELOPMENT`.

## Facilities installed

A Facility is installed when it has a Department row whose key is in `departmentProductLineageKeys`. The count is distinct facilities. Matching by Department name is not used. Current entitlement is not required.

One facility with both `DIETARY` and `HEALTHCARE_FOOD_NUTRITION` is one install. `matchDepartmentRecordForProduct` prefers the installation key, so the table has one row. `DIETARY` is not a second Marketplace product. A Department named Plant Operations on a non-lineage key is excluded.

Installed date is `Department.createdAt`, labeled **Installed**, formatted in `America/New_York`. It is not an entitlement activation date.

## Users with access

The headline is the sum of per-Facility identity-set sizes. The same email at two Facilities counts twice. That is the Phase 6B total. The page does not dedupe people across Facilities, and it does not sum a second query.

A Facility contributes users only when `departmentInstallIsCustomerOperable` is true (`resolveCommercialEntitlement` plus `evaluateCustomerDepartmentOperability`). A disabled Department, a revoked or missing entitlement when enforcement requires one, and every `DEVELOPMENT` product contribute `0`. The Department row still appears as installed. Internal Environmental Services installations can appear with zero customer users.

## Installed Facilities

| Column | Source |
|---|---|
| Facility | `Facility.displayName` |
| Organization | trimmed `Organization.name`, otherwise `—` |
| Installed | `Department.createdAt` |
| Department | local `Department.name` and key |
| Users | that Facility’s access-set size |
| Product access | label below |
| Department status | Enabled when `Department.isActive`, otherwise Disabled |

Product access labels, derived from the existing operability result:

| Label | When |
|---|---|
| Active | customer-operable |
| Development/internal | product status is `DEVELOPMENT` |
| Revoked | not operable, and the matched entitlement status is `REVOKED` |
| Not entitled | every other non-operable install, including a disabled Department |

Department Enabled/Disabled is a separate column from Product access.

## Role breakdown

The **Users with access** section counts only identities already in the canonical access sets.

| `Employee.roleType` / User role | Bucket |
|---|---|
| `GM` | General Managers |
| `MANAGER` | Managers |
| `SUPERVISOR` | Supervisors |
| `STAFF`, `LEAD_TEAM_MEMBER` | Staff |
| Facility Administrator | Facility Administrators |

`Employee.roleType` is the operational role. `EmployeeDepartment.roleType` is not used. General Managers are not folded into Managers.

Within one Facility, identity is the lowercased email, or `employee:{id}` / `user:{id}` when email is empty. One email is one person. An employee operational role wins over a Facility Administrator User with the same email. If two employees share an email, the higher rank wins: General Manager, Manager, Supervisor, Staff, Facility Administrator. A Facility Administrator is added only when that identity is not already present. Inactive or unverified administrators, and terminated employees or employees outside the Department, are excluded. Role buckets therefore sum to the headline for that product. Facility Administrators are included only for customer-operable Departments, because non-operable Facilities contribute an empty identity set.

There is no cross-customer person list.

## Record detail

`/console/catalog/[stableKey]` keeps the editor: save draft, publish, new version, retire, delete draft.

`loadHarborCatalogAdoption` adds two counts beside the editor:

- **Published version** — `vN` of the published definition, or `—`.
- **Draft version** — `vN` only when a draft successor exists.
- **Facilities installed** — `facilityCatalogInstall` count for the stable key.
- **Active placements** — `logAttachment` rows with status `ACTIVE`.

A draft successor does not change the published version or the adoption counts. There is no installed-Facility list for Records.

## Work preset detail

`loadConsoleWorkPresetDetail` accepts only `DEPARTMENT_WORK_PRESET_KEYS`. The owning product comes from `workPresetOwningProductKey`, not from the preset name. Preset version and status are `—`. The page does not invent Work preset versioning and has no edit or create action.

**Facilities installed** is the distinct `facilityId` on Work Plans whose `presetKey` or `stableKey` matches the preset. Multiple versions do not add Facilities.

**Published plans** is the distinct published lineage `facilityId + departmentId + stableKey` where status is `PUBLISHED`. Draft and retired versions do not add a published plan. Executions and occurrences are not counted.

The usage table lists each Facility Work Plan version: Facility, Organization, Department (local name), Plan (Facility plan name), Status (`DRAFT`, `PUBLISHED`, or `RETIRED`), and Version (the Facility copy). A draft v1, published v2, and successor draft v3 of one lineage are three rows, one Facility, and one published plan.

## Query shape

Department detail: one Department query for the lineage keys (with Facility and Organization), then entitlements and billing for those Facilities, then employees and Facility Administrators only for customer-operable Departments. Aggregation is in memory. There is no query per Facility.

Record adoption: one `facilityCatalogInstall` count and one active `logAttachment` count.

Work detail: one `departmentWorkPlan` query for `presetKey` or `stableKey`, then `summarizeWorkPresetAdoption` in memory.

## Authorization

All three detail routes call `requireHarborStaff()`. OWNER and MEMBER are unchanged. A facility session that opens a product, Work, or Record detail URL is sent to `/console/login` and does not receive adoption counts.

## Marketplace navigation

Department and Work rows use the projection `detailHref`: `/console/catalog/products/[productKey]` and `/console/catalog/work/[presetKey]`. Record rows still open the editor. Back to Marketplace returns to `/console/catalog` without restoring the previous filter query. Family tabs, record subtypes, search, filters, and New catalog record are unchanged.

## Tests

| Check | Result |
|---|---|
| Hermetic browse, detail presentation, and projection | PASS — 12 tests |
| SQL detail on disposable `ltc_verify_console_catalog_6b` | PASS — product, record, and work detail match the projection |
| SQL projection, rerun alone after detail | PASS — 2 tests |
| Playwright `marketplace-phase-6c.spec.ts` | PASS — 4 tests |
| Playwright `marketplace-phase-6d.spec.ts` | PASS — 6 tests |
| `npx tsc --noEmit` | PASS |
| eslint on Phase 6D files | PASS |
| legacy route mirror | PASS — 9 tests, mirror regenerated |
| `migration-integrity` | PASS — 120 migrations, no new migration |
| test-discovery sentinel | PASS — 363 files, 44 SQL-backed suites |

Detail and projection SQL tests were not run in one process. Both insert lineage Departments and compare before/after counts on the same database.

Browser suite, against Next on port 3017 with `NEXT_DIST_DIR=.next-console-6d` and `DATABASE_URL` pointed at `ltc_verify_console_catalog_6b`:

1. Departments → Facility Plant Operations opens identity, version `1.0`, status `AVAILABLE`, released `October 7, 2026`, and registry capabilities. No edit control. Back returns to Marketplace.
2. The operable Plant Facility shows 6 users, Active, Enabled. The disabled Plant Facility shows 0 users and Disabled. A decoy Department named Plant Operations is absent. The five role counts sum to the headline. Food & Nutrition includes the Dietary and canonical installation rows, with version and release `—`. Environmental Services is `DEVELOPMENT`, version `—`, users `0`.
3. Cooler Temperature Log shows published `v1`, Facilities installed, and Active placements. New version or the draft heading remains, and `/console/catalog/new` still opens.
4. Mechanical Room Round shows version `—`, status `—`, owning product Facility Plant Operations, and the Facility plan versions, including a published plan and a draft. There is no new-preset action.
5. A facility session is rejected at product, Work, and Cooler detail URLs.
6. `/console/catalog/new`, `/console/catalog/products/PLANT`, `/console/catalog/work/MECHANICAL_ROOM_ROUND`, and `/console/catalog/cooler_temperature_log` coexist. Unknown product and Work keys return HTTP 404.

## Deferred

Not implemented: Procedures, MAU, trend analytics, charts, Product editing, Work preset editing, customer-facing adoption, a cross-customer person list, billing, and any new persistence.

## Phase 6E gate

The Console Marketplace lets Harbor staff see what is distributed and inspect its registry version, release state, Facility adoption, and source-appropriate usage. Counts stay on the Phase 6B helpers. Source registries stay the authority.

**READY FOR PHASE 6E**
