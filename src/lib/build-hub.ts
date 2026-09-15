import type { ModeNavItem } from "@/lib/product-mode";

/**
 * The dedicated BUILD hub (`/build`) is a landing page that composes the BUILD navigation group.
 *
 * It is a *presentation* projection over the same role/department-filtered nav items the shell
 * already computes — it introduces no authorization of its own. Each reachable BUILD surface is
 * rendered as a card; the hub's own `/build` link is never listed as a card.
 *
 * The Build-mode left sidebar uses the same filtered BUILD group (including Build Home) so the hub
 * and the rail stay one source of truth.
 */
export const BUILD_HUB_HOME_HREF = "/build";

export type BuildHubCard = { label: string; href: string; description: string };

export type BuildSidebarNavItem = ModeNavItem;

/** Product-facing description per BUILD surface. Unlisted surfaces fall back to a generic line. */
export const BUILD_HUB_DESCRIPTIONS: Record<string, string> = {
  "/admin/facility/builder":
    "Physical structure and identity — floors, neighborhoods, rooms, spaces, and the location hierarchy.",
  "/admin/departments":
    "Configure how each department operates — locations, zones, operational cycles, work plans, and request routing.",
  "/employees":
    "Workforce configuration — people, employment, department, job role, and HR records.",
  "/assets/builder":
    "Equipment configuration — register assets and set identity, location, responsible department, criticality, and retirement. Operational condition and repairs live under RUN Assets.",
  "/menus": "Dietary menu building — cycles, periods, and menu items.",
  "/build/logs":
    "Browse the LTC Corp Log Catalog and review facility Attachments. Attach Logs from Assets, Rooms, Units, or Departments.",
  "/staffing/templates":
    "Phase 9C operational templates (compatibility). Prefer BUILD · Logs for Catalog Attachments when Canonical Logs are enabled.",
  "/staffing/work-plans":
    "Author department work plans that schedule recurring operational work.",
  "/admin/knowledge":
    "The operational knowledge and procedure library — procedures and resources.",
};

/**
 * Concise permanent page introductions for builder chrome. Prefer these over multi-paragraph
 * explanations in the page header; keep longer guidance next to the control it explains.
 */
export const BUILD_PAGE_INTROS: Record<string, string> = {
  "/admin/facility/builder":
    "Define the physical structure of your facility and assign departmental responsibility.",
  "/admin/departments":
    "Facility-level department visibility and heads. Selected-department configuration opens in Department Builder.",
  "/employees":
    "Manage people, employment records, department assignment, and HR configuration.",
  "/assets/builder":
    "Register equipment identity, normal location, and responsible department.",
  "/menus":
    "Build menu cycles and keep daily meal items aligned with servery operations.",
  "/staffing/templates":
    "Phase 9C template builder (compatibility). Canonical Catalog Attachments live under Logs.",
  "/build/logs":
    "Browse published Catalog Logs and audit Attachments. Prefer attaching from the target.",
  "/staffing/work-plans":
    "Author department work plans that schedule recurring operational work.",
  "/admin/knowledge":
    "Manage SOPs, instructions, policies, job aids, and reference materials.",
  "/admin/inspections":
    "Create structured inspections and verification checklists for unit work.",
};

const FALLBACK_DESCRIPTION =
  "Open this Build surface to configure how the operation works.";

/**
 * Turn the already-filtered BUILD nav items into hub cards, dropping the hub's own home link and
 * preserving the incoming (registry) order.
 */
export function buildHubCards(buildItems: readonly ModeNavItem[]): BuildHubCard[] {
  return buildItems
    .filter((item) => item.href !== BUILD_HUB_HOME_HREF)
    .map((item) => ({
      label: item.label,
      href: item.href,
      description: BUILD_HUB_DESCRIPTIONS[item.href] ?? FALLBACK_DESCRIPTION,
    }));
}

/**
 * Build-mode left-rail items: Build Home first (when present), then every other BUILD surface in
 * registry order. Same filtered list the hub cards use — no second hardcoded catalog.
 */
export function buildSidebarNavItems(
  buildItems: readonly ModeNavItem[],
): BuildSidebarNavItem[] {
  const home = buildItems.find((item) => item.href === BUILD_HUB_HOME_HREF);
  const rest = buildItems.filter((item) => item.href !== BUILD_HUB_HOME_HREF);
  return home ? [home, ...rest] : [...rest];
}

/** Concise page intro for a BUILD href, with a short fallback. */
export function buildPageIntro(href: string, fallback?: string): string {
  return BUILD_PAGE_INTROS[href] ?? fallback ?? FALLBACK_DESCRIPTION;
}
