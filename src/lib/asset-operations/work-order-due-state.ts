/**
 * Work Order deadline and overdue.
 *
 * `dueAt` is the operational deadline instant. `targetDate` is the Phase 10A
 * planning date and is not this answer. A missing deadline is not overdue.
 * Preventive Maintenance occurrence lateness stays on the occurrence's
 * scheduled civil date. This helper does not read that occurrence.
 */

import type { RepairStatus } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { OPEN_WORK_ORDER_STATUSES } from "./types";

export type WorkOrderDueState = "NOT_DUE" | "OVERDUE" | "NOT_APPLICABLE";

const OPEN_STATUSES = new Set<string>(OPEN_WORK_ORDER_STATUSES);

export function isOpenWorkOrderStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

/**
 * A Work Order is overdue when it is still open and the current instant is
 * at or after `dueAt`. Hold and vendor waiting do not pause the deadline.
 * Completed and cancelled Work Orders are not overdue. A null deadline is
 * not evaluable.
 */
export function evaluateWorkOrderDueState(input: {
  status: RepairStatus | string;
  dueAt: Date | null;
  now: Date;
}): WorkOrderDueState {
  if (!isOpenWorkOrderStatus(input.status) || !input.dueAt) return "NOT_APPLICABLE";
  if (input.now.getTime() >= input.dueAt.getTime()) return "OVERDUE";
  return "NOT_DUE";
}

/**
 * The operational instant for a civil scheduled day.
 * The scheduled day itself is still due. Overdue begins at the start of the
 * next facility-local day. That matches the Preventive Maintenance occurrence
 * calendar without using the occurrence as the Work Order deadline.
 */
export function workOrderDeadlineFromCivilDate(civilDate: string, timeZone?: string | null): Date {
  const key = civilDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error("Work Order civil deadline must be YYYY-MM-DD");
  }
  const day = facilityLocalDateToServiceDate(key);
  const next = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
  const instant = parseFacilityLocalScheduledStartOnDate(
    "00:00",
    toServiceDateKey(next),
    resolveFacilityTimezone(timeZone),
  );
  if (!instant) throw new Error("Work Order deadline could not be placed in facility time");
  return instant;
}
