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

export {
  adaptProjectionToOperationsCenter,
  applyProjectedScopeToDashboard,
  assembleProjectedOperationsCenter,
  contributionKindsFromContracts,
  emptyOperationsCenterScope,
  filterCallDownsToProjectedUnits,
  intersectDashboardQueriesToProjectedUnits,
  loadOperationsCenterProjection,
  resolveEligibleOcCards,
  type AssembledOperationsCenter,
  type LoadOperationsCenterProjectionOptions,
  type OcContributionKind,
  type OcDepartmentSection,
  type OcExperienceContributor,
  type ProjectedOperationsCenterScope,
} from "./projection";
