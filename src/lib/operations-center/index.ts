export { getTodayWindow, type TodayWindow } from "./get-today-window";
export { buildDashboardAggregates } from "./build-dashboard-aggregates";
export { loadDashboardQueries, type DashboardQueryResult } from "./load-dashboard-queries";
export {
  loadOperationsCenterDashboard,
  type LoadOperationsCenterDashboardOptions,
} from "./load-operations-center-dashboard";
export { getOperationsCenterCardOrder, OPERATIONS_CENTER_CARD_IDS, type OperationsCenterCardId } from "./card-registry";
export {
  computeSitePulse,
  classifyUnitPulseStatus,
  type LocationPulseBucket,
} from "./compute-site-pulse";
export { resolveOperationContext } from "./resolve-operation-context";
export { fmtMealLabel } from "./fmt-meal-label";
export type {
  OperationsCenterBirthdayEmployee,
  OperationsCenterDashboardData,
  OperationsCenterLogTotals,
  OperationsCenterMealBoard,
  OperationsCenterMealBoardRow,
  OperationsCenterUnitCard,
  OperationsCenterUnitMealTime,
  OperationContext,
  SitePulseSummary,
} from "./types";

/**
 * Pure Projection adapters only — never re-export `./projection/load` here.
 * That module uses session Projection (`next/headers`) and must stay off the
 * client graph (Business Workspace customize imports this barrel).
 */
export {
  adaptProjectionToOperationsCenter,
  applyProjectedScopeToDashboard,
  contributionKindsFromContracts,
  emptyOperationsCenterScope,
  filterCallDownsToProjectedUnits,
  intersectDashboardQueriesToProjectedUnits,
  resolveEligibleOcCards,
  type OcContributionKind,
  type OcDepartmentSection,
  type OcExperienceContributor,
  type ProjectedOperationsCenterScope,
} from "./projection";
