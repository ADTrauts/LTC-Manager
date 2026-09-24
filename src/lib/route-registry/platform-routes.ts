import { PROCEDURES_RESOURCES_VISIBLE } from "@/lib/knowledge/surface";
import { rolesAtLeast, type PlatformRoute } from "@/lib/route-registry/types";

/**
 * The canonical, platform-owned route authorization policy.
 *
 * This module is the single source of truth for which roles may reach which paths. The proxy,
 * primary navigation, the read-only Access Matrix, and the legacy compatibility seed data are all
 * projections of this list — none of them holds a second copy of the policy, and
 * `platform-routes.test.ts` fails if the list drifts from the routes that exist in `src/app`.
 *
 * Changing access here is a reviewed code change. It is deliberately not editable at runtime; see
 * `docs/architecture/ADR_PLATFORM_OWNED_ROUTE_AUTHORIZATION_2026-08-04.md`.
 *
 * Adding a route: add the `src/app` file, add its entry here, run `npm test`.
 */
export const PLATFORM_ROUTES: readonly PlatformRoute[] = [
  // ── Public entry points ───────────────────────────────────────────────────
  {
    pattern: "/",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "PUBLIC" },
    module: "marketing",
    notes: "Marketing page; redirects an authenticated visitor to their default home.",
  },
  {
    pattern: "/login",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "PUBLIC" },
    module: "auth",
    notes: "Hosts both email/password sign-in and Quick PIN sign-in.",
  },
  {
    pattern: "/signup",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "PUBLIC" },
    module: "auth",
  },
  {
    pattern: "/console/login",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "PUBLIC" },
    module: "harbor-console",
    notes: "Unlisted LTC Corp staff login. Not linked from marketing or facility /login.",
  },
  {
    pattern: "/console",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
    notes: "Harbor Today. Proxy requires harbor_session; page re-checks PlatformStaff.",
  },
  {
    pattern: "/console/customers",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/console/customers/[facilityId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/console/auth/login",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "harbor-console",
  },
  {
    pattern: "/api/console/auth/logout",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "harbor-console",
    notes: "Clears harbor_session even when the token is already invalid.",
  },
  {
    pattern: "/api/console/work-session",
    match: "EXACT",
    surface: "API",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
    notes: "Opens a bannered work session on a customer facility. Does not impersonate a facility user.",
  },
  {
    pattern: "/api/console/work-session/end",
    match: "EXACT",
    surface: "API",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
    notes: "Ends the Harbor work session and returns to the customer record.",
  },
  {
    pattern: "/console/catalog",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
    notes: "Harbor Catalog list. Platform-scoped; facilities never author these rows.",
  },
  {
    pattern: "/console/catalog/new",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/console/catalog/[stableKey]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "HARBOR_STAFF" },
    module: "harbor-console",
    requiresDownstreamAuthorization: true,
  },

  // ── Authenticated, guarded downstream ─────────────────────────────────────
  {
    pattern: "/setup",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "AUTHENTICATED" },
    module: "onboarding",
    requiresDownstreamAuthorization: true,
    notes: "Onboarding wizard; the page redirects once onboarding is complete.",
  },
  {
    pattern: "/account",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "AUTHENTICATED" },
    module: "account",
    notes: "Every authenticated role manages its own account here.",
  },
  {
    pattern: "/department/settings/[departmentId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "AUTHENTICATED" },
    module: "departments",
    requiresDownstreamAuthorization: true,
    notes:
      "Department-head authority is decided per department by canManageDepartmentHeadSettings, so the role floor cannot be expressed as a static list.",
  },

  // ── Dashboard (RUN overview) and retired Operations Center ────────────────
  {
    pattern: "/workspace",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "workspace",
    legacyArea: { key: "workspace", label: "Workspace", navOrder: 5, navVisible: true, critical: true },
    // RUN · Dashboard — the canonical manager/GM operating overview and default home.
    nav: { label: "Dashboard", order: 10 },
  },
  {
    pattern: "/dashboard",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "operations-center",
    legacyArea: { key: "dashboard", label: "Operations Center", navOrder: 10, navVisible: false, critical: true },
    notes:
      "RETIRED Operations Center surface. The page no longer renders operational content — it redirects every role to their canonical RUN home (managers → /workspace, supervisors → /today, frontline → their unit/logs). Kept reachable by all roles so bookmarks/deep links and internal 'home' redirects never dead-end. See docs/product/LEGACY_SURFACE_REGISTER.md.",
  },
  {
    pattern: "/operations",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "operations-center",
    legacyArea: { key: "operations", label: "Operations Center", navOrder: 11, navVisible: false, critical: false },
    notes:
      "Legacy alias of the retired Operations Center. Redirects to the caller's canonical RUN home.",
  },

  // ── Today's Work (feature-gated) ──────────────────────────────────────────
  {
    pattern: "/today",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "todays-work",
    legacyArea: { key: "today", label: "Today's Work", navOrder: 15, navVisible: true, critical: false },
    featureFlag: "TODAYS_WORK",
    // RUN · Today's Work — supervisor exception board / walk / coverage / handoffs.
    nav: { label: "Today's Work", order: 20 },
  },
  {
    pattern: "/today/coverage",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "todays-work",
    featureFlag: "TODAYS_WORK",
  },
  {
    pattern: "/today/handoffs",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "todays-work",
    featureFlag: "TODAYS_WORK",
  },
  {
    pattern: "/today/walk",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "todays-work",
    featureFlag: "TODAYS_WORK",
  },

  // ── Staffing ──────────────────────────────────────────────────────────────
  {
    pattern: "/staffing",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    legacyArea: { key: "staffing", label: "Today's Work", navOrder: 50, navVisible: false, critical: false },
    // RUN · Schedule — Department-scoped clock-time Shifts (presence).
    // Daily Assignments live at /staffing/assignments. Legacy Unit/meal grid: /staffing/legacy.
    // Workforce configuration lives in BUILD Employee Builder (/employees).
    nav: { label: "Schedule", order: 40 },
  },
  {
    pattern: "/staffing/legacy",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    notes: "Legacy Unit/meal ScheduleEntry grid. Prefer /staffing Department Scheduler.",
  },
  {
    pattern: "/staffing/assignments",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
  },
  {
    pattern: "/staffing/cycles",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    notes:
      "Dietary Operational Cycles supervisor overview. Page enforces DIETARY_OPERATIONAL_CYCLES_ENABLED.",
  },
  {
    pattern: "/staffing/operations",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    notes:
      "Dietary Supervisor Operations Board. Page enforces DIETARY_JOB_FLOW_ENABLED and Job Flow authority.",
  },
  {
    pattern: "/staffing/templates",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    featureFlag: "DIETARY_OPERATIONAL_EVIDENCE",
    // BUILD · Operational Templates — Phase 9C compatibility surface (not Canonical Catalog UI).
    nav: { label: "Operational Templates", order: 245 },
    notes:
      "Unified Operational Template Builder (Phase 9C). Page enforces DIETARY_OPERATIONAL_EVIDENCE_ENABLED. Not the facility Canonical Logs Catalog.",
  },
  {
    pattern: "/build/logs",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
    // BUILD · Logs — Catalog browse + Attachments index (Phase 4A).
    nav: { label: "Logs", order: 236 },
    notes: "Canonical Logs Catalog and Attachments. Page enforces CANONICAL_LOGS_ENABLED.",
  },
  {
    pattern: "/build/logs/catalog/[stableKey]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/build/logs/attach",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/build/logs/attachments/[attachmentId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/build/logs/targets/asset/[assetId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/build/logs/targets/space/[spaceId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/build/logs/targets/unit/[unitId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "build",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/staffing/work-plans",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "staffing",
    featureFlag: "DIETARY_WORK_PLANS",
    // BUILD · Work Plans — Department Work Plan builder.
    nav: { label: "Work Plans", order: 250 },
    notes:
      "Dietary Department Work Plan Builder (Phase 11A). Page enforces DIETARY_WORK_PLANS_ENABLED.",
  },
  {
    pattern: "/staffing/work-plans/[workPlanId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "staffing",
    notes:
      "Dietary Work Plan detail (Phase 11A). Page enforces DIETARY_WORK_PLANS_ENABLED.",
  },
  {
    pattern: "/staffing/log-book",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    featureFlag: "DIETARY_OPERATIONAL_EVIDENCE",
    // RUN · Log Book — historical operational evidence and records. Registry nav is evidence-flagged;
    // app-shell injects this item when CANONICAL_LOGS_ENABLED even if evidence is off.
    nav: { label: "Log Book", order: 50 },
    notes:
      "Dietary Operational Evidence Log Book (Phase 9C). Also the Canonical Logs history destination. Page allows DIETARY_OPERATIONAL_EVIDENCE_ENABLED or CANONICAL_LOGS_ENABLED.",
  },
  {
    pattern: "/staffing/log-book/[recordId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    notes: "Evidence record detail / printable view (Phase 9C).",
  },
  {
    pattern: "/staffing/logs",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
    notes:
      "Canonical RUN Logs for Attachment-derived requirements. Page enforces CANONICAL_LOGS_ENABLED. Not a top-nav item — due work lives on the room; Log Book is the history destination.",
  },
  {
    pattern: "/staffing/logs/open",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/staffing/logs/adhoc/[attachmentId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/staffing/logs/records/[recordId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
  },
  {
    pattern: "/staffing/logs/targets/space/[spaceId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
    notes: "Canonical RUN Logs for a Room/Space target. Direct Room attachments only.",
  },
  {
    pattern: "/staffing/logs/targets/department/[departmentId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
    notes: "Canonical RUN Logs for Department-target Attachments (no fake Room).",
  },
  {
    pattern: "/staffing/logs/targets/unit/[unitId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "staffing",
    featureFlag: "CANONICAL_LOGS",
    notes: "Canonical RUN Logs for Unit/Neighborhood-target Attachments. Does not redesign unit workspace.",
  },

  // ── Locations ─────────────────────────────────────────────────────────────
  {
    pattern: "/units",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "locations",
    legacyArea: { key: "units", label: "Locations", navOrder: 20, navVisible: true, critical: false },
    nav: { label: "Locations", order: 20 },
  },
  {
    pattern: "/unit/[unitId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "locations",
    legacyArea: { key: "unit", label: "Unit Workspace", navOrder: 200, navVisible: false, critical: false },
    requiresDownstreamAuthorization: true,
    notes: "The page resolves the unit within the session Facility; unit ownership is not a route concern.",
  },

  // ── Employees ─────────────────────────────────────────────────────────────
  {
    pattern: "/employees",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
    legacyArea: { key: "employees", label: "Employees", navOrder: 30, navVisible: true, critical: false },
    // BUILD · Employee Builder — workforce configuration (person, employment, department, job role, HR).
    // Today's staffing/attendance/assignments live in RUN Employees (/staffing).
    nav: { label: "Employee Builder", order: 230 },
  },
  {
    pattern: "/employees/job-roles",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/chrc-report",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/hr-audit",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/import",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/points-summary",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/separations",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },
  {
    pattern: "/employees/terminations",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "employees",
  },

  // ── Frontline work surfaces ───────────────────────────────────────────────
  {
    pattern: "/logs",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "logs",
    legacyArea: { key: "logs", label: "Logs", navOrder: 40, navVisible: true, critical: false },
    // RUN · legacy Logs. Hidden from nav when CANONICAL_LOGS_ENABLED (app-shell rewrite).
    nav: { label: "Logs", order: 70 },
    notes:
      "Legacy LogTemplate / LogAssignment / LogSubmission surface. Remains fully writable. Canonical RUN Logs live at /staffing/logs when CANONICAL_LOGS_ENABLED.",
  },
  {
    pattern: "/menus",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "menus",
    legacyArea: { key: "menus", label: "Menus", navOrder: 60, navVisible: true, critical: false },
    // BUILD · Menu Building — Dietary menu cycle/period/item configuration.
    nav: { label: "Menu Building", order: 235 },
  },
  {
    pattern: "/assets",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "assets",
    legacyArea: { key: "assets", label: "Assets", navOrder: 70, navVisible: true, critical: false },
    // RUN · Maintenance (Assets tab) — operational view (condition, profile, issues, WO).
    // Shell rewrite labels this "Maintenance" and hides the sibling Repairs nav item.
    // Asset configuration lives on `/assets/builder`. One Prisma Asset registry.
    nav: { label: "Assets", order: 60 },
  },
  {
    pattern: "/assets/builder",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "assets",
    // BUILD · Asset Builder — canonical configuration surface (identity, equipment type,
    // location, responsible department, criticality, retirement). Shares the single asset
    // registry and server actions with RUN Assets; introduces no new authority.
    nav: { label: "Asset Builder", order: 233 },
  },
  {
    pattern: "/assets/[assetId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "assets",
    requiresDownstreamAuthorization: true,
    notes:
      "Phase 10A Asset profile. Downstream authority scopes Facility and Dietary Asset Operations manage/view.",
  },
  {
    pattern: "/asset-issues/[issueId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "issues",
    requiresDownstreamAuthorization: true,
    notes:
      "Phase 10A Asset Issue triage. STAFF may read own report status; SUPERVISOR+ triage; MANAGER Work Orders. Downstream Facility/department auth applies.",
  },
  {
    pattern: "/repairs",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "repairs",
    legacyArea: { key: "repairs", label: "Repairs", navOrder: 80, navVisible: true, critical: false },
    // RUN · Maintenance (Repairs tab) — work-order queue. Hidden from header when
    // Assets is also offered; STAFF keep this as their Maintenance landing.
    nav: { label: "Repairs", order: 90 },
  },
  {
    pattern: "/repairs/[id]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "repairs",
    requiresDownstreamAuthorization: true,
    notes: "The page scopes the repair to the session Facility.",
  },
  {
    pattern: "/issues/[issueId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "issues",
    legacyArea: { key: "issues", label: "Repairs", navOrder: 81, navVisible: false, critical: false },
    requiresDownstreamAuthorization: true,
    notes:
      "Legacy Repair detail deep link — redirects to /repairs/[id]. When Asset Ops is enabled, Repair is the product term — not AssetIssue.",
  },
  {
    pattern: "/issues",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "issues",
    notes: "Legacy list façade — redirects to /repairs. Not a second legacyArea anchor.",
  },
  {
    pattern: "/reports",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "reports",
    legacyArea: { key: "reports", label: "Review", navOrder: 90, navVisible: true, critical: false },
    // RUN · Review — reporting / review surfaces.
    nav: { label: "Review", order: 100 },
  },

  // ── Build hub ─────────────────────────────────────────────────────────────
  {
    pattern: "/build",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "build",
    // BUILD · hub — the dedicated Build-mode landing. It composes the Build navigation group and is
    // presentation only: it lists only the configuration surfaces the role/department may already
    // reach, and never grants access. Frontline (STAFF / Quick PIN) stays Run-only below this floor.
    nav: { label: "Build Home", order: 200 },
  },

  // ── Administration (Facility Administrator only) ──────────────────────────
  {
    pattern: "/admin",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    legacyArea: { key: "admin", label: "Administration", navOrder: 100, navVisible: true, critical: true },
    // ADMIN · governance home (organization, facilities, access matrix). Not a co-equal operating mode.
    nav: { label: "Admin", order: 300 },
  },
  {
    pattern: "/admin/departments",
    match: "EXACT",
    surface: "PAGE",
    // Phase 9A: Manager+ may reach Department Builder for Operational Cycles.
    // Cycle mutations still enforce Dietary operational authority (FA alone is denied).
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "administration",
    // BUILD · Department Builder — the operational-programming center (capability-aware per department:
    // Locations, Zones, Operational Cycles, Work Plans, Request/Routing behavior).
    nav: { label: "Department Builder", order: 220 },
  },
  {
    pattern: "/admin/departments/[departmentId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "administration",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/admin/facility/builder",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    // BUILD · Facility Builder — physical structure and identity only (floors, neighborhoods/units,
    // rooms/spaces, space types, location hierarchy). It does not own department operating logic.
    nav: { label: "Facility Builder", order: 210 },
  },
  {
    pattern: "/admin/inspections",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    // LEGACY (hidden from nav): superseded by the unified Operational Template Builder. Reachable by
    // URL for FACILITY_ADMINISTRATOR; see docs/product/LEGACY_SURFACE_REGISTER.md.
    notes:
      "Legacy inspections configuration. Superseded by the unified Operational Template Builder (BUILD). Hidden from navigation; kept reachable and read-authoritative for FA until dependencies retire.",
  },
  {
    pattern: "/admin/knowledge",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    // BUILD · Procedures & Resources — parked from nav/hubs; page stays reachable by URL.
    // Restore with PROCEDURES_RESOURCES_VISIBLE in src/lib/knowledge/surface.ts.
    notes:
      "Operational knowledge/procedure library. Temporarily hidden from navigation and hubs; FACILITY_ADMINISTRATOR access and the page remain.",
    ...(PROCEDURES_RESOURCES_VISIBLE
      ? { nav: { label: "Procedures & Resources", order: 260 } }
      : {}),
  },
  {
    pattern: "/admin/organization",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
  },
  {
    pattern: "/admin/organization/facilities",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
  },
  {
    pattern: "/admin/permissions",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    notes: "Read-only Access Matrix. It renders this registry and cannot change it.",
  },
  {
    pattern: "/admin/billing",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "administration",
    notes: "Facility plan selection and Stripe Checkout. Does not gate departments until BILLING_ENTITLEMENTS_ENABLED.",
  },

  // ── Registered redirect ───────────────────────────────────────────────────
  {
    pattern: "/settings",
    match: "PREFIX",
    surface: "PAGE",
    access: {
      kind: "REDIRECT_ONLY",
      destination: "/admin/organization",
      allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR"),
    },
    module: "administration",
    notes: "Legacy settings entry point. Facility Administrators land on Organization; others go home.",
  },

  // ── Public APIs ───────────────────────────────────────────────────────────
  {
    pattern: "/api/health/live",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "operations",
    notes: "Liveness probe. Process-only; no database and no secrets.",
  },
  {
    pattern: "/api/health/ready",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "operations",
    notes:
      "Readiness probe. Returns only boolean dependency signals (auth secret, database, migrations).",
  },
  {
    pattern: "/api/auth/login",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "auth",
    notes: "Credential entry point; durably rate limited per account.",
  },
  {
    pattern: "/api/auth/pin-login",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "auth",
    notes: "Quick PIN entry point; durably rate limited per PIN candidate and per Facility.",
  },
  {
    pattern: "/api/auth/signup",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "auth",
  },
  {
    pattern: "/api/auth/logout",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "auth",
    notes: "Clears the session cookie; must work when the existing session is already invalid.",
  },
  {
    pattern: "/api/auth/device-facility",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "auth",
    notes:
      "Kiosk bootstrap. Reads only the device-bound Facility/Unit cookies and returns display names, before any user has signed in.",
  },
  {
    pattern: "/api/billing/webhook",
    match: "EXACT",
    surface: "API",
    access: { kind: "PUBLIC" },
    module: "billing",
    requiresDownstreamAuthorization: true,
    notes: "Stripe webhook. Authenticated by signature verification against the webhook secret, not by session.",
  },

  // ── Authenticated APIs, authorization completed in the handler ────────────
  {
    pattern: "/api/auth/session",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Returns the caller's own session summary.",
  },
  {
    pattern: "/api/auth/active-department",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Handler verifies the department belongs to the session Facility.",
  },
  {
    pattern: "/api/auth/active-unit",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Handler verifies unit membership before reissuing the session token.",
  },
  {
    pattern: "/api/auth/switch-facility",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Handler verifies the caller's granted Facility access before reissuing the session token.",
  },

  {
    pattern: "/api/offline/runtime-bundle",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "offline",
    requiresDownstreamAuthorization: true,
    notes: "Issues scoped Unit Workspace offline bundle; requires session, sessionVersion, device enrollment, and Dietary operational authority.",
  },
  {
    pattern: "/api/offline/runtime-sync",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "offline",
    requiresDownstreamAuthorization: true,
    notes: "Synchronizes bounded offline Milestone command batches with authority revalidation.",
  },
  {
    pattern: "/api/attachments/[id]",
    match: "EXACT",
    surface: "API",
    access: { kind: "HANDLER_AUTHORIZED_API" },
    module: "assets",
    requiresDownstreamAuthorization: true,
    notes: "Serves a facility-scoped attachment file; handler checks session and facilityId.",
  },

  // ── Role-restricted APIs (proxy floor plus handler authorization) ─────────
  {
    pattern: "/api/auth/bind-device",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Handler independently requires FACILITY_ADMINISTRATOR and validates the unit.",
  },
  {
    pattern: "/api/auth/logout-full",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "auth",
    requiresDownstreamAuthorization: true,
    notes: "Clears device binding as well as the session; handler independently requires FACILITY_ADMINISTRATOR.",
  },
  {
    pattern: "/api/facility/union-handbook",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("MANAGER") },
    module: "facility",
    requiresDownstreamAuthorization: true,
    notes: "Handler independently requires MANAGER and scopes to the session Facility.",
  },
  {
    pattern: "/api/onboarding/state",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "onboarding",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/onboarding/locations",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "onboarding",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/onboarding/managers",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "onboarding",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/billing/setup-intent",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "billing",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/billing/payment-method/default",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "billing",
    requiresDownstreamAuthorization: true,
  },
  {
    pattern: "/api/debug/projection-shadow",
    match: "EXACT",
    surface: "API",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("FACILITY_ADMINISTRATOR") },
    module: "diagnostics",
    requiresDownstreamAuthorization: true,
    notes: "Developer diagnostics; the handler also returns 404 unless PROJECTION_SHADOW_ENABLED is set.",
  },

  // ── Framework and static asset paths ──────────────────────────────────────
  {
    pattern: "/_next",
    match: "PREFIX",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
    notes: "Next.js build output. `_next/static` and `_next/image` are already excluded by the proxy matcher.",
  },
  {
    pattern: "/favicon.ico",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/file.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/globe.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/next.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/vercel.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/manifest.webmanifest",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/sw.js",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/offline.html",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/icons",
    match: "PREFIX",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
  {
    pattern: "/marketing",
    match: "PREFIX",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "marketing",
    notes: "Public landing-page photographs. Files live under public/marketing/.",
  },
  {
    pattern: "/window.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
];
