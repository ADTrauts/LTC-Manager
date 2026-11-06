/**
 * Wave 15E — Projection Shadow runner.
 *
 * Runs Projection Runtime beside a legacy eligibility view and reports parity.
 * Never changes Projection, legacy loaders, or user-visible surfaces.
 */

import {
  resolveProjectionRuntime,
  type ProjectionRuntimeResult,
  type ResolveProjectionRuntimeOptions,
} from "../runtime";
import type { ProjectionRequest, ProjectionSnapshot } from "../types";

import {
  adaptLegacyEligibilityToShadowView,
  type LegacyShadowInput,
} from "./adapt-legacy";
import { adaptProjectionSnapshotToShadowView } from "./adapt-projection";
import { compareShadowViews } from "./compare";
import type { ShadowParityReport } from "./types";

export type { LegacyShadowInput, LegacyShadowRoom } from "./adapt-legacy";
export { adaptLegacyEligibilityToShadowView } from "./adapt-legacy";
export { adaptProjectionSnapshotToShadowView } from "./adapt-projection";
export { compareShadowViews } from "./compare";
export type {
  ShadowAreaView,
  ShadowEligibilityView,
  ShadowExperienceView,
  ShadowMismatch,
  ShadowMismatchKind,
  ShadowParityMetrics,
  ShadowParityReport,
  ShadowQueryScopeView,
  ShadowSeverity,
} from "./types";

export type RunProjectionShadowInput = {
  request: ProjectionRequest;
  legacy: LegacyShadowInput;
  runtimeOptions?: ResolveProjectionRuntimeOptions;
  /**
   * Optional precomputed Projection result (tests / harness).
   * When omitted, resolveProjectionRuntime is invoked.
   */
  projectionResult?: ProjectionRuntimeResult;
};

export type CompareProjectionSnapshotsInput = {
  legacySnapshot: ProjectionSnapshot;
  projectionSnapshot: ProjectionSnapshot;
  legacyDurationMs?: number;
  projectionDurationMs?: number;
};

export function formatShadowParityLog(
  report: ShadowParityReport,
): Record<string, number | string | boolean> {
  return {
    event: "projection.shadow.parity",
    ok: report.ok,
    facilityId: report.projection.facilityId,
    lensKey: report.projection.lensKey,
    parityPercent: report.metrics.parityPercent,
    mismatchCount: report.metrics.mismatchCount,
    criticalCount: report.metrics.bySeverity.CRITICAL,
    errorCount: report.metrics.bySeverity.ERROR,
    warningCount: report.metrics.bySeverity.WARNING,
    infoCount: report.metrics.bySeverity.INFO,
    legacyDurationMs: Number(report.metrics.legacyDurationMs.toFixed(3)),
    projectionDurationMs: Number(
      report.metrics.projectionDurationMs.toFixed(3),
    ),
    comparisonDurationMs: Number(
      report.metrics.comparisonDurationMs.toFixed(3),
    ),
    totalDurationMs: Number(report.metrics.totalDurationMs.toFixed(3)),
    legacyViewBytesEstimate: report.metrics.legacyViewBytesEstimate,
    projectionSnapshotBytesEstimate:
      report.metrics.projectionSnapshotBytesEstimate,
  };
}

/** Golden / snapshot-vs-snapshot parity (no I/O). */
export function compareProjectionSnapshotsForShadow(
  input: CompareProjectionSnapshotsInput,
): ShadowParityReport {
  const legacyStarted = performance.now();
  const legacy = adaptProjectionSnapshotToShadowView(input.legacySnapshot);
  const legacyDurationMs =
    input.legacyDurationMs ?? performance.now() - legacyStarted;

  const projectionStarted = performance.now();
  const projection = adaptProjectionSnapshotToShadowView(
    input.projectionSnapshot,
  );
  const projectionDurationMs =
    input.projectionDurationMs ?? performance.now() - projectionStarted;

  return compareShadowViews(legacy, projection, {
    legacyDurationMs,
    projectionDurationMs,
  });
}

/**
 * Execute Projection Runtime in shadow and compare against a legacy view.
 */
export async function runProjectionShadow(
  input: RunProjectionShadowInput,
): Promise<ShadowParityReport> {
  const legacyStarted = performance.now();
  const legacyView = adaptLegacyEligibilityToShadowView(input.legacy);
  const legacyDurationMs = performance.now() - legacyStarted;

  const projectionStarted = performance.now();
  const projectionResult =
    input.projectionResult ??
    (await resolveProjectionRuntime(input.request, input.runtimeOptions));
  const projectionDurationMs =
    input.projectionResult != null
      ? input.projectionResult.metrics.totalDurationMs
      : performance.now() - projectionStarted;

  const projectionView = adaptProjectionSnapshotToShadowView(
    projectionResult.snapshot,
  );

  return compareShadowViews(legacyView, projectionView, {
    legacyDurationMs,
    projectionDurationMs,
  });
}
