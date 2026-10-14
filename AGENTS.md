<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Vssyl architecture

Current authority is `docs/product/01_PRODUCT_CONSTITUTION.md`. Vocabulary is `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md`. The Department Product contract is `docs/product/13_DEPARTMENT_PRODUCT.md`. Facility Plant Operations architecture is `docs/product/14_FACILITY_PLANT_OPERATIONS.md`. Compatibility systems are `docs/product/LEGACY_SURFACE_REGISTER.md`.

Manager language is Location Function, Operational Cycle, Phase, Key Point, Records, Audit / Reports, Work, and People & Coverage. Facility Plant Operations remains DEVELOPMENT. Do not implement that Product, create migrations, or change its release status unless explicitly asked.

## Prisma migrations (guardrails)

- **Never edit migration files that are already applied** (or that exist under `prisma/migrations/` in a shared repo) to “fix” drift, typos, or shadow-database failures. Changing them breaks checksums and makes `prisma migrate dev` report modified migrations / drift.
- **Never suggest or run `prisma migrate reset`** (or any command that drops the database) unless the user explicitly opts in to losing data.
- **Prefer forward-only fixes:** add a **new** migration for schema fixes, or use documented Prisma repair flows with the user’s approval.
- If `migrate dev` is blocked but the user must keep data: consider **`prisma migrate deploy`** for applying **pending** migrations to the real database (no shadow DB), after the migration history/checksums are consistent—or ask the user how they want to reconcile history vs. live DB.
- Menu Builder reads should use **`listMenus`** / **`loadMenu`** in `src/lib/menu-db.ts`. Applicability uses **`loadMenuApplicability`** / **`replaceMenuApplicability`** in `src/lib/menu-applicability-db.ts`. Runtime reads use **`resolveApplicableMenus`** in `src/lib/menu-runtime-db.ts` (exact location + date-effective root Operational Cycle + facility service date). **`loadFacilityMenuData`** is temporary `/logs` compatibility only (exactly one ACTIVE menu, otherwise quiet). Do not use it as the Menu editor or Runtime read.
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
