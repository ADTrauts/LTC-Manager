import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AuthKind, FacilitySession } from "@/lib/auth";
import type { DepartmentAccess } from "@/lib/department-authority";
import type { BillingStatusForEntitlement } from "@/lib/department-products/eligibility";
import {
  isDepartmentRowCustomerOperable,
  type FacilityDepartmentAccessRow,
} from "@/lib/department-products/load-facility-catalog";
import { getDepartmentProduct, matchEntitlementStatusForProduct } from "@/lib/department-products/registry";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import type { RouteFeatureFlags } from "@/lib/route-registry/authorize";
import type { ViewerTeamScope } from "@/lib/todays-work/viewer-team-scope";

import type {
  DashboardAuthority,
  DashboardDepartmentAccessMode,
  DashboardDepartmentOperator,
  DashboardLayoutOwner,
  DashboardLensRequest,
  DashboardScope,
  DashboardViewerDepartment,
  DashboardViewerNotice,
  DashboardViewerResolution,
} from "./types";

export type DashboardDepartmentCatalog = {
  departments: readonly FacilityDepartmentAccessRow[];
  entitlements: readonly { departmentKey: string; status: "ACTIVE" | "REVOKED" }[];
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
};

/**
 * Departments a Dashboard may ever show in this facility, in sort order.
 * Customers get active, released, entitled product Departments and active custom Departments,
 * with the same `showInEmployeeApp` and Plant runtime rules as the sidebar lens. Harbor work
 * sessions see every active Department, including DEVELOPMENT products.
 */
export function selectDashboardDepartments(input: {
  authKind: AuthKind;
  catalog: DashboardDepartmentCatalog;
  plantRuntimeEnabled: boolean;
}): DashboardViewerDepartment[] {
  const { catalog } = input;
  return catalog.departments
    .filter((row) => {
      if (!row.isActive) return false;
      if (input.authKind === "harbor_staff") return true;
      const plantSelectable = row.key === "PLANT" && input.plantRuntimeEnabled;
      if (!row.showInEmployeeApp && !plantSelectable) return false;
      const product = getDepartmentProduct(row.key);
      if (!product) return true;
      if (plantSelectable) return true;
      return isDepartmentRowCustomerOperable({
        key: row.key,
        isActive: row.isActive,
        entitlementStatus: matchEntitlementStatusForProduct(catalog.entitlements, product),
        billingStatus: catalog.billingStatus,
        entitlementsEnforced: catalog.entitlementsEnforced,
      });
    })
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder }));
}

/** Null below Supervisor. Department leader applies whatever the role, once the floor is met. */
export function deriveDashboardAuthority(input: {
  role: AppRole;
  leadsDepartmentInScope: boolean;
}): DashboardAuthority | null {
  if (!hasAtLeastRole(input.role, "SUPERVISOR")) return null;
  if (isFacilityAdministratorRole(input.role)) return "FACILITY_ADMINISTRATOR";
  if (input.leadsDepartmentInScope) return "DEPARTMENT_LEADER";
  if (hasAtLeastRole(input.role, "MANAGER")) return "MANAGER";
  return "SUPERVISOR";
}

/** Secondary memberships never widen scope: Managers and Supervisors get their primary Department. */
export function dashboardScopeCandidates(input: {
  authority: DashboardAuthority;
  candidates: readonly DashboardViewerDepartment[];
  ledDepartmentIds: readonly string[];
  primaryDepartmentId: string | null;
}): DashboardViewerDepartment[] {
  switch (input.authority) {
    case "FACILITY_ADMINISTRATOR":
      return [...input.candidates];
    case "DEPARTMENT_LEADER": {
      const led = new Set(input.ledDepartmentIds);
      return input.candidates.filter((department) => led.has(department.id));
    }
    case "MANAGER":
    case "SUPERVISOR":
      return input.candidates.filter((department) => department.id === input.primaryDepartmentId);
  }
}

export function dashboardLayoutOwner(session: FacilitySession): DashboardLayoutOwner {
  if (session.authKind === "user") return { kind: "USER", userId: session.uid };
  if (session.authKind === "employee") return { kind: "EMPLOYEE", employeeId: session.uid };
  return null;
}

export type DashboardAccessFact = Pick<
  DepartmentAccess,
  "mode" | "operatingModel" | "operatorName" | "vendorHeadAccepted"
>;

export type DashboardTeamScopeFact = Pick<ViewerTeamScope, "mode" | "activeTeams" | "roomIds">;

export type DashboardViewerFacts = {
  session: FacilitySession;
  facilityTimezone: string;
  serviceDate: string;
  employeeId: string | null;
  primaryDepartmentId: string | null;
  ledDepartmentIds: readonly string[];
  candidateDepartments: readonly DashboardViewerDepartment[];
  /** From the CDA resolver. A Department without an entry is left out of scope. */
  access: ReadonlyMap<string, DashboardAccessFact>;
  /** The Supervisor's team scope in their primary Department. */
  teamScope: DashboardTeamScopeFact | null;
  routeFlags: RouteFeatureFlags;
  lens?: DashboardLensRequest;
};

function departmentScope(departmentId: string): DashboardScope {
  return { kind: "DEPARTMENT", departmentId };
}

function matchScopeParam(param: string, available: readonly DashboardScope[]): DashboardScope | null {
  if (param === "facility") return available.find((scope) => scope.kind === "FACILITY") ?? null;
  const separator = param.indexOf(":");
  if (separator <= 0) return null;
  const kind = param.slice(0, separator);
  const departmentId = param.slice(separator + 1);
  if (!departmentId) return null;
  if (kind === "department") {
    return available.find((scope) => scope.kind === "DEPARTMENT" && scope.departmentId === departmentId) ?? null;
  }
  if (kind === "team") {
    return available.find((scope) => scope.kind === "TEAM" && scope.departmentId === departmentId) ?? null;
  }
  return null;
}

/** A `?scope=` parameter outranks the sidebar cookie. A cookie naming the default's Department keeps the default. */
function requestedScope(
  lens: DashboardLensRequest | undefined,
  available: readonly DashboardScope[],
  defaultScope: DashboardScope | null,
): { requested: boolean; match: DashboardScope | null } {
  const param = lens?.scopeParam?.trim();
  if (param) return { requested: true, match: matchScopeParam(param, available) };
  const cookie = lens?.cookieDepartmentId?.trim();
  if (!cookie) return { requested: false, match: null };
  if (defaultScope && defaultScope.kind !== "FACILITY" && defaultScope.departmentId === cookie) {
    return { requested: true, match: defaultScope };
  }
  return {
    requested: true,
    match: available.find((scope) => scope.kind === "DEPARTMENT" && scope.departmentId === cookie) ?? null,
  };
}

function scopeLabel(scope: DashboardScope, names: ReadonlyMap<string, string>): string {
  if (scope.kind === "FACILITY") return "the whole facility";
  const name = names.get(scope.departmentId) ?? "your Department";
  return scope.kind === "TEAM" ? `your team in ${name}` : name;
}

function toOperator(access: DashboardAccessFact): DashboardDepartmentOperator {
  return {
    operatingModel: access.operatingModel === "CONTRACTED" ? "VENDOR_RUN" : "SELF_OPERATED",
    operatorName: access.operatingModel === "CONTRACTED" ? access.operatorName : null,
    vendorHeadAccepted: access.operatingModel === "CONTRACTED" && access.vendorHeadAccepted,
  };
}

export function deriveDashboardViewer(facts: DashboardViewerFacts): DashboardViewerResolution {
  const { session } = facts;
  const candidateIds = new Set(facts.candidateDepartments.map((department) => department.id));
  const ledDepartmentIds = [...new Set(facts.ledDepartmentIds)].filter((id) => candidateIds.has(id));
  const authority = deriveDashboardAuthority({
    role: session.role,
    leadsDepartmentInScope: ledDepartmentIds.length > 0,
  });
  if (!authority) return { kind: "not_eligible", reason: "ROLE_BELOW_SUPERVISOR" };

  const departments = dashboardScopeCandidates({
    authority,
    candidates: facts.candidateDepartments,
    ledDepartmentIds,
    primaryDepartmentId: facts.primaryDepartmentId,
  }).filter((department) => {
    const access = facts.access.get(department.id);
    return access != null && access.mode !== "NONE";
  });

  const departmentAccess: Record<string, DashboardDepartmentAccessMode> = {};
  const operators: Record<string, DashboardDepartmentOperator> = {};
  for (const department of departments) {
    const access = facts.access.get(department.id)!;
    departmentAccess[department.id] = access.mode as DashboardDepartmentAccessMode;
    operators[department.id] = toOperator(access);
  }
  const names = new Map(departments.map((department) => [department.id, department.name]));

  const notices: DashboardViewerNotice[] = [];
  let available: DashboardScope[] = [];
  let defaultScope: DashboardScope | null = null;

  switch (authority) {
    case "FACILITY_ADMINISTRATOR":
      available = [{ kind: "FACILITY" }, ...departments.map((department) => departmentScope(department.id))];
      defaultScope = available[0]!;
      break;
    case "DEPARTMENT_LEADER": {
      available = departments.map((department) => departmentScope(department.id));
      const primary = departments.find((department) => department.id === facts.primaryDepartmentId);
      const first = primary ?? departments[0];
      defaultScope = first ? departmentScope(first.id) : null;
      break;
    }
    case "MANAGER":
      available = departments.map((department) => departmentScope(department.id));
      defaultScope = available[0] ?? null;
      break;
    case "SUPERVISOR": {
      const department = departments[0];
      if (!department) break;
      const team = facts.teamScope;
      if (team?.mode === "TEAM_SCOPED") {
        const teamScope: DashboardScope = {
          kind: "TEAM",
          departmentId: department.id,
          teamIds: team.activeTeams.map((row) => row.id),
          roomIds: [...team.roomIds],
        };
        available = [teamScope, departmentScope(department.id)];
        defaultScope = teamScope;
        break;
      }
      available = [departmentScope(department.id)];
      defaultScope = available[0]!;
      notices.push(
        team?.mode === "TEAM_WITHOUT_LOCATIONS"
          ? {
              code: "TEAM_WITHOUT_ROOMS",
              message: `Your team has no rooms yet. Your Dashboard shows all of ${department.name}.`,
            }
          : {
              code: "NO_TEAM_ASSIGNED",
              message: `No team assigned. Your Dashboard shows all of ${department.name}.`,
            },
      );
      break;
    }
  }

  let scope = defaultScope;
  if (!defaultScope) {
    notices.push({
      code: "NEEDS_DEPARTMENT",
      message: "Your Dashboard needs a Department. Ask your Facility Administrator to set your primary Department.",
    });
  } else {
    const lens = requestedScope(facts.lens, available, defaultScope);
    if (lens.match) {
      scope = lens.match;
    } else if (lens.requested) {
      notices.push({
        code: "LENS_NOT_AVAILABLE",
        message: `That view isn't available to you. Your Dashboard shows ${scopeLabel(defaultScope, names)}.`,
      });
    }
  }

  const layoutOwner = dashboardLayoutOwner(session);
  return {
    kind: "viewer",
    viewer: {
      facilityId: session.facilityId,
      facilityTimezone: facts.facilityTimezone,
      serviceDate: facts.serviceDate,
      session,
      role: session.role,
      authority,
      employeeId: facts.employeeId,
      layoutOwner,
      ledDepartmentIds,
      departments,
      scopeDepartmentIds: departments.map((department) => department.id),
      departmentAccess,
      operators,
      scope,
      availableScopes: available,
      notices,
      canCustomize: layoutOwner !== null,
      routeFlags: facts.routeFlags,
    },
  };
}