/**
 * Administration hub IA — presentation labels and grouping only.
 * Routes are preserved; this module does not change domain behavior.
 *
 * Admin is governance. Department Product installation lives here.
 * Department Builder (operational configuration) lives under Build.
 */

import {
  PROCEDURES_RESOURCES_HUB_ID,
  PROCEDURES_RESOURCES_VISIBLE,
} from "@/lib/knowledge/surface";

export type AdminHubLink = {
  label: string;
  description: string;
  href: string;
  /** Stable id for tests and section keys. */
  id: string;
};

export type AdminHubSection = {
  id: "organization" | "access";
  title: string;
  links: readonly AdminHubLink[];
};

/** Grouped Administration hub entries. Governance only. */
export const ADMIN_HUB_SECTIONS: readonly AdminHubSection[] = [
  {
    id: "organization",
    title: "Organization",
    links: [
      {
        id: "organization_settings",
        label: "Organization",
        description:
          "Facility details, organization information, operating company, devices, and multi-site access.",
        href: "/admin/organization",
      },
      {
        id: "departments",
        label: "Departments",
        description:
          "Manage installed Department Products and add Departments to this facility.",
        href: "/admin/departments",
      },
      {
        id: "billing",
        label: "Billing",
        description:
          "Review pricing and manage payment for this facility's subscription.",
        href: "/admin/billing",
      },
    ],
  },
  {
    id: "access",
    title: "Access",
    links: [
      {
        id: "roles_permissions",
        label: "Access",
        description: "Configure application roles and control which areas each role may access.",
        href: "/admin/permissions",
      },
      {
        id: "account",
        label: "Account",
        description: "Your sign-in, password, and device security for this facility.",
        href: "/account",
      },
    ],
  },
] as const;

/** Hub links that must not appear as primary Administration cards. */
export const ADMIN_HUB_EXCLUDED_PRIMARY_HREFS = [
  "/admin/organization/facilities",
  "/admin/facility/builder",
  "/build/departments",
  "/logs",
  "/build/logs",
  "/admin/inspections",
  "/admin/knowledge",
  "/build/knowledge",
] as const;

export function flattenAdminHubLinks(
  sections: readonly AdminHubSection[] = ADMIN_HUB_SECTIONS,
): readonly AdminHubLink[] {
  return sections.flatMap((section) => section.links);
}

function isDisplayedAdminHubLink(link: AdminHubLink): boolean {
  if (link.id === PROCEDURES_RESOURCES_HUB_ID && !PROCEDURES_RESOURCES_VISIBLE) {
    return false;
  }
  return !ADMIN_HUB_EXCLUDED_PRIMARY_HREFS.includes(
    link.href as (typeof ADMIN_HUB_EXCLUDED_PRIMARY_HREFS)[number],
  );
}

/** Administration hub sections with parked / excluded cards omitted. */
export function visibleAdminHubSections(
  sections: readonly AdminHubSection[] = ADMIN_HUB_SECTIONS,
): readonly AdminHubSection[] {
  return sections
    .map((section) => ({
      ...section,
      links: section.links.filter(isDisplayedAdminHubLink),
    }))
    .filter((section) => section.links.length > 0);
}

export function adminHubPrimaryHrefs(
  sections: readonly AdminHubSection[] = ADMIN_HUB_SECTIONS,
): readonly string[] {
  return flattenAdminHubLinks(visibleAdminHubSections(sections)).map((link) => link.href);
}
