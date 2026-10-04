import type { PrismaClient, SupportStaffNotificationType } from "@prisma/client";

import {
  sendTransactionalEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

import { formatSupportTicketNumber } from "./ticket-number";

type EnvLike = Record<string, string | undefined>;

export const SUPPORT_STAFF_NOTIFICATION_EMAIL_TAG = "support-staff-notification";

const EMAIL_HEADLINES: Record<SupportStaffNotificationType, string> = {
  NEW_TICKET: "A new support ticket needs attention.",
  ASSIGNED_TO_ME: "A support ticket was assigned to you.",
  CUSTOMER_REPLIED: "A customer replied to a ticket assigned to you.",
  HIGH_PRIORITY: "A support ticket was marked high priority.",
  URGENT_PRIORITY: "An urgent support ticket needs attention.",
  DELIVERY_FAILED: "A support reply may not have reached the customer.",
  BOUNCED: "A support reply bounced.",
  SPAM_COMPLAINT: "A customer marked a support reply as spam. Do not send automated follow-ups.",
};

export function supportConsoleOrigin(env: EnvLike = process.env): string {
  const raw = env.VSSYL_PUBLIC_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || "https://vssyl.com";
  return raw.replace(/\/$/, "");
}

export function supportConsoleTicketUrl(ticketId: string, env: EnvLike = process.env): string {
  return `${supportConsoleOrigin(env)}/console/tickets/${ticketId}`;
}

export function buildSupportStaffNotificationEmail(input: {
  type: SupportStaffNotificationType;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  requesterName?: string | null;
  facilityName?: string | null;
  env?: EnvLike;
}): { subject: string; text: string; html: string } {
  const number = formatSupportTicketNumber(input.ticketNumber);
  const url = supportConsoleTicketUrl(input.ticketId, input.env);
  const lines = [
    EMAIL_HEADLINES[input.type],
    "",
    number,
    input.subject.trim() || "Untitled ticket",
  ];
  if (input.requesterName?.trim()) {
    lines.push(`Requester: ${input.requesterName.trim()}`);
  }
  if (input.facilityName?.trim()) {
    lines.push(`Facility: ${input.facilityName.trim()}`);
  }
  lines.push("", "Open in Vssyl Console", url);
  const text = lines.join("\n");
  const html = [
    `<p>${EMAIL_HEADLINES[input.type]}</p>`,
    `<p><strong>${escapeHtml(number)}</strong><br />${escapeHtml(input.subject.trim() || "Untitled ticket")}</p>`,
    input.requesterName?.trim() ? `<p>Requester: ${escapeHtml(input.requesterName.trim())}</p>` : "",
    input.facilityName?.trim() ? `<p>Facility: ${escapeHtml(input.facilityName.trim())}</p>` : "",
    `<p><a href="${escapeHtml(url)}">Open in Vssyl Console</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject: `[Vssyl Support] ${notificationSubjectLabel(input.type)} ${number}`,
    text,
    html,
  };
}

function notificationSubjectLabel(type: SupportStaffNotificationType): string {
  switch (type) {
    case "NEW_TICKET":
      return "New ticket";
    case "CUSTOMER_REPLIED":
      return "Customer replied";
    case "URGENT_PRIORITY":
      return "Urgent ticket";
    case "BOUNCED":
      return "Email bounced";
    case "SPAM_COMPLAINT":
      return "Spam complaint";
    case "ASSIGNED_TO_ME":
      return "Assigned to you";
    case "HIGH_PRIORITY":
      return "High-priority ticket";
    case "DELIVERY_FAILED":
      return "Delivery failed";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Sends pending internal staff emails after the support mutation has committed.
 * Never throws: customer-support processing stays valid if Postmark fails.
 */
export async function dispatchPendingSupportStaffNotificationEmails(
  db: PrismaClient,
  filter: { ids?: string[]; ticketId?: string },
  options?: {
    env?: EnvLike;
    send?: typeof sendTransactionalEmail;
    logger?: Pick<Console, "error" | "info">;
  },
): Promise<void> {
  const logger = options?.logger ?? console;
  if (!filter.ids?.length && !filter.ticketId) return;
  const sqlTest =
    Boolean(process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL) && !options?.send;
  if (sqlTest) return;
  try {
    const pending = await db.supportStaffNotification.findMany({
      where: {
        emailStatus: "PENDING",
        ...(filter.ids?.length ? { id: { in: filter.ids } } : {}),
        ...(filter.ticketId ? { ticketId: filter.ticketId } : {}),
      },
      include: {
        staff: { select: { email: true, isActive: true } },
        ticket: {
          select: {
            number: true,
            subject: true,
            contact: { select: { displayName: true, email: true } },
            facility: { select: { displayName: true } },
          },
        },
      },
      take: 50,
    });
    const send = options?.send ?? sendTransactionalEmail;
    for (const row of pending) {
      if (!row.staff.isActive || row.staff.email.toLowerCase() === row.ticket.contact.email.toLowerCase()) {
        await db.supportStaffNotification.updateMany({
          where: { id: row.id, emailStatus: "PENDING" },
          data: { emailStatus: "FAILED", emailError: "skipped_invalid_recipient" },
        });
        continue;
      }
      const content = buildSupportStaffNotificationEmail({
        type: row.type,
        ticketId: row.ticketId,
        ticketNumber: row.ticket.number,
        subject: row.ticket.subject,
        requesterName: row.ticket.contact.displayName,
        facilityName: row.ticket.facility?.displayName ?? null,
        env: options?.env,
      });
      let result: SendTransactionalEmailResult;
      try {
        result = await send(
          {
            to: row.staff.email,
            subject: content.subject,
            text: content.text,
            html: content.html,
            tag: SUPPORT_STAFF_NOTIFICATION_EMAIL_TAG,
          },
          { env: options?.env },
        );
      } catch (error) {
        result = {
          sent: false,
          reason: "send_failed",
          error: error instanceof Error ? error.message : "Send threw.",
        };
      }
      if (result.sent) {
        await db.supportStaffNotification.updateMany({
          where: { id: row.id, emailStatus: "PENDING" },
          data: { emailStatus: "SENT", emailSentAt: new Date(), emailError: null },
        });
      } else {
        const error = result.reason === "send_failed" ? result.error : result.reason;
        logger.error("support.notification.email_failed", {
          notificationId: row.id,
          ticketId: row.ticketId,
          type: row.type,
          error,
        });
        await db.supportStaffNotification.updateMany({
          where: { id: row.id, emailStatus: "PENDING" },
          data: { emailStatus: "FAILED", emailError: error.slice(0, 500) },
        });
      }
    }
  } catch (error) {
    logger.error("support.notification.email_dispatch_failed", {
      ticketId: filter.ticketId ?? null,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
