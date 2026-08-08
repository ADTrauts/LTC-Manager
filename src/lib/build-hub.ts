import type { ModeNavItem } from "@/lib/product-mode";

/**
 * The dedicated BUILD hub (`/build`) is a landing page that composes the BUILD navigation group.
 *
 * It is a *presentation* projection over the same role/department-filtered nav items the shell
 * already computes — it introduces no authorization of its own. Each reachable BUILD surface is
 * rendered as a card; the hub's own `/build` link is never listed as a card.
 */
export const BUILD_HUB_HOME_HREF = "/build";

export type BuildHubCard = { label: string; href: string; description: string };

/** Product-facing description per BUILD surface. Unlisted surfaces fall back to a generic line. */
export const BUILD_HUB_DESCRIPTIONS: Record<string, string> = {
  "/admin/facility/builder":
    "Physical structure and identity — floors, neighborhoods, rooms, spaces, and the location hierarchy.",
  "/admin/departments":
    "Configure how each department operates — locations, zones, operational cycles, work plans, and request routing.",
  "/employees":
    "Workforce configuration — people, employment, department, job role, and HR records.",
  "/menus": "Dietary menu building — cycles, periods, and menu items.",
  "/staffing/templates":
    "Build the logs, checklists, and inspections your teams complete during the shift.",
  "/staffing/work-plans":
    "Author department work plans that schedule recurring operational work.",
  "/admin/knowledge":
    "The operational knowledge and procedure library — procedures and resources.",
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
