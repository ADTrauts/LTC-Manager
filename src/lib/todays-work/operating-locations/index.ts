export type {
  OperatingLocationBoard,
  OperatingLocationBoardSummary,
  OperatingLocationCurrentOperation,
  OperatingLocationIssue,
  OperatingLocationIssueFacts,
  OperatingLocationKeyTime,
  OperatingLocationKind,
  OperatingLocationStaffing,
  OperatingLocationStaffingKind,
  OperatingLocationStatus,
  OperatingLocationStatusKey,
  SupervisorOperatingLocation,
  UnderlyingOperatingRoom,
} from "./types";
export { TODAYS_WORK_HUB_SUBTITLE } from "./types";

export { collectSupervisorOperatingLocations } from "./collect";
export {
  applyViewerTeamScopeToLocations,
  intersectTeamRoomsWithCollectedLocations,
} from "./apply-team-scope";

export {
  aggregateCurrentOperation,
  buildOperatingLocationBoard,
  buildOperatingLocationStatus,
  deriveOperatingStatus,
  operatingBoardToWalkList,
  operatingLocationStatusLabel,
  operatingLocationsToWalkItems,
  presentStaffingFact,
  selectPrimaryKeyTime,
  sortOperatingLocationsForBoard,
  sortOperatingLocationsForWalk,
  summarizeOperatingLocationBoard,
} from "./build";

export {
  loadOperatingLocationBoard,
  loadedBoardToWalkList,
  type LoadOperatingLocationBoardOptions,
  type LoadedOperatingLocationBoard,
} from "./load";
