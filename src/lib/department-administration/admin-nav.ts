/**
 * Department Administration — local navigation (Wave 14C).
 * Not global nav. Tabs live under /admin/departments/[departmentId].
 */

export const DEPARTMENT_ADMIN_TABS = [
  {
    id: "overview",
    label: "Overview",
    description: "Status, coverage, and quick actions",
  },
  {
    id: "areas",
    label: "Operational Areas",
    description: "How the department organizes its Experiences",
  },
  {
    id: "archetypes",
    label: "Room Archetypes",
    description: "How the department operates by room kind",
  },
  {
    id: "rooms",
    label: "Rooms",
    description: "Map assigned rooms to archetypes",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Certification readiness and coverage gaps",
  },
  {
    id: "versions",
    label: "Versions",
    description: "Draft, certified, active, and retired history",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Baseline and profile identity",
  },
] as const;

export type DepartmentAdminTabId = (typeof DEPARTMENT_ADMIN_TABS)[number]["id"];

export function isDepartmentAdminTabId(value: string): value is DepartmentAdminTabId {
  return DEPARTMENT_ADMIN_TABS.some((tab) => tab.id === value);
}

export function resolveDepartmentAdminTab(
  value: string | null | undefined,
): DepartmentAdminTabId {
  if (value && isDepartmentAdminTabId(value)) return value;
  return "overview";
}

export function departmentAdminHref(
  departmentId: string,
  tab: DepartmentAdminTabId,
  profileId?: string | null,
): string {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (profileId) params.set("profile", profileId);
  const query = params.toString();
  return query
    ? `/admin/departments/${departmentId}?${query}`
    : `/admin/departments/${departmentId}`;
}

export function profileStatusBadgeVariant(
  status: "DRAFT" | "CERTIFIED" | "ACTIVE" | "RETIRED",
): "neutral" | "in_progress" | "success" | "warning" {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "CERTIFIED":
      return "in_progress";
    case "ACTIVE":
      return "success";
    case "RETIRED":
      return "warning";
  }
}
