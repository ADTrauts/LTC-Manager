/**
 * Department Administration — public barrel (Wave 14B).
 *
 * Operational Profiles bind the Wave 14A Experience Registry to a facility
 * department. Nothing consumes profiles at runtime in this wave; Projection
 * will consume ACTIVE profiles in a later wave.
 */

export type {
  ArchetypeExperienceSnapshot,
  ExperienceConfiguration,
  OperationalProfileStatusKey,
  ProfileAreaExperienceSnapshot,
  ProfileAreaSnapshot,
  ProfileArchetypeSnapshot,
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionMode,
  RoomExceptionSnapshot,
} from "./profile-types";
export { isRoomStagedOrUndesignated } from "./profile-types";

export {
  isValidExperienceConfiguration,
  mergeExperienceConfiguration,
  validateExperienceConfiguration,
  type ConfigurationIssue,
} from "./configuration";

export {
  assertProfileEditable,
  assertProfileTransition,
  canTransitionProfileStatus,
  isProfileDeletable,
  isProfileEditable,
  nextProfileVersion,
  planProfileActivation,
  type ActivationPlan,
} from "./lifecycle";

export {
  BASELINE_DEPARTMENT_KEYS,
  isBaselineDepartmentKey,
  materializeBaselineProfilePlan,
  type BaselineAreaPlan,
  type BaselineArchetypePlan,
  type BaselineDepartmentKey,
  type BaselineProfilePlan,
} from "./baseline";

export { recommendArchetypeKey } from "./archetype-recommendation";

export {
  validateProfileForCertification,
  type CertificationDiagnostic,
  type CertificationError,
  type CertificationInput,
  type CertificationResult,
} from "./certification";

export {
  resolveDepartmentRoomProfile,
  type ResolvedExperienceSource,
  type ResolvedRoomArea,
  type ResolvedRoomExperience,
  type ResolvedRoomProfile,
  type ResolveRoomProfileInput,
  type RoomProfileDiagnostic,
} from "./resolve-room-profile";

export {
  PLANT_FACILITY_WIDE_POLICY,
  policyEligibleExperienceKeys,
  type PlantFacilityWidePolicy,
} from "./plant-policy";

export {
  assertProfileWriteAccess,
  checkProfileWriteAccess,
  type ProfileAccessDenial,
  type ProfileWriteContext,
} from "./profile-access";

export {
  activateProfile,
  addRoomExperienceException,
  bindRoomToArchetype,
  certifyProfile,
  createBaselineDraft,
  createNextDraftVersion,
  listProfilesForFacility,
  loadProfile,
  toProfileSnapshot,
  type ProfileActor,
} from "./profile-service";
