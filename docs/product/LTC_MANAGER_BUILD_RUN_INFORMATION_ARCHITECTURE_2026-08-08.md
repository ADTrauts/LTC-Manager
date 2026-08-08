# LTC Manager — Build / Run Information Architecture

**Phase:** Product Phase 13 — Build / Run Product Shell, Information Architecture, and UX Consolidation
**Date:** 2026-08-08
**Branch:** `product/build-run-shell-phase-13-2026-08-08`
**Status:** Consolidation of Phases 9–12 into one coherent product experience
**Scope:** Product UX and Information Architecture only. No new domain architecture, no schema migrations.

---

## 1. Product mental model

LTC Manager presents **one application** with two primary operating modes and one governance area:

| Mode | Question it answers | Owns |
|------|--------------------|------|
| **RUN** | "What do I operate today?" | Operating the shift: dashboards, locations, today's workforce, log book, assets, repairs |
| **BUILD** | "How does the operation work?" | Configuring the operation: Facility, Department, Employee, Operational Template, Asset, and Procedures |
| **ADMIN** | "Who is allowed, and how are org/facilities related?" | Governance: organization, facilities, access relationships, security |

`RUN` and `BUILD` are the two **primary product modes**, presented as a segmented switch in the shell. `ADMIN` is **governance**, reachable only by authorized governance users. Admin is deliberately **not** presented as a third everyday operating mode.

The three operational reference departments remain **compositions of the same product**, not separate applications:

| Department | Reference model |
|------------|-----------------|
| **Dietary** | Time / service driven |
| **EVS** | Location / work driven |
| **Plant Operations** | Request / asset / repair driven |

A department is a **lens** applied to shared architecture (facility hierarchy, employees, assignments, cycles, work plans, evidence, assets, requests, work orders). Switching department changes context; it never grants authority.

Code source of truth: `src/lib/product-mode.ts` (presentation projection) + `src/lib/route-registry/` (authorization). Navigation follows authority; it is never a second authorization system.

---

## 2. How the shell derives navigation (no second source of truth)

```
route registry (platform-routes.ts)   ← authorization + nav metadata (authoritative)
        │  platformNavItemsForRole(role, featureFlags)   ← re-checks every link through the proxy decision
        ▼
role + department + feature-flag filtered nav items
        │  groupNavItemsByMode(items)   ← src/lib/product-mode.ts (presentation only)
        ▼
RUN / BUILD / ADMIN groups → shell top navigation + mode switch + mode indicator
```

- A link is **only** offered for a route the role may actually reach (`roleMayAccessRoute`). The reverse never holds: a registered route with no `nav` entry stays reachable by URL for approved roles. Navigation is a convenience projection.
- **Feature-aware:** department-operational nav (e.g. Log Book, Operational Templates, Work Plans) carries a `featureFlag`. The nav projection hides the link when the capability is off; the page keeps its own downstream guard. The proxy behavior is unchanged (the new flags default to enabled where a caller does not supply them).
- **Product mode is presentation only.** `resolveProductModeForPath` maps a path to RUN/BUILD/ADMIN by longest-prefix rule. It groups links; it never decides access.

---

## 3. Product IA Audit (Section B)

Legend — **Decision:** Keep = authoritative & in nav · Compose = organized within a parent surface · Redirect · Hidden = reachable by URL, absent from nav · Legacy = superseded, read-only.

### Dashboard / Today

| Route | Label (P13) | Nav source | Audience | Authority | Dept/Shared | Mode | Authoritative? | Flag | Future home | Decision |
|-------|-------------|-----------|----------|-----------|-------------|------|----------------|------|-------------|----------|
| `/workspace` | Dashboard | Top nav (RUN) | Manager/GM | SUPERVISOR+ | Shared | RUN | Yes | — | RUN · Dashboard | Keep |
| `/dashboard` | Operations Center | Hidden (URL) | Mgr/Sup | STAFF+ | Shared | RUN | Yes (exception glance) | — | RUN · linked from Dashboard | Hidden from nav |
| `/operations` | Operations Center | Hidden (URL) | Mgr/Sup | STAFF+ | Shared | RUN | Alias | — | RUN | Hidden from nav |
| `/today` | Today's Work | Top nav (RUN) | Supervisor | SUPERVISOR+ | Shared | RUN | Yes | TODAYS_WORK | RUN · Today's Work | Keep |
| `/staffing/operations` | Supervisor Operations | Compose | Supervisor | SUPERVISOR+ | Dietary | RUN | Yes | (page) DIETARY_JOB_FLOW | RUN · from Employees | Compose |
| `/staffing/cycles` | Operational Cycles | Compose | Supervisor | SUPERVISOR+ | Dietary | RUN | Yes | (page) DIETARY_OPERATIONAL_CYCLES | RUN · from Employees | Compose |

Dietary / EVS / Plant operational dashboards are **compositions inside Unit Workspace + Operations Center**, not separate top-level products.

### Locations

| Route | Label | Nav source | Audience | Authority | Mode | Decision |
|-------|-------|-----------|----------|-----------|------|----------|
| `/units` | Locations | Top nav (RUN) | Supervisor+ | SUPERVISOR+ | RUN | Keep |
| `/unit/[unitId]` | Location Runtime | Sidebar / URL | All operational | STAFF+ (scoped) | RUN | Keep (actionable node opens runtime) |
| Facility hierarchy browser | — | Left sidebar | All | scoped | RUN | Keep (Floor → Neighborhood/Unit → Room/Space projection) |

### Employees (RUN people ops vs BUILD workforce config)

| Route | Label | Nav source | Authority | Mode | Decision |
|-------|-------|-----------|-----------|------|----------|
| `/staffing` | Employees | Top nav (RUN) | SUPERVISOR+ | RUN | Keep — today's schedule / attendance / assignments / coverage |
| `/staffing/assignments` | Assignments | Compose | SUPERVISOR+ | RUN | Compose within Employees |
| `/employees` | Employee Builder | Top nav (BUILD) | MANAGER+ | BUILD | Keep — workforce configuration (person, employment, dept, role, HR) |
| `/employees/*` (chrc, hr-audit, import, points, separations, terminations) | — | Compose | MANAGER+ | BUILD | Compose within Employee Builder |

RUN Employees and BUILD Employee Builder are deliberately **not** blurred.

### Logs / Evidence

| Route | Label | Nav source | Authority | Mode | Flag | Decision |
|-------|-------|-----------|-----------|------|------|----------|
| `/staffing/log-book` | Log Book | Top nav (RUN) | SUPERVISOR+ | RUN | DIETARY_OPERATIONAL_EVIDENCE | Keep — authoritative historical evidence |
| `/staffing/log-book/[recordId]` | Record | URL | SUPERVISOR+ | RUN | (page) | Keep |
| `/logs` | Logs | Top nav (RUN) | STAFF+ | RUN | — | Keep — frontline logging entry (see register) |
| `/staffing/templates` | Operational Templates | Top nav (BUILD) | SUPERVISOR+ | BUILD | DIETARY_OPERATIONAL_EVIDENCE | Keep — authoritative unified LOG/CHECKLIST/INSPECTION builder |
| `/admin/inspections` | Inspections (legacy) | Hidden (URL) | FA | BUILD | — | **Legacy** — superseded by Operational Templates |

### Assets

| Route | Label | Nav source | Authority | Mode | Decision |
|-------|-------|-----------|-----------|------|----------|
| `/assets` | Assets | Top nav (RUN) | SUPERVISOR+ | RUN | Keep — operational asset view (status/evidence/issues/requests/WO) + Vendors sub-tab |
| `/assets/[assetId]` | Asset profile | URL | SUPERVISOR+ (scoped) | RUN | Keep |
| `/asset-issues/[issueId]` | Asset Issue | URL | STAFF+ (scoped) | RUN | Keep |
| `/repairs`, `/repairs/[id]` | Repairs / Work Orders | Top nav (RUN) | STAFF+ (scoped) | RUN | Keep |
| `/issues/[issueId]` | Issue | URL | STAFF+ (scoped) | RUN | Keep |
| `/operational-requests` | Requests | Compose | scoped | RUN | Compose (Plant intake/routing) |
| Asset **configuration** | Asset Builder | Compose | MANAGER+ | BUILD | Compose within Assets (Build tab) + Department Builder — one asset registry |

There is **one** asset registry; Asset Builder is a Build composition over it, not a duplicate.

### Build

| Route | Label | Nav source | Authority | Mode | Decision |
|-------|-------|-----------|-----------|------|----------|
| `/admin/facility/builder` | Facility Builder | Top nav (BUILD) | FA | BUILD | Keep — physical structure/identity only |
| `/admin/departments`, `/admin/departments/[id]` | Department Builder | Top nav (BUILD) | MANAGER+ | BUILD | Keep — operational-programming center |
| `/staffing/templates` | Operational Templates | Top nav (BUILD) | SUPERVISOR+ | BUILD | Keep |
| `/staffing/work-plans`, `/[id]` | Work Plans | Top nav (BUILD) | MANAGER+ | BUILD | Keep |
| `/menus` | Menu Building | Top nav (BUILD) | SUPERVISOR+ (Dietary) | BUILD | Keep |
| `/admin/knowledge` | Procedures & Resources | Top nav (BUILD) | FA | BUILD | Keep — relabeled from "Operational Knowledge" |
| `/department/settings/[id]` | Department Settings | URL | dept-head (per-dept) | BUILD | Keep |

### Admin

| Route | Label | Nav source | Authority | Mode | Decision |
|-------|-------|-----------|-----------|------|----------|
| `/admin` | Admin | Top nav (ADMIN) | FA | ADMIN | Keep — governance home |
| `/admin/organization`, `/admin/organization/facilities` | Organization / Facilities | Compose | FA | ADMIN | Compose within Admin |
| `/admin/permissions` | Access Matrix | Compose | FA | ADMIN | Keep — read-only governance view |
| `/account` | Account & Security | User menu | AUTHENTICATED | ADMIN | Keep (per-user) |
| `/settings` | — | Redirect → `/admin/organization` | FA | ADMIN | Redirect (existing) |

### Duplication / ownership conflicts found

1. **Log Book vs Logs** — `/staffing/log-book` (Operational Evidence, authoritative history) vs `/logs` (frontline logging entry). Both kept; distinct roles. Documented in the register.
2. **Operational Templates vs legacy Inspections** — `/staffing/templates` is authoritative; `/admin/inspections` is legacy → hidden from nav.
3. **Employees vs Employee Builder** — resolved: `/staffing` = RUN Employees, `/employees` = BUILD Employee Builder.
4. **Dashboard vs Operations Center** — `/workspace` = RUN Dashboard (nav); `/dashboard`/`/operations` = exception glance, hidden from nav (kept reachable, linked from Dashboard).
5. **Procedures & Resources** — `/admin/knowledge` moved from Admin to BUILD with operational terminology.

---

## 4. Canonical product model (Section C)

- **RUN** — operate today. **BUILD** — configure operations. **ADMIN** — govern organizations / facilities / access / relationships.
- RUN and BUILD are the two primary product modes. Admin is authorized-governance only and is not an equal everyday operating mode.
- See `LTC_MANAGER_RUN_GUIDE.md`, `LTC_MANAGER_BUILD_GUIDE.md`, `LTC_MANAGER_ADMIN_BOUNDARY.md`.

---

## 5. Global shell (Section D)

`src/components/app-shell.tsx`:

- **Product identity** — brand block (facility name + session label).
- **Facility context** — Facility Switcher (only when the user has >1 accessible facility).
- **Department context** — Department Scope Switcher (only when the facility has operational departments); a lens, never authority.
- **RUN / BUILD control** — segmented mode switch (`TopNav`), only shows a mode segment when that mode has authorized nav.
- **User / role context** — session label + Sign-out controls.
- **Online / offline status** — offline runtime indicator surfaces on operational runtime.
- **Account / Admin** — Admin appears as a trailing governance entry only for authorized users; Account in the user menu.
- **Mode + area indicator** — persistent breadcrumb ("Run / Locations", "Build / Department Builder").

Desktop uses the persistent product shell (admin/manager use). Tablet prioritizes operational runtime; frontline shared-tablet (Quick PIN) users are RUN-only and never routed through Build.

---

## 6. Left navigation & location projection (Section E)

The left sidebar renders the certified **Floor → Neighborhood/Unit → Room/Space** projection (`loadSidebarProjection`). Structural nodes expand; actionable nodes open runtime (`/unit/[unitId]`). Readiness chips annotate units. This is unchanged by Phase 13 and remains authoritative.

---

## 7. Role homes (Section O)

`resolveDefaultHomePath` (`src/lib/nav-zones.ts`):

| Role | Home | Mode |
|------|------|------|
| Frontline Employee (PIN) | `/unit/[unitId]` (Job Flow / assignment) or `/logs` | RUN |
| Supervisor | `/today` (exceptions) | RUN |
| Manager / GM / FA | `/workspace` (Dashboard) | RUN |
| Build-authorized Manager | may switch to BUILD | RUN → BUILD |

Every role lands in RUN. Admin is reached deliberately by authorized users. (Known finding: FA lands on RUN Dashboard rather than an Admin home; see §10.)

---

## 8. Feature flags (Section T)

The shell derives nav from route registry + role/scope + department activation + existing feature state. It does **not** introduce a new Build/Run flag matrix. Nav feature-awareness reuses the registry `featureFlag` mechanism:

| Flag | Default | Nav effect |
|------|---------|-----------|
| `TODAYS_WORK_ENABLED` | true | withdraws `/today*` (proxy-enforced) |
| `DIETARY_OPERATIONAL_EVIDENCE_ENABLED` | false | hides Log Book + Operational Templates nav |
| `DIETARY_WORK_PLANS_ENABLED` | false | hides Work Plans nav |
| `OPERATION_ENGINE_ENABLED` | **false** | unchanged (must remain false) |
| `TASK_SYNC_ENABLED` | **false** | unchanged (must remain false) |

Department-operational pages keep their own downstream flag guards regardless of nav.

---

## 9. Route policy & database (Sections U, V)

- The platform route registry remains the fail-closed authorization boundary. Unknown routes are 404. No new routes were added; only `nav`/`featureFlag` metadata changed.
- Redirects (e.g. `/settings`) do not bypass authorization.
- **Zero schema migrations.** Migration count remains **72**. Product mode is derived URL/session state; no navigation tables, no Build/Run DB ownership, no authorization persisted as navigation config.

---

## 10. Known limitations / future UX work

1. **FA default home** stays RUN Dashboard; a dedicated Admin/governance home for FA-without-operational-relationship is deferred.
2. **Asset Builder** and **Employee Builder** are compositions over existing surfaces (`/assets`, `/employees`) rather than dedicated `/build/*` routes — intentional (no new domain routes this phase).
3. ~~**BUILD hub** is the Build mode's nav group + Department Builder as landing; a dedicated `/build` landing page is a future enhancement.~~ **Closed in Phase 14:** a dedicated `/build` hub now composes the Build navigation group as cards and is the Build mode segment's landing.
4. Legacy `/logs` and `/admin/inspections` remain reachable; retirement tracked in the Legacy Surface Register.
5. ~~Old zone-based components (`administration-menu.tsx`, `administration-nav.ts`) are retained but no longer rendered; safe to remove in a later cleanup.~~ **Closed in Phase 14:** removed (dead code, no importers), with their unit tests.

> **Phase 14 (V1 UX Completion) also closed:** shell-level offline indicator, explicit tablet-viewport verification, explicit Floor → Neighborhood → Room sidebar assertions, and an end-to-end first-use Build → Run journey. See `docs/product/LTC_MANAGER_V1_UX_COMPLETION_PHASE_14_2026-08-08.md`.

---

## 11. Terminology

See `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md` and Phase 13 additions in the Run/Build guides. Implementation names (OperationDefinition, OperationInstance, Work Engine, projection, Task Sync, stableKey, templateSnapshotJson) are never exposed in user-facing navigation.
