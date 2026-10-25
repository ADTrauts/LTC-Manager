<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository identity

This is the current **Vssyl — Current Operations** application and VSSYL Console: [ADTrauts/LTC-Manager](https://github.com/ADTrauts/LTC-Manager). The `ltc-manager` package/folder name is retained. [ADTrauts/Vssyl](https://github.com/ADTrauts/Vssyl) is the mothballed **Vssyl — Legacy Platform** predecessor; do not use its architecture as current implementation guidance.

The accepted onboarding program lives in [docs/onboarding](docs/onboarding/README.md). Its phase tracker records authorized scope; ONB identifiers do not replace historical wave numbers.

The accepted Dashboard program lives in [docs/dashboard](docs/dashboard/README.md). It replaces Business Workspace (`/workspace`) and retires Today's Work (`/today*`) phase by phase; its phase tracker records authorized scope (`DSH-` identifiers). Do not extend Business Workspace or Today's Work. Department Products contribute Dashboard capabilities, never dashboard UI ([contract](docs/dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md)).

The accepted Contracted Department Authority program lives in [docs/contracted-departments](docs/contracted-departments/README.md) (`CDA-` identifiers). Model:
- Each facility has one Facility Administrator, who keeps governance and can transfer the role.
- Every Department is run by its head and its members, within role.
- The Facility Administrator only views a self-operated Department unless they are its head.
- A vendor-run Department is controlled by the vendor, who also owns its data. The Facility Administrator sees summaries, plus compliance Records read-only.
- People see only their own Department's data (employees, assigned rooms, schedules). An operating partner can add assets for its Department and set title, maintainer, and repair vendor. Title is the facility or that partner. Assets on site are shared with Plant. Facility-titled equipment stays when a contract ends; partner-titled equipment leaves, and the facility keeps a closed note (CDA-D22). The maintainer runs and pays for repairs.

Until its enforcement is enabled (CDA-07), `DepartmentOperatorRelationship` restricts nothing in code. New write actions must be classifiable under its write manifest; do not add Department writes that check only a role.

The Legacy Retirement program lives in [docs/legacy-retirement](docs/legacy-retirement/README.md) (`LEG-` identifiers). Nothing legacy may be in use at the first real customer; every account today is a test account. Do not extend legacy surfaces (`/logs`, `/admin/inspections`, `OperationalTemplate`, `/staffing/legacy`, `/issues`, projection fallback flags, Task Sync). Do not add new readers or writers of their stores. Table drops need separate explicit approval (LEG-06).

## Vssyl architecture

Current authority is `docs/product/01_PRODUCT_CONSTITUTION.md`. Vocabulary is `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md`. The Department Product contract is `docs/product/13_DEPARTMENT_PRODUCT.md`. Facility Plant Operations architecture is `docs/product/14_FACILITY_PLANT_OPERATIONS.md`. Compatibility systems are `docs/product/LEGACY_SURFACE_REGISTER.md`.

Layers (Constitution [Foundation amendment](docs/product/01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026), October 20, 2026): Platform → licensed Department Product → Marketplace items added inside a Department (Records forms, Work presets, Operating Rhythm starters, Menu templates), each Included or Paid. Capabilities come with the installed Department. Do not add deployment switches for Department capabilities; the existing ones retire in LEG-05 (LEG-D20). New item kinds reuse the Catalog; do not add a second catalog. Ownership (Domain Model, foundation round): the shift (`ScheduleEntry`) says who works, for which Department and when; the daily Assignment (`OperationalAssignment`) says where and what they cover, and is optional for seeing Work. "What's happening now" is only the published Cycle and Phase; never guess from meal times. Job Flow is the one "my work" view in every Department. It combines Work Plan items, Records due and assigned work orders without merging their stores. Adding work orders to it needs Plant scope.

Manager language is Location Function, Operational Cycle, Phase, Key Point, Records, Audit / Reports, Work, and People & Coverage. Facility Plant Operations V1 is AVAILABLE as of October 7, 2026; Environmental Services remains DEVELOPMENT. See the [release addendum](docs/plant/FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md#release-addendum--2026-10-07). Onboarding work must not change Product release status, sellability, or billing packaging as a side effect. New Plant features or migrations require explicit scope.

Forward Records (when `CANONICAL_LOGS_ENABLED=true`): `CatalogLogDefinition` → `FacilityCatalogInstall` → `LogAttachment` → derived requirement → `OperationalEvidenceRecord`. Log Book and Review are projections, not fact stores. `OperationalTemplate` is not the next layer after Catalog. Legacy `/logs` is compatibility while the flag is off. Do not add a parallel template, requirement, or evidence model.

## Prisma migrations (guardrails)

- **Never edit migration files that are already applied** (or that exist under `prisma/migrations/` in a shared repo) to “fix” drift, typos, or shadow-database failures. Changing them breaks checksums and makes `prisma migrate dev` report modified migrations / drift.
- **Never suggest or run `prisma migrate reset`** (or any command that drops the database) unless the user explicitly opts in to losing data.
- **Prefer forward-only fixes:** add a **new** migration for schema fixes, or use documented Prisma repair flows with the user’s approval.
- If `migrate dev` is blocked but the user must keep data: consider **`prisma migrate deploy`** for applying **pending** migrations to the real database (no shadow DB), after the migration history/checksums are consistent—or ask the user how they want to reconcile history vs. live DB.
- Menu Builder reads should use **`listMenus`** / **`loadMenu`** in `src/lib/menu-db.ts`. Applicability uses **`loadMenuApplicability`** / **`replaceMenuApplicability`** in `src/lib/menu-applicability-db.ts`. Runtime reads use **`resolveApplicableMenus`** in `src/lib/menu-runtime-db.ts` (exact location + date-effective root Operational Cycle + facility service date).
- Menu applicability is explicit Department locations (`unitId` XOR `spaceId`) plus root PERIOD `cycleStableKey` rows with a `menuPeriodKey` mapping. Do not infer rooms from neighborhoods. Do not bind `DepartmentOperationalCycle.id`. Do not choose a Menu winner. Do not migrate `/logs` onto the Runtime resolver unless explicitly asked.

## Prisma client vs. runtime errors

- After schema changes, run **`prisma generate`** and **restart the Next dev server** so `prisma.menu / prisma.menuCycleSettings` / new models are not undefined on the server bundle.

## Maintenance (RUN Assets + Repairs)

- RUN top nav shows one **Maintenance** item. Assets (`/assets`) and Repairs (`/repairs`) stay separate screens; they are not peer header links.
- SUPERVISOR+ land on `/assets`. STAFF land on `/repairs` (Assets is supervisor-gated).
- Maintenance local nav uses **three square / lightly rounded sub-tabs** (not pills): **Assets**, **Repairs**, **Vendors**. Vendors is still `?subtab=vendors` on `/assets`.
- **Assets** tab: operational registry (condition, open issues/repairs). Asset identity configuration lives on BUILD **Asset Builder** (`/assets/builder`).
- **Repairs** tab: work-order queue.
- **Vendors** tab: add-vendor form and vendor list.
