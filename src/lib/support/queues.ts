import type { Prisma, SupportTicketStatus } from "@prisma/client";

export const SUPPORT_QUEUES = [
  { key: "all", label: "All" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "My tickets" },
  { key: "new", label: "New" },
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "high", label: "High + Urgent" },
  { key: "recent", label: "Recently updated" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export type SupportQueueKey = (typeof SUPPORT_QUEUES)[number]["key"];

/** Statuses where Vssyl or the customer still owes an action. */
export const ACTIVE_SUPPORT_STATUSES: SupportTicketStatus[] = ["NEW", "OPEN", "WAITING_ON_CUSTOMER"];

const STATUS_QUEUE: Partial<Record<SupportQueueKey, SupportTicketStatus>> = {
  new: "NEW",
  open: "OPEN",
  waiting: "WAITING_ON_CUSTOMER",
  resolved: "RESOLVED",
  closed: "CLOSED",
};

export function parseSupportQueue(value: unknown): SupportQueueKey {
  return SUPPORT_QUEUES.some((queue) => queue.key === value) ? (value as SupportQueueKey) : "all";
}

/** Unassigned and My tickets cover active work only; resolved and closed tickets have their own queues. */
export function supportQueueWhere(
  queue: SupportQueueKey,
  staffId: string,
): Prisma.SupportTicketWhereInput {
  const status = STATUS_QUEUE[queue];
  if (status) {
    return { status };
  }
  if (queue === "unassigned") {
    return { assignedStaffId: null, status: { in: ACTIVE_SUPPORT_STATUSES } };
  }
  if (queue === "mine") {
    return { assignedStaffId: staffId, status: { in: ACTIVE_SUPPORT_STATUSES } };
  }
  if (queue === "high") {
    return { priority: { in: ["HIGH", "URGENT"] }, status: { in: ACTIVE_SUPPORT_STATUSES } };
  }
  if (queue === "recent") {
    return { status: { in: ACTIVE_SUPPORT_STATUSES } };
  }
  return {};
}
