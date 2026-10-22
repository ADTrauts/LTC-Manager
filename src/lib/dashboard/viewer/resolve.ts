import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import {
  isFacilityScopedSession,
  isPartnerFacilitySession,
  type FacilitySession,
  type PartnerFacilitySession,
} from "@/lib/auth";
import { resolveDepartmentAccessMap, resolveLedDepartmentIds } from "@/lib/department-authority";
import { loadFacilityDepartmentAccessContext } from "@/lib/department-products/load-facility-catalog";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import {
  isCanonicalLogsEnabled,
  isContractedDepartmentAuthorityEnabled,
  isDashboardV2Enabled,
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import type { RouteFeatureFlags } from "@/lib/route-registry/authorize";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { resolveViewerTeamScopes } from "@/lib/todays-work/viewer-team-scope";

import {
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
    todaysWorkEnabled: isTodaysWorkEnabled(),
    dietaryOperationalEvidenceEnabled: isDietaryOperationalEvidenceEnabled() || canonicalLogsEnabled,
    dietaryWorkPlansEnabled: isDietaryWorkPlansEnabled(),
    canonicalLogsEnabled,
    dashboardV2Enabled: isDashboardV2Enabled(),
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
 * An accepted vendor head is a Department leader for the Departments they run.
 * Anyone else on a partner session stays off the Department leader Dashboard.
 */
async function resolveVendorLeaderViewer(
  session: PartnerFacilitySession,
  deps: Partial<DashboardViewerDeps>,
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
  const led = rows.filter((row) => {
    const item = access.get(row.id);
    return item?.isHead === true && item.mode === "MANAGE";
  });
  if (led.length === 0) return { kind: "not_eligible", reason: "SESSION_KIND" };

  const departmentAccess: Record<string, DashboardViewer["departmentAccess"][string]> = {};
  const operators: Record<string, DashboardViewer["operators"][string]> = {};
  for (const department of led) {
    const item = access.get(department.id)!;
    departmentAccess[department.id] = "MANAGE";
    operators[department.id] = {
      operatingModel: item.operatingModel === "CONTRACTED" ? "VENDOR_RUN" : "SELF_OPERATED",
      operatorName: item.operatingModel === "CONTRACTED" ? item.operatorName : null,
      vendorHeadAccepted: item.operatingModel === "CONTRACTED" && item.vendorHeadAccepted,
    };
  }
  const available = led.map((department) => ({ kind: "DEPARTMENT" as const, departmentId: department.id }));
  return {
    kind: "viewer",
    viewer: {
      facilityId,
      facilityTimezone,
      serviceDate: toServiceDateKey(getFacilityServiceDate(facilityTimezone, now)),
      session,
      role: "GM",
      authority: "DEPARTMENT_LEADER",
      employeeId: null,
      layoutOwner: { kind: "USER", userId: session.uid },
      ledDepartmentIds: led.map((department) => department.id),
      departments: led,
      scopeDepartmentIds: led.map((department) => department.id),
      departmentAccess,
      operators,
      scope: available[0] ?? null,
      availableScopes: available,
      notices: [],
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
    return resolveVendorLeaderViewer(session, deps);
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
