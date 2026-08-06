/**
 * Phase 10A Dietary Asset Operations — shared contracts.
 *
 * Ownership (locked):
 * - Asset owns identity + operational status (+ AssetStatusHistory).
 * - AssetIssue owns reported condition (separate from Work Order).
 * - Repair owns Work Order / repair response.
 * - Operational Evidence remains separate; may link to an Issue without owning it.
 * - Supervisor Board / Job Flow project exceptions only — no ownership.
 */

import type {
  AssetIssueStatus,
  AssetOperationalImpact,
  AssetStatus,
  AssetStatusChangeReason,
  RepairPriority,
  RepairStatus,
} from "@prisma/client";

/** Legacy ACTIVE is treated as OPERATIONAL for product display and writes. */
export const ASSET_OPERATIONAL_STATUSES = [
  "OPERATIONAL",
  "DEGRADED",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const;

export type AssetOperationalStatus = (typeof ASSET_OPERATIONAL_STATUSES)[number];

export const OPEN_ASSET_ISSUE_STATUSES: AssetIssueStatus[] = [
  "REPORTED",
  "ACKNOWLEDGED",
  "TRIAGED",
  "MONITORING",
];

export const TERMINAL_ASSET_ISSUE_STATUSES: AssetIssueStatus[] = [
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];

export const OPEN_WORK_ORDER_STATUSES: RepairStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "WAITING_ON_VENDOR",
  "ON_HOLD",
];

export const COMPLETED_WORK_ORDER_STATUSES: RepairStatus[] = [
  "COMPLETED",
  "CLOSED",
];

export function normalizeAssetStatus(status: AssetStatus | string): AssetOperationalStatus {
  if (status === "ACTIVE" || status === "OPERATIONAL") return "OPERATIONAL";
  if (status === "DEGRADED") return "DEGRADED";
  if (status === "OUT_OF_SERVICE") return "OUT_OF_SERVICE";
  if (status === "RETIRED") return "RETIRED";
  return "OPERATIONAL";
}

export function isAssetAvailableForProspectiveUse(status: AssetStatus | string): boolean {
  const normalized = normalizeAssetStatus(status);
  return normalized === "OPERATIONAL" || normalized === "DEGRADED";
}

export function assetStatusLabel(status: AssetStatus | string): string {
  switch (normalizeAssetStatus(status)) {
    case "OPERATIONAL":
      return "Operational";
    case "DEGRADED":
      return "Degraded";
    case "OUT_OF_SERVICE":
      return "Out of service";
    case "RETIRED":
      return "Retired";
    default:
      return "Operational";
  }
}

export function assetIssueStatusLabel(status: AssetIssueStatus): string {
  switch (status) {
    case "REPORTED":
      return "Reported";
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "TRIAGED":
      return "Triaged";
    case "MONITORING":
      return "Monitoring";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function workOrderStatusLabel(status: RepairStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "ASSIGNED":
      return "Assigned";
    case "IN_PROGRESS":
      return "In progress";
    case "WAITING_PARTS":
      return "Waiting on parts";
    case "WAITING_ON_VENDOR":
      return "Waiting on vendor";
    case "ON_HOLD":
      return "On hold";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}

export function operationalImpactLabel(impact: AssetOperationalImpact): string {
  switch (impact) {
    case "NO_IMMEDIATE_IMPACT":
      return "No immediate service impact";
    case "WORKAROUND_AVAILABLE":
      return "Workaround available";
    case "SERVICE_AT_RISK":
      return "Service at risk";
    case "EQUIPMENT_UNAVAILABLE":
      return "Equipment unavailable";
    default:
      return impact;
  }
}

export type AssetHistoryEventKind =
  | "ASSET_CREATED"
  | "LOCATION_CHANGED"
  | "DEPARTMENT_CHANGED"
  | "STATUS_CHANGED"
  | "EVIDENCE_RECORD"
  | "CORRECTIVE_ACTION"
  | "ISSUE_REPORTED"
  | "ISSUE_TRIAGED"
  | "WORK_ORDER_OPENED"
  | "WORK_ORDER_STATUS_CHANGED"
  | "VENDOR_ASSIGNED"
  | "WORK_COMPLETED"
  | "RETURN_TO_SERVICE"
  | "ASSET_RETIRED";

export type AssetHistoryEvent = {
  id: string;
  kind: AssetHistoryEventKind;
  at: Date;
  title: string;
  detail: string | null;
  href: string | null;
  status?: string | null;
};

export type ReportAssetIssueInput = {
  facilityId: string;
  departmentId: string;
  assetId: string;
  unitId: string;
  spaceId?: string | null;
  summary: string;
  description: string;
  observedAt: Date;
  priority?: RepairPriority;
  operationalImpact?: AssetOperationalImpact;
  equipmentRemainsUsable?: boolean;
  workaroundInstruction?: string | null;
  evidenceRecordId?: string | null;
  comment?: string | null;
  clientCommandId?: string | null;
  deviceBoundUnitId?: string | null;
  recordedOnline?: boolean;
  allowDuplicateOpen?: boolean;
};

export type ChangeAssetStatusInput = {
  assetId: string;
  toStatus: AssetOperationalStatus;
  reason: AssetStatusChangeReason;
  note?: string | null;
  sourceIssueId?: string | null;
  sourceRepairId?: string | null;
};
