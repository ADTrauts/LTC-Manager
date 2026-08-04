import { isActiveNavPath } from "@/lib/nav-utils";
import type { NavRouteItem } from "@/lib/nav-zones";

/** Routes that leave the primary header and live under Administration. */
export const ADMINISTRATION_MENU_HREFS = [
  "/employees",
  "/logs",
  "/menus",
  "/assets",
  "/repairs",
  "/admin",
] as const;

export type AdministrationMenuHref = (typeof ADMINISTRATION_MENU_HREFS)[number];

export type AdministrationMenuSectionId =
  | "people"
  | "operational_setup"
  | "facilities"
  | "platform";

export type AdministrationMenuSectionDef = {
  id: AdministrationMenuSectionId;
  label: string;
  hrefs: readonly AdministrationMenuHref[];
};

/**
 * Fixed IA for the Administration dropdown. Visibility is applied later from
 * already-filtered nav items (RBAC + department scope) — never hardcode roles here.
 */
export const ADMINISTRATION_MENU_SECTIONS: readonly AdministrationMenuSectionDef[] = [
  { id: "people", label: "People", hrefs: ["/employees"] },
  { id: "operational_setup", label: "Operational setup", hrefs: ["/logs", "/menus"] },
  { id: "facilities", label: "Facilities", hrefs: ["/assets", "/repairs"] },
  { id: "platform", label: "Platform administration", hrefs: ["/admin"] },
] as const;

const ADMIN_HREF_SET = new Set<string>(ADMINISTRATION_MENU_HREFS);

export function isAdministrationMenuHref(href: string): boolean {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  return ADMIN_HREF_SET.has(path);
}

export type PartitionedTopNav = {
  primaryItems: NavRouteItem[];
  administrationItems: NavRouteItem[];
};

/** Split role/dept-filtered nav into primary header links vs Administration children. */
export function partitionTopNavItems(items: NavRouteItem[]): PartitionedTopNav {
  const primaryItems: NavRouteItem[] = [];
  const administrationItems: NavRouteItem[] = [];
  for (const item of items) {
    if (isAdministrationMenuHref(item.href)) {
      administrationItems.push(item);
    } else {
      primaryItems.push(item);
    }
  }
  return { primaryItems, administrationItems };
}

export type AdministrationMenuSection = {
  id: AdministrationMenuSectionId;
  label: string;
  items: { label: string; href: string }[];
};

/**
 * Build visible Administration sections from already-filtered nav items.
 * Omits empty sections; preserves section and within-section href order.
 */
export function buildAdministrationMenuSections(
  administrationItems: NavRouteItem[],
): AdministrationMenuSection[] {
  const byHref = new Map(administrationItems.map((item) => [item.href, item]));
  const sections: AdministrationMenuSection[] = [];

  for (const def of ADMINISTRATION_MENU_SECTIONS) {
    const items = def.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavRouteItem => Boolean(item))
      .map(({ label, href }) => ({ label, href }));
    if (items.length > 0) {
      sections.push({ id: def.id, label: def.label, items });
    }
  }

  // Keep any unexpected admin-zone hrefs reachable without inventing new top-level links.
  const known = new Set<string>(ADMINISTRATION_MENU_HREFS);
  const extras = administrationItems
    .filter((item) => !known.has(item.href))
    .map(({ label, href }) => ({ label, href }));
  if (extras.length > 0) {
    const platform = sections.find((s) => s.id === "platform");
    if (platform) {
      platform.items.push(...extras);
    } else {
      sections.push({
        id: "platform",
        label: "Platform administration",
        items: extras,
      });
    }
  }

  return sections;
}

/** True when the Administration trigger should appear active for the current path. */
export function isAdministrationMenuActive(
  pathname: string | null,
  administrationItems: { href: string }[],
): boolean {
  return administrationItems.some((item) => isActiveNavPath(pathname, item.href));
}
