/**
 * Wave 15G — Shared projected-location eligibility load.
 *
 * ProjectionSnapshot → LocationsViewModel (shared tree).
 * Locations (15F) and Sidebar (15G) both consume this; purpose differs for memo keys.
 */

import { cookies } from "next/headers";

import type { AppJwtPayload } from "@/lib/auth";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getEmployeeAllowedUnitIdSet } from "@/lib/employee-units";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import {
  buildDepartmentLens,
  buildFacilityLens,
  buildProjectionRequest,
  createProjectionRuntimeRequestScope,
  permissionKeysForRoleBand,
  resolveProjectionRuntime,
  type ProjectionPurpose,
  type ProjectionRuntimeMemo,
  type ProjectionRuntimeResult,
  type ProjectionSourceLoadDb,
} from "@/lib/projection";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import { adaptProjectionToLocationsView } from "./adapt-projection";
import type { LocationsViewModel } from "./types";

export type LoadProjectedLocationOptions = {
  purpose: ProjectionPurpose;
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  lensOverride?:
    | { mode: "FACILITY" }
    | {
        mode: "DEPARTMENT";
        departmentId: string;
        departmentKey: "DIETARY" | "EVS" | "PLANT";
      };
  allowedUnitIdsOverride?: readonly string[] | "ALL";
  lockedUnitIdOverride?: string | null;
};

export type LoadProjectedLocationResult = {
  view: LocationsViewModel;
  projectedUnitIds: readonly string[];
  error: string | null;
  metrics: {
    totalDurationMs: number;
    locationCount: number;
    actionableLocationCount: number;
  } | null;
};

export function emptyProjectedLocationView(
  facilityId: string,
  purpose: ProjectionPurpose,
  error: string,
): LocationsViewModel {
  return {
    facilityId,
    purpose,
    lensMode: "DEPARTMENT",
    lensKey: "fail-closed",
    departmentKey: null,
    revision: {
      hierarchyRevision: "none",
      assignmentRevision: "none",
      profileRevision: "none",
      bindingRevision: "none",
      policyRevision: "none",
      experienceRegistryVersion: 0,
      accessClassRevision: "none",
    },
    departmentSnapshots: [],
    projectedUnitIds: [],
    diagnostics: [
      {
        code: "PROJECTION_INVARIANT",
        severity: "ERROR",
        message: error,
      },
    ],
  };
}

async function resolvePrincipalAccess(
  session: AppJwtPayload,
  overrides: LoadProjectedLocationOptions,
): Promise<{
  allowedUnitIds: readonly string[] | "ALL";
  lockedUnitId?: string;
  principalKind: "USER" | "EMPLOYEE";
}> {
  if (overrides.allowedUnitIdsOverride !== undefined) {
    return {
      allowedUnitIds: overrides.allowedUnitIdsOverride,
      lockedUnitId: overrides.lockedUnitIdOverride ?? undefined,
      principalKind: session.authKind === "employee" ? "EMPLOYEE" : "USER",
    };
  }

  let allowedUnitIds: readonly string[] | "ALL" = "ALL";
  let lockedUnitId: string | undefined;

  if (session.authKind === "employee") {
    const allowed = await getEmployeeAllowedUnitIdSet(session.uid);
    if (allowed !== null) {
      allowedUnitIds = [...allowed];
    }
    const cookieStore = await cookies();
    const deviceUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value;
    if (
      typeof deviceUnitId === "string" &&
      deviceUnitId.length > 0 &&
      session.activeUnitId === deviceUnitId
    ) {
      lockedUnitId = deviceUnitId;
      allowedUnitIds = [deviceUnitId];
    }
  } else {
    const empId = await getOperationalEmployeeIdForSession(session);
    if (empId) {
      const allowed = await getEmployeeAllowedUnitIdSet(empId);
      if (allowed !== null) {
        allowedUnitIds = [...allowed];
      }
    }
  }

  if (overrides.lockedUnitIdOverride !== undefined) {
    lockedUnitId = overrides.lockedUnitIdOverride ?? undefined;
  }

  return {
    allowedUnitIds,
    lockedUnitId,
    principalKind: session.authKind === "employee" ? "EMPLOYEE" : "USER",
  };
}

/**
 * One Projection Runtime resolve → shared LocationsViewModel tree.
 * Fail closed: never returns a broad legacy location set.
 */
export async function loadProjectedLocationView(
  session: AppJwtPayload,
  options: LoadProjectedLocationOptions,
): Promise<LoadProjectedLocationResult> {
  const facilityId = session.facilityId ?? "";
  const purpose = options.purpose;

  if (!facilityId) {
    const view = emptyProjectedLocationView("", purpose, "Projection requires a facility session");
    return { view, projectedUnitIds: [], error: view.diagnostics[0]?.message ?? "error", metrics: null };
  }

  try {
    const access = await resolvePrincipalAccess(session, options);

    let lens:
      | ReturnType<typeof buildFacilityLens>
      | ReturnType<typeof buildDepartmentLens>;

    if (options.lensOverride) {
      lens =
        options.lensOverride.mode === "FACILITY"
          ? buildFacilityLens()
          : buildDepartmentLens(
              options.lensOverride.departmentId,
              options.lensOverride.departmentKey,
            );
    } else {
      const cookieStore = await cookies();
      const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
      if (deptNav.showAllDepartmentNav) {
        lens = buildFacilityLens();
      } else if (
        deptNav.activeDepartmentId &&
        deptNav.activeOperationalDepartmentKey
      ) {
        lens = buildDepartmentLens(
          deptNav.activeDepartmentId,
          deptNav.activeOperationalDepartmentKey,
        );
      } else {
        const view = emptyProjectedLocationView(
          facilityId,
          purpose,
          "Projection requires an active department lens or Facility Overview",
        );
        return {
          view,
          projectedUnitIds: [],
          error: view.diagnostics[0]?.message ?? "error",
          metrics: null,
        };
      }
    }

    const request = buildProjectionRequest({
      facilityId,
      lens,
      purpose,
      principal: {
        principalKind: access.principalKind,
        role: session.role,
        allowedUnitIds: access.allowedUnitIds,
        lockedUnitId: access.lockedUnitId,
        permissionKeys: permissionKeysForRoleBand(session.role),
      },
    });

    const memo = options.memo ?? createProjectionRuntimeRequestScope();
    const result = await resolveProjectionRuntime(request, {
      db: options.db,
      memo,
    });

    const view = adaptProjectionToLocationsView(result.snapshot);
    return {
      view,
      projectedUnitIds: view.projectedUnitIds,
      error: null,
      metrics: {
        totalDurationMs: result.metrics.totalDurationMs,
        locationCount: result.metrics.locationCount,
        actionableLocationCount: result.metrics.actionableLocationCount,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Projection eligibility failed";
    const view = emptyProjectedLocationView(facilityId, purpose, message);
    return { view, projectedUnitIds: [], error: message, metrics: null };
  }
}
