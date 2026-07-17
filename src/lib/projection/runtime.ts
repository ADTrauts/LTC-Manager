/**
 * Wave 15D — Projection Runtime Service.
 *
 * Validate request → load ProjectionSource → execute Wave 15C pipeline →
 * return an immutable ProjectionSnapshot. Contains no Projection logic.
 */

import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";

import { loadProjectionSource, type ProjectionSourceLoadDb } from "./load-source";
import {
  createProjectionRuntimeMemo,
  type ProjectionRuntimeMemo,
} from "./memo";
import { resolveProjection } from "./pipeline";
import type { ProjectionSource } from "./source";
import type {
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionSnapshot,
} from "./types";
import { validateProjectionSnapshot } from "./validation";

export type ProjectionRuntimeMetrics = {
  loadDurationMs: number;
  pipelineDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
  areaCount: number;
  experienceCount: number;
  locationCount: number;
  actionableLocationCount: number;
  diagnosticsCount: number;
  snapshotBytesEstimate: number;
};

export type ProjectionRuntimeResult = {
  snapshot: ProjectionSnapshot;
  metrics: ProjectionRuntimeMetrics;
  sourceDiagnostics: readonly ProjectionDiagnostic[];
};

export type ResolveProjectionRuntimeOptions = {
  db?: ProjectionSourceLoadDb;
  /** Optional request-scoped memo shared across resolves in one request. */
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  /**
   * Optional preloaded source (tests / advanced callers).
   * When provided, the adapter load is skipped.
   */
  source?: ProjectionSource;
  /** Extra adapter diagnostics to merge when supplying a preloaded source. */
  sourceDiagnostics?: readonly ProjectionDiagnostic[];
  loadDurationMs?: number;
};

function emptySnapshot(
  request: ProjectionRequest,
  diagnostics: readonly ProjectionDiagnostic[],
  resolvedAt: string,
): ProjectionSnapshot {
  return Object.freeze({
    context: Object.freeze({
      identity: Object.freeze({
        key: `${request.facilityId}:empty:${request.purpose}:${request.accessClass.key}`,
        facilityId: request.facilityId,
        lensKey:
          request.lens.mode === "FACILITY"
            ? "facility"
            : `department:${request.lens.departmentId}:${request.lens.departmentKey}`,
        purpose: request.purpose,
        revision: Object.freeze({
          hierarchyRevision: "hierarchy:none",
          assignmentRevision: "assignments:none",
          profileRevision: "profiles:none",
          bindingRevision: "bindings:none",
          policyRevision: "policy:none",
          experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
          accessClassRevision: `access:${request.accessClass.key}`,
        }),
        focus: request.focus,
      }),
      request,
      builtAt: resolvedAt,
    }),
    metadata: Object.freeze({
      architectureWave: "15B",
      registryVersion: EXPERIENCE_REGISTRY_VERSION,
      notes: Object.freeze([
        "Wave 15D runtime fail-closed empty snapshot.",
      ] as const),
    }),
    areas: Object.freeze([]),
    experiences: Object.freeze([]),
    locations: Object.freeze({
      roots: Object.freeze([]),
      actionableIds: Object.freeze([]),
      byId: Object.freeze({}),
    }),
    queryScopes: Object.freeze({
      byExperience: Object.freeze({}),
      byDomain: Object.freeze({}),
    }),
    descriptors: Object.freeze([]),
    diagnostics: Object.freeze({
      issues: Object.freeze([...diagnostics]),
    }),
  });
}

function estimateSnapshotBytes(snapshot: ProjectionSnapshot): number {
  try {
    return JSON.stringify(snapshot).length;
  } catch {
    return 0;
  }
}

function validateRequest(
  request: ProjectionRequest,
): ProjectionDiagnostic[] {
  const issues: ProjectionDiagnostic[] = [];
  if (!request.facilityId?.trim()) {
    issues.push({
      code: "SOURCE_INVALID",
      severity: "ERROR",
      message: "ProjectionRequest.facilityId is required",
      path: "request.facilityId",
    });
  }
  if (request.lens.mode === "DEPARTMENT") {
    if (!request.lens.departmentId?.trim() || !request.lens.departmentKey?.trim()) {
      issues.push({
        code: "UNKNOWN_DEPARTMENT",
        severity: "ERROR",
        message: "Department lens requires departmentId and departmentKey",
        path: "request.lens",
      });
    }
  }
  if (!request.accessClass?.key?.trim()) {
    issues.push({
      code: "SOURCE_INVALID",
      severity: "ERROR",
      message: "ProjectionRequest.accessClass.key is required",
      path: "request.accessClass.key",
    });
  }
  if (
    request.focus &&
    request.focus.facilityId &&
    request.focus.facilityId !== request.facilityId
  ) {
    issues.push({
      code: "SOURCE_INVALID",
      severity: "ERROR",
      message: "Focus facilityId must match request facilityId",
      path: "request.focus.facilityId",
    });
  }
  return issues;
}

function mergeDiagnostics(
  snapshot: ProjectionSnapshot,
  extras: readonly ProjectionDiagnostic[],
): ProjectionSnapshot {
  if (extras.length === 0) return snapshot;
  return Object.freeze({
    ...snapshot,
    diagnostics: Object.freeze({
      issues: Object.freeze([...extras, ...snapshot.diagnostics.issues]),
    }),
  });
}

function buildMetrics(input: {
  loadDurationMs: number;
  pipelineDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
  snapshot: ProjectionSnapshot;
}): ProjectionRuntimeMetrics {
  return {
    loadDurationMs: input.loadDurationMs,
    pipelineDurationMs: input.pipelineDurationMs,
    validationDurationMs: input.validationDurationMs,
    totalDurationMs: input.totalDurationMs,
    areaCount: input.snapshot.areas.length,
    experienceCount: input.snapshot.experiences.length,
    locationCount: Object.keys(input.snapshot.locations.byId).length,
    actionableLocationCount: input.snapshot.locations.actionableIds.length,
    diagnosticsCount: input.snapshot.diagnostics.issues.length,
    snapshotBytesEstimate: estimateSnapshotBytes(input.snapshot),
  };
}

/**
 * Structured runtime diagnostics for operators/logs — not user analytics.
 */
export function formatProjectionRuntimeLog(
  result: ProjectionRuntimeResult,
): Record<string, number | string> {
  return {
    event: "projection.runtime.resolve",
    facilityId: result.snapshot.context.identity.facilityId,
    lensKey: result.snapshot.context.identity.lensKey,
    purpose: result.snapshot.context.request.purpose,
    loadDurationMs: Number(result.metrics.loadDurationMs.toFixed(3)),
    pipelineDurationMs: Number(result.metrics.pipelineDurationMs.toFixed(3)),
    validationDurationMs: Number(
      result.metrics.validationDurationMs.toFixed(3),
    ),
    totalDurationMs: Number(result.metrics.totalDurationMs.toFixed(3)),
    areaCount: result.metrics.areaCount,
    experienceCount: result.metrics.experienceCount,
    locationCount: result.metrics.locationCount,
    actionableLocationCount: result.metrics.actionableLocationCount,
    diagnosticsCount: result.metrics.diagnosticsCount,
    snapshotBytesEstimate: result.metrics.snapshotBytesEstimate,
  };
}

async function resolveProjectionRuntimeUncached(
  request: ProjectionRequest,
  options: ResolveProjectionRuntimeOptions = {},
): Promise<ProjectionRuntimeResult> {
  const totalStarted = performance.now();
  const requestIssues = validateRequest(request);
  const resolvedAt = request.asOf ?? new Date().toISOString();

  if (requestIssues.some((issue) => issue.severity === "ERROR")) {
    const snapshot = emptySnapshot(request, requestIssues, resolvedAt);
    const metrics = buildMetrics({
      loadDurationMs: 0,
      pipelineDurationMs: 0,
      validationDurationMs: 0,
      totalDurationMs: performance.now() - totalStarted,
      snapshot,
    });
    return { snapshot, metrics, sourceDiagnostics: requestIssues };
  }

  let source = options.source ?? null;
  let sourceDiagnostics = [...(options.sourceDiagnostics ?? [])];
  let loadDurationMs = options.loadDurationMs ?? 0;

  if (!source) {
    const loaded = await loadProjectionSource(request, options.db);
    loadDurationMs = loaded.loadDurationMs;
    sourceDiagnostics = [...loaded.diagnostics];
    source = loaded.source;
  }

  if (!source) {
    const snapshot = emptySnapshot(
      request,
      [...requestIssues, ...sourceDiagnostics],
      resolvedAt,
    );
    return {
      snapshot,
      metrics: buildMetrics({
        loadDurationMs,
        pipelineDurationMs: 0,
        validationDurationMs: 0,
        totalDurationMs: performance.now() - totalStarted,
        snapshot,
      }),
      sourceDiagnostics,
    };
  }

  // Hard fail-closed adapter errors must not broaden via a partial graph.
  const blocking = sourceDiagnostics.filter(
    (issue) =>
      issue.severity === "ERROR" &&
      (issue.code === "SOURCE_INVALID" ||
        issue.code === "UNKNOWN_DEPARTMENT" ||
        issue.code === "INACTIVE_DEPARTMENT"),
  );
  if (blocking.length > 0 && request.lens.mode === "DEPARTMENT") {
    const unknownLens = blocking.some(
      (issue) =>
        issue.code === "UNKNOWN_DEPARTMENT" ||
        issue.code === "INACTIVE_DEPARTMENT",
    );
    if (unknownLens) {
      const snapshot = emptySnapshot(
        request,
        [...requestIssues, ...sourceDiagnostics],
        source.resolvedAt,
      );
      return {
        snapshot,
        metrics: buildMetrics({
          loadDurationMs,
          pipelineDurationMs: 0,
          validationDurationMs: 0,
          totalDurationMs: performance.now() - totalStarted,
          snapshot,
        }),
        sourceDiagnostics,
      };
    }
  }

  const pipelineStarted = performance.now();
  let snapshot = resolveProjection(source);
  const pipelineDurationMs = performance.now() - pipelineStarted;

  snapshot = mergeDiagnostics(snapshot, [
    ...requestIssues,
    ...sourceDiagnostics,
  ]);

  const validationStarted = performance.now();
  const validationIssues = validateProjectionSnapshot(snapshot);
  const validationDurationMs = performance.now() - validationStarted;

  if (validationIssues.length > 0) {
    snapshot = emptySnapshot(
      request,
      [
        ...requestIssues,
        ...sourceDiagnostics,
        ...validationIssues,
        {
          code: "PROJECTION_INVARIANT",
          severity: "ERROR",
          message: "Projection snapshot failed post-pipeline validation",
          path: "snapshot",
        },
      ],
      source.resolvedAt,
    );
  }

  const metrics = buildMetrics({
    loadDurationMs,
    pipelineDurationMs,
    validationDurationMs,
    totalDurationMs: performance.now() - totalStarted,
    snapshot,
  });

  return {
    snapshot,
    metrics,
    sourceDiagnostics,
  };
}

/**
 * Single Projection Runtime entrypoint.
 */
export async function resolveProjectionRuntime(
  request: ProjectionRequest,
  options: ResolveProjectionRuntimeOptions = {},
): Promise<ProjectionRuntimeResult> {
  if (options.memo) {
    return options.memo.getOrCreate(request, () =>
      resolveProjectionRuntimeUncached(request, options),
    );
  }
  return resolveProjectionRuntimeUncached(request, options);
}

export function createProjectionRuntimeRequestScope() {
  return createProjectionRuntimeMemo<ProjectionRuntimeResult>();
}
