# LTC Manager — V1 Bulk Onboarding Imports (2026-08-09)

**Branch:** `product/v1-bulk-onboarding-imports-2026-08-09`  
**Base tip:** `dbbd36a93e6001cfc385c0314589ef0252b7184f`  
**Migration count:** 72 (no schema change)

## Purpose

Large facilities cannot configure hundreds of rooms/spaces and assets one record at a time. This phase adds **create-only** bulk CSV onboarding inside Facility Builder and Asset Builder.

## Employee import audit (precedent)

| Topic | Finding |
|-------|---------|
| Route | `/employees/import` — `ImportCsvForm` + `importEmployeesFromCsvAction` |
| Format | **CSV only** (no XLSX dependency) |
| Parser | `src/lib/csv-parse.ts` + `src/lib/employee-csv-import.ts` |
| Preview | **None** — upload mutates immediately |
| Duplicate | Upsert by email or first+last name |
| Transaction | Per-row transactions; partial file success |
| Authority | MANAGER+ |
| Limits | 500 rows / 2 MB |
| Tests | No dedicated unit tests |

**Reuse:** CSV parser, header-alias pattern, Manager-facing template download, result counts.

**Do not copy:** immediate mutation, name-based upsert ambiguity, silent field drops, lack of dry-run, lack of all-or-nothing hierarchy safety.

## Shared bulk-import UX

Component: `src/components/build/bulk-import-wizard.tsx`

Flow:

1. Download Template  
2. Upload Completed File  
3. Validate  
4. Preview  
5. Confirm Import  
6. Completion Summary  

Upload never mutates configuration. Confirm re-parses the file and revalidates authority.

Error results CSV includes: row number, status, message, original columns.

Limits: **2,000 rows / 2 MB**. Format: **CSV only**.

## Facility Structure template

Headers:

```
floor,neighborhood,space,spaceType,roomNumber,code,description,department,customTypeLabel
```

| Column | Required | Notes |
|--------|----------|-------|
| floor | yes | Creates/reuses `Unit` with `hierarchyRole=FLOOR` |
| neighborhood | yes | Creates/reuses Neighborhood under Floor (`NEIGHBORHOOD`) |
| space | yes | Creates/reuses `UnitSpace` under Neighborhood |
| spaceType | yes | Facility Builder preset labels (e.g. Resident Room, Servery) |
| roomNumber | no | max 32 |
| code | no | max 20 |
| description | no | max 500 |
| department | no | Active department name/key → space responsibility on create |
| customTypeLabel | no | Required when spaceType is Other/Custom |

### Hierarchy rules

- One file builds Floor → Neighborhood → Room.
- Repeated parent names create parents once.
- Exact existing matches are **reused** (create-only).
- Ambiguous names → invalid (no silent guess).
- Inactive / STAGED parents → invalid.
- Existing space with different type → **conflict** (no overwrite).
- Imports never delete, retire, rename, or move hierarchy.

### Transaction / idempotency

- Full-file validation before write.
- Parent-before-child deterministic create order inside `prisma.$transaction`.
- Replay of the same file reuses existing nodes; create counts stay at zero.
- Large imports use extended interactive transaction timeouts (facility 120s, assets 180s) so 200+ spaces / 250+ assets can confirm atomically.

## Asset template

Headers:

```
name,equipmentType,floor,neighborhood,space,assetCode,manufacturer,model,serialNumber,facilityAssetNumber,status,department,criticality,notes,description
```

| Column | Required | Notes |
|--------|----------|-------|
| name | yes | min 2 |
| equipmentType | yes | min 2 |
| floor | yes | Human-readable Floor name |
| neighborhood | yes | Neighborhood/Unit under that Floor |
| space | no | Room/Space under Neighborhood |
| assetCode | no | Auto-generated when blank |
| serialNumber / facilityAssetNumber | no | Stable identity for skip detection |
| status | no | Default OPERATIONAL (or ACTIVE legacy) |
| department | no | Defaults from unit PRIMARY responsibility when possible |
| criticality | no | Default ROUTINE |

### Location matching

Resolves `Floor → Neighborhood → Space` by name against Facility Builder hierarchy.  
**Never** places an asset at facility root on match failure.

### Duplicate rules

| Match | Behavior |
|-------|----------|
| Exact `assetCode` | Existing / Skip |
| Exact `facilityAssetNumber` | Skip (conflict if different code) |
| Exact `serialNumber` | Skip if same name/type; else conflict |
| No match | Create |

Creates use canonical `createAsset` when Asset Ops is enabled (INITIAL status history). Does **not** create issues, repairs, evidence, or work orders.

## Authority

| Import | Authority |
|--------|-----------|
| Facility Structure | Matches Facility Builder configure actions (**MANAGER+** password). Route registry still FA-gates `/admin/facility/builder` (pre-existing inconsistency). |
| Asset | Matches Asset create action gate (**SUPERVISOR+** password). Canonical `createAsset` manage authority still requires Manager+ when Asset Ops is enabled. |
| Quick PIN | Denied |
| Frontline STAFF | Denied |

Confirmation revalidates authority server-side.

## Environment note (this closeout)

Local disposable verification ran on **PostgreSQL 14.18** (`ltc_verify_bulk_import_20260809`). PostgreSQL 16 was not available. Formal candidate sign-off requires a PG16 disposable rerun per product policy. `ltc_manager` was not touched.

## BUILD integration

- **No** new Build Home cards.
- Facility Builder: Add individually **or** Bulk Import (prominent on empty state).
- Asset Builder: Add individually **or** Bulk Import (prominent on empty state).

## Tests

- Hermetic: `src/lib/bulk-import/*.hermetic.test.ts`
- Scale DB: `src/lib/bulk-import/bulk-import.scale.db.test.ts` (≥4 floors, ≥17 neighborhoods, ≥200 spaces, ≥250 assets + replay)
- Browser: `npm run test:bulk-import-browser`

## Retained findings

1. Employee CSV import remains immediate upsert without preview — future alignment optional.
2. Facility Builder registry docs still describe FA-only while actions allow MANAGER+ (pre-existing).
3. Unit names remain facility-wide unique — templates must use unique Neighborhood names across floors.
4. Migration count unchanged at 72; no new schema.

## Out of scope (explicit)

Spreadsheet sync, scheduled imports, Sheets/API mass sync, field-mapping wizards, destructive updates, bulk retirement, AI mapping, universal ETL.
