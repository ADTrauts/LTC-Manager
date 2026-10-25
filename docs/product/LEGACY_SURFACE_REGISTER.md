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
| Legacy meal milestone stores, `UnitMealTime`, `LogTemplate`, legacy inspections, and `OperationalTemplate` | **RETIRED in LEG-06.** The tables are dropped. | None. Records use the Catalog chain. |
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
> **RUN surface rationalization amendment (2026-08-09, corrected DSH-04, LEG-01, and LEG-05):** Operations Center is retired. `/operations` is no longer a route. `/dashboard` is the Dashboard for Supervisor and above. `loadDashboardQueries` is gone. Run / Build / Admin switching lives in the account menu.

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

**Removal policy:** a route is removed only when (1) no current workflow depends on it, (2) no historical deep-link requirement exists, and (3) route registry and tests support removal. Prefer redirect / hidden-nav before destructive removal. Legacy data is not migrated merely to simplify navigation.

**Test-data amendment (LEG-06, approved by the product owner October 24, 2026).** There are no real customers. After row counts on local `ltc_manager` and staging `neondb`, the product owner approved dropping the legacy tables and columns in `20261025010000_leg06_schema_cleanup`. That approval covers pre-customer test rows only. Forward Records, shifts, repairs, and location-function profiles stay.

---

## Register

| # | Route | Current class | Authoritative replacement | Rationale | Decision |
|---|-------|---------------|---------------------------|-----------|----------|
| 1 | `/admin/inspections` | **RETIRED** | `/build/logs` | The inspection tables were dropped in LEG-06. | Not a record store. |
| 2 | `/logs` | **RETIRED** | `/staffing/logs` and `/staffing/log-book` | The legacy log tables were dropped in LEG-06. | Not a record store. |
| 3 | `/dashboard` | **Dashboard for Supervisor and above.** `/operations` is removed. | `/dashboard` is the home. `/workspace` redirects there. | Operations Center and Business Workspace are retired as homes. DSH-04 sends Supervisor and above to the Dashboard without a flag. | Dashboard page for Supervisor+. Floor roles are sent to their unit or Logs. |
| 4 | `/staffing` (as "Today's Work" label) | **ACTIVE AUTHORITY** (relabeled) | — | Repurposed as RUN **Employees** (today's workforce ops). Old label retired. | Keep; product label = Employees. |
| 5 | `/employees` (as top-level "Employees") | **ACTIVE AUTHORITY** (reclassified) | — | Reclassified from RUN people-ops to BUILD **Employee Builder** (workforce configuration). | Keep; mode = BUILD. |
| 6 | `/menus` (as "Menus" in Administration dropdown) | **ACTIVE AUTHORITY** (reclassified) | `/menus/[menuId]` | Reclassified to BUILD **Menus** library. Individual editors are `/menus/[menuId]` with Overview, Menu, and Applicability. Not a facility singleton. Runtime resolution is `resolveApplicableMenus`; the first Run surface is Today's Menu on the Space workspace. `/logs` still uses `loadFacilityMenuData`. | Keep; mode = BUILD. |
| 7 | `/admin/knowledge` ("Operational Knowledge") | **ACTIVE AUTHORITY** (relabeled/moved) | — | Relabeled to **Procedures & Resources**, moved from Admin to BUILD. Authority preserved (FA). | Keep; mode = BUILD. |
| 8 | `/settings` | **Removed (LEG-05).** | — | The settings entry no longer redirects. Organization stays at `/admin/organization`. | Not a route. |
| 9 | Old zone-based nav components (`src/components/navigation/administration-menu.tsx`, `src/lib/administration-nav.ts`, `src/lib/administration-menu-position.ts`) | **REMOVED (Phase 14)** | `TopNav` mode grouping + `src/lib/product-mode.ts` | Dead after the Run/Build shell — no live importers. Deleted with their unit tests in Phase 14; `link-integrity` / `navigation` registry tests remain green. | Removed. No route affected. |
| 10 | Operation Engine / Task Sync | **RETIRED** | — | The operation and Task tables were dropped in LEG-06. | Not a product surface. |
| 11 | `/build` (BUILD hub) | **ACTIVE AUTHORITY** (new, Phase 14) | — | Dedicated Build-mode landing that composes the Build navigation group as cards. Presentation-only projection (SUPERVISOR floor); frontline stays Run-only below it. The Build mode segment lands here. | Keep; mode = BUILD. |
| 12 | `/assets/builder` (Asset Builder) | **ACTIVE AUTHORITY** (new, V1 shell refinement 2026-08-09) | — | Canonical BUILD asset-configuration surface. Shares the single asset registry and the same server actions as the RUN `/assets` view (adds no new authority); SUPERVISOR floor + department scope match `/assets`. Restored to Build Home via the BUILD nav projection. | Keep; mode = BUILD. |
| 13 | `/today`, `/today/walk`, `/today/coverage`, `/today/handoffs` | **REDIRECT** | `/dashboard`, `/units?view=rounds`, `/staffing`, `/staffing/handoffs` | Today's Work is retired. Supervisor and above begin in the Dashboard. Handoffs live in People & Coverage. Rounds live in Locations. Coverage lives in Schedule. | Keep the addresses. They only redirect. Hidden from navigation. |

---

## Facility Plant Operations surfaces (2026-10-06)

These routes and persistence names remain. Classify them; do not delete them to force Product nouns onto the URL or table.

| Surface / name | Current class | User-facing noun | Notes |
|----------------|---------------|------------------|-------|
| `/repairs` | **ACTIVE AUTHORITY** | Work Orders | Route retained. STAFF land here as My Work. SUPERVISOR+ Maintenance sub-nav label is Work Orders. |
| `/asset-issues` | **ACTIVE AUTHORITY** | Issues | Route retained. Supervisor-gated. Location-only Issues are valid. |
| `/preventive-maintenance` | **ACTIVE AUTHORITY** | Preventive Maintenance | Canonical Plant Run PM surface. |
| `Repair` | Kept persistence (LEG-D15) | Work Order | Table name stays. Do not revive Repair as the manager-facing noun. |
| `AssetIssue` | Kept persistence (LEG-D15) | Issue | Table name stays. May exist without an Asset. |
| `PreventiveMaintenanceSchedule` | **RETIRED** | — | Dropped in LEG-06. Forward PM identity is `PreventiveMaintenancePlan` / occurrence. |
| `preventiveScheduleId` | **RETIRED** | — | Dropped in LEG-06. |

---

## Redirect / deprecation decisions summary

- **Removed (LEG-05):** `/settings` and `/operations` are not routes. `/build/knowledge` is not a route; procedures stay at `/admin/knowledge`.
- **Redirect (RETIRED, 2026-08-09, updated DSH-04):** `/dashboard` is the Dashboard for Supervisor and above. `/workspace` redirects there. `/today`, `/today/walk`, `/today/coverage`, and `/today/handoffs` only redirect to the Dashboard, Rounds, Schedule, and Handoffs.
- **Retired (LEG-06):** `/admin/inspections` and `/logs` are not record stores. The inspection and log tables are dropped.
- **Added (Phase 14):** `/build` BUILD hub (ROLE_RESTRICTED, SUPERVISOR floor) — a new page route, registered in `platform-routes.ts`.
- **Removed (Phase 14):** deprecated zone-based nav code (row 9). No **route** was removed; only dead components/tests were deleted.
- **Stale locations:** `loadDashboardQueries` is gone. The Dashboard does not use that loader. Historical staged units stay out of the operating location board.

## Route policy note

All routes remain classified in the platform route registry. Unknown routes stay fail-closed (404). Redirects preserve authorization. Hiding a route from navigation never changes its server-side authorization.
