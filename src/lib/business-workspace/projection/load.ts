/**
 * Wave 15K — Business Workspace Projection loader + assembled view.
 *
 * Server-only entry: depends on session Projection resolve (`next/headers`).
 * Do not re-export from `@/lib/business-workspace` — import this path from
 * Server Components only (client customize imports the barrel).
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { isProjectionBusinessWorkspaceEnabled } from "@/lib/feature-flags";
import {
  resolveSessionProjection,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import {
  loadBusinessWorkspace,
  type LoadBusinessWorkspaceInput,
} from "../load-business-workspace";
import type { BusinessWorkspaceView } from "../types";

import {
  adaptProjectionToBusinessWorkspace,
  emptyBusinessWorkspaceScope,
} from "./adapt-projection";
import {
  countWorkspaceInputRows,
  intersectInputsToProjectedScope,
  resolveProjectedCompositionConfig,
} from "./intersect";
import type { ProjectedBusinessWorkspaceScope } from "./types";

export type LoadBusinessWorkspaceProjectionOptions = Omit<
  LoadProjectedLocationOptions,
  "purpose" | "focus"
> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  activeDepartmentKey?: OperationalDepartmentKey | null;
};

export type AssembledBusinessWorkspace = {
  enabled: boolean;
  usedLegacy: boolean;
  scope: ProjectedBusinessWorkspaceScope | null;
  view: BusinessWorkspaceView | null;
  error: string | null;
};

/**
 * Resolve Projection eligibility for Business Workspace (purpose BUSINESS_WORKSPACE).
 */
export async function loadBusinessWorkspaceProjection(
  session: AppJwtPayload,
  options: LoadBusinessWorkspaceProjectionOptions = {},
): Promise<{
  enabled: boolean;
  scope: ProjectedBusinessWorkspaceScope | null;
  usedLegacy: boolean;
  error: string | null;
  projectionDurationMs: number | null;
}> {
  if (!isProjectionBusinessWorkspaceEnabled()) {
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
      error: "Business Workspace requires a facility session",
      projectionDurationMs: null,
    };
  }

  const started = Date.now();
  const resolved = await resolveSessionProjection(session, {
    ...options,
    purpose: "BUSINESS_WORKSPACE",
    lensOverride: options.lensOverride,
  });
  const projectionDurationMs = Date.now() - started;

  if (!resolved.ok || !resolved.runtime) {
    return {
      enabled: true,
      scope: emptyBusinessWorkspaceScope(
        facilityId,
        resolved.error ?? "Projection failed",
      ),
      usedLegacy: false,
      error: resolved.error ?? "Projection failed",
      projectionDurationMs,
    };
  }

  const scope = adaptProjectionToBusinessWorkspace(resolved.runtime.snapshot, {
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
 * Assemble Business Workspace within Projection eligibility only.
 * Never unions with legacy eligibility. Projection failure fails closed
 * (no broad facility input load).
 */
export async function assembleProjectedBusinessWorkspace(
  session: AppJwtPayload,
  workspaceInput: LoadBusinessWorkspaceInput,
  options: LoadBusinessWorkspaceProjectionOptions = {},
): Promise<AssembledBusinessWorkspace> {
  const projection = await loadBusinessWorkspaceProjection(session, options);

  if (!projection.enabled) {
    return {
      enabled: false,
      usedLegacy: true,
      scope: null,
      view: null,
      error: null,
    };
  }

  if (!projection.scope || projection.error) {
    return {
      enabled: true,
      usedLegacy: false,
      scope: projection.scope,
      view: null,
      error: projection.error ?? "Business Workspace Projection unavailable",
    };
  }

  const scope = projection.scope;
  const config = resolveProjectedCompositionConfig(scope);
  const liveStarted = Date.now();

  let view: BusinessWorkspaceView | null;
  try {
    view = await loadBusinessWorkspace({
      ...workspaceInput,
      projectedScope: scope,
      projectedCompositionConfig: config,
      // Do not fall through to legacy scopeInputsForContext.
      skipLegacyScope: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Business Workspace load failed";
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
      view: null,
      error: message,
    };
  }

  const liveInputDurationMs = Date.now() - liveStarted;

  if (!view) {
    return {
      enabled: true,
      usedLegacy: false,
      scope,
      view: null,
      error: "Business Workspace denied for this role",
    };
  }

  return {
    enabled: true,
    usedLegacy: false,
    scope: {
      ...scope,
      performance: {
        ...scope.performance,
        liveInputDurationMs,
        compositionDurationMs: null,
        domainRowCountsBeforeIntersection: null,
        domainRowCountsAfterIntersection: null,
      },
    },
    view,
    error: null,
  };
}

/** Re-export intersect helpers for tests / advanced callers. */
export {
  countWorkspaceInputRows,
  intersectInputsToProjectedScope,
  resolveProjectedCompositionConfig,
};
