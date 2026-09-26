/**
 * Department Administration — public barrel.
 *
 * Current programming: Location Program on Overview · Locations · Teams.
 * Experience-catalog profiles / Areas / Archetypes are retired compatibility.
 * Do not import this barrel from client components that would pull server code.
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
  EXPERIENCE_CATALOG_BASELINE_RETIRED,
  EXPERIENCE_CATALOG_BASELINE_RETIRED_MESSAGE,
  assertExperienceCatalogBaselinesNotWritable,
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

// profile-service is server-only (Prisma). Import it from
// `@/lib/department-administration/profile-service`, never this barrel.

export {
  DEPARTMENT_ADMIN_TABS,
  DEPARTMENT_ADMIN_DEFERRED_TABS,
  DEPARTMENT_ADMIN_LEGACY_TABS,
  DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT,
  DEPARTMENT_ADMIN_ALL_TAB_IDS,
  DEPARTMENT_PROFILE_TAB_IDS,
  departmentAdminHref,
  departmentAdminTabsForFlags,
  isDepartmentAdminTabId,
  isDepartmentAdminPrimaryTabId,
  isDepartmentAdminDeferredTabId,
  isDepartmentAdminRetiredTabId,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
  type DepartmentAdminDeferredTabId,
  type DepartmentAdminLegacyTabId,
  type DepartmentAdminPrimaryTabId,
  type DepartmentAdminRetiredTabId,
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
  groupRoomsByFacilityRoomType,
  groupRoomsByOperationalType,
  locationConfigurationLabel,
  operationalTypeKeyFromName,
  uniqueOperationalTypeKey,
  type FacilityRoomTypeGroup,
  type OperationalTypeGroup,
} from "./operational-type";

export {
  composeLocationProgram,
  emptyLocationProgram,
  formatNeedSummary,
  locationProgramIsAttached,
  type ComposeLocationProgramInput,
  type LocationProgram,
  type LocationProgramAsset,
  type LocationProgramCycle,
  type LocationProgramCycleTeam,
  type LocationProgramLog,
  type LocationProgramNeedGrain,
  type LocationProgramProvenance,
  type LocationProgramTeam,
} from "./location-program";

export {
  emptyLocationOverlays,
  resolveEffectiveLocationProgram,
  type EffectiveLocationExperience,
  type EffectiveLocationKind,
  type EffectiveCoverageExpectationItem,
  type EffectiveLocationOverlays,
  type EffectiveLocationProgram,
  type EffectiveOperationalType,
  type OverlayProvenance,
  type ResolveEffectiveLocationProgramInput,
} from "./effective-location-program";

// load-effective-location-program and load-location-program are server-only.
// Import them from their files, not this barrel.

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

export type {
  DepartmentAdminView,
  DepartmentRoomRow,
  ProfileListItem,
} from "./load-department-admin";

// loadDepartmentAdminView / loadDepartmentLocationsView / experienceDisplayName
// are server-only. Import them from
// `@/lib/department-administration/load-department-admin`.
