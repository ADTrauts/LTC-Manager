import type { DashboardAuthority, DashboardScopeKind } from "@/lib/dashboard/viewer/types";

import type { DashboardLayoutItemInput } from "./parse";

/** Bands that open this scope. A Facility Administrator sets the default for one of them. */
export function facilityDefaultBands(scopeKind: DashboardScopeKind): readonly DashboardAuthority[] {
  if (scopeKind === "FACILITY") return ["FACILITY_ADMINISTRATOR"];
  if (scopeKind === "TEAM") return ["SUPERVISOR"];
  return ["FACILITY_ADMINISTRATOR", "DEPARTMENT_LEADER", "MANAGER", "SUPERVISOR"];
}

export function facilityDefaultBandLabel(authority: DashboardAuthority): string {
  switch (authority) {
    case "FACILITY_ADMINISTRATOR":
      return "Facility Administrators";
    case "DEPARTMENT_LEADER":
      return "Department leaders";
    case "MANAGER":
      return "Managers";
    case "SUPERVISOR":
      return "Supervisors";
  }
}

/** Personal layout wins. An empty personal list is a saved choice. Facility default is next. */
export function chooseDashboardLayout(
  personal: readonly DashboardLayoutItemInput[] | null,
  facility: readonly DashboardLayoutItemInput[] | null,
): readonly DashboardLayoutItemInput[] | null {
  if (personal) return personal;
  if (facility) return facility;
  return null;
}
