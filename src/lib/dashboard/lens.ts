import type { DashboardScope, DashboardViewerDepartment } from "./viewer/types";

/** `?scope=` value. Honored only when it matches `availableScopes`. */
export function dashboardScopeParam(scope: DashboardScope): string {
  if (scope.kind === "FACILITY") return "facility";
  if (scope.kind === "TEAM") return `team:${scope.departmentId}`;
  return `department:${scope.departmentId}`;
}

export function dashboardScopeHref(
  scope: DashboardScope,
  onboardingComplete: boolean,
  homePath = "/dashboard",
): string {
  const params = new URLSearchParams();
  params.set("scope", dashboardScopeParam(scope));
  if (onboardingComplete) params.set("onboarding", "complete");
  return `${homePath}?${params.toString()}`;
}

export function dashboardEditHref(
  scope: DashboardScope,
  onboardingComplete: boolean,
  homePath = "/dashboard",
): string {
  const params = new URLSearchParams(dashboardScopeHref(scope, onboardingComplete, homePath).split("?")[1] ?? "");
  params.set("edit", "1");
  return `${homePath}?${params.toString()}`;
}

export function dashboardScopeChoiceLabel(
  scope: DashboardScope,
  departments: readonly Pick<DashboardViewerDepartment, "id" | "name">[],
): string {
  if (scope.kind === "FACILITY") return "Facility";
  const name = departments.find((department) => department.id === scope.departmentId)?.name ?? "Department";
  return scope.kind === "TEAM" ? `Team · ${name}` : name;
}
