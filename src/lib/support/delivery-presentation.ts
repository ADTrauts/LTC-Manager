import type { SupportMessageDeliveryStatus, SupportTicketMessageKind } from "@prisma/client";

export type OutboundDeliveryView = {
  sentText: string | null;
  outcomeText: string | null;
  tone: "neutral" | "ok" | "problem";
  detail: string | null;
};

export function describeSupportBounce(input: {
  bounceType?: string | null;
  bounceDescription?: string | null;
}): string {
  const type = input.bounceType ?? "";
  if (type === "SoftBounce" || type === "Transient") return "Temporary delivery problem";
  if (type === "HardBounce") return "Mailbox does not exist";
  const description = input.bounceDescription?.trim();
  if (description && /mailbox|unknown user|does not exist|user unknown/i.test(description)) {
    return "Mailbox does not exist";
  }
  return "Delivery failed";
}

export function presentOutboundDelivery(
  input: {
    deliveryStatus: SupportMessageDeliveryStatus | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    createdAt: Date;
    bounceType?: string | null;
    bounceDescription?: string | null;
  },
  formatTime: (value: Date) => string,
): OutboundDeliveryView {
  const status = input.deliveryStatus ?? "PENDING";
  const sentAt = input.sentAt ?? input.createdAt;
  const sentText = status === "PENDING" ? null : `Sent ${formatTime(sentAt)}`;

  if (status === "PENDING") {
    return {
      sentText: null,
      outcomeText: "Sending",
      tone: "neutral",
      detail: "Delivery hasn't been confirmed. Check Postmark before sending again.",
    };
  }
  if (status === "SENT") {
    return { sentText, outcomeText: null, tone: "ok", detail: null };
  }
  if (status === "DELIVERED") {
    return {
      sentText,
      outcomeText: `Delivered ${formatTime(input.deliveredAt ?? sentAt)}`,
      tone: "ok",
      detail: null,
    };
  }
  if (status === "FAILED") {
    return { sentText, outcomeText: "Delivery failed", tone: "problem", detail: null };
  }
  if (status === "BOUNCED") {
    return {
      sentText,
      outcomeText: "Delivery failed",
      tone: "problem",
      detail: describeSupportBounce(input),
    };
  }
  return { sentText, outcomeText: "Spam complaint received", tone: "problem", detail: null };
}

const PROBLEM_STATUSES = new Set<SupportMessageDeliveryStatus>(["FAILED", "BOUNCED", "SPAM_COMPLAINT"]);

export function latestOutboundDeliveryWarning(
  messages: Array<{ kind: SupportTicketMessageKind; deliveryStatus: SupportMessageDeliveryStatus | null; createdAt: Date }>,
): string | null {
  const latest = [...messages]
    .filter((message) => message.kind === "OUTBOUND")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest?.deliveryStatus || !PROBLEM_STATUSES.has(latest.deliveryStatus)) return null;
  if (latest.deliveryStatus === "SPAM_COMPLAINT") {
    return "The customer marked the latest reply as spam. Do not send automated follow-ups to this address until this is resolved.";
  }
  if (latest.deliveryStatus === "FAILED") {
    return "Email delivery failed for this customer.";
  }
  return "Customer may not have received the latest reply.";
}
