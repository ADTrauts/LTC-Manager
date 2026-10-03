import type {
  SupportMessageDeliveryStatus,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";

export const SUPPORT_TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const SUPPORT_TICKET_TYPES = [
  "SUPPORT",
  "BUG",
  "FEATURE_REQUEST",
  "IMPROVEMENT",
  "ACCOUNT_ACCESS",
  "BILLING",
  "OTHER",
] as const satisfies readonly SupportTicketType[];

export const SUPPORT_TICKET_TYPE_LABEL: Record<SupportTicketType, string> = {
  SUPPORT: "Support",
  BUG: "Bug",
  FEATURE_REQUEST: "Feature request",
  IMPROVEMENT: "Improvement",
  ACCOUNT_ACCESS: "Account access",
  BILLING: "Billing",
  OTHER: "Other",
};

export const SUPPORT_TICKET_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const satisfies readonly SupportTicketPriority[];

export const SUPPORT_TICKET_PRIORITY_LABEL: Record<SupportTicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const SUPPORT_DELIVERY_STATUS_LABEL: Record<SupportMessageDeliveryStatus, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  FAILED: "Failed",
  DELIVERED: "Delivered",
  BOUNCED: "Delivery failed",
  SPAM_COMPLAINT: "Spam complaint received",
};

export function isSupportTicketType(value: unknown): value is SupportTicketType {
  return typeof value === "string" && (SUPPORT_TICKET_TYPES as readonly string[]).includes(value);
}

export function isSupportTicketPriority(value: unknown): value is SupportTicketPriority {
  return (
    typeof value === "string" && (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}
