# Console Marketplace — Phase 6C Certification

**Date:** 2026-10-07  
**Verdict:** PASS — ready for Phase 6D  
**Schema:** none. No migration.

Phase 6C replaces the Records-only Marketplace table with the Phase 6B projection. Harbor staff browse Department Products, catalog Records, and Work presets from `/console/catalog`. Department and Work detail pages are not built.

## Browse information architecture

The page title stays **Marketplace**. Console navigation is unchanged.

One route. Browse state is the query string.

| Family | URL | Rows |
|---|---|---|
| All (default) | `/console/catalog` | Department Products, catalog Records, Work presets |
| Departments | `?family=departments` | `catalogFamily = DEPARTMENTS` |
| Records | `?family=records` | `catalogFamily = RECORDS` |
| Work | `?family=work` | `catalogFamily = WORK` |

Records adds a second row: All, Logs, Checklists, Inspections (`type=log|checklist|inspection`). Audits, Readings, Acknowledgements, and Procedures are not browse families or record subtypes.

Invalid `family`, `type`, `status`, and `category` values are dropped and the address is redirected to the canonical query. An explicit `family=all` redirects to `/console/catalog`. Changing family drops `type`, `status`, and `category`. Search is kept.

## Table

`HarborCatalogPage` calls `requireHarborStaff()` and `listConsoleCatalogItems` once. Filtering, search, and sorting run on that list. The page does not call the Department registry, `listHarborCatalogLines`, or the Work preset registry.

`listHarborCatalogLines` remains for the existing record detail and editor.

Default sort inside the filtered set is name ascending (case-insensitive), then stable key. Install count is not a sort. Columns are not click-sortable.

| Column | Source |
|---|---|
| Name | `name`, with `stableKey` underneath |
| Type | Department, Log, Checklist, Inspection, or Work |
| Category | `categoryLabel` from the projection |
| Version | `versionDisplay` exactly (`1.0`, `v1`, `—`) |
| Status | `statusLabel` exactly (`AVAILABLE`, `DEVELOPMENT`, `Published`, `Published · Draft`, `Retired`, `—`) |
| Installed | `2 facilities`, `1 facility`, or `None yet` |
| Usage | count plus `usageLabel`, with singular nouns (`1 user`, `24 placements`, `4 published plans`, `—`) |

Record names link to `/console/catalog/[stableKey]`. Department and Work rows are text. The projection still carries future `detailHref` values, and the browse UI does not follow them.

## Search and filters

Search is one case-insensitive `includes` over name, stable key, category label, and category key. On All it crosses Departments, Records, and Work. It does not search customer Facility configuration.

Status and category filters are omitted on All.

| Family | Status | Category |
|---|---|---|
| Departments | AVAILABLE, DEVELOPMENT, RETIRED | industry labels present in the projection |
| Records | Published, Published · Draft, Draft, Retired | catalog categories present for the current subtype |
| Work | none | owning product names present in the projection |

Category options come from the family (and record subtype) before status and search, so the menu does not collapse after a selection. Clear filters returns to the current family with no subtype, status, category, or search.

## Authoring

| View | Action |
|---|---|
| All | New catalog record → `/console/catalog/new` |
| Records | New catalog record |
| Records → Logs / Checklists / Inspections | New catalog log / checklist / inspection, via the existing editor `initialPurposeType` |
| Departments | none |
| Work | none |

The create page still uses `HarborCatalogEditor` and `createHarborCatalogAction`. Record detail, draft save, publish, new version, retire, and delete draft were not redesigned.

## Empty states

| Case | Copy | Create |
|---|---|---|
| All, catalog empty, no search | No Marketplace items are available. | New catalog record |
| Departments | No Department Products match these filters. | none |
| Records | No catalog Records match these filters. | New catalog record |
| Work | No Work presets match these filters. | none |
| Search miss | No Marketplace items match “query”. | does not claim the Marketplace is empty |

A result count (`14 items` / `1 item`) sits above the table. Family tabs do not show live badge counts.

## Deferred

Not implemented: Department Product detail, installed-Facility list, users-with-access detail, role breakdown, Record detail adoption polish, Work preset detail, Procedure catalog, MAU, activity trends, and any new persistence.

Catalog `purposeType = PROCEDURE` stays out of the projection, so it does not appear in the table.

## Authorization

`/console/catalog` remains `HARBOR_STAFF` through `requireHarborStaff()`. OWNER and MEMBER are unchanged. A facility session that opens `/console/catalog` is sent to `/console/login` and does not see adoption counts.

## Tests

| Check | Result |
|---|---|
| Hermetic browse filters, normalization, install/usage copy, and create actions | PASS — 5 tests in `console-catalog-browse.hermetic.test.ts` |
| Hermetic projection, including the browse page source lock | PASS — `console-catalog.hermetic.test.ts` |
| SQL projection tests on disposable `ltc_verify_console_catalog_6b` | PASS — department counts, user access, record install/placement, work install/published usage, source isolation |
| Playwright `tests/console-browser/marketplace-phase-6c.spec.ts` | PASS — 4 tests |
| `npx tsc --noEmit` | PASS |
| eslint on Phase 6C files | PASS |
| `prisma validate` | PASS |
| `migration-integrity` | PASS — 120 migrations, no new migration |
| test-discovery sentinel | PASS — 361 files, 43 SQL-backed suites |

Browser suite, against Next on port 3017 with `NEXT_DIST_DIR=.next-console-6c` and `DATABASE_URL` pointed at `ltc_verify_console_catalog_6b`:

1. All shows Facility Plant Operations, Healthcare Food & Nutrition, Environmental Services, Cooler Temperature Log, Opening Checklist, and Mechanical Room Round. Departments, Records, and Work each keep a single family. Plant shows Department / Healthcare / 1.0 / AVAILABLE and facility/user copy. Mechanical Room Round shows Work / Facility Plant Operations / — / — and published-plan copy. Department and Work rows have no link. Departments and Work have no create button. Procedures is not a family, and a procedure definition is absent from the table.
2. Logs, Checklists, and Inspections filter the record family. Cooler Temperature Log opens `/console/catalog/cooler_temperature_log`. New catalog record creates a draft that returns in Marketplace search.
3. `cooler`, `PLANT`, and `Mechanical` search as specified. Records + Logs + Sanitation + `dishwasher` returns the sanitation log. Switching to Departments removes `type` and `category` and keeps the query. Departments `AVAILABLE` hides Environmental Services. Records `Published` hides a draft-only log. Work has no status filter. A search miss names the query.
4. Harbor sign-in opens Marketplace. A facility session is rejected at `/console/login`.

Record publish, new version, retire, and delete draft were not re-run in the browser. Those actions and `/console/catalog/[stableKey]` were not changed.
