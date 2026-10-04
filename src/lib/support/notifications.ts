import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type SupportStaffNotificationEmailStatus,
  type SupportStaffNotificationType,
} from "@prisma/client";

import { formatSupportTicketNumber } from "./ticket-number";

type Db = PrismaClient | Prisma.TransactionClient;

export const SUPPORT_STAFF_NOTIFICATION_TYPES = [
  "NEW_TICKET",
  "ASSIGNED_TO_ME",
  "CUSTOMER_REPLIED",
  "HIGH_PRIORITY",
  "URGENT_PRIORITY",
  "DELIVERY_FAILED",
  "BOUNCED",
  "SPAM_COMPLAINT",
] as const satisfies readonly SupportStaffNotificationType[];

export const SUPPORT_STAFF_NOTIFICATION_EMAIL_TYPES = [
  "NEW_TICKET",
  "CUSTOMER_REPLIED",
  "URGENT_PRIORITY",
  "BOUNCED",
  "SPAM_COMPLAINT",
] as const satisfies readonly SupportStaffNotificationType[];

const EMAIL_TYPES = new Set<string>(SUPPORT_STAFF_NOTIFICATION_EMAIL_TYPES);

export const SUPPORT_STAFF_NOTIFICATION_FEED_LIMIT = 50;

export type SupportNotificationTicketRef = {
  id: string;
  number: number;
  subject: string;
  assignedStaffId: string | null;
};

export type SupportStaffNotificationItem = {
  id: string;
  type: SupportStaffNotificationType;
  ticketId: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export function supportNotificationDedupeKey(
  type: SupportStaffNotificationType,
  staffId: string,
  sourceKey: string,
): string {
  return `${type}:${staffId}:${sourceKey}`;
}

export function shouldEmailSupportNotification(type: SupportStaffNotificationType): boolean {
  return EMAIL_TYPES.has(type);
}

export function supportNotificationCopy(
  type: SupportStaffNotificationType,
  ticketNumber: string,
  subject: string,
): { title: string; body: string } {
  const headline = `${ticketNumber} · ${subject.trim() || "Untitled ticket"}`;
  switch (type) {
    case "NEW_TICKET":
      return { title: "New support ticket", body: headline };
    case "ASSIGNED_TO_ME":
      return { title: "Ticket assigned to you", body: headline };
    case "CUSTOMER_REPLIED":
      return { title: "Customer replied", body: headline };
    case "HIGH_PRIORITY":
      return { title: "High-priority ticket", body: headline };
    case "URGENT_PRIORITY":
      return { title: "Urgent ticket", body: headline };
    case "DELIVERY_FAILED":
      return {
        title: "Delivery failed",
        body: `${ticketNumber} · Customer may not have received the latest reply`,
      };
    case "BOUNCED":
      return {
        title: "Email bounced",
        body: `${ticketNumber} · Mailbox rejected the latest reply`,
      };
    case "SPAM_COMPLAINT":
      return {
        title: "Spam complaint",
        body: `${ticketNumber} · Do not send automated follow-ups`,
      };
  }
}

/**
 * Deterministic recipients. No support-role distinction exists on PlatformStaff, so fan-out
 * uses every active Harbor staff member. The acting staff member is never notified of their
 * own assignment or priority change.
 */
export function resolveSupportNotificationStaffIds(input: {
  type: SupportStaffNotificationType;
  assignedStaffId: string | null;
  actorStaffId: string | null;
  activeStaffIds: readonly string[];
}): string[] {
  const { type, assignedStaffId, actorStaffId, activeStaffIds } = input;
  if (type === "ASSIGNED_TO_ME") {
    if (!assignedStaffId || assignedStaffId === actorStaffId) return [];
    return [assignedStaffId];
  }
  if (type === "CUSTOMER_REPLIED") {
    return assignedStaffId ? [assignedStaffId] : [];
  }
  if (
    type === "HIGH_PRIORITY" ||
    type === "URGENT_PRIORITY" ||
    type === "DELIVERY_FAILED" ||
    type === "BOUNCED" ||
    type === "SPAM_COMPLAINT"
  ) {
    if (assignedStaffId) {
      return assignedStaffId === actorStaffId ? [] : [assignedStaffId];
    }
    return activeStaffIds.filter((id) => id !== actorStaffId);
  }
  return activeStaffIds.filter((id) => id !== actorStaffId);
}

async function activeHarborStaffIds(db: Db, exceptStaffId?: string | null): Promise<string[]> {
  const rows = await db.platformStaff.findMany({
    where: { isActive: true, ...(exceptStaffId ? { id: { not: exceptStaffId } } : {}) },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function recordSupportStaffNotifications(
  db: Db,
  input: {
    type: SupportStaffNotificationType;
    ticket: SupportNotificationTicketRef;
    messageId?: string | null;
    actorStaffId?: string | null;
    sourceKey: string;
    now?: Date;
  },
): Promise<string[]> {
  const needsAllStaff =
    input.type === "NEW_TICKET" ||
    ((input.type === "HIGH_PRIORITY" ||
      input.type === "URGENT_PRIORITY" ||
      input.type === "DELIVERY_FAILED" ||
      input.type === "BOUNCED" ||
      input.type === "SPAM_COMPLAINT") &&
      !input.ticket.assignedStaffId);

  const activeStaffIds = needsAllStaff ? await activeHarborStaffIds(db) : [];
  const staffIds = resolveSupportNotificationStaffIds({
    type: input.type,
    assignedStaffId: input.ticket.assignedStaffId,
    actorStaffId: input.actorStaffId ?? null,
    activeStaffIds,
  });
  if (staffIds.length === 0) return [];

  const ticketNumber = formatSupportTicketNumber(input.ticket.number);
  const copy = supportNotificationCopy(input.type, ticketNumber, input.ticket.subject);
  const emailStatus: SupportStaffNotificationEmailStatus = shouldEmailSupportNotification(input.type)
    ? "PENDING"
    : "NOT_REQUIRED";
  const createdAt = input.now ?? new Date();
  const rows = staffIds.map((staffId) => ({
    staffId,
    type: input.type,
    ticketId: input.ticket.id,
    messageId: input.messageId ?? null,
    dedupeKey: supportNotificationDedupeKey(input.type, staffId, input.sourceKey),
    title: copy.title,
    body: copy.body,
    emailStatus,
    createdAt,
  }));

  for (const row of rows) {
    await db.$executeRaw`
      INSERT INTO "SupportStaffNotification" (
        "id", "staffId", "type", "ticketId", "messageId", "dedupeKey",
        "title", "body", "isRead", "emailStatus", "createdAt"
      )
      SELECT
        ${randomUUID()},
        s.id,
        ${row.type}::"SupportStaffNotificationType",
        ${row.ticketId},
        ${row.messageId},
        ${row.dedupeKey},
        ${row.title},
        ${row.body},
        false,
        ${row.emailStatus}::"SupportStaffNotificationEmailStatus",
        ${row.createdAt}
      FROM "PlatformStaff" s
      WHERE s.id = ${row.staffId} AND s."isActive" = true
      ON CONFLICT ("dedupeKey") DO NOTHING
    `;
  }
  const pending = await db.supportStaffNotification.findMany({
    where: {
      dedupeKey: { in: rows.map((row) => row.dedupeKey) },
      emailStatus: "PENDING",
    },
    select: { id: true },
  });
  return pending.map((row) => row.id);
}

export async function listSupportStaffNotifications(
  db: Db,
  staffId: string,
  take = SUPPORT_STAFF_NOTIFICATION_FEED_LIMIT,
): Promise<{ items: SupportStaffNotificationItem[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    db.supportStaffNotification.findMany({
      where: { staffId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        ticketId: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
      },
    }),
    db.supportStaffNotification.count({ where: { staffId, isRead: false } }),
  ]);
  return {
    unreadCount,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      ticketId: row.ticketId,
      title: row.title,
      body: row.body,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function markSupportStaffNotificationRead(
  db: Db,
  input: { staffId: string; id: string; now?: Date },
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const updated = await db.supportStaffNotification.updateMany({
    where: { id: input.id, staffId: input.staffId, isRead: false },
    data: { isRead: true, readAt: input.now ?? new Date() },
  });
  if (updated.count === 1) return { ok: true };
  const owned = await db.supportStaffNotification.findFirst({
    where: { id: input.id, staffId: input.staffId },
    select: { id: true },
  });
  return owned ? { ok: true } : { ok: false, reason: "not_found" };
}

export async function markAllSupportStaffNotificationsRead(
  db: Db,
  input: { staffId: string; now?: Date },
): Promise<number> {
  const updated = await db.supportStaffNotification.updateMany({
    where: { staffId: input.staffId, isRead: false },
    data: { isRead: true, readAt: input.now ?? new Date() },
  });
  return updated.count;
}
