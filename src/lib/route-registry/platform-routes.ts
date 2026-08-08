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

  // ── Workspace and Operations Center ───────────────────────────────────────
  {
    pattern: "/workspace",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "workspace",
    legacyArea: { key: "workspace", label: "Workspace", navOrder: 5, navVisible: true, critical: true },
    // RUN · Dashboard — the manager/GM operating picture and default home.
    nav: { label: "Dashboard", order: 10 },
  },
  {
    pattern: "/dashboard",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "operations-center",
    legacyArea: { key: "dashboard", label: "Operations Center", navOrder: 10, navVisible: false, critical: true },
    notes: "Reachable by every role; also the fallback destination for denied navigation.",
  },
  {
    pattern: "/operations",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("STAFF") },
    module: "operations-center",
    legacyArea: { key: "operations", label: "Operations Center", navOrder: 11, navVisible: false, critical: false },
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
    // RUN · Employees — today's workforce operations (schedule / attendance / assignments / coverage).
    // Workforce configuration (person, employment, role) lives in BUILD Employee Builder (/employees).
    nav: { label: "Employees", order: 40 },
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
    // BUILD · Operational Templates — the authoritative unified LOG / CHECKLIST / INSPECTION builder.
    nav: { label: "Operational Templates", order: 240 },
    notes:
      "Unified Operational Template Builder (Phase 9C). Page enforces DIETARY_OPERATIONAL_EVIDENCE_ENABLED.",
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
    // RUN · Log Book — historical operational evidence and records. Nav hidden when the capability is
    // off (the page keeps its own DIETARY_OPERATIONAL_EVIDENCE_ENABLED guard downstream).
    nav: { label: "Log Book", order: 50 },
    notes:
      "Dietary Operational Evidence Log Book (Phase 9C). Page enforces DIETARY_OPERATIONAL_EVIDENCE_ENABLED.",
  },
  {
    pattern: "/staffing/log-book/[recordId]",
    match: "EXACT",
    surface: "PAGE",
    access: { kind: "ROLE_RESTRICTED", allowedRoles: rolesAtLeast("SUPERVISOR") },
    module: "staffing",
    notes: "Evidence record detail / printable view (Phase 9C).",
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
    // RUN · Logs — frontline STAFF logging surface (kept; see Legacy Surface Register for its
    // relationship to the Operational Evidence Log Book).
    nav: { label: "Logs", order: 70 },
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
    // RUN · Assets — operational asset view (status / evidence / issues / requests / work orders).
    // Asset configuration (identity, type, department, retirement) is composed within this area's
    // Build tab and the Department Builder; there is one asset registry.
    nav: { label: "Assets", order: 60 },
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
    // RUN · Repairs / Work Orders — operational repair runtime.
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
    legacyArea: { key: "issues", label: "Issues", navOrder: 81, navVisible: false, critical: false },
    requiresDownstreamAuthorization: true,
    notes: "The page scopes the issue to the session Facility.",
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
    // BUILD · Procedures & Resources — the operational knowledge/procedure library, presented in
    // operational language rather than "Operational Knowledge".
    nav: { label: "Procedures & Resources", order: 260 },
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
    pattern: "/window.svg",
    match: "EXACT",
    surface: "INTERNAL",
    access: { kind: "INTERNAL" },
    module: "framework",
  },
];
