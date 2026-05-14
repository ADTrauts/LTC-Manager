<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Prisma migrations (guardrails)

- **Never edit migration files that are already applied** (or that exist under `prisma/migrations/` in a shared repo) to “fix” drift, typos, or shadow-database failures. Changing them breaks checksums and makes `prisma migrate dev` report modified migrations / drift.
- **Never suggest or run `prisma migrate reset`** (or any command that drops the database) unless the user explicitly opts in to losing data.
- **Prefer forward-only fixes:** add a **new** migration for schema fixes, or use documented Prisma repair flows with the user’s approval.
- If `migrate dev` is blocked but the user must keep data: consider **`prisma migrate deploy`** for applying **pending** migrations to the real database (no shadow DB), after the migration history/checksums are consistent—or ask the user how they want to reconcile history vs. live DB.
- Menu reads should use **`loadFacilityMenuData`** in `src/lib/menu-db.ts` so unit/logs/menus pages do not hard-crash when the Prisma client is stale or menu tables are not present yet.

## Prisma client vs. runtime errors

- After schema changes, run **`prisma generate`** and **restart the Next dev server** so `prisma.menuSettings` / new models are not undefined on the server bundle.

## Assets page (sub-tabs and styling)

- The **Assets** top-level area (`src/app/(protected)/assets/page.tsx`) uses **two sub-tabs**: **Assets** and **Vendors**, driven by the query param **`subtab`**: `assets` (default) or `vendors` (e.g. `/assets?subtab=vendors`).
- **Assets** sub-tab: add-asset form and asset registry (status updates).
- **Vendors** sub-tab: add-vendor form and a simple vendor list (registry).
- **Sub-tab control styling** should follow the same **square / lightly rounded** look as **Menu Building** (e.g. `rounded-md`, bordered inactive state, solid dark active state)—**not** pill / `rounded-full` chips.
