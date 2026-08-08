/**
 * The canonical LTC Manager product model: RUN, BUILD, ADMIN.
 *
 * RUN   — operate today (the operational surfaces staff and managers use to run the shift).
 * BUILD — configure how the operation works (Facility, Department, Employee, Template, Asset builders).
 * ADMIN — govern the organization, facilities, and access relationships.
 *
 * This module is a *presentation* projection. It maps a path to the mode its surface belongs to so
 * the shell can group navigation and render a mode indicator. It is deliberately NOT an authorization
 * boundary: which roles may reach which routes is decided only by the platform route registry
 * (`src/lib/route-registry`). A mode never grants access it never withholds it — the shell still
 * offers a link only for routes the role may actually reach.
 *
 * See docs/product/LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md.
 */

export const PRODUCT_MODES = ["RUN", "BUILD", "ADMIN"] as const;

export type ProductMode = (typeof PRODUCT_MODES)[number];

export const PRODUCT_MODE_LABELS: Record<ProductMode, string> = {
  RUN: "Run",
  BUILD: "Build",
  ADMIN: "Admin",
};

/** Short description of what each mode is for; shown in the mode switch and empty states. */
export const PRODUCT_MODE_TAGLINES: Record<ProductMode, string> = {
  RUN: "Operate today",
  BUILD: "Configure operations",
  ADMIN: "Govern facilities & access",
};

/** RUN and BUILD are the two primary operating modes; ADMIN is governance, never a co-equal mode. */
export const PRIMARY_PRODUCT_MODES: readonly ProductMode[] = ["RUN", "BUILD"];

export const PRODUCT_MODE_ORDER: readonly ProductMode[] = ["RUN", "BUILD", "ADMIN"];

type ModePathRule = { pathPrefix: string; mode: ProductMode; label: string };

/**
 * Longest matching prefix wins. BUILD/ADMIN children of `/admin` are listed explicitly so they
 * override the `/admin` → ADMIN default, and BUILD tools under `/staffing` override the RUN default.
 * Keep aligned with the route registry nav metadata and the Legacy Surface Register.
 */
export const PRODUCT_MODE_PATH_RULES: ModePathRule[] = (
  [
    // ── BUILD — configuration surfaces ─────────────────────────────────────
    { pathPrefix: "/build", mode: "BUILD", label: "Build Home" },
    { pathPrefix: "/admin/facility/builder", mode: "BUILD", label: "Facility Builder" },
    { pathPrefix: "/admin/departments", mode: "BUILD", label: "Department Builder" },
    { pathPrefix: "/admin/knowledge", mode: "BUILD", label: "Procedures & Resources" },
    { pathPrefix: "/admin/inspections", mode: "BUILD", label: "Inspections (legacy)" },
    { pathPrefix: "/department/settings", mode: "BUILD", label: "Department Settings" },
    { pathPrefix: "/employees", mode: "BUILD", label: "Employee Builder" },
    { pathPrefix: "/menus", mode: "BUILD", label: "Menu Building" },
    { pathPrefix: "/staffing/templates", mode: "BUILD", label: "Operational Templates" },
    { pathPrefix: "/staffing/work-plans", mode: "BUILD", label: "Work Plans" },

    // ── ADMIN — governance surfaces ────────────────────────────────────────
    { pathPrefix: "/admin/organization", mode: "ADMIN", label: "Organization" },
    { pathPrefix: "/admin/permissions", mode: "ADMIN", label: "Access Matrix" },
    { pathPrefix: "/admin", mode: "ADMIN", label: "Admin" },
    { pathPrefix: "/account", mode: "ADMIN", label: "Account & Security" },

    // ── RUN — operational surfaces (default) ───────────────────────────────
    { pathPrefix: "/workspace", mode: "RUN", label: "Dashboard" },
    { pathPrefix: "/dashboard", mode: "RUN", label: "Operations Center" },
    { pathPrefix: "/operations", mode: "RUN", label: "Operations Center" },
    { pathPrefix: "/today", mode: "RUN", label: "Today's Work" },
    { pathPrefix: "/units", mode: "RUN", label: "Locations" },
    { pathPrefix: "/unit", mode: "RUN", label: "Location Runtime" },
    { pathPrefix: "/staffing/log-book", mode: "RUN", label: "Log Book" },
    { pathPrefix: "/staffing/cycles", mode: "RUN", label: "Operational Cycles" },
    { pathPrefix: "/staffing/operations", mode: "RUN", label: "Supervisor Operations" },
    { pathPrefix: "/staffing/assignments", mode: "RUN", label: "Assignments" },
    { pathPrefix: "/staffing", mode: "RUN", label: "Employees" },
    { pathPrefix: "/logs", mode: "RUN", label: "Logs" },
    { pathPrefix: "/assets", mode: "RUN", label: "Assets" },
    { pathPrefix: "/asset-issues", mode: "RUN", label: "Asset Issues" },
    { pathPrefix: "/repairs", mode: "RUN", label: "Repairs" },
    { pathPrefix: "/issues", mode: "RUN", label: "Issues" },
    { pathPrefix: "/operational-requests", mode: "RUN", label: "Requests" },
    { pathPrefix: "/reports", mode: "RUN", label: "Review" },
  ] satisfies ModePathRule[]
).sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

const DEFAULT_MODE: ProductMode = "RUN";

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  return withoutQuery.endsWith("/") && withoutQuery.length > 1
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

function ruleForPath(pathname: string): ModePathRule | undefined {
  const normalized = normalizePathname(pathname);
  for (const rule of PRODUCT_MODE_PATH_RULES) {
    if (normalized === rule.pathPrefix || normalized.startsWith(`${rule.pathPrefix}/`)) {
      return rule;
    }
  }
  return undefined;
}

/** The product mode a path belongs to. Unknown/empty paths default to RUN. */
export function resolveProductModeForPath(pathname: string): ProductMode {
  return ruleForPath(pathname)?.mode ?? DEFAULT_MODE;
}

/** Human area label for a path, used by the shell mode indicator / breadcrumb. */
export function resolveProductAreaLabel(pathname: string): string | null {
  return ruleForPath(pathname)?.label ?? null;
}

export type ModeNavItem = { label: string; href: string };

export type ModeNavGroup = {
  mode: ProductMode;
  label: string;
  tagline: string;
  items: ModeNavItem[];
};

/**
 * Group already role/department-filtered nav items into RUN / BUILD / ADMIN, preserving the incoming
 * order within each mode and RUN → BUILD → ADMIN order globally. Empty modes are omitted.
 */
export function groupNavItemsByMode(items: readonly ModeNavItem[]): ModeNavGroup[] {
  const byMode = new Map<ProductMode, ModeNavItem[]>();
  for (const item of items) {
    const mode = resolveProductModeForPath(item.href);
    const list = byMode.get(mode) ?? [];
    list.push({ label: item.label, href: item.href });
    byMode.set(mode, list);
  }
  return PRODUCT_MODE_ORDER.filter((mode) => (byMode.get(mode)?.length ?? 0) > 0).map((mode) => ({
    mode,
    label: PRODUCT_MODE_LABELS[mode],
    tagline: PRODUCT_MODE_TAGLINES[mode],
    items: byMode.get(mode) ?? [],
  }));
}

/**
 * The mode the shell should present as active for the current path. Falls back to the first mode
 * that actually has navigation for this role when the current path resolves to a mode with none
 * (e.g. a STAFF member on an ADMIN-classified deep link they cannot navigate to).
 */
export function resolveActiveMode(pathname: string, groups: readonly ModeNavGroup[]): ProductMode {
  const requested = resolveProductModeForPath(pathname);
  if (groups.some((group) => group.mode === requested)) {
    return requested;
  }
  return groups[0]?.mode ?? DEFAULT_MODE;
}
