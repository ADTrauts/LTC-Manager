/**
 * Phase 10A Dietary Asset Operations — core library.
 *
 * Ownership:
 * - Asset owns identity + operational status (+ AssetStatusHistory).
 * - AssetIssue owns reported condition (Issue). Not a Request. Not a Work Order.
 * - Repair owns Work Order / repair response. Repair.issueId is authoritative.
 * - Operational Evidence remains separate.
 * - Supervisor Board / Job Flow project exceptions only.
 *
 * Gate: Dietary Asset Operations flag or Facility Plant Operations runtime
 * (`isSharedAssetOperationsEnabled`).
 */

export type {
  AssetHistoryEvent,
  AssetHistoryEventKind,
  AssetOperationalStatus,
  ChangeAssetStatusInput,
  ReportAssetIssueInput,
  ReportIssueInput,
} from "./types";

export {
  ASSET_OPERATIONAL_STATUSES,
  COMPLETED_WORK_ORDER_STATUSES,
  OPEN_ASSET_ISSUE_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  TERMINAL_ASSET_ISSUE_STATUSES,
  assetIssueStatusLabel,
  assetStatusLabel,
  isAssetAvailableForProspectiveUse,
  normalizeAssetStatus,
  operationalImpactLabel,
  workOrderStatusLabel,
} from "./types";

export {
  issueAuthorityLabel,
  isOpenIssueAuthority,
  issueStatusesForListView,
  parseIssueListView,
  presentIssueAuthority,
  type IssueAuthority,
  type IssueListView,
} from "./issue-semantics";

export {
  decideAssetOperationsAuthority,
  requireAssetManage,
  requireAssetReport,
  requireAssetStatusChange,
  requireAssetTriage,
  requireWorkOrderManage,
  resolveAssetOperationsAuthority,
  type AssetOperationsAuthorityDecision,
} from "./authority";

export {
  assertAssetEligibleForProspectiveTemplateBinding,
  changeAssetStatus,
  createAsset,
  getAssetProfile,
  listAssetsForFacility,
  retireAsset,
  returnAssetToService,
  updateAssetIdentity,
  type CreateAssetInput,
  type UpdateAssetIdentityInput,
} from "./asset-service";

export {
  acknowledgeIssue,
  cancelIssue,
  closeIssue,
  createIssueFromRequest,
  getIssueDetail,
  getIssueWorkOrders,
  linkEvidenceToIssue,
  linkRequestToIssue,
  listIssuesForDepartment,
  markMonitoring,
  reopenIssue,
  reportAssetIssue,
  reportIssue,
  resolveIssue,
  triageIssue,
} from "./issue-service";

export {
  assignResponsibleEmployee,
  assignVendor,
  completeWorkOrder,
  createWorkOrder,
  createWorkOrderDirect,
  createWorkOrderFromIssue,
  createWorkOrderFromOperationalRequest,
  holdWorkOrder,
  linkEvidenceToWorkOrder,
  linkWorkOrderToIssue,
  listWorkOrders,
  loadWorkOrder,
  markReturnToServiceReady,
  technicianUpdateWorkOrder,
  updateWorkOrderStatus,
  type CreateWorkOrderDirectInput,
} from "./work-order-service";

export {
  addWorkOrderLabor,
  addWorkOrderPart,
  addWorkOrderRecordRequirement,
  formatRecordedExpense,
  formatWorkOrderCloseoutBlockedMessage,
  projectRecordedExpense,
  removeWorkOrderLabor,
  removeWorkOrderPart,
  removeWorkOrderRecordRequirement,
  satisfyWorkOrderRecordRequirement,
  setWorkOrderExternalCost,
  updateWorkOrderLabor,
  updateWorkOrderPart,
  validateWorkOrderCloseout,
  waiveWorkOrderRecordRequirement,
  WAIVE_REASON_MIN_LENGTH,
  WORK_PERFORMED_MIN_LENGTH,
  type RepairAssetConditionReviewChoice,
  type WorkOrderCloseoutMissingFact,
  type WorkOrderCloseoutValidation,
} from "./work-order-closeout";

export {
  DEFAULT_MAINTENANCE_CATEGORIES,
  mapRepairTradeToCategoryKey,
  presentWorkOrder,
  presentWorkOrderHoldReason,
  presentWorkOrderPriority,
  presentWorkOrderStatus,
  presentWorkOrderKind,
  workOrderPriorityAuthorityLabel,
  workOrderStatusAuthorityLabel,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from "./work-order-semantics";

export {
  archiveMaintenanceCategory,
  ensureDefaultMaintenanceCategories,
  listMaintenanceCategories,
} from "./maintenance-categories";

export {
  addWorkOrderNote,
  assignWorkOrder,
  completeAssignedWorkOrder,
  createIssueFromRecord,
  declineRequest,
  holdAssignedWorkOrder,
  resolveIssueOptionallyRequests,
  resolveRequestWithoutWork,
  resumeWorkOrder,
  startWorkOrder,
  triageRequestCreateIssue,
  triageRequestCreateIssueAndWorkOrder,
  triageRequestLinkIssue,
} from "./corrective-maintenance";

export { loadAssetTimeline, type LoadAssetTimelineOptions } from "./history";

export {
  loadSupervisorAssetExceptions,
  loadUnitRuntimeAssets,
  type LoadUnitRuntimeAssetsOptions,
  type SupervisorAssetExceptionItem,
  type UnitRuntimeAssetItem,
} from "./load-runtime-assets";

export {
  ASSET_BUILD_PATH,
  ASSET_CONDITION_VALUES,
  ASSET_LIFECYCLE_RETIRED,
  ASSET_RUN_PATH,
  assetAttentionConditionWhere,
  assetAvailableForProspectiveUseWhere,
  assetLifecycleActiveWhere,
  assetNotRetiredWhere,
  assetResponsibleDepartmentWhere,
  isAssetLifecycleRetired,
  isAssetOperationalCondition,
  isAssetStatusHistoryLifecycleEvent,
  resolveAssetOwnershipSurface,
  type AssetConditionValue,
  type AssetOwnershipSurface,
} from "./ownership";

export {
  MAINTENANCE_ASSETS_HREF,
  MAINTENANCE_NAV_LABEL,
  MAINTENANCE_REPAIRS_HREF,
  MAINTENANCE_SUBNAV_ITEMS,
  MAINTENANCE_VENDORS_HREF,
  applyMaintenanceNavRewrite,
  isRunMaintenancePath,
  maintenanceSubNavItems,
  resolveMaintenanceSubNavActiveId,
  type MaintenanceNavRewriteOptions,
  type MaintenanceSubNavId,
  type MaintenanceSubNavItem,
} from "./maintenance-nav";

export {
  formatAssetLocationAriaLabel,
  formatAssetLocationLabel,
  resolveSpaceIdForUnitChange,
  type AssetLocationLabelInput,
} from "./location-label";

export {
  conditionToneClass,
  presentAssetLifecycleAndCondition,
  runConditionSelectValues,
  type AssetConditionPresentation,
  type AssetLifecyclePresentation,
} from "./lifecycle-presentation";

export {
  defaultResponsibleOrganizationNames,
  departmentDisplayLabel,
  ensureAndListResponsibleOrganizations,
  preferredRepairProviderDisplayLabel,
  projectAssetResponsibility,
  resolvePreferredRepairProviderForAsset,
  responsibleOrganizationDisplayLabel,
  type AssetResponsibilityParty,
  type AssetResponsibilityProjection,
} from "./responsibility";

export {
  compareRepairsForQueue,
  isRepairCompletedStatus,
  isRepairOpenStatus,
  parseRepairQueueFilter,
  repairDepartmentWhere,
  repairMatchesQueueFilter,
  repairOpenedAgeLabel,
  repairSourceCompactLine,
  repairSourceKind,
  repairSourceLabel,
  repairStatusProductLabel,
  type RepairQueueFilter,
  type RepairSourceKind,
} from "./repair-presentation";
