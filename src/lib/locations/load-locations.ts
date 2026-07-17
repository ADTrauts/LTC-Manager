/**
 * Wave 15F — Locations Experience loader.
 *
 * One Projection Runtime call (purpose LOCATIONS). No legacy eligibility pass.
 * Fail closed: Projection failure yields an empty view — never broadens.
 */

import { cookies } from "next/headers";

import type { AppJwtPayload } from "@/lib/auth";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getEmployeeAllowedUnitIdSet } from "@/lib/employee-units";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import {
  buildDepartmentLens,
  buildFacilityLens,
  buildProjectionRequest,
  createProjectionRuntimeRequestScope,
  permissionKeysForRoleBand,
  resolveProjectionRuntime,
  type ProjectionRuntimeMemo,
  type ProjectionRuntimeResult,
  type ProjectionSourceLoadDb,
} from "@/lib/projection";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import { adaptProjectionToLocationsView } from "./adapt-projection";
import type { LocationsViewModel } from "./types";

export type LoadLocationsViewOptions = {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  /** Test override — skip cookie/department resolution. */
  lensOverride?:
    | { mode: "FACILITY" }
    | {
        mode: "DEPARTMENT";
        departmentId: string;
        departmentKey: "DIETARY" | "EVS" | "PLANT";
      };
  /** Test override for principal unit access. */
  allowedUnitIdsOverride?: readonly string[] | "ALL";
  lockedUnitIdOverride?: string | null;
};

export type LoadLocationsViewResult = {
  enabled: boolean;
  view: LocationsViewModel | null;
  /** Empty when Projection failed closed or flag disabled. */
  projectedUnitIds: readonly string[];
  error: string | null;
  metrics: {
    totalDurationMs: number;
    locationCount: number;
    actionableLocationCount: number;
  } | null;
};

function emptyFailClosed(
  facilityId: string,
  error: string,
): LoadLocationsViewResult {
  return {
    enabled: true,
    view: {
      facilityId,
      purpose: "LOCATIONS",
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
    },
    projectedUnitIds: [],
    error,
    metrics: null,
  };
}

async function resolvePrincipalAccess(
  session: AppJwtPayload,
  overrides: LoadLocationsViewOptions,
): Promise<{
  allowedUnitIds: readonly string[] | "ALL";
  lockedUnitId?: string;
  principalKind: "USER" | "EMPLOYEE";
}> {
  if (overrides.allowedUnitIdsOverride !== undefined) {
    return {
      allowedUnitIds: overrides.allowedUnitIdsOverride,
      lockedUnitId: overrides.lockedUnitIdOverride ?? undefined,
      principalKind:
        session.authKind === "employee" ? "EMPLOYEE" : "USER",
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
    } else if (session.activeUnitId) {
      // PIN sessions may still carry an active unit without device lock.
      lockedUnitId = undefined;
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
 * Load the Locations Experience from Projection Runtime.
 * Single resolve; reuses request-scoped memoization when provided.
 */
export async function loadLocationsView(
  session: AppJwtPayload,
  options: LoadLocationsViewOptions = {},
): Promise<LoadLocationsViewResult> {
  if (!isProjectionLocationsEnabled()) {
    return {
      enabled: false,
      view: null,
      projectedUnitIds: [],
      error: null,
      metrics: null,
    };
  }

  const facilityId = session.facilityId;
  if (!facilityId) {
    return emptyFailClosed("", "Locations requires a facility session");
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
        return emptyFailClosed(
          facilityId,
          "Locations requires an active department lens or Facility Overview",
        );
      }
    }

    const request = buildProjectionRequest({
      facilityId,
      lens,
      purpose: "LOCATIONS",
      principal: {
        principalKind: access.principalKind,
        role: session.role,
        allowedUnitIds: access.allowedUnitIds,
        lockedUnitId: access.lockedUnitId,
        permissionKeys: permissionKeysForRoleBand(session.role),
      },
    });

    const memo =
      options.memo ?? createProjectionRuntimeRequestScope();

    const result = await resolveProjectionRuntime(request, {
      db: options.db,
      memo,
    });

    const view = adaptProjectionToLocationsView(result.snapshot);

    return {
      enabled: true,
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
      err instanceof Error ? err.message : "Locations Projection failed";
    return emptyFailClosed(facilityId, message);
  }
}
