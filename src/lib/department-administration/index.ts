/**
 * Department Administration — public barrel.
 *
 * Department Builder composes Facility responsibility with Operating Rhythm,
 * People & Coverage, and Records. Do not import this barrel from client
 * components that would pull server code.
 */

export {
  PLANT_FACILITY_WIDE_POLICY,
  type PlantFacilityWidePolicy,
} from "./plant-policy";

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
  isPreventiveMaintenanceBuilderPath,
  preventiveMaintenanceBuilderHref,
  preventiveMaintenanceNewHref,
  preventiveMaintenancePlanHref,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
  type DepartmentAdminDeferredTabId,
  type DepartmentAdminLegacyTabId,
  type DepartmentAdminPrimaryTabId,
  type DepartmentAdminRetiredTabId,
  type DepartmentAdminTabId,
} from "./admin-nav";

export {
  ADMIN_DEPARTMENTS_HREF,
  ADMIN_DEPARTMENTS_MARKETPLACE_HREF,
  DEPARTMENT_BUILDER_LIST_HREF,
  adminDepartmentManageHref,
  adminDepartmentsHrefFromLegacyBuildQuery,
  departmentBuilderAllDepartmentsHref,
  departmentBuilderHrefAfterDepartmentSwitch,
  departmentBuilderWorkspaceHref,
  isDepartmentBuilderWorkspacePath,
  resolveDepartmentBuilderEntryHref,
  rewriteDepartmentBuilderNavHref,
} from "./builder-entry";

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

// load-location-program is server-only. Import it from its file, not this barrel.

export {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  isActionableDepartmentUnit,
  locationCoverageSummary,
  type DepartmentActionableLocation,
  type DepartmentLocationFloorGroup,
  type DepartmentLocationKind,
  type DepartmentLocationNeighborhoodNode,
  type DepartmentLocationSource,
} from "./department-locations";

export type { DepartmentAdminView } from "./load-department-admin";

// loadDepartmentAdminView / loadDepartmentLocationsView / experienceDisplayName
// are server-only. Import them from
// `@/lib/department-administration/load-department-admin`.
