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
  DepartmentTeamView,
  TeamCatalog,
  TeamEmployeeOption,
  TeamRoomView,
} from "./types";
export {
  evaluateTeamManagerCandidate,
  normalizeTeamDescription,
  normalizeTeamDisplayName,
  teamNamesConflict,
  validateTeamRoomSubmission,
} from "./validation";
