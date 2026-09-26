/**
 * Department Builder — local navigation.
 * Primary IA: Overview | Locations | Teams
 *
 * Retired tabs (Coverage, Cycles, Areas, Archetypes, Room Types, …) are not
 * a product surface. Deep links resolve to a primary tab. Do not add them back.
 */

export const DEPARTMENT_ADMIN_TABS = [
  {
    id: "overview",
    label: "Overview",
    description: "Identity and department-wide status",
  },
  {
    id: "locations",
    label: "Locations",
    description: "Where this department operates",
  },
  {
    id: "teams",
    label: "Teams",
    description: "Enduring groups within this department",
  },
] as const;

export type DepartmentAdminPrimaryTabId = (typeof DEPARTMENT_ADMIN_TABS)[number]["id"];

/**
 * Retired `?tab=` ids. Always redirect. Not listed in the bar.
 * Coverage / Cycles author on Teams. Areas / Archetypes / Room Types are
 * the retired Experience-catalog programming model.
 */
export const DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT = {
  coverage: "teams",
  cycles: "teams",
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
   * @deprecated Cycles is not a tab. Ignored.
   */
  cyclesEnabled?: boolean;
  /** Locations always available when the department detail page is reachable. */
  locationsEnabled?: boolean;
}): (typeof DEPARTMENT_ADMIN_TABS)[number][] {
  void input.profilesEnabled;
  void input.cyclesEnabled;
  const locationsEnabled = input.locationsEnabled ?? true;
  return DEPARTMENT_ADMIN_TABS.filter((tab) => {
    if (tab.id === "locations") return locationsEnabled;
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

export function departmentAdminHref(
  departmentId: string,
  tab: DepartmentAdminPrimaryTabId | DepartmentAdminRetiredTabId,
  profileId?: string | null,
): string {
  const resolved = isDepartmentAdminRetiredTabId(tab)
    ? DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT[tab]
    : tab;
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
