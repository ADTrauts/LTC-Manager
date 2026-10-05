/**
 * Phase 12A Operational Request contracts.
 *
 * Request is intake: someone is asking for attention.
 * Repair is the Work Order row — not Request state and not canonical Issue.
 * AssetIssue is the Issue store. Asset is optional; location-only Issues are valid.
 * Creating a Request does not create an Issue.
 */

import type {
  AssetOperationalImpact,
  OperationalRequestStatus,
  RepairPriority,
} from "@prisma/client";

import type {
  RequestAuthority,
  RequesterProjectedStatus,
} from "./request-semantics";

export const OPEN_OPERATIONAL_REQUEST_STATUSES: OperationalRequestStatus[] = [
  "REPORTED",
  "ACKNOWLEDGED",
  "UNDER_REVIEW",
  "WORK_ASSIGNED",
  "WORK_IN_PROGRESS",
  "WAITING_ON_VENDOR",
  "WAITING_ON_PARTS",
  "MONITORING",
  "REOPENED",
];

export const TERMINAL_OPERATIONAL_REQUEST_STATUSES: OperationalRequestStatus[] = [
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];

export const TRIAGE_ELIGIBLE_STATUSES: OperationalRequestStatus[] = [
  "REPORTED",
  "ACKNOWLEDGED",
  "UNDER_REVIEW",
  "REOPENED",
  "MONITORING",
];

/** Map internal status to requester-facing label (no private triage language). */
export function requesterVisibleStatusLabel(
  status: OperationalRequestStatus,
): string {
  switch (status) {
    case "REPORTED":
      return "Reported";
    case "ACKNOWLEDGED":
      return "Received";
    case "UNDER_REVIEW":
      return "Under review";
    case "WORK_ASSIGNED":
      return "Work assigned";
    case "WORK_IN_PROGRESS":
      return "Work in progress";
    case "WAITING_ON_VENDOR":
      return "Waiting on vendor";
    case "WAITING_ON_PARTS":
      return "Waiting on parts";
    case "MONITORING":
      return "Monitoring";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    case "CANCELLED":
      return "Cancelled";
    case "REOPENED":
      return "Reopened";
    default:
      return "Updated";
  }
}

export type CreateOperationalRequestInput = {
  facilityId: string;
  requestingDepartmentId: string;
  responsibleDepartmentId: string;
  affectedDepartmentId?: string | null;
  unitId: string;
  spaceId?: string | null;
  assetId?: string | null;
  summary: string;
  description: string;
  priority?: RepairPriority;
  operationalImpact?: AssetOperationalImpact;
  equipmentRemainsUsable?: boolean | null;
  workaroundInstruction?: string | null;
  observedAt: Date;
  clientCommandId?: string | null;
  recordedOnline?: boolean;
  deviceBoundUnitId?: string | null;
  allowObviousDuplicate?: boolean;
};

export type RequesterVisibleRequestStatus = {
  requestId: string;
  requestCode: string;
  /** Stored Prisma status (compatibility). Prefer projectedStatus for requester UI. */
  status: OperationalRequestStatus;
  statusLabel: string;
  requestAuthority: RequestAuthority;
  projectedStatus: RequesterProjectedStatus;
  projectedStatusLabel: string;
  summary: string;
  requesterVisibleStatusSummary: string | null;
  workaroundInstruction: string | null;
  priority: RepairPriority;
  operationalImpact: AssetOperationalImpact;
  observedAt: string;
  reportedAt: string;
  unitName: string | null;
  assetName: string | null;
  updates: Array<{
    updateText: string;
    statusAfterUpdate: OperationalRequestStatus | null;
    updatedAt: string;
  }>;
  workOrderCode: string | null;
  workOrderStatus: string | null;
};
