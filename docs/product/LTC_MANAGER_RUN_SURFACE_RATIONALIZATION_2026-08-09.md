# LTC Manager — RUN Surface Rationalization & Workspace Menu Cleanup

**Date:** 2026-08-09
**Branch:** `product/run-surface-rationalization-2026-08-09`
**Base:** `product/v1-shell-ux-refinement-2026-08-09` @ `ed9dd5683f8454170a49c9a8745998fa13735c0b`
**Migration count:** 72 (unchanged — no new models, no migrations)
**Type:** Product-surface cleanup & legacy retirement (not a new feature phase)

---

## 1. Purpose

Retire the legacy/overlapping **Operations Center** surface, establish a clean canonical RUN
information architecture, remove stale-location behavior, and move **Run / Build / Admin** switching
out of the primary top navigation into the right-side context/account menu.

Canonical RUN product model after this change:

| Surface | Route | Responsibility |
|---------|-------|----------------|
| **Dashboard** | `/workspace` | Manager/GM operating **overview** — are we staffed, on time, what needs attention, where to go next. |
| **Today's Work** | `/today` | Current-day operational **execution** — cycle, coverage, readiness, needs-attention / in-progress / ready, handoffs. |
| **Locations** | `/units`, `/unit/[id]` | Place-based operational view over the canonical Floor → Neighborhood/Unit → Room/Space hierarchy. |
| **Employees** | `/staffing` | Today's workforce view. |
| **Assets** | `/assets` | Operational asset view. |
| **Log Book** | `/staffing/log-book` | Canonical RUN historical operational records (was the clipped nav item — now rendered explicitly). |

**Operations Center is no longer a peer RUN destination.**

---

## 2. Audit — the three overlapping RUN surfaces

| Dimension | Dashboard (`/workspace`) | Today's Work (`/today`) | Operations Center (`/dashboard`, `/operations`) |
|-----------|--------------------------|-------------------------|--------------------------------------------------|
| Entry point | `src/app/(protected)/workspace/page.tsx` | `src/app/(protected)/today/page.tsx` | `src/app/(protected)/dashboard/page.tsx` (+ `/operations` alias) |
| Loader | `assembleProjectedBusinessWorkspace` (flag on) / `loadBusinessWorkspace` (flag off) | `assembleProjectedTodaysWorkHub` (flag on) / `loadWalkList` (flag off) | `loadOperationsCenterDashboard` → `loadDashboardQueries` |
| Projection flag | `PROJECTION_BUSINESS_WORKSPACE_ENABLED` (default **off**) | `PROJECTION_TODAYS_WORK_ENABLED` (default **off**) | `PROJECTION_OPERATIONS_CENTER_ENABLED` (default **off**) |
| Active-location source | legacy → `loadDashboardQueries` | legacy → `loadDashboardQueries` | `loadDashboardQueries` |
| Staffing / coverage | summary cards | detailed coverage board | detailed |
| Readiness / service timing | summary | detailed | detailed |
| Issues / exceptions | manager-focus / priorities | needs-attention board | exception cards |
| Unique capability | manager overview framing | supervisor exception/walk/coverage/handoff flow | **none** not already owned by Dashboard or Today's Work |
| Incoming links / nav | RUN nav "Dashboard" | RUN nav "Today's Work" | left sidebar link, dashboard quick actions, "Open Operations Center" labels |

**Finding:** Operations Center held **no unique capability**. Its manager-overview content is owned by
Dashboard; its current-day execution content is owned by Today's Work. It was a third, overlapping
lens over the same `loadDashboardQueries` data — and the one most prone to showing stale locations.

### Disposition of Operations Center capabilities

- Manager overview framing → **already in Dashboard** (`/workspace`). No migration needed.
- Current-day execution/exception board → **already in Today's Work** (`/today`). No migration needed.
- Location listing → **owned by Locations** (`/units`) via the canonical Projection.
- No capability was duplicated into another page; nothing unique was lost.

---

## 3. Stale / deleted-location root cause

**Symptom:** Operations Center displayed Units the operator had since retired/deleted.

**Root cause (traced, not guessed):** `src/lib/operations-center/load-dashboard-queries.ts` fetched
Units with `where: { isActive: true, facilityId }` **only**. A Unit retired to the builder-only
`STAGED` hierarchy role keeps `isActive: true` (retirement moves it to staging; it is not hard-deleted
— there is no `deletedAt`/`retiredAt`/`status` column on `Unit`). The legacy query never excluded
`hierarchyRole: STAGED`, so retired Units re-appeared as *currently active* operational locations.

**Blast radius:** not limited to the retired surface. Because the Projection flags for Dashboard
(`/workspace`) and Today's Work (`/today`) **default off**, both surfaces also fall back to
`loadDashboardQueries` — so the same defect was live on the canonical RUN surfaces. Locations
(`/units`) was already protected: its Projection path filters `isActive && !staged`, and even its
legacy rollback path uses `operationalUnitWhere` (which excludes `STAGED`).

**Fix:** the legacy (non-projected) path now composes its Unit where-clause and unit-relation scope
with `operationalUnitWhere(facilityId, …)` from `src/lib/facility-builder/operational-visibility.ts`,
which excludes `BUILDER_ONLY_HIERARCHY_ROLES` (`STAGED`). When a Projection scope is supplied,
`projectedUnitIds` has already excluded ineligible Units, so only the id-intersection is applied. The
scope-building is extracted into an exported pure function, `resolveDashboardUnitScopes`, and pinned
by `src/lib/operations-center/load-dashboard-queries.test.ts`.

- **No new model, no migration** (count stays 72).
- **Historical records preserved** — retirement only affects presentation as a *currently active*
  location; rows tied to a retired Unit remain in the database and inspectable where supported.
- **Physical SoT respected** — Floor → Neighborhood/Unit → Room/Space; no legacy flat Unit projection
  was revived.

---

## 4. Retirement & IA changes

### Operations Center retirement
- `/dashboard` and `/operations` pages now render nothing and **server-redirect** to the caller's
  canonical RUN home via `resolveDefaultHomePath` (managers → `/workspace`, supervisors → `/today`,
  frontline → their unit/logs). The `onboarding=complete` query param is preserved on `/dashboard`.
- Routes remain **registered** in `platform-routes.ts` (STAFF+) so bookmarks/deep links and internal
  "home" fallbacks/`revalidatePath` calls never dead-end, and redirects preserve authorization.
- Removed from the **left sidebar** (`src/components/left-sidebar.tsx`).
- Relabeled all "Operations Center" / "Open Operations Center" user-facing strings to **Dashboard**
  across the Business Workspace components and loaders.
- `product-mode.ts`, `nav-zones.ts`, and `platform-routes.ts` notes updated; `PRIMARY_NAV_LABELS` and
  `normalizePrimaryNavLabel` now read `/dashboard` as **Dashboard**.

### Primary RUN top nav
- Preferred RUN destinations render clearly: **Dashboard, Today's Work, Locations, Employees, Assets,
  Log Book** (plus the pre-existing canonical RUN entries Logs, Repairs, Review). The RUN header is a
  horizontal scroller — no hidden/clipped labels or orphaned icons.
- **Clipped-item audit result:** the partially-visible item after Assets was **Log Book**
  (`/staffing/log-book`) — a canonical RUN destination. It is retained and rendered intentionally
  (pinned by `run-surface-rationalization.test.ts`), not removed.

### Run / Build / Admin relocation (context menu)
- The permanent **Run | Build** toggle and the **Admin** top-nav item were removed from `TopNav`.
- Switching now lives in the right-side context/account menu (`src/components/sign-out-controls.tsx`),
  which is relabeled from "Account" to the user/context label and structured as:

  - **Workspace** — Run · Build
  - **Administration** — Admin
  - **Account** — Change password · Sign out · Sign out & unbind device (where applicable)

- **Visibility is presentation-only and derives from route authority**, never role labels:
  `roleMayAccessRoute("/build", …)` / `roleMayAccessRoute("/admin", …)`. Menu entries never grant
  authority.
  - **Quick PIN / frontline:** RUN-only — no Build, no Admin, and no pointless Run-only workspace group.
  - **Build-authorized (e.g. Manager):** Run · Build.
  - **Governance-authorized (FA):** Run · Build · Admin.

### BUILD / ADMIN identity after toggle removal
- Entering BUILD from the menu still applies the **amber** shell treatment (driven by
  `resolveProductModeForPath` on the URL via `ShellModeFrame`/`ShellZoneIndicator`), lands on the
  canonical **Build Home** (`/build`), and the mode indicator provides a return path to Build Home.
- ADMIN remains **governance only** with its own separate visual treatment; return to Run/Build is via
  the same context menu. No deferred FA governance home was built (out of scope).

### Left sidebar
- Operations Center link removed. The rail remains the dominant Floor → Neighborhood/Unit → Room
  place-navigation model; no redundant Dashboard/Today's Work shortcut was added.

---

## 5. Authority & product-boundary confirmation

- **Authorization architecture unchanged.** No route access rule changed; menu entries are navigation
  only and mirror `roleMayAccessRoute`. Direct-URL server authorization is unchanged (STAFF still
  redirected away from `/employees`, `/admin`).
- **RUN / BUILD / ADMIN boundaries unchanged.**
- **Quick PIN frontline remains RUN-only.**
- **`ltc_manager` untouched.** No cloud resources. `OPERATION_ENGINE_ENABLED=false`,
  `TASK_SYNC_ENABLED=false`.
- **Historical records preserved** — no domain models deleted; no legacy data migrated merely to
  simplify navigation.

---

## 6. Tests

### Unit / hermetic (added)
- `src/lib/operations-center/load-dashboard-queries.test.ts` — legacy scope excludes `STAGED` while
  keeping active units; unit-relation scope excludes `STAGED`; projected scope intersects by id;
  empty projection fails closed.
- `src/lib/run-surface-rationalization.test.ts` — Operations Center is not a peer RUN destination;
  retired routes stay reachable and resolve to RUN; canonical RUN nav complete/unclipped; Log Book
  explicit; Run/Build/Admin absent from the permanent RUN top bar; context-menu Build/Admin
  visibility derives from route authority; Quick PIN sees neither.
- Updated `src/lib/nav-zones.test.ts` for the `/dashboard` → **Dashboard** label and the
  redundant-heading example.

### Browser (updated + extended)
`tests/product-shell-browser/ci-gate.spec.ts` — mode switching rewritten to drive Run/Build/Admin
from the context menu; new scenarios: **scenario-25** (Operations Center legacy routes redirect to the
canonical RUN home; no Operations Center anywhere in nav) and **scenario-26** (context menu exposes
Run/Build + account actions together). Quick-PIN, BUILD amber treatment, and tablet-overflow scenarios
updated for the menu relocation.

---

## 7. Verification matrix

| Gate | Result | Notes |
|------|--------|-------|
| `verify:static` (typecheck + lint + registry sentinels + migration integrity + prisma validate) | **PASS** | 72 migrations; 153 test files discovered. |
| `test:hermetic` | **PASS** | 1598 tests, 0 fail, 93 skipped (SQL-backed suites intentionally skip hermetically). |
| `verify:build` | **PASS** | `/dashboard`, `/operations`, `/workspace`, `/today`, `/units` all present as routes. |
| `verify:db` (PostgreSQL 16) | **NOT RUN — environmental** | Local PostgreSQL is **14.18**; Docker unavailable; no disposable PG16 target. Per policy: `ltc_manager` not modified, no unsafe DB used. **Requires PG16 re-run for formal candidate sign-off.** |
| Playwright browser gates (`test:product-shell-browser`, …) | **NOT RUN — environmental** | Require a seeded disposable PG16 DB + running server; unavailable here. Specs updated for the new IA and ready for PG16 re-run. |

---

## 8. Retained findings

1. **PG16 verification pending (environmental).** `verify:db` and all Playwright browser gates could
   not run (local PG14, no Docker/PG16). Static, hermetic, and build gates are green. A PG16 re-run is
   required for formal candidate sign-off.
2. **Projection flags remain default-off** for Dashboard and Today's Work. This change fixes the
   legacy loader so those surfaces are correct regardless of flag state; enabling the Projection paths
   remains a separate, deliberate decision.

**Recommendation:** PASS WITH FINDINGS.
