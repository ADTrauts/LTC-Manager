/**
 * Shared session Projection resolve for Locations / Sidebar / Unit Workspace.
 *
 * Returns LocationsViewModel for place-entry consumers, or raw runtime via
 * `resolveSessionProjection` for Experience-driven surfaces.
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
  type ProjectionLocationReference,
  type ProjectionPurpose,
  type ProjectionRuntimeMemo,
  type ProjectionRuntimeResult,
  type ProjectionSourceLoadDb,
} from "@/lib/projection";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import { adaptProjectionToLocationsView } from "./adapt-projection";
import { enrichLocationsRoomDisplay } from "./enrich-room-display";
import type { LocationsViewModel } from "./types";

export type LoadProjectedLocationOptions = {
  purpose: ProjectionPurpose;
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  focus?: ProjectionLocationReference;
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

export type ResolveSessionProjectionResult =
  | {
      ok: true;
      runtime: ProjectionRuntimeResult;
      error: null;
    }
  | {
      ok: false;
      runtime: null;
      error: string;
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
 * One Projection Runtime resolve for the session (shared by Locations/Sidebar/UW).
 */
export async function resolveSessionProjection(
  session: AppJwtPayload,
  options: LoadProjectedLocationOptions,
): Promise<ResolveSessionProjectionResult> {
  const facilityId = session.facilityId ?? "";
  if (!facilityId) {
    return { ok: false, runtime: null, error: "Projection requires a facility session" };
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
        return {
          ok: false,
          runtime: null,
          error: "Projection requires an active department lens or Facility Overview",
        };
      }
    }

    const request = buildProjectionRequest({
      facilityId,
      lens,
      purpose: options.purpose,
      focus: options.focus,
      principal: {
        principalKind: access.principalKind,
        role: session.role,
        allowedUnitIds: access.allowedUnitIds,
        lockedUnitId: access.lockedUnitId,
        permissionKeys: permissionKeysForRoleBand(session.role),
      },
    });

    const memo = options.memo ?? createProjectionRuntimeRequestScope();
    const runtime = await resolveProjectionRuntime(request, {
      db: options.db,
      memo,
    });

    return { ok: true, runtime, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Projection eligibility failed";
    return { ok: false, runtime: null, error: message };
  }
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

  const resolved = await resolveSessionProjection(session, options);
  if (!resolved.ok || !resolved.runtime) {
    const view = emptyProjectedLocationView(
      facilityId,
      purpose,
      resolved.error ?? "Projection failed",
    );
    return {
      view,
      projectedUnitIds: [],
      error: resolved.error,
      metrics: null,
    };
  }

  const adapted = adaptProjectionToLocationsView(resolved.runtime.snapshot);
  const view = await enrichLocationsRoomDisplay(adapted);
  return {
    view,
    projectedUnitIds: view.projectedUnitIds,
    error: null,
    metrics: {
      totalDurationMs: resolved.runtime.metrics.totalDurationMs,
      locationCount: resolved.runtime.metrics.locationCount,
      actionableLocationCount: resolved.runtime.metrics.actionableLocationCount,
    },
  };
}
