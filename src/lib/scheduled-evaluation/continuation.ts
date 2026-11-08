import { SCHEDULED_EVALUATION_OVERDUE_MS } from "./cadence";
import type { ScheduledEvaluationDb } from "./types";

export type EvaluationCheckpoint = {
  facilityCursor: string | null;
  recordCursor: string | null;
  recordFacilityId: string | null;
};

/** Extra full record pages resumed inside one invocation. Five pages remain the query cap. */
export const FACILITY_RECORD_CONTINUATIONS = 8;

export const EMPTY_CHECKPOINT: EvaluationCheckpoint = {
  facilityCursor: null,
  recordCursor: null,
  recordFacilityId: null,
};

/**
 * Next bounded slice of a sorted id list.
 * A cursor past the end wraps to the start. The cursor itself is not repeated
 * until that wrap. A short tail is returned as its own slice so the following
 * pass starts over, instead of evaluating the head twice in one pass.
 */
export function takeFacilityBatch(
  sortedIds: readonly string[],
  cursor: string | null,
  limit: number,
): { ids: string[]; nextCursor: string | null } {
  if (limit <= 0 || sortedIds.length === 0) return { ids: [], nextCursor: null };
  const start = cursor == null ? 0 : sortedIds.findIndex((id) => id > cursor);
  const slice = start === -1 ? sortedIds.slice(0, limit) : sortedIds.slice(start, start + limit);
  return { ids: slice, nextCursor: slice.at(-1) ?? null };
}

export function evaluationIsOverdue(
  lastSucceededAt: Date | null,
  now: Date,
  thresholdMs = SCHEDULED_EVALUATION_OVERDUE_MS,
): boolean {
  if (!lastSucceededAt) return true;
  return now.getTime() - lastSucceededAt.getTime() > thresholdMs;
}

type CheckpointRow = {
  resumeAfter: string | null;
  resumeFacilityId: string | null;
};

type CheckpointDelegate = {
  findUnique: (args: {
    where: { evaluatorKey: string };
    select: { resumeAfter: true; resumeFacilityId: true };
  }) => Promise<CheckpointRow | null>;
  update?: (args: {
    where: { evaluatorKey: string };
    data: Record<string, unknown>;
  }) => Promise<unknown>;
  updateMany?: (args: {
    where: { evaluatorKey: string; lockedBy?: string };
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
};

function delegate(db: ScheduledEvaluationDb): CheckpointDelegate | null {
  const table = (db as ScheduledEvaluationDb & { scheduledEvaluationLease?: CheckpointDelegate })
    .scheduledEvaluationLease;
  if (!table?.findUnique || (!table.update && !table.updateMany)) return null;
  return table;
}

export async function readEvaluationCheckpoint(
  db: ScheduledEvaluationDb,
  evaluatorKey: string,
): Promise<EvaluationCheckpoint> {
  const table = delegate(db);
  if (!table) return { ...EMPTY_CHECKPOINT };
  const row = await table.findUnique({
    where: { evaluatorKey },
    select: { resumeAfter: true, resumeFacilityId: true },
  });
  if (!row) return { ...EMPTY_CHECKPOINT };
  return parseStoredCheckpoint(row);
}

/**
 * `resumeAfter` is the last facility id finished.
 * `resumeFacilityId` stores an in-facility record cursor as `facilityId|recordId`
 * while that facility still has a full page left. A failing facility is still
 * finished so the next facility is not stuck behind it.
 */
export async function writeEvaluationCheckpoint(
  db: ScheduledEvaluationDb,
  evaluatorKey: string,
  checkpoint: EvaluationCheckpoint,
  fence?: { owner?: string; cycleCompleted?: boolean; now?: Date },
): Promise<boolean> {
  const table = delegate(db);
  if (!table) return false;
  const resumeFacilityId =
    checkpoint.recordFacilityId && checkpoint.recordCursor
      ? `${checkpoint.recordFacilityId}|${checkpoint.recordCursor}`
      : null;
  const data: Record<string, unknown> = {
    resumeAfter: checkpoint.facilityCursor,
    resumeFacilityId,
    ...(fence?.cycleCompleted && fence.now ? { lastCycleCompletedAt: fence.now } : {}),
  };
  if (fence?.owner && table.updateMany) {
    const updated = await table.updateMany({
      where: { evaluatorKey, lockedBy: fence.owner },
      data,
    });
    return updated.count === 1;
  }
  if (!table.update) return false;
  await table.update({ where: { evaluatorKey }, data });
  return true;
}

/**
 * Visit every eligible Facility that fits in this invocation.
 * Each slice stays at `batchSize`. The pass stops at the execution deadline,
 * when renewal fails, or when every id has been visited. A full page for one
 * Facility is resumed before the next Facility. The batch size does not change.
 */
export async function forFacilityRotation(input: {
  orderedIds: readonly string[];
  checkpoint: EvaluationCheckpoint;
  batchSize: number;
  oneList: boolean;
  control?: { deadline: Date; renew: () => Promise<boolean> };
  visit: (
    facilityId: string,
    afterId: string | null,
  ) => Promise<{ full: boolean; lastId: string | null }>;
}): Promise<{ checkpoint: EvaluationCheckpoint; cycleCompleted: boolean }> {
  const seen = new Set<string>();
  const checkpoint: EvaluationCheckpoint = { ...input.checkpoint };
  let cursor = checkpoint.facilityCursor;
  let stopped = false;

  while (!stopped) {
    if (input.control && Date.now() >= input.control.deadline.getTime()) break;
    if (input.control && !(await input.control.renew())) break;
    const batch = input.oneList
      ? { ids: input.orderedIds }
      : takeFacilityBatch(input.orderedIds, cursor, input.batchSize);
    let ids = batch.ids.filter((id) => !seen.has(id));
    if (
      checkpoint.recordFacilityId &&
      !seen.has(checkpoint.recordFacilityId) &&
      !ids.includes(checkpoint.recordFacilityId)
    ) {
      ids = [checkpoint.recordFacilityId, ...ids.slice(0, Math.max(0, input.batchSize - 1))];
    }
    if (ids.length === 0) break;
    for (const facilityId of ids) {
      if (input.control && Date.now() >= input.control.deadline.getTime()) {
        stopped = true;
        break;
      }
      let after = recordCursorFor(checkpoint, facilityId);
      let paging = true;
      let continuations = 0;
      while (paging) {
        const scanned = await input.visit(facilityId, after);
        seen.add(facilityId);
        cursor = facilityId;
        checkpoint.facilityCursor = facilityId;
        if (
          scanned.full &&
          scanned.lastId &&
          scanned.lastId !== after &&
          continuations < FACILITY_RECORD_CONTINUATIONS
        ) {
          continuations += 1;
          checkpoint.recordFacilityId = facilityId;
          checkpoint.recordCursor = scanned.lastId;
          after = scanned.lastId;
          if (input.control && Date.now() >= input.control.deadline.getTime()) {
            stopped = true;
            paging = false;
          }
        } else {
          if (checkpoint.recordFacilityId === facilityId) {
            checkpoint.recordFacilityId = null;
            checkpoint.recordCursor = null;
          }
          paging = false;
        }
      }
    }
    if (input.oneList) break;
  }

  const cycleCompleted =
    !stopped &&
    !checkpoint.recordCursor &&
    input.orderedIds.every((id) => seen.has(id));
  if (cycleCompleted) checkpoint.facilityCursor = null;
  return { checkpoint, cycleCompleted };
}

export function recordCursorFor(
  checkpoint: EvaluationCheckpoint,
  facilityId: string,
): string | null {
  if (!checkpoint.recordFacilityId || checkpoint.recordFacilityId !== facilityId) return null;
  return checkpoint.recordCursor;
}

export function parseStoredCheckpoint(row: {
  resumeAfter: string | null;
  resumeFacilityId: string | null;
}): EvaluationCheckpoint {
  if (!row.resumeFacilityId) {
    return { facilityCursor: row.resumeAfter, recordCursor: null, recordFacilityId: null };
  }
  const split = row.resumeFacilityId.indexOf("|");
  if (split <= 0) {
    return { facilityCursor: row.resumeAfter, recordCursor: null, recordFacilityId: null };
  }
  return {
    facilityCursor: row.resumeAfter,
    recordFacilityId: row.resumeFacilityId.slice(0, split),
    recordCursor: row.resumeFacilityId.slice(split + 1),
  };
}
