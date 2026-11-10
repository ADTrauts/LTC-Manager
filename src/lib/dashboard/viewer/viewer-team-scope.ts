/**
 * Compatibility re-export.
 *
 * Placement scope lives in operational-placement (today's Assignment rooms).
 * Team membership is organizational and does not own rooms.
 */

export {
  evaluateViewerTeamScope,
  formatViewerTeamScopeLabel,
  isTeamUnconfiguredScope,
  keyTimeSpaceFilterFromTeamScope,
  narrowTeamScopeToCollectedRooms,
  resolveViewerTeamScopes,
  uniqueRoomIds,
  type TeamMembershipScopeRow,
  type ViewerTeamScope,
  type ViewerTeamScopeMode,
  type ViewerTeamScopeReason,
  type ViewerTeamScopeTeam,
} from "./operational-placement";
