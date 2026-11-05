/**
 * Wave 15E — Shadow parity comparison (report only).
 */

import type {
  ShadowEligibilityView,
  ShadowMismatch,
  ShadowParityMetrics,
  ShadowParityReport,
  ShadowSeverity,
} from "./types";

function estimateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function mismatch(
  kind: ShadowMismatch["kind"],
  severity: ShadowSeverity,
  path: string,
  message: string,
  legacyValue?: string,
  projectionValue?: string,
): ShadowMismatch {
  return { kind, severity, path, message, legacyValue, projectionValue };
}

function setDiff(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const missing = left.filter((value) => !rightSet.has(value));
  const extra = right.filter((value) => !leftSet.has(value));
  return { missing, extra };
}

function isSuperset(candidate: readonly string[], baseline: readonly string[]) {
  const set = new Set(candidate);
  return baseline.every((value) => set.has(value)) && candidate.length > baseline.length;
}

export function compareShadowViews(
  legacy: ShadowEligibilityView,
  projection: ShadowEligibilityView,
  timings?: {
    legacyDurationMs?: number;
    projectionDurationMs?: number;
    comparisonStartedAt?: number;
  },
): ShadowParityReport {
  const comparisonStarted = timings?.comparisonStartedAt ?? performance.now();
  const mismatches: ShadowMismatch[] = [];
  let comparedSlotCount = 0;
  let matchedSlotCount = 0;

  function observeEqual(path: string, left: string, right: string, kind: ShadowMismatch["kind"]) {
    comparedSlotCount += 1;
    if (left === right) {
      matchedSlotCount += 1;
      return;
    }
    mismatches.push(
      mismatch(kind, "WARNING", path, `${path} differs`, left, right),
    );
  }

  observeEqual(
    "facilityId",
    legacy.facilityId,
    projection.facilityId,
    "UNKNOWN_DIFFERENCE",
  );
  observeEqual(
    "lensKey",
    legacy.lensKey,
    projection.lensKey,
    "DEPARTMENT_LENS_MISMATCH",
  );

  comparedSlotCount += 1;
  const deptDiff = setDiff(legacy.departmentKeys, projection.departmentKeys);
  if (deptDiff.missing.length === 0 && deptDiff.extra.length === 0) {
    matchedSlotCount += 1;
  } else {
    mismatches.push(
      mismatch(
        "DEPARTMENT_LENS_MISMATCH",
        "ERROR",
        "departmentKeys",
        "Department lens composition differs",
        legacy.departmentKeys.join(","),
        projection.departmentKeys.join(","),
      ),
    );
  }

  const locationDiff = setDiff(legacy.locationIds, projection.locationIds);
  comparedSlotCount += legacy.locationIds.length + projection.locationIds.length;
  matchedSlotCount +=
    legacy.locationIds.length +
    projection.locationIds.length -
    locationDiff.missing.length -
    locationDiff.extra.length;
  for (const id of locationDiff.missing) {
    mismatches.push(
      mismatch(
        "MISSING_LOCATION",
        "WARNING",
        `locations.${id}`,
        "Location present in legacy but missing from Projection",
        id,
      ),
    );
  }
  for (const id of locationDiff.extra) {
    mismatches.push(
      mismatch(
        "EXTRA_LOCATION",
        "ERROR",
        `locations.${id}`,
        "Location present in Projection but missing from legacy (broader)",
        undefined,
        id,
      ),
    );
  }

  const roomDiff = setDiff(legacy.roomIds, projection.roomIds);
  comparedSlotCount += legacy.roomIds.length + projection.roomIds.length;
  matchedSlotCount +=
    legacy.roomIds.length +
    projection.roomIds.length -
    roomDiff.missing.length -
    roomDiff.extra.length;
  for (const id of roomDiff.missing) {
    mismatches.push(
      mismatch(
        "MISSING_ROOM",
        "WARNING",
        `rooms.${id}`,
        "Room actionable in legacy but not in Projection",
        id,
      ),
    );
  }
  for (const id of roomDiff.extra) {
    mismatches.push(
      mismatch(
        "EXTRA_ROOM",
        "ERROR",
        `rooms.${id}`,
        "Room actionable in Projection but not in legacy (broader)",
        undefined,
        id,
      ),
    );
  }


  comparedSlotCount += 2;
  if (legacy.plantApplied === projection.plantApplied) {
    matchedSlotCount += 1;
  } else {
    mismatches.push(
      mismatch(
        "PLANT_MISMATCH",
        "WARNING",
        "plantApplied",
        "Plant policy application differs (often expected before cutover)",
        String(legacy.plantApplied),
        String(projection.plantApplied),
      ),
    );
  }
  const plantDiff = setDiff(
    legacy.plantCoveredLocationIds,
    projection.plantCoveredLocationIds,
  );
  if (plantDiff.missing.length === 0 && plantDiff.extra.length === 0) {
    matchedSlotCount += 1;
  } else {
    mismatches.push(
      mismatch(
        "PLANT_MISMATCH",
        "WARNING",
        "plantCoveredLocationIds",
        "Plant coverage differs",
        legacy.plantCoveredLocationIds.join(","),
        projection.plantCoveredLocationIds.join(","),
      ),
    );
  }

  if (legacy.revisionTokens.length > 0 || projection.revisionTokens.length > 0) {
    comparedSlotCount += 1;
    const revisionDiff = setDiff(legacy.revisionTokens, projection.revisionTokens);
    if (revisionDiff.missing.length === 0 && revisionDiff.extra.length === 0) {
      matchedSlotCount += 1;
    } else {
      mismatches.push(
        mismatch(
          "REVISION_MISMATCH",
          "INFO",
          "revisionTokens",
          "Revision tokens differ",
          legacy.revisionTokens.join("|"),
          projection.revisionTokens.join("|"),
        ),
      );
    }
  }

  if (mismatches.length === 0 && comparedSlotCount === 0) {
    mismatches.push(
      mismatch(
        "UNKNOWN_DIFFERENCE",
        "INFO",
        "comparison",
        "No comparable slots were observed",
      ),
    );
  }

  const bySeverity: Record<ShadowSeverity, number> = {
    INFO: 0,
    WARNING: 0,
    ERROR: 0,
    CRITICAL: 0,
  };
  const byKind: Record<string, number> = {};
  for (const entry of mismatches) {
    bySeverity[entry.severity] += 1;
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
  }

  const safeCompared = Math.max(comparedSlotCount, 1);
  const parityPercent = Number(
    ((matchedSlotCount / safeCompared) * 100).toFixed(2),
  );

  const metrics: ShadowParityMetrics = {
    legacyDurationMs: timings?.legacyDurationMs ?? 0,
    projectionDurationMs: timings?.projectionDurationMs ?? 0,
    comparisonDurationMs: performance.now() - comparisonStarted,
    totalDurationMs:
      (timings?.legacyDurationMs ?? 0) +
      (timings?.projectionDurationMs ?? 0) +
      (performance.now() - comparisonStarted),
    legacyViewBytesEstimate: estimateBytes(legacy),
    projectionSnapshotBytesEstimate: estimateBytes(projection),
    comparedSlotCount,
    matchedSlotCount,
    mismatchCount: mismatches.length,
    parityPercent,
    bySeverity,
    byKind,
  };

  const ok =
    bySeverity.CRITICAL === 0 &&
    bySeverity.ERROR === 0;

  return {
    ok,
    metrics,
    mismatches,
    legacy,
    projection,
  };
}
