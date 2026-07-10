export type {
  ReadinessBatchResult,
  ReadinessReasonCode,
  ReadinessState,
  ReadinessSummary,
  UnitReadiness,
  UnitReadinessSignals,
} from "./types";
export {
  evaluateBlockedRules,
  evaluateInProgressRules,
  requiresStaffingCoverage,
  resolveReadinessReason,
  type BlockedRuleEvaluation,
} from "./blocked-rules";
export {
  computeUnitReadiness,
  summarizeReadiness,
  type UnitReadinessSignalInput,
} from "./compute-unit-readiness";
export { computeReadinessBatch, type ComputeReadinessBatchInput } from "./compute-readiness-batch";
export { buildSitePulseFromReadinessSummary } from "./build-site-pulse";
export { loadUnitReadinessBatch } from "./load-unit-readiness-batch";
export {
  resolveReadinessProfile,
  resolveUnitProfileKey,
  dietaryReadinessProfile,
  evsReadinessProfile,
  plantReadinessProfile,
  neutralReadinessProfile,
} from "./profiles";
export { computeMealScopedLogCounts } from "./meal-scoped-log-counts";

/** User-facing label for internal readiness state. Internal `blocked` maps to Needs Attention. */
export function readinessStateDisplayLabel(state: import("./types").ReadinessState): string {
  if (state === "blocked") return "Needs Attention";
  if (state === "in_progress") return "In Progress";
  return "Ready";
}
