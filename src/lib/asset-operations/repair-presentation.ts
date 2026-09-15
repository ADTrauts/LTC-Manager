/**
 * Repair queue / detail presentation helpers (no schema change).
 * Repair remains Prisma Repair; AssetIssue remains separate.
 */

import type { RepairStatus, WorkOrderKind } from "@prisma/client";

import {
  COMPLETED_WORK_ORDER_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  workOrderStatusLabel,
} from "./types";

export type RepairQueueFilter =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "COMPLETED"
  | "ALL";

export type RepairSourceKind = "LINKED_ISSUE" | "DIRECT" | "PREVENTIVE";

export function isRepairOpenStatus(status: RepairStatus): boolean {
  return (OPEN_WORK_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isRepairCompletedStatus(status: RepairStatus): boolean {
  return (COMPLETED_WORK_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isRepairWaitingStatus(status: RepairStatus): boolean {
  return (
    status === "WAITING_PARTS" ||
    status === "WAITING_ON_VENDOR" ||
    status === "ON_HOLD"
  );
}

export function isRepairInProgressStatus(status: RepairStatus): boolean {
  return status === "IN_PROGRESS" || status === "ASSIGNED";
}

/** Product filter membership for the Repairs queue. */
export function repairMatchesQueueFilter(
  status: RepairStatus,
  filter: RepairQueueFilter,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "OPEN":
      // Default “Open work” tab — all non-terminal statuses needing attention.
      return isRepairOpenStatus(status);
    case "IN_PROGRESS":
      return isRepairInProgressStatus(status);
    case "WAITING":
      return isRepairWaitingStatus(status);
    case "COMPLETED":
      return isRepairCompletedStatus(status) || status === "CANCELLED";
    default:
      return true;
  }
}

export function parseRepairQueueFilter(raw: string | undefined | null): RepairQueueFilter {
  if (
    raw === "OPEN" ||
    raw === "IN_PROGRESS" ||
    raw === "WAITING" ||
    raw === "COMPLETED" ||
    raw === "ALL"
  ) {
    return raw;
  }
  return "OPEN";
}

export function repairSourceKind(input: {
  workOrderKind?: WorkOrderKind | string | null;
  hasLinkedAssetIssue: boolean;
}): RepairSourceKind {
  if (input.workOrderKind === "PREVENTIVE") return "PREVENTIVE";
  if (input.hasLinkedAssetIssue) return "LINKED_ISSUE";
  return "DIRECT";
}

export function repairSourceLabel(kind: RepairSourceKind): string {
  switch (kind) {
    case "LINKED_ISSUE":
      return "Linked issue";
    case "PREVENTIVE":
      return "Preventive";
    case "DIRECT":
    default:
      return "Direct repair";
  }
}

export function repairSourceCompactLine(input: {
  kind: RepairSourceKind;
  issueSummary?: string | null;
}): string {
  if (input.kind === "LINKED_ISSUE" && input.issueSummary?.trim()) {
    return `Issue: ${input.issueSummary.trim()}`;
  }
  return repairSourceLabel(input.kind);
}

/** Calm user-facing status for queue chips (maps enum → product language). */
export function repairStatusProductLabel(status: RepairStatus): string {
  if (isRepairWaitingStatus(status)) {
    if (status === "WAITING_PARTS") return "Waiting (parts)";
    if (status === "WAITING_ON_VENDOR") return "Waiting (vendor)";
    return "Waiting";
  }
  return workOrderStatusLabel(status);
}

export function repairOpenedAgeLabel(openedAt: Date, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - openedAt.getTime());
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Opened today";
  if (days === 1) return "Opened 1 day ago";
  return `Opened ${days} days ago`;
}

/**
 * Default queue sort: open work before completed; within open, oldest first;
 * within completed, newest first.
 */
export function compareRepairsForQueue(
  a: { status: RepairStatus; requestedAt: Date },
  b: { status: RepairStatus; requestedAt: Date },
): number {
  const aOpen = isRepairOpenStatus(a.status) ? 0 : 1;
  const bOpen = isRepairOpenStatus(b.status) ? 0 : 1;
  if (aOpen !== bOpen) return aOpen - bOpen;
  if (aOpen === 0) {
    return a.requestedAt.getTime() - b.requestedAt.getTime();
  }
  return b.requestedAt.getTime() - a.requestedAt.getTime();
}

/** Prisma where fragment: Repairs relevant to shell Department. */
export function repairDepartmentWhere(
  activeDepartmentId: string | null | undefined,
):
  | {
      OR: Array<
        | { responsibleDepartmentId: string }
        | { requestingDepartmentId: string }
        | { asset: { departmentId: string } }
        | { asset: { departmentId: null } }
        | { assetId: null }
      >;
    }
  | Record<string, never> {
  if (!activeDepartmentId) return {};
  return {
    OR: [
      { responsibleDepartmentId: activeDepartmentId },
      { requestingDepartmentId: activeDepartmentId },
      { asset: { departmentId: activeDepartmentId } },
      { asset: { departmentId: null } },
      { assetId: null },
    ],
  };
}
