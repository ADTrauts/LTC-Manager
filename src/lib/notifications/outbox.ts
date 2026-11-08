import { Prisma } from "@prisma/client";

import { isNotificationEventType, type NotificationEventType } from "./event-types";

/**
 * Notifications & Attention intake. This is not a general event bus.
 *
 * Pass the client from `prisma.$transaction`. The root Prisma client is rejected
 * at runtime: Prisma's transaction client type is a structural subset, so
 * TypeScript still accepts a root client. `$transaction` and `$connect` exist
 * only on the root client.
 *
 * The write is one `NotificationOutbox` row. It does not choose priority,
 * recipients, or a Notification, and it does not touch the source domain.
 *
 * `dedupeKey` is the intake attempt within the facility. It is not the
 * attention thread key from `coverageAttentionThreadKey`.
 */

const ROOT_CLIENT_METHODS = ["$transaction", "$connect"] as const;

export type NotificationIntake = {
  facilityId: string;
  departmentId?: string | null;
  eventType: NotificationEventType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
};

export type NotificationIntakeResult =
  | { outcome: "created"; id: string }
  | { outcome: "duplicate"; id: string };

function assertTransactionClient(tx: Prisma.TransactionClient): void {
  const record = tx as unknown as Record<string, unknown>;
  if (ROOT_CLIENT_METHODS.some((method) => typeof record[method] === "function")) {
    throw new Error(
      "enqueueNotificationEvent requires the transaction client from prisma.$transaction",
    );
  }
}

function assertCanonicalPart(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a non-empty canonical id`);
  }
}

function assertIntake(event: NotificationIntake): void {
  assertCanonicalPart("facilityId", event.facilityId);
  if (event.departmentId != null) {
    assertCanonicalPart("departmentId", event.departmentId);
  }
  if (!isNotificationEventType(event.eventType)) {
    throw new Error("eventType is not in the notification catalog");
  }
  assertCanonicalPart("aggregateType", event.aggregateType);
  assertCanonicalPart("aggregateId", event.aggregateId);
  assertCanonicalPart("dedupeKey", event.dedupeKey);
  if (!(event.occurredAt instanceof Date) || Number.isNaN(event.occurredAt.getTime())) {
    throw new Error("occurredAt must be a valid server instant");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const INTAKE_SAVEPOINT = "notification_intake";

export async function enqueueNotificationEvent(
  tx: Prisma.TransactionClient,
  event: NotificationIntake,
): Promise<NotificationIntakeResult> {
  assertTransactionClient(tx);
  assertIntake(event);
  const where = {
    facilityId_dedupeKey: {
      facilityId: event.facilityId,
      dedupeKey: event.dedupeKey,
    },
  } as const;
  const prior = await tx.notificationOutbox.findUnique({ where, select: { id: true } });
  if (prior) return { outcome: "duplicate", id: prior.id };

  // A unique conflict aborts the surrounding Postgres transaction. The savepoint
  // lets the caller's other writes continue, then the read sees the winning row.
  await tx.$executeRawUnsafe(`SAVEPOINT ${INTAKE_SAVEPOINT}`);
  try {
    const created = await tx.notificationOutbox.create({
      data: {
        facilityId: event.facilityId,
        departmentId: event.departmentId ?? null,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt,
        payload: event.payload,
        dedupeKey: event.dedupeKey,
      },
      select: { id: true },
    });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${INTAKE_SAVEPOINT}`);
    return { outcome: "created", id: created.id };
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${INTAKE_SAVEPOINT}`);
    if (!isUniqueViolation(error)) throw error;
    const existing = await tx.notificationOutbox.findUnique({ where, select: { id: true } });
    if (!existing) throw error;
    return { outcome: "duplicate", id: existing.id };
  }
}
