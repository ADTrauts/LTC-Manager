export {
  assertCanChangeDepartmentPeople,
  applyDepartmentChangeCeiling,
  loadDepartmentChangeAccess,
  PEOPLE_CHANGE_REASON,
  withDepartmentChangeCeiling,
} from "./changes";
export {
  canReadComplianceRecordsInMode,
  decideDepartmentAccess,
  departmentAccessReason,
  departmentSummaryReason,
  DepartmentAccessError,
  DEPARTMENT_NONE_REASON,
  DEPARTMENT_VIEW_REASON,
  requireDepartmentManage,
  type DepartmentAccess,
  type DepartmentAccessDecisionInput,
  type DepartmentAccessMode,
  type DepartmentSessionKind,
} from "./access";
export {
  deriveDepartmentHeadStatus,
  isActiveDepartmentMember,
  listDepartmentsNeedingHead,
  type DepartmentHeadStatus,
  type DepartmentNeedingHead,
} from "./heads";
export { deriveLedDepartmentIds, resolveLedDepartmentIds } from "./led-departments";
export {
  DepartmentStaffManagerError,
  isStaffManagerEligible,
  loadDepartmentStaffManagerChoices,
  resolveDepartmentStaffManagerIds,
  setDepartmentStaffManager,
  type DepartmentStaffManagerChoice,
} from "./staff-managers";
export {
  DEPARTMENT_OWNER_KINDS,
  DEPARTMENT_OWNER_RESOLVERS,
  resolveDepartmentOwner,
  type DepartmentOwner,
  type DepartmentOwnerInput,
  type DepartmentOwnerKind,
} from "./owners";
export {
  resolveDepartmentAccess,
  resolveDepartmentAccessMap,
  resolveFacilityAdministratorView,
  type DepartmentAccessSession,
} from "./resolve";
export { departmentViewOnlyNotice } from "./view-notice";
export {
  acceptVendorHead,
  assignVendorHead,
  declineVendorHead,
  listVendorOperatedDepartments,
  loadAcceptedVendorHeads,
  vendorAccountIsHead,
  vendorHeadAcceptedForPeriod,
  VendorHeadError,
} from "./vendor-heads";
export {
  assertVisibleDepartment,
  assetVisibilityWhere,
  departmentIsVisible,
  employeeVisibleWhere,
  loadDepartmentVisibility,
  visibleDepartmentIdList,
  type DepartmentVisibility,
} from "./visibility";
export {
  assertOneOperatorWorkforce,
  WORKFORCE_SPLIT_REASON,
  workforceOperatorKey,
  workforceRecordMustSplit,
  type WorkforceOperatorFact,
} from "./workforce-records";
export {
  WRITE_MANIFEST,
  WRITE_MANIFEST_MODE,
  type WriteClass,
  type WriteManifest,
  type WriteManifestEntry,
} from "./write-manifest";
