import { Prisma, type PrismaClient, type SupportMessageDeliveryStatus, type SupportStaffNotificationType } from "@prisma/client";

import { dispatchPendingSupportStaffNotificationEmails } from "./notification-email";
import { recordSupportStaffNotifications } from "./notifications";
import { applySupportTicketStatusChange } from "./ticket-service";

const MAX_DESCRIPTION = 240;

export type SupportDeliveryEventKind = "Delivery" | "Bounce" | "SpamComplaint";

export type ParsedSupportDeliveryEvent =
  | {
      kind: "Delivery";
      providerMessageId: string;
      occurredAt: Date | null;
    }
  | {
      kind: "Bounce";
      providerMessageId: string;
      occurredAt: Date | null;
      bounceType: string;
      bounceCode: string | null;
      bounceDescription: string | null;
      inactive: boolean;
    }
  | {
      kind: "SpamComplaint";
      providerMessageId: string;
      occurredAt: Date | null;
      complaintType: string;
    };

export type ParseSupportDeliveryEventResult =
  | { ok: true; event: ParsedSupportDeliveryEvent }
  | { ok: false; reason: "malformed" | "ignored_type" };

const KNOWN_TYPES = new Set(["Delivery", "Bounce", "SpamComplaint"]);

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDate(value: unknown): Date | null {
  const text = readString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function truncate(value: string | null): string | null {
  if (!value) return null;
  return value.length <= MAX_DESCRIPTION ? value : value.slice(0, MAX_DESCRIPTION);
}

/** Postmark delivery / bounce / spam-complaint JSON. Content dumps are ignored. */
export function parseSupportDeliveryEvent(raw: unknown): ParseSupportDeliveryEventResult {
  const body = asRecord(raw);
  if (!body) return { ok: false, reason: "malformed" };
  const recordType = readString(body.RecordType);
  const providerMessageId = readString(body.MessageID);
  if (!recordType || !providerMessageId) return { ok: false, reason: "malformed" };
  if (!KNOWN_TYPES.has(recordType)) return { ok: false, reason: "ignored_type" };

  if (recordType === "Delivery") {
    return {
      ok: true,
      event: {
        kind: "Delivery",
        providerMessageId,
        occurredAt: readDate(body.DeliveredAt),
      },
    };
  }

  if (recordType === "Bounce") {
    const bounceType = readString(body.Type) ?? "Bounce";
    const typeCode = typeof body.TypeCode === "number" ? String(body.TypeCode) : readString(body.TypeCode);
    return {
      ok: true,
      event: {
        kind: "Bounce",
        providerMessageId,
        occurredAt: readDate(body.BouncedAt),
        bounceType,
        bounceCode: typeCode,
        bounceDescription: truncate(readString(body.Description) ?? readString(body.Name)),
        inactive: body.Inactive === true,
      },
    };
  }

  return {
    ok: true,
    event: {
      kind: "SpamComplaint",
      providerMessageId,
      occurredAt: readDate(body.BouncedAt),
      complaintType: readString(body.Type) ?? "SpamComplaint",
    },
  };
}

export function isPermanentSupportBounce(event: Extract<ParsedSupportDeliveryEvent, { kind: "Bounce" }>): boolean {
  if (event.bounceType === "HardBounce" || event.bounceCode === "1") return true;
  if (event.bounceType === "SoftBounce" || event.bounceType === "Transient") return false;
  return event.inactive;
}

const DELIVERABLE_FROM = new Set<SupportMessageDeliveryStatus>(["SENT"]);
const BOUNCEABLE_FROM = new Set<SupportMessageDeliveryStatus>(["SENT", "DELIVERED"]);
const COMPLAINT_FROM = new Set<SupportMessageDeliveryStatus>(["SENT", "DELIVERED", "BOUNCED"]);

export type ApplySupportDeliveryResult =
  | { result: "applied"; messageId: string; ticketId: string; deliveryStatus: SupportMessageDeliveryStatus }
  | { result: "duplicate"; messageId: string; ticketId: string; deliveryStatus: SupportMessageDeliveryStatus }
  | { result: "ignored"; messageId: string; ticketId: string; deliveryStatus: SupportMessageDeliveryStatus }
  | { result: "unknown" };

export async function applySupportDeliveryEvent(
  db: PrismaClient,
  event: ParsedSupportDeliveryEvent,
  now: Date = new Date(),
): Promise<ApplySupportDeliveryResult> {
  const message = await db.supportTicketMessage.findUnique({
    where: { providerMessageId: event.providerMessageId },
    select: {
      id: true,
      kind: true,
      deliveryStatus: true,
      ticketId: true,
      ticket: {
        select: {
          id: true,
          number: true,
          subject: true,
          assignedStaffId: true,
          status: true,
          resolvedAt: true,
          closedAt: true,
        },
      },
    },
  });
  if (!message || message.kind !== "OUTBOUND" || !message.deliveryStatus) {
    return { result: "unknown" };
  }
  const row: MessageRow = {
    id: message.id,
    ticketId: message.ticketId,
    deliveryStatus: message.deliveryStatus,
    ticket: message.ticket,
  };

  if (event.kind === "Delivery") {
    return applyDelivery(db, row, event, now);
  }
  if (event.kind === "Bounce") {
    return applyBounce(db, row, event, now);
  }
  return applyComplaint(db, row, event, now);
}

type MessageRow = {
  id: string;
  ticketId: string;
  deliveryStatus: SupportMessageDeliveryStatus;
  ticket: {
    id: string;
    number: number;
    subject: string;
    assignedStaffId: string | null;
    status: "NEW" | "OPEN" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED";
    resolvedAt: Date | null;
    closedAt: Date | null;
  };
};

async function recordDeliveryProblemNotification(
  db: PrismaClient | Prisma.TransactionClient,
  message: MessageRow,
  type: Extract<SupportStaffNotificationType, "DELIVERY_FAILED" | "BOUNCED" | "SPAM_COMPLAINT">,
) {
  await recordSupportStaffNotifications(db, {
    type,
    ticket: {
      id: message.ticket.id,
      number: message.ticket.number,
      subject: message.ticket.subject,
      assignedStaffId: message.ticket.assignedStaffId,
    },
    messageId: message.id,
    sourceKey: message.id,
  });
}

async function applyDelivery(
  db: PrismaClient,
  message: MessageRow,
  event: Extract<ParsedSupportDeliveryEvent, { kind: "Delivery" }>,
  now: Date,
): Promise<ApplySupportDeliveryResult> {
  if (message.deliveryStatus === "DELIVERED") {
    return { result: "duplicate", messageId: message.id, ticketId: message.ticketId, deliveryStatus: "DELIVERED" };
  }
  if (!DELIVERABLE_FROM.has(message.deliveryStatus)) {
    return { result: "ignored", messageId: message.id, ticketId: message.ticketId, deliveryStatus: message.deliveryStatus };
  }
  const occurredAt = event.occurredAt ?? now;
  const updated = await db.supportTicketMessage.updateMany({
    where: { id: message.id, deliveryStatus: { in: [...DELIVERABLE_FROM] } },
    data: {
      deliveryStatus: "DELIVERED",
      deliveredAt: occurredAt,
      lastDeliveryEventAt: occurredAt,
    },
  });
  if (updated.count !== 1) {
    const current = await db.supportTicketMessage.findUnique({
      where: { id: message.id },
      select: { deliveryStatus: true },
    });
    const status = current?.deliveryStatus ?? message.deliveryStatus;
    return {
      result: status === "DELIVERED" ? "duplicate" : "ignored",
      messageId: message.id,
      ticketId: message.ticketId,
      deliveryStatus: status,
    };
  }
  return { result: "applied", messageId: message.id, ticketId: message.ticketId, deliveryStatus: "DELIVERED" };
}

async function applyBounce(
  db: PrismaClient,
  message: MessageRow,
  event: Extract<ParsedSupportDeliveryEvent, { kind: "Bounce" }>,
  now: Date,
): Promise<ApplySupportDeliveryResult> {
  if (message.deliveryStatus === "BOUNCED") {
    return { result: "duplicate", messageId: message.id, ticketId: message.ticketId, deliveryStatus: "BOUNCED" };
  }
  if (!BOUNCEABLE_FROM.has(message.deliveryStatus)) {
    return { result: "ignored", messageId: message.id, ticketId: message.ticketId, deliveryStatus: message.deliveryStatus };
  }
  const occurredAt = event.occurredAt ?? now;
  return db.$transaction(async (tx) => {
    const updated = await tx.supportTicketMessage.updateMany({
      where: { id: message.id, deliveryStatus: { in: [...BOUNCEABLE_FROM] } },
      data: {
        deliveryStatus: "BOUNCED",
        bouncedAt: occurredAt,
        lastDeliveryEventAt: occurredAt,
        bounceType: event.bounceType,
        bounceCode: event.bounceCode,
        bounceDescription: event.bounceDescription,
      },
    });
    if (updated.count !== 1) {
      const current = await tx.supportTicketMessage.findUnique({
        where: { id: message.id },
        select: { deliveryStatus: true },
      });
      const status = current?.deliveryStatus ?? message.deliveryStatus;
      return {
        result: status === "BOUNCED" ? "duplicate" : "ignored",
        messageId: message.id,
        ticketId: message.ticketId,
        deliveryStatus: status,
      };
    }

    const existingEvent = await tx.supportTicketEvent.findFirst({
      where: { causedByMessageId: message.id, type: "EMAIL_BOUNCED" },
      select: { id: true },
    });
    if (!existingEvent) {
      await tx.supportTicketEvent.create({
        data: {
          ticketId: message.ticketId,
          type: "EMAIL_BOUNCED",
          causedByMessageId: message.id,
          toValue: event.bounceType,
          metadata: {
            bounceType: event.bounceType,
            bounceCode: event.bounceCode,
            permanent: isPermanentSupportBounce(event),
          },
        },
      });
    }

    if (isPermanentSupportBounce(event) && message.ticket.status === "WAITING_ON_CUSTOMER") {
      const causedWait = await tx.supportTicketEvent.findFirst({
        where: {
          causedByMessageId: message.id,
          type: "STATUS_CHANGED",
          toValue: "WAITING_ON_CUSTOMER",
        },
        select: { id: true },
      });
      if (causedWait) {
        await applySupportTicketStatusChange(tx, {
          ticket: message.ticket,
          to: "OPEN",
          actorStaffId: null,
          causedByMessageId: message.id,
          now,
        });
      }
    }

    await tx.supportTicket.update({ where: { id: message.ticketId }, data: { updatedAt: now } });
    await recordDeliveryProblemNotification(tx, message, "BOUNCED");
    return { result: "applied" as const, messageId: message.id, ticketId: message.ticketId, deliveryStatus: "BOUNCED" as const };
  }).then(async (result) => {
    if (result.result === "applied") {
      await dispatchPendingSupportStaffNotificationEmails(db, { ticketId: message.ticketId });
    }
    return result;
  });
}

async function applyComplaint(
  db: PrismaClient,
  message: MessageRow,
  event: Extract<ParsedSupportDeliveryEvent, { kind: "SpamComplaint" }>,
  now: Date,
): Promise<ApplySupportDeliveryResult> {
  if (message.deliveryStatus === "SPAM_COMPLAINT") {
    return { result: "duplicate", messageId: message.id, ticketId: message.ticketId, deliveryStatus: "SPAM_COMPLAINT" };
  }
  if (!COMPLAINT_FROM.has(message.deliveryStatus)) {
    return { result: "ignored", messageId: message.id, ticketId: message.ticketId, deliveryStatus: message.deliveryStatus };
  }
  const occurredAt = event.occurredAt ?? now;
  return db.$transaction(async (tx) => {
    const updated = await tx.supportTicketMessage.updateMany({
      where: { id: message.id, deliveryStatus: { in: [...COMPLAINT_FROM] } },
      data: {
        deliveryStatus: "SPAM_COMPLAINT",
        complainedAt: occurredAt,
        lastDeliveryEventAt: occurredAt,
        complaintType: event.complaintType,
      },
    });
    if (updated.count !== 1) {
      const current = await tx.supportTicketMessage.findUnique({
        where: { id: message.id },
        select: { deliveryStatus: true },
      });
      const status = current?.deliveryStatus ?? message.deliveryStatus;
      return {
        result: status === "SPAM_COMPLAINT" ? "duplicate" : "ignored",
        messageId: message.id,
        ticketId: message.ticketId,
        deliveryStatus: status,
      };
    }

    const existingEvent = await tx.supportTicketEvent.findFirst({
      where: { causedByMessageId: message.id, type: "EMAIL_COMPLAINT" },
      select: { id: true },
    });
    if (!existingEvent) {
      await tx.supportTicketEvent.create({
        data: {
          ticketId: message.ticketId,
          type: "EMAIL_COMPLAINT",
          causedByMessageId: message.id,
          toValue: event.complaintType,
        },
      });
    }
    await tx.supportTicket.update({ where: { id: message.ticketId }, data: { updatedAt: now } });
    await recordDeliveryProblemNotification(tx, message, "SPAM_COMPLAINT");
    return {
      result: "applied" as const,
      messageId: message.id,
      ticketId: message.ticketId,
      deliveryStatus: "SPAM_COMPLAINT" as const,
    };
  }).then(async (result) => {
    if (result.result === "applied") {
      await dispatchPendingSupportStaffNotificationEmails(db, { ticketId: message.ticketId });
    }
    return result;
  });
}
