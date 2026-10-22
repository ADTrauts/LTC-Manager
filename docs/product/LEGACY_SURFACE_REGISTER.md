# Legacy Surface Register

**Status:** Compatibility register. Current architecture is [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md).  
**Date:** 2026-08-08, compatibility systems certified 2026-10-02  
**Purpose:** Name the systems that remain readable and are not the forward architecture.  
**Retirement:** Every surface here retires before the first real customer under the [Legacy Retirement program](../legacy-retirement/README.md) (`LEG-`). It amends this register as each phase lands. Until then, the rows below describe the current state.

---

## Compatibility systems (2026-10-02)

These stores and names stay. They are readable. They are not the canonical forward model. New writes are fenced where noted.

| System | What it still is | New writes |
|--------|------------------|------------|
| Legacy meal milestone stores (`READY` / `SERVICE_STARTED` on the older milestone path) | Historical Dietary timing compatibility | Not the timing source when a service date already has `OperationalCycleKeyPointActual` |
| `UnitMealTime` | Older unit meal clock | Not the Dietary Key Point actual |
| `LogTemplate` / `LogAssignment` / `LogSubmission` | Legacy log capture and history. Live compatibility authority **only while `CANONICAL_LOGS_ENABLED` is off**. | Fenced when canonical Records are enabled. Not the forward Record engine. |
| Legacy Inspection engine | Legacy inspection definitions, occurrences, and submissions | Fenced when canonical Records are enabled. Inspection as a Catalog Record form + `LogAttachment` is the forward path |
| `OperationalTemplate` | Previous facility-owned definition + applicability + schedule engine (Phase 9C). Remaining callers: `/staffing/templates` (historical/private), PM `PreventiveMaintenancePlanRecordRequirement`, WO `RepairRecordRequirement`, compatibility runtime when canonical is off, offline template sync (fenced when canonical is on). | Not the Record definition and **not** the next layer after `CatalogLogDefinition`. Writers and template-backed `submitEvidenceRecord` are fenced when canonical Records are enabled. |
| Review-named internal infrastructure | Loaders and types that still say Review | Not a workspace and not a submitted-evidence store. Manager surface is Audit / Reports at `/reports` |
| Legacy physical-type applicability | Older readers that match room type or unit type | Not used for canonical Product Location Functions, Cycles, Work, or Records |
| Legacy Operational Type terminology and `DepartmentRoomArchetype` rows | Persistence for Location Functions, including historical keys such as `servery` | Canonical identity is the Product `functionKey`. Display labels and room names are not identity |

### Forward Record engine (Phase 0)

```text
CatalogLogDefinition
  → FacilityCatalogInstall
  → LogAttachment
  → derived requirement
  → OperationalEvidenceRecord
```

Log Book (`/staffing/log-book`) and Audit / Reports (`/reports`) read that fact. They do not own it.

`CANONICAL_LOGS_ENABLED` defaults **false**. Do not describe `/logs` as the long-term Record authority. While the flag is off, `/logs` is **legacy compatibility authority**. When the flag is on, due work is `/staffing/logs` and manager configuration is `/build/logs`.

No historical rows are rewritten to make these systems disappear.

---

# Historical route register (2026-08)

The table below governed duplicate routes during the Build / Run shell. It remains a route history. It is not the platform map.

> **Phase 14 amendment (2026-08-08):** the deprecated zone-based navigation code (row 9) has been **removed** (no longer DEPRECATED-retained), and the dedicated BUILD hub (`/build`, row 11) is now the Build-mode landing. See `docs/product/LTC_MANAGER_V1_UX_COMPLETION_PHASE_14_2026-08-08.md`.
>
> **V1 shell UX refinement amendment (2026-08-09):** Asset Builder is now a first-class BUILD surface (`/assets/builder`, row 12) that appears on Build Home; the global header now exposes only **Build Home** in BUILD mode (individual builders are reached from the hub, not from permanent header links); Change password moved into the account menu. See `docs/product/LTC_MANAGER_V1_SHELL_UX_REFINEMENT_2026-08-09.md`.
>
> **RUN surface rationalization amendment (2026-08-09):** **Operations Center is RETIRED** as a peer RUN destination (row 3 reclassified **HIDDEN FROM NAVIGATION → REDIRECT**). `/dashboard` and `/operations` no longer render an operational surface — both server-redirect to the caller's canonical RUN home (managers → `/workspace` Dashboard, supervisors → `/today` Today's Work, frontline → their unit/logs). Run / Build / Admin switching moved out of the permanent top bar into the right-side context/account menu. The stale-location defect (retired Units shown as active) was root-caused and fixed in the shared `loadDashboardQueries` loader. See `docs/product/LTC_MANAGER_RUN_SURFACE_RATIONALIZATION_2026-08-09.md`.

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
| 1 | `/admin/inspections` | **LEGACY READ-ONLY / HIDDEN FROM NAVIGATION** | `/build/logs` (Catalog INSPECTION + Attachment) | Inspection as a Catalog Record form is the forward path. `/staffing/templates` is Phase 9C compatibility, not the Catalog. | Hide from nav; keep reachable & read-authoritative for FA; writes fenced when `CANONICAL_LOGS_ENABLED`. No data deleted. |
| 2 | `/logs` | **LEGACY COMPATIBILITY AUTHORITY** while `CANONICAL_LOGS_ENABLED` is off | `/staffing/logs` (due work) + `/staffing/log-book` (history) | Frontline STAFF logging while the canonical flag is off. Not the forward Record engine. Distinct from Log Book. | Keep reachable for historical `LogSubmission` reads. Hide from nav and fence writers when canonical Logs are on. |
| 3 | `/dashboard`, `/operations` | **REDIRECT (RETIRED — RUN surface rationalization 2026-08-09)** | Role-aware canonical RUN home (`/workspace` Dashboard, `/today` Today's Work, or unit/logs) | Operations Center overlapped Dashboard and Today's Work and displayed stale/retired locations. Retired as a peer RUN destination; both routes now render nothing and redirect via `resolveDefaultHomePath`. Kept reachable by all roles (STAFF+) so bookmarks/deep links and internal "home" fallbacks never dead-end. No historical records deleted. | Redirect; reachable by URL (STAFF+); absent from all navigation. |
| 4 | `/staffing` (as "Today's Work" label) | **ACTIVE AUTHORITY** (relabeled) | — | Repurposed as RUN **Employees** (today's workforce ops). Old label retired. | Keep; product label = Employees. |
| 5 | `/employees` (as top-level "Employees") | **ACTIVE AUTHORITY** (reclassified) | — | Reclassified from RUN people-ops to BUILD **Employee Builder** (workforce configuration). | Keep; mode = BUILD. |
| 6 | `/menus` (as "Menus" in Administration dropdown) | **ACTIVE AUTHORITY** (reclassified) | `/menus/[menuId]` | Reclassified to BUILD **Menus** library. Individual editors are `/menus/[menuId]` with Overview, Menu, and Applicability. Not a facility singleton. Runtime resolution is `resolveApplicableMenus`; the first Run surface is Today's Menu on the Space workspace. `/logs` still uses `loadFacilityMenuData`. | Keep; mode = BUILD. |
| 7 | `/admin/knowledge` ("Operational Knowledge") | **ACTIVE AUTHORITY** (relabeled/moved) | — | Relabeled to **Procedures & Resources**, moved from Admin to BUILD. Authority preserved (FA). | Keep; mode = BUILD. |
| 8 | `/settings` | **REDIRECT** | `/admin/organization` | Existing legacy settings entry. FA → Organization; others → default home. Redirect does not bypass authorization. | Keep redirect (unchanged). |
| 9 | Old zone-based nav components (`src/components/navigation/administration-menu.tsx`, `src/lib/administration-nav.ts`, `src/lib/administration-menu-position.ts`) | **REMOVED (Phase 14)** | `TopNav` mode grouping + `src/lib/product-mode.ts` | Dead after the Run/Build shell — no live importers. Deleted with their unit tests in Phase 14; `link-integrity` / `navigation` registry tests remain green. | Removed. No route affected. |
| 10 | Dormant Operation Engine / Task Sync pages | **HIDDEN / DORMANT (do not activate)** | — | `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` remain **false**. Phase 14 does not activate dormant systems. | No change; keep dormant. |
| 11 | `/build` (BUILD hub) | **ACTIVE AUTHORITY** (new, Phase 14) | — | Dedicated Build-mode landing that composes the Build navigation group as cards. Presentation-only projection (SUPERVISOR floor); frontline stays Run-only below it. The Build mode segment lands here. | Keep; mode = BUILD. |
| 12 | `/assets/builder` (Asset Builder) | **ACTIVE AUTHORITY** (new, V1 shell refinement 2026-08-09) | — | Canonical BUILD asset-configuration surface. Shares the single asset registry and the same server actions as the RUN `/assets` view (adds no new authority); SUPERVISOR floor + department scope match `/assets`. Restored to Build Home via the BUILD nav projection. | Keep; mode = BUILD. |

---

## Facility Plant Operations surfaces (2026-10-06)

These routes and persistence names remain. Classify them; do not delete them to force Product nouns onto the URL or table.

| Surface / name | Current class | User-facing noun | Notes |
|----------------|---------------|------------------|-------|
| `/repairs` | **ACTIVE AUTHORITY** | Work Orders | Route retained. STAFF land here as My Work. SUPERVISOR+ Maintenance sub-nav label is Work Orders. |
| `/asset-issues` | **ACTIVE AUTHORITY** | Issues | Route retained. Supervisor-gated. Location-only Issues are valid. |
| `/preventive-maintenance` | **ACTIVE AUTHORITY** | Preventive Maintenance | Canonical Plant Run PM surface. |
| `Repair` | Persistence name | Work Order | Compatibility row for accepted maintenance work. Do not revive Repair as the manager-facing noun. |
| `AssetIssue` | Persistence name | Issue | Compatibility row for a known undesirable condition. May exist without an Asset. |
| `PreventiveMaintenanceSchedule` | **LEGACY READ-ONLY** | — | Older schedule row. Forward PM identity is `PreventiveMaintenancePlan` / occurrence. |
| `preventiveScheduleId` | **LEGACY READ-ONLY** | — | Compatibility foreign key on older rows. New PM writes use plan / occurrence identity. |

---

## Redirect / deprecation decisions summary

- **Redirect:** `/settings → /admin/organization` (pre-existing; unchanged).
- **Redirect (RETIRED, 2026-08-09):** `/dashboard` and `/operations` → role-aware canonical RUN home (`resolveDefaultHomePath`). Operations Center is retired as a peer RUN destination; the pages render nothing but the routes remain registered (STAFF+) so redirects preserve authorization and avoid dead links.
- **Hidden from navigation:** `/admin/inspections` (reachable by URL, server-authorized).
- **Added (Phase 14):** `/build` BUILD hub (ROLE_RESTRICTED, SUPERVISOR floor) — a new page route, registered in `platform-routes.ts`.
- **Removed (Phase 14):** deprecated zone-based nav code (row 9). No **route** was removed; only dead components/tests were deleted.
- **Stale-location root cause (2026-08-09):** the shared `loadDashboardQueries` loader (`src/lib/operations-center/load-dashboard-queries.ts`) filtered Units by `isActive: true` **only**, so a Unit retired to the builder-only `STAGED` hierarchy role (which stays `isActive: true`) leaked in as an active operational location. Because the Projection feature flags for Dashboard (`/workspace`) and Today's Work (`/today`) default **off**, this legacy loader was the live default for those surfaces too — the defect was not limited to the retired Operations Center. **Fix:** the legacy path now composes its Unit where-clause with `operationalUnitWhere`, which excludes `BUILDER_ONLY_HIERARCHY_ROLES` (`STAGED`). No new model, no migration (count stays 72). Historical rows are untouched — only their presentation as *currently active* locations is corrected.

## Route policy note

All routes remain classified in the platform route registry. Unknown routes stay fail-closed (404). Redirects preserve authorization. Hiding a route from navigation never changes its server-side authorization.
