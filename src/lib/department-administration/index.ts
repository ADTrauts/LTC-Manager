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
  assertPatternAuthoringAccess,
  assertProfileWriteAccess,
  checkPatternAuthoringAccess,
  checkProfileWriteAccess,
  type PatternAuthoringContext,
  type ProfileAccessDenial,
  type ProfileWriteContext,
} from "./profile-access";

export {
  activateProfile,
  addRoomExperienceException,
  bindRoomsToArchetype,
  bindRoomToArchetype,
  certifyProfile,
  clearRoomArchetypeBinding,
  createBaselineDraft,
  createNextDraftVersion,
  createRoomArchetype,
  ensureWorkingDraftForPatterns,
  listProfilesForFacility,
  loadProfile,
  moveAreaExperience,
  removeRoomExperienceException,
  reorderAreaExperiences,
  retireActiveProfile,
  setAreaExperienceActive,
  setArchetypeExperiences,
  toProfileSnapshot,
  updateRoomArchetype,
  type ProfileActor,
} from "./profile-service";

export {
  DEPARTMENT_ADMIN_TABS,
  DEPARTMENT_ADMIN_LEGACY_TABS,
  DEPARTMENT_ADMIN_ALL_TAB_IDS,
  DEPARTMENT_PROFILE_TAB_IDS,
  departmentAdminHref,
  departmentAdminTabsForFlags,
  isDepartmentAdminTabId,
  isDepartmentAdminPrimaryTabId,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
  type DepartmentAdminLegacyTabId,
  type DepartmentAdminPrimaryTabId,
  type DepartmentAdminTabId,
} from "./admin-nav";

export {
  DEPARTMENT_BUILDER_LIST_HREF,
  departmentBuilderAllDepartmentsHref,
  departmentBuilderHrefAfterDepartmentSwitch,
  departmentBuilderWorkspaceHref,
  isDepartmentBuilderWorkspacePath,
  resolveDepartmentBuilderEntryHref,
  rewriteDepartmentBuilderNavHref,
  shouldRedirectDepartmentsListToWorkspace,
} from "./builder-entry";

export {
  operationalTypeKeyFromName,
  uniqueOperationalTypeKey,
} from "./operational-type";

export {
  buildRoomTypeExperienceGroups,
  classifyRoomTypeExperienceForUi,
  customizedAssociatedRoomCount,
  departmentArchetypeForRoomType,
  groupAssignedRoomsByRoomType,
  roomTypeSupportsDepartmentConfiguration,
  sharedRoomTypeDescription,
  type DepartmentRoomTypeGroup,
  type RoomTypeExperienceGroup,
  type RoomTypeExperienceProductClass,
  type RoomTypeExperienceRow,
} from "./room-types";

export {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  isActionableDepartmentUnit,
  locationCoverageSummary,
  resolveLocationStatus,
  roomOperationalPattern,
  type DepartmentActionableLocation,
  type DepartmentLocationFloorGroup,
  type DepartmentLocationKind,
  type DepartmentLocationNeighborhoodNode,
  type DepartmentLocationSource,
  type DepartmentLocationStatus,
} from "./department-locations";

export {
  experienceDisplayName,
  loadDepartmentAdminView,
  loadDepartmentLocationsView,
  selectWorkingProfileId,
  type DepartmentAdminView,
  type DepartmentRoomRow,
  type ProfileListItem,
} from "./load-department-admin";
