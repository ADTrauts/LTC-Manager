/**
 * One Facility Administrator per facility (CDA-02). The role moves only by transfer from the
 * current holder, or by parent-organization recovery when the seat is empty or its holder has
 * left. Both complete only when the invitee accepts.
 */

export {
  DEFAULT_OUTGOING_ROLE,
  FACILITY_ADMINISTRATOR_INVITATION_TTL_MS,
  HOLDER_GONE_REASON_LABEL,
  holderGoneReason,
  invitationIsLive,
  isOutgoingRoleChoice,
  organizationMayAppoint,
  OUTGOING_ROLE_CHOICES,
  type FacilityAdministratorHolder,
  type FacilityAdministratorSeat,
  type HolderGoneReason,
  type OutgoingRoleChoice,
} from "./rules";

export {
  acceptFacilityAdministratorInvitation,
  appointFacilityAdministratorByOrganization,
  cancelFacilityAdministratorInvitation,
  declineFacilityAdministratorInvitation,
  FacilityAdministratorInvitationError,
  inviteFacilityAdministratorSuccessor,
  listFacilityAdministratorCandidates,
  listFacilityAdministratorInvitationsForInvitee,
  listOrganizationFacilityAdministratorSeats,
  loadFacilityAdministratorSeat,
  loadLiveFacilityAdministratorInvitation,
  type FacilityAdministratorCandidate,
  type FacilityAdministratorInvitationView,
  type OrganizationFacilityAdministratorRow,
} from "./service";

export {
  groupFacilityAdministratorConflicts,
  listFacilityAdministratorConflicts,
  type FacilityAdministratorClaim,
  type FacilityAdministratorConflict,
} from "./report";
