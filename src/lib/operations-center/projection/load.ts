/**
 * Wave 15J — Operations Center Projection loader + assembled dashboard.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { isProjectionOperationsCenterEnabled } from "@/lib/feature-flags";
import {
  resolveSessionProjection,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import { loadOperationsCenterDashboard } from "../load-operations-center-dashboard";
import type { OperationsCenterDashboardData } from "../types";

import {
  adaptProjectionToOperationsCenter,
  emptyOperationsCenterScope,
} from "./adapt-projection";
import {
  applyProjectedScopeToDashboard,
  filterCallDownsToProjectedUnits,
} from "./intersect";
import type { ProjectedOperationsCenterScope } from "./types";

export type LoadOperationsCenterProjectionOptions = Omit<
  LoadProjectedLocationOptions,
  "purpose" | "focus"
> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  activeDepartmentKey?: OperationalDepartmentKey | null;
};

export type AssembledOperationsCenter = {
  enabled: boolean;
  usedLegacy: boolean;
  scope: ProjectedOperationsCenterScope | null;
  data: OperationsCenterDashboardData | null;
  error: string | null;
};

/**
 * Load Projection eligibility for Operations Center (purpose OPERATIONS_CENTER).
 * Flag off → caller uses legacy path exclusively.
 */
export async function loadOperationsCenterProjection(
  session: AppJwtPayload,
  options: LoadOperationsCenterProjectionOptions = {},
): Promise<{
  enabled: boolean;
  scope: ProjectedOperationsCenterScope | null;
  usedLegacy: boolean;
  error: string | null;
  projectionDurationMs: number | null;
}> {
  if (!isProjectionOperationsCenterEnabled()) {
    return {
      enabled: false,
      scope: null,
      usedLegacy: true,
      error: null,
      projectionDurationMs: null,
    };
  }

  const facilityId = session.facilityId;
  if (!facilityId) {
    return {
      enabled: true,
      scope: null,
      usedLegacy: false,
      error: "Operations Center requires a facility session",
      projectionDurationMs: null,
    };
  }

  const started = Date.now();
  const resolved = await resolveSessionProjection(session, {
    ...options,
    purpose: "OPERATIONS_CENTER",
    lensOverride: options.lensOverride,
  });
  const projectionDurationMs = Date.now() - started;

  if (!resolved.ok || !resolved.runtime) {
    return {
      enabled: true,
      scope: emptyOperationsCenterScope(
        facilityId,
        resolved.error ?? "Projection failed",
      ),
      usedLegacy: false,
      error: resolved.error ?? "Projection failed",
      projectionDurationMs,
    };
  }

  const scope = adaptProjectionToOperationsCenter(resolved.runtime.snapshot, {
    projectionDurationMs,
    diagnostics: resolved.runtime.snapshot.diagnostics.issues,
  });

  return {
    enabled: true,
    scope,
    usedLegacy: false,
    error: scope.error,
    projectionDurationMs,
  };
}

/**
 * Assemble Operations Center within Projection eligibility only.
 * Never unions with legacy eligibility. Projection failure fails closed.
 */
export async function assembleProjectedOperationsCenter(
  session: AppJwtPayload,
  options: LoadOperationsCenterProjectionOptions = {},
): Promise<AssembledOperationsCenter> {
  const projection = await loadOperationsCenterProjection(session, options);

  if (!projection.enabled) {
    return {
      enabled: false,
      usedLegacy: true,
      scope: null,
      data: null,
      error: null,
    };
  }

  if (!projection.scope || projection.error) {
    return {
      enabled: true,
      usedLegacy: false,
      scope: projection.scope,
      data: null,
      error: projection.error ?? "Operations Center Projection unavailable",
    };
  }

  const scope = projection.scope;
  const facilityId = session.facilityId!;
  const queryStarted = Date.now();

  const activeDepartmentKey =
    scope.lensMode === "DEPARTMENT" ? scope.departmentKey : null;

  let data: OperationsCenterDashboardData;
  try {
    data = await loadOperationsCenterDashboard(facilityId, {
      activeDepartmentKey,
      projectedUnitIds: scope.projectedUnitIds,
      degradeReadinessOnFailure: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Operations Center load failed";
    return {
      enabled: true,
      usedLegacy: false,
      scope: {
        ...scope,
        error: message,
        diagnostics: [
          ...scope.diagnostics,
          {
            code: "PROJECTION_INVARIANT",
            severity: "ERROR",
            message,
          },
        ],
      },
      data: null,
      error: message,
    };
  }

  const dashboardQueryDurationMs = Date.now() - queryStarted;
  const compositionStarted = Date.now();

  // Safety intersection (call-downs still load facility-wide today).
  let assembled = applyProjectedScopeToDashboard(data, scope);
  if (assembled.callDowns) {
    const filtered = filterCallDownsToProjectedUnits(
      {
        items: assembled.callDowns.items,
        summary: assembled.callDowns.summary,
        dateIso: assembled.callDowns.dateIso,
      },
      scope.projectedUnitIds,
    );
    assembled = {
      ...assembled,
      callDowns: {
        items: filtered.items,
        summary: filtered.summary,
        dateIso: filtered.dateIso,
      },
    };
  }

  const compositionDurationMs = Date.now() - compositionStarted;
  const enrichedScope: ProjectedOperationsCenterScope = {
    ...scope,
    performance: {
      ...scope.performance,
      dashboardQueryDurationMs,
      readinessDurationMs: null,
      compositionDurationMs,
      domainRowCountsBeforeIntersection: null,
      domainRowCountsAfterIntersection: assembled.unitCards.length,
    },
  };

  return {
    enabled: true,
    usedLegacy: false,
    scope: enrichedScope,
    data: assembled,
    error: null,
  };
}
