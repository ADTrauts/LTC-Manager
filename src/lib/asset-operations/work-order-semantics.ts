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
  "WAITING_PARTS",
  "WAITING_ON_VENDOR",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "CLOSED",
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

export function resolveStoredHoldWrite(
  requested: RepairStatus,
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
  return { status: requested, holdReason: null };
}

export type WorkOrderPresentation = {
  status: WorkOrderStatus;
  holdReason: WorkOrderHoldReason | null;
  priority: WorkOrderPriority;
  kind: "CORRECTIVE" | "PREVENTIVE";
  categoryKey: string | null;
  categoryLabel: string | null;
};

export function presentWorkOrder(input: {
  status: RepairStatus | string;
  holdReason?: WorkOrderHoldReason | string | null;
  priority: RepairPriority | string;
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
    kind: presentWorkOrderKind(input.workOrderKind),
    categoryKey: category.key,
    categoryLabel: category.label,
  };
}
