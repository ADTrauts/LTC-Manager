import type { OperationalAssignmentStatus } from "@prisma/client";

export type AssignmentStatusLabel = {
  label: string;
  tone: "neutral" | "active" | "completed" | "cancelled";
};

const STATUS_LABELS: Record<OperationalAssignmentStatus, AssignmentStatusLabel> = {
  PLANNED: { label: "Planned", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "active" },
  COMPLETED: { label: "Completed", tone: "completed" },
  CANCELLED: { label: "Cancelled", tone: "cancelled" },
};

export function assignmentStatusLabel(status: OperationalAssignmentStatus): AssignmentStatusLabel {
  return STATUS_LABELS[status];
}

export function isAssignmentActive(status: OperationalAssignmentStatus): boolean {
  return status === "PLANNED" || status === "ACTIVE";
}
