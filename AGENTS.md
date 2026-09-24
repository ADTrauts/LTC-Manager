<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Prisma migrations (guardrails)

- **Never edit migration files that are already applied** (or that exist under `prisma/migrations/` in a shared repo) to “fix” drift, typos, or shadow-database failures. Changing them breaks checksums and makes `prisma migrate dev` report modified migrations / drift.
- **Never suggest or run `prisma migrate reset`** (or any command that drops the database) unless the user explicitly opts in to losing data.
- **Prefer forward-only fixes:** add a **new** migration for schema fixes, or use documented Prisma repair flows with the user’s approval.
- If `migrate dev` is blocked but the user must keep data: consider **`prisma migrate deploy`** for applying **pending** migrations to the real database (no shadow DB), after the migration history/checksums are consistent—or ask the user how they want to reconcile history vs. live DB.
- Menu reads should use **`loadFacilityMenuData`** in `src/lib/menu-db.ts` so unit/logs/menus pages do not hard-crash when the Prisma client is stale or menu tables are not present yet.

## Prisma client vs. runtime errors

- After schema changes, run **`prisma generate`** and **restart the Next dev server** so `prisma.menuSettings` / new models are not undefined on the server bundle.

## Maintenance (RUN Assets + Repairs)

- RUN top nav shows one **Maintenance** item. Assets (`/assets`) and Repairs (`/repairs`) stay separate screens; they are not peer header links.
- SUPERVISOR+ land on `/assets`. STAFF land on `/repairs` (Assets is supervisor-gated).
- Maintenance local nav uses **three square / lightly rounded sub-tabs** (not pills): **Assets**, **Repairs**, **Vendors**. Vendors is still `?subtab=vendors` on `/assets`.
- **Assets** tab: operational registry (condition, open issues/repairs). Asset identity configuration lives on BUILD **Asset Builder** (`/assets/builder`).
- **Repairs** tab: work-order queue.
- **Vendors** tab: add-vendor form and vendor list.
