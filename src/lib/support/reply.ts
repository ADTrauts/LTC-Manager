import type {
  PrismaClient,
  SupportMessageDeliveryStatus,
  SupportTicketStatus,
} from "@prisma/client";

import { sendConsoleTicketReplyEmail, type SendTransactionalEmailResult } from "@/lib/email";

import { getSupportFromAddress, getSupportReplyToAddress } from "./config";
import { SupportTicketError } from "./errors";
import { dispatchPendingSupportStaffNotificationEmails } from "./notification-email";
import { recordSupportStaffNotifications } from "./notifications";
import {
  formatMessageIdHeader,
  generateSupportInternetMessageId,
  messageIdDomainFromAddress,
} from "./identifiers";
import {
  applySupportTicketStatusChange,
  findPriorSupportSubmission,
  isClientSubmissionConflict,
} from "./ticket-service";
import { formatSupportEmailSubject, formatSupportTicketNumber } from "./ticket-number";

export type SupportReplyEmail = {
  to: string;
  from: string;
  replyTo: string | null;
  displayName: string;
  facilityDisplayName: string | null;
  ticketNumber: string;
  emailSubject: string;
  ticketSubject: string;
  replyBody: string;
  internetMessageId: string;
  metadata: {
    supportTicketId: string;
    supportTicketNumber: string;
    supportMessageId: string;
  };
};

export type SupportReplyEmailSender = (email: SupportReplyEmail) => Promise<SendTransactionalEmailResult>;

/**
 * Postmark replaces custom Message-ID headers unless X-PM-KeepID is set. Whether the API path
 * honors it is checked by scripts/verify/postmark-support-message-id.ts.
 */
export const postmarkSupportReplySender: SupportReplyEmailSender = (email) =>
  sendConsoleTicketReplyEmail({
    to: email.to,
    from: email.from,
    replyTo: email.replyTo,
    displayName: email.displayName,
    facilityDisplayName: email.facilityDisplayName,
    ticketNumber: email.ticketNumber,
    emailSubject: email.emailSubject,
    ticketSubject: email.ticketSubject,
    replyBody: email.replyBody,
    headers: [
      { name: "Message-ID", value: formatMessageIdHeader(email.internetMessageId) },
      { name: "X-PM-KeepID", value: "true" },
    ],
    metadata: email.metadata,
  });

const MAX_DELIVERY_ERROR_LENGTH = 500;

export function describeSupportDeliveryFailure(
  result: Exclude<SendTransactionalEmailResult, { sent: true }>,
): string {
  if (result.reason === "not_configured") {
    return "Email is not configured on this server.";
  }
  const detail = result.error.trim() || "Unknown error.";
  return `Postmark did not accept the message: ${detail}`.slice(0, MAX_DELIVERY_ERROR_LENGTH);
}

export type RecordSupportReplyInput = {
  ticketId: string;
  actorStaffId: string;
  body: string;
  clientSubmissionId: string;
  /** Status to apply with the reply; null or the current status leaves it alone. */
  status?: SupportTicketStatus | null;
  fromEmail?: string;
  /** Defaults to the ticket's routed Reply-To when inbound routing is configured. */
  replyTo?: string | null;
  now?: Date;
};

/**
 * Records the reply as PENDING (with any status change) and commits before anything is sent.
 * A repeated clientSubmissionId returns the original message and must not be delivered again.
 */
export async function recordSupportReply(
  db: PrismaClient,
  input: RecordSupportReplyInput,
): Promise<{ messageId: string; duplicate: boolean }> {
  const prior = await findPriorSupportSubmission(db, input.ticketId, input.clientSubmissionId);
  if (prior) {
    return { messageId: prior.id, duplicate: true };
  }

  const now = input.now ?? new Date();
  const fromEmail = input.fromEmail ?? getSupportFromAddress();

  try {
    return await db.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id: input.ticketId },
        select: {
          id: true,
          number: true,
          subject: true,
          replyToken: true,
          status: true,
          resolvedAt: true,
          closedAt: true,
          contact: { select: { email: true } },
        },
      });
      if (!ticket) {
        throw new SupportTicketError("not_found");
      }
      if (ticket.status === "CLOSED") {
        throw new SupportTicketError("ticket_closed");
      }

      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          kind: "OUTBOUND",
          authorStaffId: input.actorStaffId,
          bodyText: input.body.trim(),
          fromEmail,
          toEmails: [ticket.contact.email],
          replyTo: input.replyTo === undefined ? getSupportReplyToAddress(ticket.replyToken) : input.replyTo,
          subject: formatSupportEmailSubject(ticket.number, ticket.subject),
          internetMessageId: generateSupportInternetMessageId(messageIdDomainFromAddress(fromEmail)),
          deliveryStatus: "PENDING",
          clientSubmissionId: input.clientSubmissionId,
        },
        select: { id: true },
      });

      if (input.status) {
        await applySupportTicketStatusChange(tx, {
          ticket,
          to: input.status,
          actorStaffId: input.actorStaffId,
          causedByMessageId: message.id,
          now,
        });
      }
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: now } });

      return { messageId: message.id, duplicate: false };
    });
  } catch (error) {
    if (isClientSubmissionConflict(error)) {
      const raced = await findPriorSupportSubmission(db, input.ticketId, input.clientSubmissionId);
      if (raced) {
        return { messageId: raced.id, duplicate: true };
      }
    }
    throw error;
  }
}

/** Sends a PENDING reply once. Messages already SENT or FAILED are left as they are. */
export async function deliverSupportReply(
  db: PrismaClient,
  messageId: string,
  send: SupportReplyEmailSender,
  now: () => Date = () => new Date(),
): Promise<SupportMessageDeliveryStatus> {
  const message = await db.supportTicketMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      kind: true,
      bodyText: true,
      fromEmail: true,
      replyTo: true,
      toEmails: true,
      subject: true,
      internetMessageId: true,
      deliveryStatus: true,
      ticket: {
        select: {
          id: true,
          number: true,
          subject: true,
          assignedStaffId: true,
          facility: { select: { displayName: true } },
          contact: { select: { displayName: true } },
        },
      },
    },
  });
  if (!message || message.kind !== "OUTBOUND" || !message.deliveryStatus) {
    throw new SupportTicketError("not_found");
  }
  if (message.deliveryStatus !== "PENDING") {
    return message.deliveryStatus;
  }

  const ticketNumber = formatSupportTicketNumber(message.ticket.number);
  let result: SendTransactionalEmailResult;
  try {
    result = await send({
      to: message.toEmails[0] ?? "",
      from: message.fromEmail ?? getSupportFromAddress(),
      replyTo: message.replyTo,
      displayName: message.ticket.contact.displayName ?? "there",
      facilityDisplayName: message.ticket.facility?.displayName ?? null,
      ticketNumber,
      emailSubject: message.subject ?? formatSupportEmailSubject(message.ticket.number, message.ticket.subject),
      ticketSubject: message.ticket.subject,
      replyBody: message.bodyText,
      internetMessageId: message.internetMessageId ?? "",
      metadata: {
        supportTicketId: message.ticket.id,
        supportTicketNumber: ticketNumber,
        supportMessageId: message.id,
      },
    });
  } catch (error) {
    result = {
      sent: false,
      reason: "send_failed",
      error: error instanceof Error ? error.message : "Send threw.",
    };
  }

  const status: SupportMessageDeliveryStatus = result.sent ? "SENT" : "FAILED";
  await db.supportTicketMessage.updateMany({
    where: { id: message.id, deliveryStatus: "PENDING" },
    data: result.sent
      ? {
          deliveryStatus: "SENT",
          providerMessageId: result.messageId === "unknown" ? null : result.messageId,
          sentAt: now(),
        }
      : { deliveryStatus: "FAILED", deliveryError: describeSupportDeliveryFailure(result) },
  });
  if (status === "FAILED") {
    await recordSupportStaffNotifications(db, {
      type: "DELIVERY_FAILED",
      ticket: {
        id: message.ticket.id,
        number: message.ticket.number,
        subject: message.ticket.subject,
        assignedStaffId: message.ticket.assignedStaffId,
      },
      messageId: message.id,
      sourceKey: message.id,
    });
    await dispatchPendingSupportStaffNotificationEmails(db, { ticketId: message.ticket.id });
  }
  return status;
}

export async function sendSupportReply(
  db: PrismaClient,
  input: RecordSupportReplyInput,
  send: SupportReplyEmailSender = postmarkSupportReplySender,
): Promise<{ messageId: string; duplicate: boolean; deliveryStatus: SupportMessageDeliveryStatus | null }> {
  const recorded = await recordSupportReply(db, input);
  if (recorded.duplicate) {
    return { ...recorded, deliveryStatus: null };
  }
  const deliveryStatus = await deliverSupportReply(db, recorded.messageId, send);
  return { ...recorded, deliveryStatus };
}
