/**
 * Key Point attention intake.
 * The domain decides the occurrence. Notifications does not read the screen.
 * `milestone.*` is the catalog id. The product word is Key Point.
 */

import type { Prisma } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import {
  keyPointDeadlineMovedIntakeDedupeKey,
  keyPointOverdueIntakeDedupeKey,
  keyPointRecordedIntakeDedupeKey,
  type KeyPointAttentionThread,
} from "@/lib/notifications/thread-key";

export type KeyPointAttentionGrain = Omit<KeyPointAttentionThread, "kind"> & {
  expectedLocal: string;
  locationLabel: string;
  keyPointLabel: string;
};

function payload(grain: KeyPointAttentionGrain): Prisma.InputJsonValue {
  return {
    serviceDate: grain.serviceDate,
    departmentId: grain.departmentId,
    spaceId: grain.spaceId,
    cycleStableKey: grain.cycleStableKey,
    expectedLocal: grain.expectedLocal,
    locationLabel: grain.locationLabel,
    keyPointLabel: grain.keyPointLabel,
  };
}

function thread(grain: KeyPointAttentionGrain): Omit<KeyPointAttentionThread, "kind"> {
  return {
    facilityId: grain.facilityId,
    serviceDate: grain.serviceDate,
    departmentId: grain.departmentId,
    spaceId: grain.spaceId,
    cycleStableKey: grain.cycleStableKey,
  };
}

export async function enqueueKeyPointOverdue(
  tx: Prisma.TransactionClient,
  grain: KeyPointAttentionGrain,
  occurredAt: Date,
): Promise<string | null> {
  const identity = thread(grain);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: grain.facilityId,
    departmentId: grain.departmentId,
    eventType: "milestone.overdue",
    aggregateType: "key_point_occurrence",
    aggregateId: `${grain.serviceDate}:${grain.spaceId}:${grain.cycleStableKey}`,
    occurredAt,
    dedupeKey: keyPointOverdueIntakeDedupeKey(identity, grain.expectedLocal),
    payload: payload(grain),
  });
  return result.outcome === "created" ? result.id : null;
}

export async function enqueueKeyPointRecorded(
  tx: Prisma.TransactionClient,
  grain: KeyPointAttentionGrain,
  occurredAt: Date,
): Promise<string | null> {
  const identity = thread(grain);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: grain.facilityId,
    departmentId: grain.departmentId,
    eventType: "milestone.recorded",
    aggregateType: "key_point_occurrence",
    aggregateId: `${grain.serviceDate}:${grain.spaceId}:${grain.cycleStableKey}`,
    occurredAt,
    dedupeKey: keyPointRecordedIntakeDedupeKey(identity),
    payload: payload(grain),
  });
  return result.outcome === "created" ? result.id : null;
}

export async function enqueueKeyPointDeadlineMoved(
  tx: Prisma.TransactionClient,
  grain: KeyPointAttentionGrain,
  occurredAt: Date,
): Promise<string | null> {
  const identity = thread(grain);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: grain.facilityId,
    departmentId: grain.departmentId,
    eventType: "milestone.deadline_moved",
    aggregateType: "key_point_occurrence",
    aggregateId: `${grain.serviceDate}:${grain.spaceId}:${grain.cycleStableKey}`,
    occurredAt,
    dedupeKey: keyPointDeadlineMovedIntakeDedupeKey(identity, grain.expectedLocal),
    payload: payload(grain),
  });
  return result.outcome === "created" ? result.id : null;
}
