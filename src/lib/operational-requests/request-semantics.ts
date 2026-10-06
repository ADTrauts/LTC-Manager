/**
 * Shared Request semantics.
 *
 * Authoritative Request state is intake/outcome. It is not a Work Order.
 * Requester-visible progress may be *projected* from linked Repair execution.
 * Stored OperationalRequestStatus values remain readable (compatibility).
 * Do not rewrite historical rows.
 *
 * Request = someone is asking for attention.
 * Issue (AssetIssue) = a known undesirable condition.
 * Repair = Work Order persistence. Not canonical Issue.
 *
 * Location-only Issues are valid (Asset optional). Request remains intake.
 */

import type { OperationalRequestStatus, RepairStatus } from "@prisma/client";

import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";

/** Conceptual Request authority. Not a Prisma enum. */
export type RequestAuthority =
  | "RECEIVED"
  | "ACCEPTED"
  | "DECLINED"
  | "RESOLVED_WITHOUT_WORK"
  | "CLOSED";

/** Derived requester-facing status. IN_PROGRESS is never stored Request authority. */
export type RequesterProjectedStatus =
  | "RECEIVED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DECLINED";

/** Historical WO-shaped stored statuses. Readable; not future Request authority. */
export const LEGACY_REQUEST_EXECUTION_STATUSES: readonly OperationalRequestStatus[] = [
  "WORK_ASSIGNED",
  "WORK_IN_PROGRESS",
  "WAITING_ON_VENDOR",
  "WAITING_ON_PARTS",
];

const LEGACY_EXECUTION = new Set<string>(LEGACY_REQUEST_EXECUTION_STATUSES);

export function isLegacyRequestExecutionStatus(
  status: OperationalRequestStatus | string,
): boolean {
  return LEGACY_EXECUTION.has(status);
}

/**
 * Map stored OperationalRequestStatus → conceptual Request authority.
 * workOrderId distinguishes resolve-without-work from other terminals.
 */
export function presentRequestAuthority(
  status: OperationalRequestStatus | string,
  workOrderId?: string | null,
): RequestAuthority {
  if (status === "CANCELLED") return "DECLINED";
  if (status === "CLOSED") return "CLOSED";
  if (status === "RESOLVED") {
    return workOrderId ? "CLOSED" : "RESOLVED_WITHOUT_WORK";
  }
  if (status === "REPORTED" || status === "ACKNOWLEDGED") return "RECEIVED";
  return "ACCEPTED";
}

function isOpenWorkOrderStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (OPEN_WORK_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Requester-visible projection.
 * IN_PROGRESS derives from linked Repair when present; otherwise from legacy
 * stored WO-shaped Request statuses (compatibility only).
 */
export function presentRequesterStatus(input: {
  status: OperationalRequestStatus | string;
  workOrderId?: string | null;
  workOrderStatus?: RepairStatus | string | null;
  /** Additional Work Orders linked via the Issue. Never written onto Request.status. */
  linkedWorkOrderStatuses?: Array<RepairStatus | string | null | undefined>;
}): RequesterProjectedStatus {
  const authority = presentRequestAuthority(input.status, input.workOrderId);
  if (authority === "DECLINED") return "DECLINED";
  if (authority === "CLOSED" || authority === "RESOLVED_WITHOUT_WORK") {
    return "RESOLVED";
  }
  const linked = [
    input.workOrderStatus,
    ...(input.linkedWorkOrderStatuses ?? []),
  ];
  if (linked.some((status) => isOpenWorkOrderStatus(status ?? null))) {
    return "IN_PROGRESS";
  }
  if (!input.workOrderStatus && isLegacyRequestExecutionStatus(input.status)) {
    return "IN_PROGRESS";
  }
  if (authority === "RECEIVED") return "RECEIVED";
  return "ACCEPTED";
}

export function requesterProjectedStatusLabel(status: RequesterProjectedStatus): string {
  switch (status) {
    case "RECEIVED":
      return "Received";
    case "ACCEPTED":
      return "Accepted";
    case "IN_PROGRESS":
      return "In Progress";
    case "RESOLVED":
      return "Resolved";
    case "DECLINED":
      return "Declined";
    default:
      return "Updated";
  }
}

export function requestAuthorityLabel(status: RequestAuthority): string {
  switch (status) {
    case "RECEIVED":
      return "Received";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "RESOLVED_WITHOUT_WORK":
      return "Resolved without work";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}
