# LTC Manager — V1 Shell UX Refinement

**Date:** 2026-08-09
**Branch:** `product/v1-shell-ux-refinement-2026-08-09`
**Base (Phase 14 certified tip):** `5a144d03c7750c9d0d5665f38ec1e08c0ace2c61`
**Scope:** Targeted V1 shell UX cleanup. No new product phase. No new source-of-truth models, no new migrations (count remains **72**), no authorization changes, no change to RUN / BUILD / ADMIN product boundaries, no cloud resources. `OPERATION_ENGINE_ENABLED=false`, `TASK_SYNC_ENABLED=false`. `ltc_manager` untouched.

---

## 1. Why the refinement was needed

The Phase 14 shell was certified PASS WITH FINDINGS. A review of the live shell surfaced four UX issues, all resolved here by **simplifying** rather than adding navigation:

1. Asset Builder was missing from Build Home.
2. BUILD mode was not visually distinct enough from RUN.
3. The global top bar was overcrowded (facility + department + Run/Build + Build Home + Facility Builder + Department Builder + Admin + Change password + Sign out).
4. Department context and operational mode were conceptually mixed (the department selector was labelled "Operational mode").

Everything below reuses the existing authoritative infrastructure: the platform route registry (`src/lib/route-registry`), the product-mode projection (`src/lib/product-mode.ts`), and the Build Hub projection (`src/lib/build-hub.ts`).

## 2. Asset Builder omission — root cause and fix

**Root cause:** *missing BUILD nav registration.* Asset Builder had no route/`nav` entry in the platform registry; asset configuration was only composed inside the RUN `/assets` page (the `data-testid="asset-builder"` "Add Asset" section) and Department Builder. Because it had no `nav` entry, `platformNavItemsForRole` never emitted it, `groupNavItemsByMode` never placed it in the BUILD group, and `buildHubCards` therefore produced no Asset Builder card. It was **not** capability/flag filtering and **not** a Build Hub projection bug.

**Fix (registry-driven, no second authority model):**
- Added a dedicated BUILD route `/assets/builder` (`src/app/(protected)/assets/builder/page.tsx`) with registry entry `nav: { label: "Asset Builder", order: 233 }`, `ROLE_RESTRICTED` at the **SUPERVISOR** floor — identical to `/assets`. It reuses the **single asset registry** and the same server actions (`createAssetAction`, `updateAssetDepartmentAction`, `updateAssetCriticalityAction`, `updateAssetStatusAction`); it grants no new authority and adds no model/migration.
- Classified `/assets/builder` as BUILD in `PRODUCT_MODE_PATH_RULES` (longest-prefix wins, so `/assets` stays RUN while `/assets/builder` is BUILD).
- Build Home continues to derive its cards from the BUILD navigation projection — the Asset Builder card appears only because the projection carried it in (proven by `src/lib/build-hub.test.ts` and `src/lib/shell-ux-refinement.test.ts`). Department scope for `/assets/builder` matches `/assets` (DIETARY/EVS/PLANT), so availability stays truthful and consistent with the nav projection.

## 3. BUILD visual identity decision

A restrained **amber** treatment, driven from a single source of truth:
- `ShellModeFrame` (client) publishes the current product mode as `data-product-mode` on the shell root (from `resolveProductModeForPath` — no duplicated BUILD detection).
- `globals.css` applies an amber-50 wash + amber-200 border to `[data-shell-region="header"]` and `[data-shell-region="mode-indicator"]` only under `[data-product-mode="BUILD"]`.
- The active BUILD mode-switch segment and the breadcrumb "Build" chip use the same amber accent.
- RUN and ADMIN keep the neutral/brand treatment; **ADMIN never inherits BUILD styling.** Colour is a reinforcement only — the "Build" / "Build Home" text remains the primary cue. No alarm/error semantics; subtle enough for long-duration use. Applies across all BUILD surfaces because it derives from product-mode classification.

## 4. Account-menu change

Change password and Sign out moved into a single right-aligned **account menu** dropdown (`src/components/sign-out-controls.tsx` → `AccountMenu`); FA additionally gets "Sign out & unbind device". Change password is no longer a permanent top-level header button. Password functionality is unchanged, and sign-out still clears the offline IndexedDB bundle before the session cookie is removed (`clearForSignOut` / `clearAllOfflineData` preserved; the offline sign-out-clearance hermetic test remains green).

## 5. Department-context behavior

- The header department control is relabelled **"Department"** (a context lens) and conceptually separated from the **Run / Build** product mode.
- It is now **progressive** (`src/lib/department-context.ts`): `hidden` when no department context is available, a **compact identity chip** for a single available department, and the **selector** for multiple. Availability is computed from the user's actual department memberships (`resolveSelectableDepartmentsForSession`) — FA sees all active, employee-app-visible departments; everyone else sees only their memberships. Not inferred from role name. Server-side authorization is unchanged and no additional department access is granted.

## 6. Simplified Build navigation & Admin positioning

- In BUILD, the global header exposes only **Build Home** (`headerNavItemsForMode`). Individual builders are reached from Build Home cards and the breadcrumb/mode-switch return path — they are never reintroduced as permanent global header links, even from a stale nav source.
- RUN keeps its full canonical operational navigation (Dashboard, Locations, Employees, Log Book, Assets, …).
- **Admin** remains a separate trailing governance destination for entitled users only (FA), never a peer toggle beside Run/Build; managers/GM without governance authority never see it; Quick PIN never sees it. No new Admin landing page was introduced.

## 7. Breadcrumb / return-to-Build-Home

The persistent mode indicator (`ShellZoneIndicator`) makes the "Build" segment a link back to Build Home on every BUILD surface, and the BUILD mode-switch segment lands on `/build`. The Asset Builder page also renders an explicit in-page breadcrumb + "Back to Build Home" (`src/components/build/build-breadcrumb.tsx`). Every canonical BUILD destination therefore has a clear path back to Build Home without hunting the header.

## 8. Build Home final card set

Derived from the BUILD nav projection (capability/authority/flag-aware). For a Facility Administrator: **Facility Builder, Department Builder, Employee Builder, Asset Builder, Menu Building, Operational Templates, Work Plans, Procedures & Resources**. Frontline (STAFF / Quick PIN) sees no cards (Run-only below the SUPERVISOR floor).

## 9. Responsive results

Verified in the product-shell browser gate (semantic/state assertions, no pixel-perfect checks):
- Desktop (1360×900) readable; tablet landscape (1024×768) and tablet portrait (820×1180) — **no horizontal overflow**, including on BUILD surfaces (`/build`).
- Account menu usable; department context does not crowd out Run/Build; BUILD amber treatment visible; Build Home cards usable.

## 10. Regression results

Run sequentially against a disposable database.

| Gate | Result |
|------|--------|
| `verify:static` (typecheck, lint, migration-integrity, hygiene, prisma validate) | **PASS** — 72 migrations |
| `test:hermetic` | **PASS** — 1494 passed, 0 failed, 93 skipped |
| `verify:build` | **PASS** — `/assets/builder` compiled |
| `verify:db` | **PASS** — migrate deploy + idempotent seed + 1587 SQL-backed tests |
| `test:product-shell-browser` | **PASS** — 24/24 |
| `test:dietary-pilot` | **PASS** — 5/5 |
| `test:assignment-browser` | **PASS** — 6/6 |
| `test:offline-browser` | **PASS** — 25/25 |
| `test:evs-browser` | **PASS** — 9/9 |
| `test:plant-browser` | **PASS** — 7/7 |
| `test:asset-operations-browser` (touched asset code) | **PASS** — 1/1 |

## 11. Migration count

**72** (unchanged). No migrations added.

## 12. Retained findings

- **PostgreSQL version:** `verify:db` and the browser gates ran against the environment's disposable **PostgreSQL 14** (no PostgreSQL 16 server or Docker available in this environment). Migrations, idempotent seed, and all SQL-backed tests passed; this is an **environmental** note, not a product defect. Re-run on PostgreSQL 16 in CI before release.
- **Dedicated FA governance home** remains a retained Phase 14 finding and is explicitly **not in scope** for this refinement.
- Asset Builder / Employee Builder still share their single registries with the RUN surfaces (one asset registry, one workforce registry) by design; Asset Builder is now additionally reachable as its own BUILD surface.

## 13. What did not change

Authorization architecture, route-registry authority, feature-flag behavior, RUN/BUILD/ADMIN product boundaries, domain models. `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` remain false/dormant. `ltc_manager` untouched. No cloud resources.
