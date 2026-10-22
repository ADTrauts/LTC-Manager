# Dashboard current-state audit — October 20, 2026

Evidence for the [Dashboard decisions](./DECISIONS.md). The code was inspected on branch `codex/onboarding-integration`. The scale was:
- 422 commits
- 127 `page.tsx` files
- 190 Prisma models
- 151 migrations
- about 481 test files
- 338 docs, about 99 of them dated phase reports

The research also used five parallel code and doc reviews and a search of earlier working sessions. Key claims were rechecked against source.

## Summary

1. **The Dashboard is three designs on one page.** `/workspace` stacks:
   - the Wave 12 Business Workspace
   - a parallel Projection path
   - the September 22 Dashboard Runtime

   The newest overwrote the older sections in place.
2. **It barely knows who is looking.**
   - Supervisors get four sections. Manager, GM and Facility Administrator get the identical full set.
   - Department head and team membership exist in the data model but are not used.
3. **One page has four names.** Dashboard (nav), Business Workspace (title), Customize Workspace (panel) and `operationsCenter` (icon). "Workspace" also means the header's operating-context selector since October 12.
4. **Today's Work is the supervisor's shift hub, and half of it duplicates the Dashboard.** Its counts come from different functions, so the two pages disagree.
5. **The data foundation is good.**
   - Runtime Location State is a batched, single source of truth for location answers.
   - Most modules already have Department-scoped summary functions.
   - The partner Dashboard is the best existing card pattern.
6. **There is no card seam yet.** The Marketplace installs Department Products and Catalog Records, not dashboard content. Nothing answers "is this capability on for this Department" in one call.

## 1. Three designs on `/workspace`

| Layer | When | What it added | State today |
|---|---|---|---|
| Business Workspace | Wave 12 | Manager Focus, Management Agenda, Priorities, Department Health, Quick Actions, Performance, Recent Activity; hide, collapse and reorder preferences (`WorkspacePreference`) | Feeds hardcoded empty; sections relabeled or force-hidden |
| Projection path | Wave 15K | Parallel scope and intersect composition | Behind `PROJECTION_BUSINESS_WORKSPACE_ENABLED` (default off); a second path to maintain |
| Dashboard Runtime | September 22 | Runtime Location State aggregation: operating count, pace, attention, coverage, next event | The only live content, painted into the old section slots |

### Defects visible in code

| Defect | Where | Effect |
|---|---|---|
| Header operation hardcoded to `mealType: "BREAKFAST"`, `phase: "Preparation"` | `src/lib/business-workspace/load-business-workspace.ts` (about lines 280–303) | Placeholder context. It stays hidden only because its render branch is also dead. |
| `managerFocus`, `managementAgenda`, `priorities`, `departmentHealth` always `[]` | Same file | Four section designs with no data |
| Priorities and Department Health force-hidden (`hiddenWhenRuntime`) | Same file, line 266 | Customize offers sections that can never appear |
| "Manager Focus" renders as "Needs Attention", "Agenda" as "Upcoming", "Performance" as "Operation snapshot" | `src/components/business-workspace/business-workspace-view.tsx` (lines 610–626) | Section ids, titles and content disagree |
| Role tiers are only Supervisor vs everyone else | `src/lib/business-workspace/workspace-permissions.ts` | GM = Manager = Facility Administrator |
| Dashboard and Today's Work count locations with different functions | `collectActionableLandingSpaces` / `presentDashboardWorkspace` vs `collectSupervisorOperatingLocations` / `projectOperatingLocationBoardFromRuntime` | October 16 screenshots: "0 operating / 3 spaces" vs "6 On Track" for the same facility |
| One loader failure blanks the page | `src/app/(protected)/workspace/page.tsx` | "Workspace unavailable", with no per-card isolation |
| Department compositions hardcoded per DIETARY / EVS / PLANT / FACILITY | `src/lib/business-workspace/workspace-composition.ts` | New or custom Departments get nothing specific; no capability seam |

## 2. Who is looking: what exists vs what the Dashboard uses

| Concept | Exists | Used by the Dashboard |
|---|---|---|
| Role ladder | `FACILITY_ADMINISTRATOR` > `GM` > `MANAGER` > `SUPERVISOR` > `LEAD_TEAM_MEMBER` > `STAFF` (`src/lib/access.ts`) | Only Supervisor vs the rest |
| Department head | `Department.headEmployeeId` (a link, not a role) | No |
| GM-as-head rule | `canManageDepartmentHeadSettings`: head link, or GM role in the primary Department | No |
| Team membership and team rooms | `EmployeeTeamMembership`, `resolveViewerTeamScopes` | No. Only Today's Work uses it. |
| Department lens | `ltc_active_department` cookie. Only Facility Administrator gets all Departments. | Yes, as the only scope input |
| Route authorization | Platform route registry in code (`authorizeRoute`), not a per-facility matrix | Yes |

## 3. Today's Work

**What it is.** "Today's Work — Supervisor hub" at `/today`, Supervisor+, plus `/today/walk`, `/today/coverage` and `/today/handoffs`.

**Unique parts.**
- walk order
- handoffs (with AI shift summary)
- call-downs
- expected work
- team-scoped view

**Duplicated parts.** Attention summary counts and the operating-location board duplicate the Dashboard and Locations, and they count differently.

**Why it survived every attempt to remove it.**
- Supervisors land on `/today` by default (`resolveDefaultHomePath`, `src/lib/nav-zones.ts`).
- The Constitution says "Supervisors begin in Today's Work … Site awareness lives on Dashboard and Today's Work."
- Five tests pin it:
  - `run-surface-rationalization`
  - `todays-work-rbac`
  - `nav-zones`
  - `route-registry/navigation`
  - `authorize`
- Browser CI opens `/today/coverage`.
- Phase prompts from September 15–23 froze it, and the roadmap says "Never replace Today's Work handoffs".
- No phase was ever written to remove it.

**Reach.**
- About 29 non-test source files and 28 test files reference `/today` routes.
- `src/lib/todays-work/` is imported by scheduling, the AI operational snapshot and staffing pages, so its helpers must move rather than be deleted.

## 4. Platform, modules and Marketplace

**Department Products** (`src/lib/department-products/registry.ts`):

| Product | Status | Install key | Notes |
|---|---|---|---|
| Healthcare Food & Nutrition | AVAILABLE | `DIETARY` | `food_service_area`, meal Cycles, Work presets, Menus, meal milestones |
| Facility Plant Operations | AVAILABLE V1 (October 7) | `PLANT` | Requests, Issues, Work Orders, PM. No Location Function, no cycle starter. |
| Environmental Services | DEVELOPMENT | `EVS` | `resident_care`, `service_support`; engines behind `EVS_OPERATIONS_ENABLED` |

**Engine admission** (`src/lib/department-operations.ts`).
- Shared engines (cycles, job flow, evidence, assets, Work Plans) admit any active Department.
- Dietary, EVS and Plant honor their release flags. Plant uses `isPlantRuntimeEnabled`.
- Custom keys are admitted with no flag.

**"Marketplace" means three different things.** None of them installs dashboard content.
- The customer Department Marketplace (`/admin/departments?marketplace=1`).
- The VSSYL Console catalog (`/console/catalog`).
- Catalog Records install (`CatalogLogDefinition` → `FacilityCatalogInstall` → `LogAttachment`).

**Gaps.**
- Product operability, engine flags and the Record engine rollout are separate checks, with no single capability answer.
- There is no shared attention shape, and each module has its own tones.
- There is no HR alert aggregate.
- `loadOperationalReviewDay` is too heavy for a per-request card.
- Records cards must branch on the Record engine (`CANONICAL_LOGS_ENABLED` is off by default).

**Retired design.** The Experience Framework (35 docs) designed widget registries. It was never built as a renderer and was retired on September 25 (`docs/platform-vision/RETIRED.md`). Borrow its vocabulary only.

## 5. Reusable data sources

Department-scoped summary functions a card can call today:

| Function | Purpose |
|---|---|
| `loadDepartmentRunPresentation` | Current run presentation |
| `loadGmCycleSummary` | Cycle summary |
| `loadTodaysExpectedWork` | Expected work |
| `loadSupervisorDailyCoverage` | Daily coverage |
| `loadPmRunBoard` | PM board |
| `listWorkOrders` | Work orders, with its own actor authority |
| `listPlantTriageQueue` | Plant request triage |
| `loadSupervisorAssetExceptions` | Asset exceptions |
| `listIssuesForDepartment` | Issues |
| `resolveApplicableMenus` | Menus |
| `loadFacilityRunLogRequirements` | Forward-engine Records requirements (from `LogAttachment`). Returns nothing when `CANONICAL_LOGS_ENABLED` is off; it does not read legacy `/logs`. Corrected October 20. |
| `loadOperationalReviewDay` | Review day (heavy) |

**Facility-wide only (need a Department filter).**
- `loadPresenceCallOffs`
- `loadWorkspaceNonOperationalExtras`. It uses `take: 6` per query, so the filter must live inside each query.

**Best existing pattern.** The partner Dashboard (`/partner`, `loadPartnerDashboard`) uses Department-scoped cards with a permission check per card.

**Contracted (vendor-run) Departments (added October 20).**
- **The model exists.** `DepartmentOperatorRelationship` records which Organization operates each Department on a date. `deriveOperatingModel` returns `CONTRACTED` or `FACILITY_OPERATED`. `loadCurrentOperatorsForFacilityDepartments` loads it in one batch. The [domain model](../product/03_PRODUCT_DOMAIN_MODEL.md) already uses the Terrace View example: ECMC owns the Facility and Metz Culinary operates Food & Nutrition.
- **It controls nothing today.** The docs call the operating Organization "governance metadata only", so it does not affect authorization. The Facility Administrator's access is inconsistent instead:
  - **Can edit in any Department:** Operating Rhythm, Location Functions, Menus, Employees and Schedule.
  - **Cannot view outside their primary Department:** Work, Records, preventive maintenance, Plant requests and Job Flow.
  - Details are in the [Contracted Department Authority audit §3](../contracted-departments/CURRENT_STATE_AUDIT_2026-10-20.md#3-facility-administrator-posture-by-module).
- **Partner access is separate.** A Metz user who signs in through partner access (`/partner`) gets a limited partner context with read, submit and correct Records only. A Metz GM with an internal Terrace View account is an ordinary internal leader and gets the full Department leader view.

## 6. Repository and doc weight

- **Duplicate files.** There were 277 macOS " 2" duplicates in the working tree, most under `src/`. They were unimported, untracked and local only (hidden by `.git/info/exclude`). They were archived outside the repository on October 20 (see [phased plan, DSH-01 item 10](./PHASED_PLAN.md#dsh-01--foundation-no-visible-change)).
- **Stale redirects.** 16 `redirect("/dashboard")` calls in 11 files predate the `/dashboard` retirement.
- **Docs that still teach the old homes:**
  - Constitution home lines
  - Language Guide rows
  - Persona Model GM and Supervisor
  - RUN freeze
  - Business Workspace acceptance checklist
  - RUN guide
  - roadmap

  [DSH-D17](./DECISIONS.md#dsh-d17--superseded-statements-and-amendment-schedule--accepted-october-20-2026) schedules each amendment.
