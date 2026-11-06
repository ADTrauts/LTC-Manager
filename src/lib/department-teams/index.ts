export {
  decideTeamAuthority,
  requireTeamManage,
  type TeamAuthorityDecision,
} from "./authority";
export {
  archiveDepartmentTeam,
  createDepartmentTeam,
  loadAllowedTeamSpaceIds,
  loadTeamById,
  loadTeamCatalog,
  loadTeamEmployeeOptions,
  loadTeamsForDepartment,
  pruneTeamRoomsAfterResponsibilityRemoved,
  resolveTeamAuthority,
  updateDepartmentTeam,
} from "./service";
export type {
  DepartmentCycleOption,
  DepartmentTeamView,
  TeamCatalog,
  TeamCycleChildView,
  TeamCycleNeedGrain,
  TeamCycleView,
  TeamEmployeeOption,
  TeamOperationalTypeOption,
  TeamRoomView,
} from "./types";
export {
  assertUniqueRootCycleLabel,
  linkTeamToCycle,
  loadDepartmentRootCycleOptions,
  loadTeamCyclesForDepartment,
  rootCycleLabelConflicts,
  unlinkTeamFromCycle,
  updateTeamCycleNeed,
} from "./team-cycles";
export {
  evaluateTeamManagerCandidate,
  normalizeTeamDescription,
  normalizeTeamDisplayName,
  teamNamesConflict,
  validateTeamRoomSubmission,
} from "./validation";
export {
  configuredTeamSpaceIds,
  describeTeamApplicability,
  matchTeamToLocation,
  dedupeTeamLocationMatches,
  overlaySourceFromTeamMatch,
  validateTeamOperationalTypeKeys,
} from "./team-operational-type-applicability";
