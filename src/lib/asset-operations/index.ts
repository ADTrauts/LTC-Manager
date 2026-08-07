/**
 * Phase 10A Dietary Asset Operations — core library.
 *
 * Ownership:
 * - Asset owns identity + operational status (+ AssetStatusHistory).
 * - AssetIssue owns reported condition (separate from Work Order).
 * - Repair owns Work Order / repair response.
 * - Operational Evidence remains separate.
 * - Supervisor Board / Job Flow project exceptions only.
 *
 * Gate: DIETARY_ASSET_OPERATIONS_ENABLED (see isDietaryAssetOperationsEnabled).
 */

export type {
  AssetHistoryEvent,
  AssetHistoryEventKind,
  AssetOperationalStatus,
  ChangeAssetStatusInput,
  ReportAssetIssueInput,
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
  closeIssue,
  getIssueDetail,
  linkEvidenceToIssue,
  listIssuesForDepartment,
  markMonitoring,
  reopenIssue,
  reportAssetIssue,
  resolveIssue,
  triageIssue,
} from "./issue-service";

export {
  assignResponsibleEmployee,
  assignVendor,
  completeWorkOrder,
  createWorkOrderDirect,
  createWorkOrderFromIssue,
  createWorkOrderFromOperationalRequest,
  markReturnToServiceReady,
  technicianUpdateWorkOrder,
  updateWorkOrderStatus,
  type CreateWorkOrderDirectInput,
} from "./work-order-service";

export { loadAssetTimeline, type LoadAssetTimelineOptions } from "./history";

export {
  loadSupervisorAssetExceptions,
  loadUnitRuntimeAssets,
  type LoadUnitRuntimeAssetsOptions,
  type SupervisorAssetExceptionItem,
  type UnitRuntimeAssetItem,
} from "./load-runtime-assets";
