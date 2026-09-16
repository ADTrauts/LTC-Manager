/**
 * Department Builder — local navigation.
 * Primary IA: Overview | Locations | Teams | Operational Cycles
 *
 * Legacy profile-authoring tab ids remain resolvable for deep links.
 * Room Types is deferred (internal profile/archetype architecture preserved).
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
  {
    id: "cycles",
    label: "Operational Cycles",
    description: "Repeating operating periods",
  },
] as const;

/** Legacy / advanced tabs still reachable via ?tab= for compatibility. */
export const DEPARTMENT_ADMIN_LEGACY_TABS = [
  {
    id: "room-types",
    label: "Room Types",
    description: "Deferred department Room Type configuration",
  },
  {
    id: "areas",
    label: "Operational Areas",
    description: "How the department organizes its Experiences",
  },
  {
    id: "archetypes",
    label: "Operational Patterns",
    description: "Shared operating patterns for location kinds",
  },
  {
    id: "rooms",
    label: "Room mapping",
    description: "Map assigned rooms to operational patterns",
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

export type DepartmentAdminPrimaryTabId = (typeof DEPARTMENT_ADMIN_TABS)[number]["id"];
export type DepartmentAdminLegacyTabId = (typeof DEPARTMENT_ADMIN_LEGACY_TABS)[number]["id"];
export type DepartmentAdminTabId =
  | DepartmentAdminPrimaryTabId
  | DepartmentAdminLegacyTabId;

const ALL_TABS = [...DEPARTMENT_ADMIN_TABS, ...DEPARTMENT_ADMIN_LEGACY_TABS] as const;

/** @deprecated Prefer DEPARTMENT_ADMIN_TABS; kept for tests that list primary + legacy. */
export const DEPARTMENT_ADMIN_ALL_TAB_IDS: readonly DepartmentAdminTabId[] = ALL_TABS.map(
  (t) => t.id,
);

/** Profile-authoring tabs — secondary to Locations / Overview. */
export const DEPARTMENT_PROFILE_TAB_IDS: readonly DepartmentAdminTabId[] = [
  "overview",
  "locations",
  "areas",
  "archetypes",
  "rooms",
  "diagnostics",
  "versions",
  "settings",
];

const LEGACY_TAB_REDIRECT: Record<DepartmentAdminLegacyTabId, DepartmentAdminPrimaryTabId> = {
  "room-types": "locations",
  areas: "locations",
  archetypes: "locations",
  rooms: "locations",
  diagnostics: "overview",
  versions: "overview",
  settings: "overview",
};

export function isDepartmentAdminTabId(value: string): value is DepartmentAdminTabId {
  return ALL_TABS.some((tab) => tab.id === value);
}

export function isDepartmentAdminPrimaryTabId(
  value: string,
): value is DepartmentAdminPrimaryTabId {
  return DEPARTMENT_ADMIN_TABS.some((tab) => tab.id === value);
}

export function departmentAdminTabsForFlags(input: {
  profilesEnabled: boolean;
  /**
   * @deprecated Cycles is a primary Department Builder tab and is always shown.
   * Retained for call-site compatibility; ignored for nav visibility.
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
    /** When true (default), legacy ids resolve to primary IA tabs. */
    redirectLegacy?: boolean;
  },
): DepartmentAdminTabId {
  const fallback = options?.fallback ?? "overview";
  const redirectLegacy = options?.redirectLegacy ?? true;

  if (value && isDepartmentAdminTabId(value)) {
    const resolved: DepartmentAdminTabId =
      redirectLegacy && value in LEGACY_TAB_REDIRECT
        ? LEGACY_TAB_REDIRECT[value as DepartmentAdminLegacyTabId]
        : value;

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
