/**
 * External delivery on the shared Scheduled Evaluation clock.
 *
 * This pass expires snoozes and asks the existing push worker to deliver.
 * It does not decide operational truth, acknowledgement, or escalation.
 * Quiet Hours do not wake when they end.
 */

import { SCHEDULED_EVALUATION_FACILITY_BATCH } from "@/lib/scheduled-evaluation/cadence";
import {
  forFacilityRotation,
  readEvaluationCheckpoint,
  writeEvaluationCheckpoint,
} from "@/lib/scheduled-evaluation/continuation";
import type { ScheduledEvaluationDb, ScheduledEvaluationResult } from "@/lib/scheduled-evaluation/types";

import { deliverQueuedPushDispatches, type PushTransport } from "./push-delivery";
import { enqueueSnoozeExpiryWake, SNOOZE_WAKE_HORIZON_MS } from "./push-dispatch";

export { SNOOZE_WAKE_HORIZON_MS };

export const EXTERNAL_DELIVERY_PAGE = 100;
export const EXTERNAL_DELIVERY_MAX_PAGES = 5;
export const EXTERNAL_DELIVERY_DISPATCH_LIMIT = 25;

type DueRecipient = { id: string; snoozedUntil: Date | null };

export async function evaluateExternalDelivery(input: {
  db: ScheduledEvaluationDb;
  now: Date;
  facilityIds?: string[];
  transport?: PushTransport;
  control?: { deadline: Date; owner?: string; renew: () => Promise<boolean> };
}): Promise<ScheduledEvaluationResult> {
  const result: ScheduledEvaluationResult = {
    facilitiesScanned: 0,
    candidates: 0,
    transitions: 0,
    reevaluations: 0,
    failures: 0,
    outboxIds: [],
  };
  const horizonStart = new Date(input.now.getTime() - SNOOZE_WAKE_HORIZON_MS);
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "notifications.external-delivery");
  const discovered = await input.db.notification.findMany({
    where: {
      resolvedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      recipients: { some: { snoozedUntil: { gte: horizonStart, lte: input.now } } },
      ...(input.facilityIds ? { facilityId: { in: input.facilityIds } } : {}),
    },
    distinct: ["facilityId"],
    select: { facilityId: true },
    orderBy: { facilityId: "asc" },
  });
  const ordered = [...new Set(discovered.map((row) => row.facilityId))].sort();
  const rotation = await forFacilityRotation({
    orderedIds: ordered,
    checkpoint,
    batchSize: SCHEDULED_EVALUATION_FACILITY_BATCH,
    oneList: Boolean(input.facilityIds),
    control: input.control,
    visit: async (facilityId, afterId) => {
      try {
        const scanned = await scanFacility(input.db, facilityId, input.now, horizonStart, afterId);
        if (!afterId) result.facilitiesScanned += 1;
        result.candidates += scanned.candidates;
        result.transitions += scanned.transitions;
        result.failures += scanned.failures;
        return { full: scanned.full, lastId: scanned.lastId };
      } catch {
        result.failures += 1;
        result.facilitiesScanned += 1;
        return { full: false, lastId: null };
      }
    },
  });
  result.cycleCompleted = input.facilityIds ? true : rotation.cycleCompleted;
  if (!input.facilityIds) {
    await writeEvaluationCheckpoint(input.db, "notifications.external-delivery", rotation.checkpoint, {
      owner: input.control?.owner,
      cycleCompleted: rotation.cycleCompleted,
      now: input.now,
    });
  }
  try {
    await deliverQueuedPushDispatches(input.db, {
      now: input.now,
      limit: EXTERNAL_DELIVERY_DISPATCH_LIMIT,
      ...(input.transport ? { transport: input.transport } : {}),
      ...(input.facilityIds ? { facilityIds: input.facilityIds } : {}),
    });
  } catch {
    result.failures += 1;
  }
  return result;
}

async function scanFacility(
  db: ScheduledEvaluationDb,
  facilityId: string,
  now: Date,
  horizonStart: Date,
  startAfter: string | null,
): Promise<Pick<ScheduledEvaluationResult, "candidates" | "transitions" | "failures"> & { lastId: string | null; full: boolean }> {
  const totals = { candidates: 0, transitions: 0, failures: 0, lastId: startAfter, full: false };
  let cursor = startAfter;
  for (let page = 0; page < EXTERNAL_DELIVERY_MAX_PAGES; page += 1) {
    const recipients: DueRecipient[] = await db.notificationRecipient.findMany({
      where: {
        snoozedUntil: { gte: horizonStart, lte: now },
        notification: {
          facilityId,
          resolvedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, snoozedUntil: true },
      orderBy: [{ id: "asc" }],
      take: EXTERNAL_DELIVERY_PAGE,
    });
    for (const recipient of recipients) {
      totals.candidates += 1;
      if (!recipient.snoozedUntil) continue;
      try {
        totals.transitions += await enqueueSnoozeExpiryWake(db, {
          recipientId: recipient.id,
          snoozedUntil: recipient.snoozedUntil,
          now,
        });
      } catch {
        totals.failures += 1;
      }
    }
    const last: DueRecipient | undefined = recipients[recipients.length - 1];
    if (!last) break;
    totals.lastId = last.id;
    cursor = last.id;
    if (recipients.length < EXTERNAL_DELIVERY_PAGE) break;
    if (page === EXTERNAL_DELIVERY_MAX_PAGES - 1) totals.full = true;
  }
  return totals;
}
