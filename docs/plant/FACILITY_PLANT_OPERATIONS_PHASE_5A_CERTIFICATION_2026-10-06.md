# Facility Plant Operations — Phase 5A Certification

**Date:** 2026-10-06  
**Mode:** ACT complete — product coherence, discoverability, and first-run readiness  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Phase 4D:** [Phase 4D certification 2026-10-06](./FACILITY_PLANT_OPERATIONS_PHASE_4D_CERTIFICATION_2026-10-06.md)  
**Baseline:** `0770f2c` `fix(plant): allow preventive work without procedure`

Facility Plant Operations remains **DEVELOPMENT**. This phase did not implement starter Work/Record/PM presets, a starter installer, full documentation reconciliation, Marketplace release copy, or registry AVAILABLE.

Phase 5 PLAN verdict that authorized this slice: **READY WITH CONSTRAINTS**. This ACT implements **5A only**.

---

## Verdict

```text
PASS — READY FOR PHASE 5B
```

Authorized Facility Plant Operations users can see and understand Request, Issue, Work Order, Preventive Maintenance, and Asset without learning persistence names. SUPERVISOR+ Maintenance navigation is coherent. STAFF stay on My Work. Unit/Space “Report a problem” creates a Request, not an Issue. Asset Run profile works for Plant without Dietary Asset Operations. Plant Build exposes Work, Getting Started, and factual counts without blocking Run.

---

## Run navigation

Top-level capability remains **Maintenance**.

SUPERVISOR+ Maintenance sub-nav:

```text
Assets · Work Orders · Issues · Preventive · Vendors
```

Routes (unchanged):

| Label | Route |
|---|---|
| Assets | `/assets` |
| Work Orders | `/repairs` |
| Issues | `/asset-issues` |
| Preventive | `/preventive-maintenance` |
| Vendors | `/assets?subtab=vendors` |

STAFF do not receive Maintenance sub-tabs. STAFF land on `/repairs` as **My Work**. `/asset-issues` and `/preventive-maintenance` remain supervisor-gated; STAFF hitting Issues are redirected to `/repairs`.

---

## Build navigation

Plant Department Builder tabs:

```text
Overview · Locations · Operating Rhythm · Work · Maintenance · People & Coverage · Records
```

Menus remain hidden. Maintenance remains the PM Builder (`/build/departments/:id/preventive-maintenance`). Assets and Procedures stay linked surfaces, not Builder tabs.

Work is visible for Plant even with no Work presets. Empty state distinguishes recurring operational rounds from Preventive Maintenance (scheduled service against a specific Asset). Starter Work presets are **not** installed.

Operating Rhythm stays visible. Copy: Operational Cycles are optional for Facility Plant Operations.

---

## Terminology

Official Product registry name: **Facility Plant Operations**. Local Department default name remains **Plant Operations**. Status remains **DEVELOPMENT**.

### Work Order (customer-visible)

Repaired on active V1 surfaces:

- Repairs → Work Orders
- New repair → New Work Order
- Create repair → Create Work Order
- Direct repair → Direct Work Order
- Why this repair exists → Work Order source
- Repairs by Status → Work Orders by Status
- Asset Repairs heading → Work Orders
- Search repairs (sr-only) → Search Work Orders
- Category display `General repair` → **General** (stable key `GENERAL_REPAIR` unchanged)

Not renamed: Prisma `Repair`, `/repairs`, internal compatibility identifiers, testids.

### Issue

User-facing: **Issue**, **Report Issue**, **Create Issue**.  
Not exposed as “Asset Issue” on operator UI. Asset remains optional; location-only Issues show **Location-only**. Route `/asset-issues` and persistence `AssetIssue` unchanged.

### Preventive Maintenance

Operator labels:

```text
Preventive · Preventive Maintenance · Due soon · Due today · Overdue · Completed · Skipped · Upcoming schedule
```

Primary UI no longer uses Projected, occurrence, materialization, or generator as operator nouns. Skip copy: “Skip this scheduled maintenance.” Internal domain names unchanged.

---

## Request intake

**Defect closed:** `ReportProblemForm` and `RequesterStatusPanel` are mounted from Unit, Space, Neighborhood, and employee runtime. “Report a problem” is Request intake, not Issue create.

- Non-Plant Facility users may submit a maintenance need without Plant Department membership (existing Request routes).
- Location is pre-populated from the Unit/Space context.
- Asset is optional. Location-only Requests are valid.
- Submit creates `OperationalRequest` only — no Issue, no Work Order.
- Help copy: “Report a maintenance need for this location. Plant Operations will review it and determine whether an Issue or Work Order is needed.”
- Requester status projection: Received · Accepted · In Progress · Resolved · Declined.
- Plant triage remains `/staffing/operations`. Browser-certified: submitted Request appears on the Plant triage panel.

Existing Request services/persistence. No new request model.

---

## Asset eligibility

Shared Asset Run/profile (`/assets`, `/assets/[assetId]`, builder) uses `isSharedAssetOperationsEnabled`:

```text
Dietary Asset Operations flag
OR Plant runtime
```

| Combination | Result |
|---|---|
| Dietary only | Unchanged — Asset profile works |
| Plant only (`DIETARY_ASSET_OPERATIONS_ENABLED=false`) | Asset registry and `/assets/[assetId]` open; no unrelated redirect |
| Dietary + Plant | One shared profile |
| Neither | Existing gate — operational Asset route denied |

Not Plant-specific. Not duplicated. Plant roles may view the shared operational profile; STAFF still do not receive unrestricted Asset administration. Mutation boundaries unchanged.

Asset profile copy: **Work Orders**, **Create Work Order**. Preventive Maintenance section lists Plan names/statuses and links to Plant PM Build for SUPERVISOR+. History still projects Work Orders, PM, condition, and Issues from canonical facts. No new ledger.

---

## Getting Started

Plant Build Overview adds derived **Getting Started** plus factual counts (Locations, Assets, People, Work Plans, Records, published PM Plans). No charts, no score, no `SETUP_COMPLETE`.

Sequence:

1. Confirm Locations
2. Add or import Assets
3. Confirm maintenance categories
4. Add People & Coverage
5. Add starter configuration — **Available in starter configuration** (deferred; Overview placement `Add starter configuration` does not install)
6. Configure recurring Work
7. Confirm Records
8. Add Procedures if needed
9. Create Preventive Maintenance Plans
10. Start operating

Guidance only. Copy: “This list does not block Run, Requests, or Work Orders.” Step 10 is always ready.

---

## Empty states

| Surface | Guidance |
|---|---|
| Requests | Maintenance need; Plant reviews; may become Issue or Work Order |
| Issues | Known problem/condition; Asset optional; Requests triaged into Issues when appropriate |
| Work Orders | Assigned maintenance work; Supervisor+ **New Work Order**; STAFF empty has no create CTA |
| PM Build | Plans schedule service for real Assets; Add Asset if none; Create Plan if Assets exist |
| Assets | Run registry vs Asset Builder; **Configure Assets** |
| Work | Recurring rounds vs PM; starter later |
| Records | Existing department Records explanation (starter templates are 5B) |
| Procedures | Optional standardized instructions; PM does not require one |
| Vendors | Optional external providers for assigned Work Orders; not contracts/procurement |

---

## Runtime eligibility

Canonical helper: `src/lib/department-products/plant-runtime.ts`.

Plant runtime is enabled when:

```text
PLANT_OPERATIONS_ENABLED (internal DEVELOPMENT override)
OR installed PLANT Department Product
   AND (Harbor/internal access OR customer-operable)
```

Association uses Product `installationKey` `PLANT` via `matchDepartmentRecordForProduct`. A locally renamed Department is not treated as the Product.

While status is DEVELOPMENT, `isDepartmentRowCustomerOperable` remains false, so ordinary customers cannot enable Plant by having a leftover Department row. The override remains for internal testing. `installDepartmentProductForInternalDevelopment("PLANT")` still works.

Customer Marketplace: hidden. Customer install: rejected. No billing change.

Department picker / `assertCustomerDepartmentContext` admit Plant when runtime is enabled so password managers with Plant primary can open `/assets` and `/build/departments/:id` during internal DEVELOPMENT without making the Product customer-operable.

Harbor work-session allowlist was **not** broadened. Harbor already allows `/assets` and `/build/departments`. `/repairs`, `/asset-issues`, `/preventive-maintenance`, `/unit`, and `/staffing/operations` remain outside Harbor work prefixes. That is existing Harbor infrastructure, not customer Product routing.

---

## Authorization

| Role | Result |
|---|---|
| Requester (non-Plant Facility user) | Can submit Request; cannot create Issue/WO through that flow; sees Received |
| STAFF | My Work only; no Build; no starter UI; no Issues sub-nav; no WO create |
| Supervisor | Run coordination; Issues; Work Orders; draft where existing Build policy permits; no publish |
| Manager | Build + Run |
| Facility Administrator | Existing Product / primary Department policy (`/admin/departments` list remains FA-only; canonical Builder URL is `/build/departments/:id`) |

---

## Tests

### Hermetic / eligibility

```text
src/lib/department-products/phase-5a-product-coherence.hermetic.test.ts
src/lib/department-products/eligibility.hermetic.test.ts
src/lib/department-products/customer-selection.hermetic.test.ts
src/lib/department-products/department-products.hermetic.test.ts
```

PASS — DEVELOPMENT hidden; Work Orders/Issues nav; WO/Issue/PM copy; Request mount; Work tab; Getting Started; runtime facts (flag OR installed+Harbor/operable; Dietary/Plant/shared/neither Asset facts).

### Browser `@phase-5a @ci-gate`

`tests/plant-browser/phase-5a-product-coherence.spec.ts` against disposable `ltc_verify_phase4b_sql_20261006`, `DIETARY_ASSET_OPERATIONS_ENABLED=false`.

| Scenario | Result |
|---|---|
| Supervisor Maintenance nav: Work Orders, Issues, Create Work Order, no “New repair”; PM Upcoming schedule; no occurrence primary labels | PASS |
| Supervisor creates location-only Issue from Maintenance; Asset null | PASS |
| Dietary requester location-only Request (High, no Asset) → Received; no Issue/WO; Plant triage shows Request | PASS |
| Plant-only Asset registry + `/assets/[assetId]`: Work Orders + PM section | PASS |
| Plant Build: final tabs, Work, Getting Started, counts, starter deferred, no Menus | PASS |
| STAFF: My Work, no sub-nav, no New Work Order, Issues redirect, no Getting Started | PASS |

`test:plant-browser` **6 passed**.

Dietary CI gate “Report a problem” uses `?reportProblem=1` (Request form), not Issue create.

### SQL regression (disposable verify DB)

Sequential on `ltc_verify_phase4b_sql_20261006` (never `ltc_manager`):

| Suite | Result |
|---|---|
| `phase-3a-issue-generalization.test.ts` | PASS |
| `phase-12a-operational-requests.test.ts` | PASS (create Request: no Issue, no Work Order, requester Received) |
| `phase-3c-corrective-maintenance.test.ts` | PASS |
| `phase-3d-work-order-closeout.test.ts` | PASS |
| `phase-4d-preventive-maintenance.test.ts` | PASS |

### Static

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| Targeted eslint (5A surfaces) | PASS |
| `pnpm verify:discovery` | PASS — 354 files, 40 SQL-backed |
| `pnpm exec prisma validate` | PASS |
| `pnpm verify:migrations` | PASS — 120 migrations; newest `20261006140000_pm_active_work_order_unique` |

Unrelated leftover Vercel/`AGENTS.md` files were not staged.

---

## Schema / migration

```text
No schema change.
No migration.
```

---

## Product governance

`getDepartmentProduct("PLANT")?.status === "DEVELOPMENT"`.  
`name === "Facility Plant Operations"`.  
Not Marketplace-visible, not sellable, not customer-installable. No billing/entitlement changes.

---

## Deferred to Phase 5B

Not implemented (intentionally):

- Mechanical Room Round / Building Walkthrough / Exterior/Grounds / Generator Visual Check Work presets
- Five starter Record templates
- PM Plan presets
- Starter installer (`Add starter configuration` is placement only)
- Full documentation reconciliation (technician/supervisor/manager guides, Marketplace copy)
- Product AVAILABLE
- Harbor work-session expansion
- Advanced analytics (MTBF, MTTR, compliance %, spend, repair-vs-replace)

---

## Phase 5B gate

```text
READY FOR PHASE 5B
```

Facility Plant Operations is coherent and discoverable enough that remaining finishing work is optional starter configuration and documentation/release preparation.
