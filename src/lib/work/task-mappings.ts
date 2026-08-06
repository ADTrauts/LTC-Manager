import type {
  LogSubmissionStatus,
  RepairPriority,
  RepairStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

/** Map log submission status → Task projection status. */
export function mapLogSubmissionStatusToTaskStatus(
  status: LogSubmissionStatus,
): TaskStatus {
  switch (status) {
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
    case "MISSED":
      return "OPEN";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Conservative default — logs do not carry an explicit priority today. */
export function mapLogSubmissionPriorityToTaskPriority(): TaskPriority {
  return "MEDIUM";
}

export function mapRepairStatusToTaskStatus(status: RepairStatus): TaskStatus {
  switch (status) {
    case "OPEN":
    case "ASSIGNED":
      return "OPEN";
    case "IN_PROGRESS":
    case "WAITING_PARTS":
    case "WAITING_ON_VENDOR":
    case "ON_HOLD":
      return "IN_PROGRESS";
    case "COMPLETED":
    case "CLOSED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function mapRepairPriorityToTaskPriority(
  priority: RepairPriority,
): TaskPriority {
  switch (priority) {
    case "LOW":
      return "LOW";
    case "MEDIUM":
      return "MEDIUM";
    case "HIGH":
      return "HIGH";
    case "URGENT":
      return "URGENT";
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

export function buildLogTaskTitle(input: {
  templateName: string;
  mealType?: string | null;
}): string {
  const meal = input.mealType?.trim();
  if (meal) {
    return `${input.templateName} (${meal})`;
  }
  return input.templateName;
}

export function completedAtForTaskStatus(
  status: TaskStatus,
  completedAt: Date | null | undefined,
  fallback: Date | null = null,
): Date | null {
  if (status === "COMPLETED") {
    return completedAt ?? fallback ?? new Date();
  }
  return null;
}
