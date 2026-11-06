import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import {
  isFacilityScopedSession,
  isPartnerFacilitySession,
  type FacilitySession,
  type PartnerFacilitySession,
} from "@/lib/auth";
import {
  resolveDepartmentAccessMap,
  resolveLedDepartmentIds,
  type DepartmentAccess,
} from "@/lib/department-authority";
import { loadFacilityDepartmentAccessContext } from "@/lib/department-products/load-facility-catalog";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import {
  isCanonicalLogsEnabled,
  isContractedDepartmentAuthorityEnabled,
} from "@/lib/feature-flags";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import type { RouteFeatureFlags } from "@/lib/route-registry/authorize";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { resolveViewerTeamScopes } from "@/lib/dashboard/viewer/viewer-team-scope";

import {
  applyDashboardLens,
  dashboardScopeCandidates,
  deriveDashboardAuthority,
  deriveDashboardViewer,
  selectDashboardDepartments,
} from "./derive";
import type { DashboardLensRequest, DashboardViewer, DashboardViewerResolution } from "./types";

/** Live flag values for `authorizeRoute`. Log Book opens under either Records engine, as its page guard allows. */
export function currentDashboardRouteFlags(): RouteFeatureFlags {
  const canonicalLogsEnabled = isCanonicalLogsEnabled();
  return {
    dietaryOperationalEvidenceEnabled: true,
    dietaryWorkPlansEnabled: true,
    canonicalLogsEnabled,
  };
}

export type DashboardViewerDeps = {
  db: PrismaClient;
  now: Date;
  resolveEmployeeId: (session: FacilitySession) => Promise<string | null>;
  plantRuntimeEnabled: (facilityId: string, session: FacilitySession) => Promise<boolean>;
  routeFlags: RouteFeatureFlags;
};

/**
 * Departments a partner may open on the Dashboard.
 * A person who heads any Department is a leader for those Departments only.
 * Anyone else who can manage a Department gets the manager Dashboard for those Departments.
 */
export function selectPartnerDashboardDepartments<T extends { id: string }>(
  rows: readonly T[],
  access: ReadonlyMap<string, Pick<DepartmentAccess, "isHead" | "mode">>,
): {
  authority: "DEPARTMENT_LEADER" | "MANAGER";
  role: "GM" | "MANAGER";
  departments: T[];
} | null {
  const manageable = rows.filter((row) => access.get(row.id)?.mode === "MANAGE");
  const led = manageable.filter((row) => access.get(row.id)?.isHead === true);
  const departments = led.length > 0 ? led : manageable;
  if (departments.length === 0) return null;
  if (led.length > 0) return { authority: "DEPARTMENT_LEADER", role: "GM", departments };
  return { authority: "MANAGER", role: "MANAGER", departments };
}

/**
 * A partner who can manage a Department uses the same Dashboard as that role.
 * Heads are Department leaders. Other partner people are managers of the Departments they can run.
 */
async function resolveVendorLeaderViewer(
  session: PartnerFacilitySession,
  deps: Partial<DashboardViewerDeps>,
  lens: DashboardLensRequest,
): Promise<DashboardViewerResolution> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const facilityId = session.facilityId;
  const [facilityTimezone, rows] = await Promise.all([
    loadFacilityTimezone(db, facilityId),
    db.department.findMany({
      where: { facilityId, isActive: true },
      select: { id: true, key: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  if (rows.length === 0) return { kind: "not_eligible", reason: "SESSION_KIND" };

  const access = await resolveDepartmentAccessMap(db, session, {
    facilityId,
    departmentIds: rows.map((row) => row.id),
    now,
  });
  const selected = selectPartnerDashboardDepartments(rows, access);
  if (!selected) return { kind: "not_eligible", reason: "SESSION_KIND" };

  const departmentAccess: Record<string, DashboardViewer["departmentAccess"][string]> = {};
  const operators: Record<string, DashboardViewer["operators"][string]> = {};
  for (const department of selected.departments) {
    const item = access.get(department.id)!;
    departmentAccess[department.id] = "MANAGE";
    operators[department.id] = {
      operatingModel: item.operatingModel === "CONTRACTED" ? "VENDOR_RUN" : "SELF_OPERATED",
      operatorName: item.operatingModel === "CONTRACTED" ? item.operatorName : null,
      vendorHeadAccepted: item.operatingModel === "CONTRACTED" && item.vendorHeadAccepted,
    };
  }
  const available = selected.departments.map((department) => ({
    kind: "DEPARTMENT" as const,
    departmentId: department.id,
  }));
  const defaultScope = available[0] ?? null;
  if (!defaultScope) return { kind: "not_eligible", reason: "SESSION_KIND" };
  const names = new Map(selected.departments.map((department) => [department.id, department.name]));
  const picked = applyDashboardLens(lens, available, defaultScope, names);
  return {
    kind: "viewer",
    viewer: {
      facilityId,
      facilityTimezone,
      serviceDate: toServiceDateKey(getFacilityServiceDate(facilityTimezone, now)),
      session,
      role: selected.role,
      authority: selected.authority,
      employeeId: null,
      layoutOwner: { kind: "USER", userId: session.uid },
      ledDepartmentIds:
        selected.authority === "DEPARTMENT_LEADER" ? selected.departments.map((department) => department.id) : [],
      departments: selected.departments,
      scopeDepartmentIds: selected.departments.map((department) => department.id),
      departmentAccess,
      operators,
      scope: picked.scope,
      availableScopes: available,
      notices: picked.notice ? [picked.notice] : [],
      canCustomize: true,
      routeFlags: deps.routeFlags ?? currentDashboardRouteFlags(),
    },
  };
}

/**
 * Who is looking, what they may see, and in which scope. Scope comes only from here:
 * the sidebar cookie and `?scope=` can only pick among `availableScopes`.
 */
export async function resolveDashboardViewer(
  session: FacilitySession | PartnerFacilitySession,
  lens: DashboardLensRequest = {},
  deps: Partial<DashboardViewerDeps> = {},
): Promise<DashboardViewerResolution> {
  if (isPartnerFacilitySession(session)) {
    if (!isContractedDepartmentAuthorityEnabled()) {
      return { kind: "not_eligible", reason: "SESSION_KIND" };
    }
    return resolveVendorLeaderViewer(session, deps, lens);
  }
  if (!isFacilityScopedSession(session)) {
    return { kind: "not_eligible", reason: "SESSION_KIND" };
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    return { kind: "not_eligible", reason: "ROLE_BELOW_SUPERVISOR" };
  }

  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const resolveEmployeeId = deps.resolveEmployeeId ?? getOperationalEmployeeIdForSession;
  const facilityId = session.facilityId;

  const [facilityTimezone, catalog, plantRuntimeEnabled, employeeId] = await Promise.all([
    loadFacilityTimezone(db, facilityId),
    loadFacilityDepartmentAccessContext(db, facilityId),
    (deps.plantRuntimeEnabled ?? isPlantRuntimeEnabled)(facilityId, session),
    resolveEmployeeId(session),
  ]);

  const [employee, ledDepartmentIds] = employeeId
    ? await Promise.all([
        db.employee.findFirst({
          where: { id: employeeId, facilityId },
          select: { primaryDepartmentId: true },
        }),
        resolveLedDepartmentIds(db, { facilityId, employeeId }),
      ])
    : [null, [] as string[]];
  const primaryDepartmentId = employee?.primaryDepartmentId ?? session.primaryDepartmentId ?? null;

  const candidateDepartments = selectDashboardDepartments({
    authKind: session.authKind,
    catalog,
    plantRuntimeEnabled,
  });
  const candidateIds = new Set(candidateDepartments.map((department) => department.id));
  const authority = deriveDashboardAuthority({
    role: session.role,
    leadsDepartmentInScope: ledDepartmentIds.some((id) => candidateIds.has(id)),
  })!;
  const scoped = dashboardScopeCandidates({
    authority,
    candidates: candidateDepartments,
    ledDepartmentIds,
    primaryDepartmentId,
  });

  const access = await resolveDepartmentAccessMap(db, session, {
    facilityId,
    departmentIds: scoped.map((department) => department.id),
    now,
  });

  const teamDepartment = authority === "SUPERVISOR" ? scoped[0] : undefined;
  const teamScope = teamDepartment
    ? ((
        await resolveViewerTeamScopes({
          session,
          facilityId,
          departments: [{ id: teamDepartment.id, label: teamDepartment.name }],
          db,
          resolveEmployeeId: async () => employeeId,
        })
      ).get(teamDepartment.id) ?? null)
    : null;

  return deriveDashboardViewer({
    session,
    facilityTimezone,
    serviceDate: toServiceDateKey(getFacilityServiceDate(facilityTimezone, now)),
    employeeId,
    primaryDepartmentId,
    ledDepartmentIds,
    candidateDepartments,
    access,
    teamScope,
    routeFlags: deps.routeFlags ?? currentDashboardRouteFlags(),
    lens,
  });
}
