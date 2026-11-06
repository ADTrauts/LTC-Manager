/**
 * Canonical Work Order domain projection.
 *
 * Persistence remains Repair. Stored RepairStatus / RepairPriority / RepairTrade
 * stay readable. New Product code uses these presenters instead of mapping raw enums.
 *
 * Completing a Work Order does not resolve Issue, close Request, or restore Asset.
 */

import type {
  RepairPriority,
  RepairStatus,
  RepairTrade,
  WorkOrderHoldReason,
  WorkOrderKind,
} from "@prisma/client";

export type WorkOrderStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELED";

export type WorkOrderPriority = "ROUTINE" | "HIGH" | "URGENT" | "EMERGENCY";

export type WorkOrderHoldReasonAuthority = WorkOrderHoldReason;

export type MaintenanceCategoryKey =
  | "HVAC"
  | "PLUMBING"
  | "ELECTRICAL"
  | "LIFE_SAFETY"
  | "KITCHEN_EQUIPMENT"
  | "CARPENTRY_BUILDING"
  | "GROUNDS"
  | "GENERAL_REPAIR";

export const DEFAULT_MAINTENANCE_CATEGORIES: ReadonlyArray<{
  key: MaintenanceCategoryKey;
  label: string;
  sortOrder: number;
}> = [
  { key: "HVAC", label: "HVAC", sortOrder: 10 },
  { key: "PLUMBING", label: "Plumbing", sortOrder: 20 },
  { key: "ELECTRICAL", label: "Electrical", sortOrder: 30 },
  { key: "LIFE_SAFETY", label: "Life safety", sortOrder: 40 },
  { key: "KITCHEN_EQUIPMENT", label: "Kitchen equipment", sortOrder: 50 },
  { key: "CARPENTRY_BUILDING", label: "Carpentry / building", sortOrder: 60 },
  { key: "GROUNDS", label: "Grounds", sortOrder: 70 },
  { key: "GENERAL_REPAIR", label: "General", sortOrder: 80 },
];

export const ALL_REPAIR_STATUSES: readonly RepairStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_VENDOR",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

export const ALL_REPAIR_PRIORITIES: readonly RepairPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
  "EMERGENCY",
];

export function presentWorkOrderStatus(
  status: RepairStatus | string | null | undefined,
): WorkOrderStatus {
  if (status === "ASSIGNED") return "ASSIGNED";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (
    status === "ON_HOLD" ||
    status === "WAITING_PARTS" ||
    status === "WAITING_ON_VENDOR"
  ) {
    return "ON_HOLD";
  }
  if (status === "COMPLETED" || status === "CLOSED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELED";
  return "OPEN";
}

export function presentWorkOrderHoldReason(input: {
  status?: RepairStatus | string | null;
  holdReason?: WorkOrderHoldReason | string | null;
}): WorkOrderHoldReason | null {
  if (input.holdReason === "WAITING_FOR_PART") return "WAITING_FOR_PART";
  if (input.holdReason === "WAITING_FOR_VENDOR") return "WAITING_FOR_VENDOR";
  if (input.holdReason === "WAITING_FOR_ACCESS") return "WAITING_FOR_ACCESS";
  if (input.holdReason === "SCHEDULED_LATER") return "SCHEDULED_LATER";
  if (input.holdReason === "OTHER") return "OTHER";
  if (input.status === "WAITING_PARTS") return "WAITING_FOR_PART";
  if (input.status === "WAITING_ON_VENDOR") return "WAITING_FOR_VENDOR";
  if (presentWorkOrderStatus(input.status) === "ON_HOLD") return "OTHER";
  return null;
}

export function presentWorkOrderPriority(
  priority: RepairPriority | string | null | undefined,
): WorkOrderPriority {
  if (priority === "HIGH") return "HIGH";
  if (priority === "URGENT") return "URGENT";
  if (priority === "EMERGENCY") return "EMERGENCY";
  return "ROUTINE";
}

export function presentWorkOrderKind(
  kind: WorkOrderKind | string | null | undefined,
): "CORRECTIVE" | "PREVENTIVE" {
  return kind === "PREVENTIVE" ? "PREVENTIVE" : "CORRECTIVE";
}

export function workOrderStatusAuthorityLabel(status: WorkOrderStatus): string {
  switch (status) {
    case "ASSIGNED":
      return "Assigned";
    case "IN_PROGRESS":
      return "In progress";
    case "ON_HOLD":
      return "On hold";
    case "COMPLETED":
      return "Completed";
    case "CANCELED":
      return "Canceled";
    case "OPEN":
    default:
      return "Open";
  }
}

export function workOrderPriorityAuthorityLabel(priority: WorkOrderPriority): string {
  switch (priority) {
    case "HIGH":
      return "High";
    case "URGENT":
      return "Urgent";
    case "EMERGENCY":
      return "Emergency";
    case "ROUTINE":
    default:
      return "Routine";
  }
}

/**
 * Deterministic RepairTrade → starter category key.
 * EQUIPMENT is not guessed as kitchen — GENERAL_REPAIR.
 */
export function mapRepairTradeToCategoryKey(
  trade: RepairTrade | string | null | undefined,
): MaintenanceCategoryKey {
  if (trade === "PLUMBING") return "PLUMBING";
  if (trade === "ELECTRICAL") return "ELECTRICAL";
  if (trade === "EQUIPMENT") return "GENERAL_REPAIR";
  return "GENERAL_REPAIR";
}

export function currentRepairStatusWrite(
  requested: RepairStatus | string,
  holdReason?: WorkOrderHoldReason | null,
): { status: RepairStatus; holdReason: WorkOrderHoldReason | null } {
  if (requested === "CLOSED") {
    return { status: "COMPLETED", holdReason: null };
  }
  return resolveStoredHoldWrite(requested, holdReason);
}

export function resolveStoredHoldWrite(
  requested: RepairStatus | string,
  holdReason?: WorkOrderHoldReason | null,
): { status: RepairStatus; holdReason: WorkOrderHoldReason | null } {
  if (requested === "WAITING_PARTS") {
    return { status: "ON_HOLD", holdReason: holdReason ?? "WAITING_FOR_PART" };
  }
  if (requested === "WAITING_ON_VENDOR") {
    return { status: "ON_HOLD", holdReason: holdReason ?? "WAITING_FOR_VENDOR" };
  }
  if (requested === "ON_HOLD") {
    return { status: "ON_HOLD", holdReason: holdReason ?? "OTHER" };
  }
  if (
    requested === "OPEN" ||
    requested === "ASSIGNED" ||
    requested === "IN_PROGRESS" ||
    requested === "COMPLETED" ||
    requested === "CANCELLED"
  ) {
    return { status: requested, holdReason: null };
  }
  return { status: "OPEN", holdReason: null };
}

export type WorkOrderResponseRequirementLabel = "STANDARD" | "IMMEDIATE";

const TERMINAL_WORK_ORDER_STATUSES = new Set(["COMPLETED", "CANCELLED", "CLOSED", "CANCELED"]);

/**
 * Immediate response is active only while the Work Order is still open
 * and its own response requirement says IMMEDIATE.
 * Queue priority, the deadline, and the assignee do not answer this.
 */
export function workOrderRequiresImmediateResponse(input: {
  status?: string | null;
  responseRequirement?: string | null;
}): boolean {
  if (input.responseRequirement !== "IMMEDIATE") return false;
  if (input.status && TERMINAL_WORK_ORDER_STATUSES.has(input.status)) return false;
  return true;
}

export type WorkOrderResponseRequirementView = {
  value: WorkOrderResponseRequirementLabel;
  label: "Standard" | "Immediate";
  explanation: string;
  editable: boolean;
  readOnlyReason: "role" | "completed" | "cancelled" | "no_department" | null;
};

const RESPONSE_EXPLANATION = {
  STANDARD: "Uses the normal Work Order assignment and deadline workflow.",
  IMMEDIATE:
    "Immediate response uses the Department's On-Call Coverage to notify the current responder.",
} as const;

export const WORK_ORDER_RESPONSE_PRIORITY_DISTINCTION =
  "Priority controls queue ordering. Response Requirement controls whether immediate operational response is required.";

/**
 * What the Work Order screen may show and change.
 * The domain service remains the authority for the write.
 */
export function presentWorkOrderResponseRequirement(input: {
  responseRequirement?: string | null;
  status?: string | null;
  canManageWorkOrders: boolean;
  hasResponsibleDepartment: boolean;
}): WorkOrderResponseRequirementView {
  const value: WorkOrderResponseRequirementLabel =
    input.responseRequirement === "IMMEDIATE" ? "IMMEDIATE" : "STANDARD";
  const status = input.status ?? "OPEN";
  const terminal = TERMINAL_WORK_ORDER_STATUSES.has(status);
  let readOnlyReason: WorkOrderResponseRequirementView["readOnlyReason"] = null;
  if (status === "CANCELLED" || status === "CANCELED") readOnlyReason = "cancelled";
  else if (terminal) readOnlyReason = "completed";
  else if (!input.hasResponsibleDepartment) readOnlyReason = "no_department";
  else if (!input.canManageWorkOrders) readOnlyReason = "role";
  return {
    value,
    label: value === "IMMEDIATE" ? "Immediate" : "Standard",
    explanation: RESPONSE_EXPLANATION[value],
    editable: readOnlyReason === null,
    readOnlyReason,
  };
}

export function presentWorkOrderResponseHistoryLine(
  transition: string | null | undefined,
): string | null {
  switch (transition) {
    case "OPENED":
      return "Immediate response required";
    case "CLEARED":
      return "Response returned to Standard";
    case "COMPLETED":
      return "Immediate-response Work Order completed";
    case "CANCELLED":
      return "Immediate-response Work Order cancelled";
    default:
      return null;
  }
}

export type WorkOrderPresentation = {
  status: WorkOrderStatus;
  holdReason: WorkOrderHoldReason | null;
  priority: WorkOrderPriority;
  responseRequirement: WorkOrderResponseRequirementLabel;
  kind: "CORRECTIVE" | "PREVENTIVE";
  categoryKey: string | null;
  categoryLabel: string | null;
};

export function presentWorkOrder(input: {
  status: RepairStatus | string;
  holdReason?: WorkOrderHoldReason | string | null;
  priority: RepairPriority | string;
  responseRequirement?: string | null;
  workOrderKind?: WorkOrderKind | string | null;
  maintenanceCategory?: { key: string; label: string; archivedAt?: Date | null } | null;
  repairTrade?: RepairTrade | string | null;
}): WorkOrderPresentation {
  const status = presentWorkOrderStatus(input.status);
  const category = input.maintenanceCategory
    ? { key: input.maintenanceCategory.key, label: input.maintenanceCategory.label }
    : input.repairTrade
      ? {
          key: mapRepairTradeToCategoryKey(input.repairTrade),
          label:
            DEFAULT_MAINTENANCE_CATEGORIES.find(
              (row) => row.key === mapRepairTradeToCategoryKey(input.repairTrade),
            )?.label ?? "General",
        }
      : { key: null, label: null };
  return {
    status,
    holdReason: status === "ON_HOLD" ? presentWorkOrderHoldReason(input) : null,
    priority: presentWorkOrderPriority(input.priority),
    responseRequirement: input.responseRequirement === "IMMEDIATE" ? "IMMEDIATE" : "STANDARD",
    kind: presentWorkOrderKind(input.workOrderKind),
    categoryKey: category.key,
    categoryLabel: category.label,
  };
}
