/**
 * Department Builder — local navigation.
 * Overview, Locations, Operating Rhythm, Work, People & Coverage, Records.
 * Menus appear only for a Dietary product.
 *
 * Retired tab ids still resolve so old links land on the owning section.
 */

export const DEPARTMENT_ADMIN_TABS = [
  {
    id: "overview",
    label: "Overview",
    description: "Installed product and configuration gaps",
  },
  {
    id: "locations",
    label: "Locations",
    description: "Physical places and Location Functions",
  },
  {
    id: "operating-rhythm",
    label: "Operating Rhythm",
    description: "Operational Cycles, phases, and key points",
  },
  {
    id: "work",
    label: "Work",
    description: "Work plans for this department",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Preventive Maintenance for Facility Plant Operations",
  },
  {
    id: "people",
    label: "People & Coverage",
    description: "Teams and coverage. Employee identity stays in People.",
  },
  {
    id: "records",
    label: "Records",
    description: "Record requirements for this department",
  },
  {
    id: "menus",
    label: "Menus",
    description: "Dietary menus",
  },
] as const;

export type DepartmentAdminPrimaryTabId = (typeof DEPARTMENT_ADMIN_TABS)[number]["id"];

/**
 * Retired `?tab=` ids. Always redirect. Not listed in the bar.
 * Cycles configure under Operating Rhythm. Teams configure under People & Coverage.
 */
export const DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT = {
  coverage: "people",
  cycles: "operating-rhythm",
  teams: "people",
  "room-types": "locations",
  areas: "locations",
  archetypes: "locations",
  rooms: "locations",
  diagnostics: "overview",
  versions: "overview",
  settings: "overview",
} as const satisfies Record<string, DepartmentAdminPrimaryTabId>;

export type DepartmentAdminRetiredTabId = keyof typeof DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT;

/** @deprecated Empty. Retired tabs are not a product surface. */
export const DEPARTMENT_ADMIN_DEFERRED_TABS = [] as const;

/** @deprecated Empty. Retired tabs are not a product surface. */
export const DEPARTMENT_ADMIN_LEGACY_TABS = [] as const;

export type DepartmentAdminDeferredTabId = never;
export type DepartmentAdminLegacyTabId = never;
export type DepartmentAdminTabId = DepartmentAdminPrimaryTabId;

export const DEPARTMENT_ADMIN_ALL_TAB_IDS: readonly DepartmentAdminTabId[] =
  DEPARTMENT_ADMIN_TABS.map((t) => t.id);

/** Primary tabs only. Profile-authoring leftover ids are retired. */
export const DEPARTMENT_PROFILE_TAB_IDS: readonly DepartmentAdminTabId[] = [
  "overview",
  "locations",
  "operating-rhythm",
];

export function isDepartmentAdminRetiredTabId(
  value: string,
): value is DepartmentAdminRetiredTabId {
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT, value);
}

export function isDepartmentAdminTabId(value: string): value is DepartmentAdminTabId {
  return DEPARTMENT_ADMIN_TABS.some((tab) => tab.id === value);
}

export function isDepartmentAdminPrimaryTabId(
  value: string,
): value is DepartmentAdminPrimaryTabId {
  return DEPARTMENT_ADMIN_TABS.some((tab) => tab.id === value);
}

export function isDepartmentAdminDeferredTabId(
  _value: string,
): _value is DepartmentAdminDeferredTabId {
  return false;
}

export function departmentAdminTabsForFlags(input: {
  profilesEnabled: boolean;
  /**
   * @deprecated The Operating Rhythm tab is always present. Ignored.
   */
  cyclesEnabled?: boolean;
  /** Locations always available when the department detail page is reachable. */
  locationsEnabled?: boolean;
  /** Omit Work when this Product has no work plans and no work presets. */
  workEnabled?: boolean;
  /** Canonical Record requirements. Omit when the record engine is off. */
  recordsEnabled?: boolean;
  /** Dietary menus. Omit for other products. */
  menusEnabled?: boolean;
  /** Plant Preventive Maintenance builder. Omit for other products. */
  maintenanceEnabled?: boolean;
}): (typeof DEPARTMENT_ADMIN_TABS)[number][] {
  void input.profilesEnabled;
  void input.cyclesEnabled;
  const locationsEnabled = input.locationsEnabled ?? true;
  const workEnabled = input.workEnabled ?? true;
  const recordsEnabled = input.recordsEnabled ?? false;
  const menusEnabled = input.menusEnabled ?? false;
  const maintenanceEnabled = input.maintenanceEnabled ?? false;
  return DEPARTMENT_ADMIN_TABS.filter((tab) => {
    if (tab.id === "locations") return locationsEnabled;
    if (tab.id === "work") return workEnabled;
    if (tab.id === "maintenance") return maintenanceEnabled;
    if (tab.id === "records") return recordsEnabled;
    if (tab.id === "menus") return menusEnabled;
    return true;
  });
}

export function resolveDepartmentAdminTab(
  value: string | null | undefined,
  options?: {
    availableTabIds?: readonly DepartmentAdminTabId[];
    fallback?: DepartmentAdminTabId;
  },
): DepartmentAdminTabId {
  const fallback = options?.fallback ?? "overview";

  const resolved: DepartmentAdminTabId | null = value
    ? isDepartmentAdminRetiredTabId(value)
      ? DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT[value]
      : isDepartmentAdminTabId(value)
        ? value
        : null
    : null;

  if (resolved) {
    if (!options?.availableTabIds || options.availableTabIds.includes(resolved)) {
      return resolved;
    }
  }
  if (options?.availableTabIds?.length) {
    return options.availableTabIds[0]!;
  }
  return fallback;
}

export function preventiveMaintenanceBuilderHref(departmentId: string): string {
  return `/build/departments/${departmentId}/preventive-maintenance`;
}

export function preventiveMaintenancePlanHref(departmentId: string, planId: string): string {
  return `${preventiveMaintenanceBuilderHref(departmentId)}/${planId}`;
}

export function preventiveMaintenanceNewHref(departmentId: string): string {
  return `${preventiveMaintenanceBuilderHref(departmentId)}/new`;
}

export function isPreventiveMaintenanceBuilderPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/build\/departments\/[^/]+\/preventive-maintenance(?:\/.*)?$/.test(pathname);
}

export function departmentAdminHref(
  departmentId: string,
  tab: DepartmentAdminPrimaryTabId | DepartmentAdminRetiredTabId,
  profileId?: string | null,
): string {
  const resolved = isDepartmentAdminRetiredTabId(tab)
    ? DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT[tab]
    : tab;
  if (resolved === "maintenance") {
    return preventiveMaintenanceBuilderHref(departmentId);
  }
  const params = new URLSearchParams();
  if (resolved !== "overview") params.set("tab", resolved);
  if (profileId) params.set("profile", profileId);
  const query = params.toString();
  return query
    ? `/build/departments/${departmentId}?${query}`
    : `/build/departments/${departmentId}`;
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
