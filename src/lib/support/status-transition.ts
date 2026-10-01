import type { SupportTicketStatus } from "@prisma/client";

export const SUPPORT_TICKET_STATUSES = [
  "NEW",
  "OPEN",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
] as const satisfies readonly SupportTicketStatus[];

const ALLOWED_TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  NEW: ["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  OPEN: ["WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  WAITING_ON_CUSTOMER: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: [],
};

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === "string" && (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}

export function allowedSupportTicketTransitions(
  from: SupportTicketStatus,
): readonly SupportTicketStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

export function canTransitionSupportTicket(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type SupportTicketStatusPlan =
  | { kind: "unchanged" }
  | { kind: "invalid"; from: SupportTicketStatus; to: SupportTicketStatus }
  | {
      kind: "change";
      from: SupportTicketStatus;
      to: SupportTicketStatus;
      data: { status: SupportTicketStatus; resolvedAt: Date | null; closedAt: Date | null };
    };

/**
 * Decide what a requested status change does to the ticket row. Same-state requests are
 * `unchanged` so callers never write a meaningless STATUS_CHANGED event.
 */
export function planSupportTicketStatusChange(input: {
  from: SupportTicketStatus;
  to: SupportTicketStatus;
  resolvedAt: Date | null;
  closedAt: Date | null;
  now: Date;
}): SupportTicketStatusPlan {
  const { from, to, now } = input;
  if (from === to) {
    return { kind: "unchanged" };
  }
  if (!canTransitionSupportTicket(from, to)) {
    return { kind: "invalid", from, to };
  }

  let resolvedAt = input.resolvedAt;
  if (to === "RESOLVED") {
    resolvedAt = now;
  } else if (from === "RESOLVED" && to !== "CLOSED") {
    resolvedAt = null;
  }

  const closedAt = to === "CLOSED" ? now : input.closedAt;

  return { kind: "change", from, to, data: { status: to, resolvedAt, closedAt } };
}
