/**
 * Administration hub IA — presentation labels and grouping only.
 * Routes are preserved; this module does not change domain behavior.
 */

export type AdminHubLink = {
  label: string;
  description: string;
  href: string;
  /** Stable id for tests and section keys. */
  id: string;
};

export type AdminHubSection = {
  id: "facility_organization" | "departments_access" | "operational_configuration";
  title: string;
  links: readonly AdminHubLink[];
};

/** Grouped Administration hub entries (Option A navigation regroup). */
export const ADMIN_HUB_SECTIONS: readonly AdminHubSection[] = [
  {
    id: "facility_organization",
    title: "Facility & Organization",
    links: [
      {
        id: "facility_structure",
        label: "Facility Structure",
        description:
          "Create floors, neighborhoods, units, rooms, and operational spaces. Assign responsible departments to each room.",
        href: "/admin/facility/builder",
      },
      {
        id: "organization_settings",
        label: "Organization Settings",
        description:
          "Manage facility details, organization information, operating company details, device settings, and multi-site access.",
        href: "/admin/organization",
      },
    ],
  },
  {
    id: "departments_access",
    title: "Departments & Access",
    links: [
      {
        id: "departments",
        label: "Departments",
        description:
          "Manage department visibility, department leadership, and department-specific operational settings.",
        href: "/admin/departments",
      },
      {
        id: "roles_permissions",
        label: "Roles & Permissions",
        description: "Configure application roles and control which areas each role may access.",
        href: "/admin/permissions",
      },
    ],
  },
  {
    id: "operational_configuration",
    title: "Operational Configuration",
    links: [
      {
        id: "logs",
        label: "Logs",
        description:
          "Build recurring operational records such as temperature, sanitizer, cleaning, and completion logs.",
        href: "/logs",
      },
      {
        id: "inspections",
        label: "Inspections",
        description:
          "Create structured inspections, verification checklists, findings, and follow-up requirements.",
        href: "/admin/inspections",
      },
      {
        id: "procedures_resources",
        label: "Procedures & Resources",
        description:
          "Manage SOPs, policies, instructions, and reference materials linked to operational work.",
        href: "/admin/knowledge",
      },
    ],
  },
] as const;

/** Hub links that must not appear as primary Administration cards. */
export const ADMIN_HUB_EXCLUDED_PRIMARY_HREFS = ["/admin/organization/facilities"] as const;

export function flattenAdminHubLinks(
  sections: readonly AdminHubSection[] = ADMIN_HUB_SECTIONS,
): readonly AdminHubLink[] {
  return sections.flatMap((section) => section.links);
}

export function adminHubPrimaryHrefs(
  sections: readonly AdminHubSection[] = ADMIN_HUB_SECTIONS,
): readonly string[] {
  return flattenAdminHubLinks(sections).map((link) => link.href);
}
