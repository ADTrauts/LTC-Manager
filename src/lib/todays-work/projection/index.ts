/**
 * Wave 15I — Today's Work Projection cutover.
 */

export type { TodaysWorkProjectionView } from "./types";

export { adaptProjectionToTodaysWork } from "./adapt-projection";

export {
  filterCallDownsToProjectedUnits,
  filterCoverageToProjectedUnits,
  filterHandoffsToProjectedUnits,
  filterWalkListToProjectedUnits,
} from "./assemble";

export {
  assembleProjectedTodaysWorkHandoffs,
  assembleProjectedTodaysWorkHub,
  assembleProjectedTodaysWorkWalk,
  loadTodaysWorkProjection,
  type AssembledTodaysWork,
  type AssembledTodaysWorkHandoffs,
  type LoadTodaysWorkProjectionOptions,
  type LoadTodaysWorkProjectionResult,
} from "./load";
