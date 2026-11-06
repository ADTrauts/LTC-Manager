/**
 * N1C recipient lifecycle.
 *
 * Read is not acknowledgement. Acknowledgement is not resolution.
 * Only an owning-domain resolve event, applied by the processor, sets resolvedAt.
 * seenAt stays empty. N2 has no separate surfaced fact.
 * Snooze is a separate recipient write. Acknowledgement does not clear it.
 * dismissedAt is reserved and is not snooze, acknowledgement, hiding, or resolution.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

type Db = PrismaClient | Prisma.TransactionClient;

export class NotificationLifecycleError extends Error {
  readonly code: "NOT_FOUND" | "FACILITY_ACCESS_DENIED" | "NOT_RECIPIENT" | "ACKNOWLEDGEMENT_NOT_REQUIRED";

  constructor(code: NotificationLifecycleError["code"]) {
    super(code);
    this.name = "NotificationLifecycleError";
    this.code = code;
  }
}

async function recipientRows(
  db: Db,
  input: { facilityId: string; notificationId: string; userId: string },
) {
  if (!(await userHasActiveFacilityAccess(db, input.userId, input.facilityId))) {
    throw new NotificationLifecycleError("FACILITY_ACCESS_DENIED");
  }
  const notification = await db.notification.findFirst({
    where: { id: input.notificationId, facilityId: input.facilityId },
    select: {
      id: true,
      requiresAcknowledgement: true,
      resolvedAt: true,
      recipients: {
        where: { userId: input.userId },
        select: { id: true, readAt: true, acknowledgedAt: true },
      },
    },
  });
  if (!notification) throw new NotificationLifecycleError("NOT_FOUND");
  if (notification.recipients.length === 0) throw new NotificationLifecycleError("NOT_RECIPIENT");
  return notification;
}

export async function markNotificationRead(
  db: Db,
  input: { facilityId: string; notificationId: string; userId: string; readAt?: Date },
): Promise<{ readAt: Date; acknowledgedAt: Date | null; resolvedAt: Date | null }> {
  const notification = await recipientRows(db, input);
  const readAt = input.readAt ?? new Date();
  await db.notificationRecipient.updateMany({
    where: {
      id: { in: notification.recipients.map((row) => row.id) },
      readAt: null,
    },
    data: { readAt },
  });
  const current = await db.notification.findFirstOrThrow({
    where: { id: notification.id },
    select: {
      resolvedAt: true,
      recipients: {
        where: { userId: input.userId },
        select: { readAt: true, acknowledgedAt: true },
        take: 1,
      },
    },
  });
  const recipient = current.recipients[0];
  if (!recipient?.readAt) throw new NotificationLifecycleError("NOT_RECIPIENT");
  return {
    readAt: recipient.readAt,
    acknowledgedAt: recipient.acknowledgedAt,
    resolvedAt: current.resolvedAt,
  };
}

/**
 * Acknowledgement is rejected when the thread does not require it.
 * Optional acknowledgement in Section 16 is not a stored requirement, so N1C
 * does not record it.
 */
export async function acknowledgeNotification(
  db: Db,
  input: { facilityId: string; notificationId: string; userId: string; acknowledgedAt?: Date },
): Promise<{ readAt: Date | null; acknowledgedAt: Date; resolvedAt: Date | null }> {
  const notification = await recipientRows(db, input);
  if (!notification.requiresAcknowledgement) {
    throw new NotificationLifecycleError("ACKNOWLEDGEMENT_NOT_REQUIRED");
  }
  const acknowledgedAt = input.acknowledgedAt ?? new Date();
  await db.notificationRecipient.updateMany({
    where: {
      id: { in: notification.recipients.map((row) => row.id) },
      acknowledgedAt: null,
    },
    data: { acknowledgedAt },
  });
  const current = await db.notification.findFirstOrThrow({
    where: { id: notification.id },
    select: {
      resolvedAt: true,
      recipients: {
        where: { userId: input.userId },
        select: { readAt: true, acknowledgedAt: true },
        take: 1,
      },
    },
  });
  const recipient = current.recipients[0];
  if (!recipient?.acknowledgedAt) throw new NotificationLifecycleError("NOT_RECIPIENT");
  return {
    readAt: recipient.readAt,
    acknowledgedAt: recipient.acknowledgedAt,
    resolvedAt: current.resolvedAt,
  };
}
