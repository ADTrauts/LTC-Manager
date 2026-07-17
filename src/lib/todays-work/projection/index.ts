/**
 * Wave 15I — Today's Work Projection cutover.
 */

export type {
  TodaysWorkActionEntry,
  TodaysWorkAreaContributor,
  TodaysWorkExperienceContributor,
  TodaysWorkProjectionSection,
  TodaysWorkProjectionView,
  TodaysWorkToolEntry,
} from "./types";

export { adaptProjectionToTodaysWork } from "./adapt-projection";

export {
  assembleExperienceWalkContributions,
  filterCallDownsToProjectedUnits,
  filterCoverageToProjectedUnits,
  filterHandoffsToProjectedUnits,
  filterWalkListToProjectedUnits,
  type ExperienceWalkContribution,
} from "./assemble";

export {
  assembleProjectedTodaysWorkCoverage,
  assembleProjectedTodaysWorkHandoffs,
  assembleProjectedTodaysWorkHub,
  assembleProjectedTodaysWorkWalk,
  loadTodaysWorkProjection,
  type AssembledTodaysWork,
  type AssembledTodaysWorkCoverage,
  type AssembledTodaysWorkHandoffs,
  type LoadTodaysWorkProjectionOptions,
  type LoadTodaysWorkProjectionResult,
} from "./load";
