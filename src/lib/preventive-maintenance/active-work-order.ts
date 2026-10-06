/**
 * Active Work Order definition for Preventive Maintenance occurrences.
 * Canonical statuses come from OPEN_WORK_ORDER_STATUSES. Do not re-parse RepairStatus here.
 */

import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";

export const PM_TERMINAL_WORK_ORDER_STATUSES = ["COMPLETED", "CLOSED", "CANCELLED"] as const;

export function isPmActiveWorkOrderStatus(status: string): boolean {
  return (OPEN_WORK_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isPmTerminalWorkOrderStatus(status: string): boolean {
  return (PM_TERMINAL_WORK_ORDER_STATUSES as readonly string[]).includes(status);
}
