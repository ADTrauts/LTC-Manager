# LTC Manager — Legacy Surface Register

**Phase:** Product Phase 13 (amended in Phase 14 — V1 UX Completion)
**Date:** 2026-08-08
**Purpose:** Explicitly govern every legacy / duplicate route so legacy surfaces are governed rather than silently competing for authority.

> **Phase 14 amendment (2026-08-08):** the deprecated zone-based navigation code (row 9) has been **removed** (no longer DEPRECATED-retained), and the dedicated BUILD hub (`/build`, row 11) is now the Build-mode landing. See `docs/product/LTC_MANAGER_V1_UX_COMPLETION_PHASE_14_2026-08-08.md`.

---

## Classification vocabulary

| Class | Meaning |
|-------|---------|
| **ACTIVE AUTHORITY** | Current authoritative surface; in navigation. |
| **LEGACY READ-ONLY** | Superseded for authoring; still authoritative for reading history. |
| **REDIRECT** | Registered redirect to the canonical surface; renders nothing itself. |
| **HIDDEN FROM NAVIGATION** | Reachable by URL for approved roles; intentionally absent from nav. |
| **DEPRECATED** | Slated for removal once dependencies retire; still reachable. |
| **REMOVE ROUTE** | Safe to delete (no workflow / deep-link / test dependency). |

**Removal policy:** a route is removed only when (1) no current workflow depends on it, (2) no historical deep-link requirement exists, and (3) route registry and tests support removal. Prefer redirect / hidden-nav before destructive removal. **No historical records are deleted; no legacy data is migrated merely to simplify navigation.**

---

## Register

| # | Route | Current class | Authoritative replacement | Rationale | Decision |
|---|-------|---------------|---------------------------|-----------|----------|
| 1 | `/admin/inspections` | **LEGACY READ-ONLY / HIDDEN FROM NAVIGATION** | `/staffing/templates` (Operational Templates) | Unified Operational Template architecture (Phase 9C) supersedes legacy inspection configuration. | Hide from nav; keep reachable & read-authoritative for FA; retire when no active dependency. No data deleted. |
| 2 | `/logs` | **ACTIVE AUTHORITY** (frontline) | — | Frontline STAFF logging entry point; distinct from the Operational Evidence Log Book. Not a duplicate of `/staffing/log-book`. | Keep in RUN nav. Re-evaluate once Operational Evidence is the exclusive logging path facility-wide. |
| 3 | `/dashboard`, `/operations` | **HIDDEN FROM NAVIGATION** | `/workspace` (RUN Dashboard) | Operations Center is the deliberate exception glance, not the everyday home. Kept reachable and linked from the Dashboard. | Hidden from nav; reachable by URL (STAFF+). |
| 4 | `/staffing` (as "Today's Work" label) | **ACTIVE AUTHORITY** (relabeled) | — | Repurposed as RUN **Employees** (today's workforce ops). Old label retired. | Keep; product label = Employees. |
| 5 | `/employees` (as top-level "Employees") | **ACTIVE AUTHORITY** (reclassified) | — | Reclassified from RUN people-ops to BUILD **Employee Builder** (workforce configuration). | Keep; mode = BUILD. |
| 6 | `/menus` (as "Menus" in Administration dropdown) | **ACTIVE AUTHORITY** (reclassified) | — | Reclassified to BUILD **Menu Building**. | Keep; mode = BUILD. |
| 7 | `/admin/knowledge` ("Operational Knowledge") | **ACTIVE AUTHORITY** (relabeled/moved) | — | Relabeled to **Procedures & Resources**, moved from Admin to BUILD. Authority preserved (FA). | Keep; mode = BUILD. |
| 8 | `/settings` | **REDIRECT** | `/admin/organization` | Existing legacy settings entry. FA → Organization; others → default home. Redirect does not bypass authorization. | Keep redirect (unchanged). |
| 9 | Old zone-based nav components (`src/components/navigation/administration-menu.tsx`, `src/lib/administration-nav.ts`, `src/lib/administration-menu-position.ts`) | **REMOVED (Phase 14)** | `TopNav` mode grouping + `src/lib/product-mode.ts` | Dead after the Run/Build shell — no live importers. Deleted with their unit tests in Phase 14; `link-integrity` / `navigation` registry tests remain green. | Removed. No route affected. |
| 10 | Dormant Operation Engine / Task Sync pages | **HIDDEN / DORMANT (do not activate)** | — | `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` remain **false**. Phase 14 does not activate dormant systems. | No change; keep dormant. |
| 11 | `/build` (BUILD hub) | **ACTIVE AUTHORITY** (new, Phase 14) | — | Dedicated Build-mode landing that composes the Build navigation group as cards. Presentation-only projection (SUPERVISOR floor); frontline stays Run-only below it. The Build mode segment lands here. | Keep; mode = BUILD. |

---

## Redirect / deprecation decisions summary

- **Redirect:** `/settings → /admin/organization` (pre-existing; unchanged).
- **Hidden from navigation:** `/admin/inspections`, `/dashboard`, `/operations` (all reachable by URL, server-authorized).
- **Added (Phase 14):** `/build` BUILD hub (ROLE_RESTRICTED, SUPERVISOR floor) — a new page route, registered in `platform-routes.ts`.
- **Removed (Phase 14):** deprecated zone-based nav code (row 9). No **route** was removed; only dead components/tests were deleted.

## Route policy note

All routes remain classified in the platform route registry. Unknown routes stay fail-closed (404). Redirects preserve authorization. Hiding a route from navigation never changes its server-side authorization.
