/**
 * Scheduled Evaluation asks whether a REQUIRED location-grain Key Point
 * passed its expected facility-local minute without an actual.
 * Department-grain Key Points are not evaluated. They have no room occurrence row.
 */

import type { PrismaClient } from "@prisma/client";

import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { SCHEDULED_EVALUATION_FACILITY_BATCH } from "@/lib/scheduled-evaluation/cadence";
import {
  forFacilityRotation,
  readEvaluationCheckpoint,
  writeEvaluationCheckpoint,
} from "@/lib/scheduled-evaluation/continuation";
import type { ScheduledEvaluationResult } from "@/lib/scheduled-evaluation/types";

import { enqueueKeyPointOverdue } from "./key-point-attention";
import {
  effectiveKeyPointDueLocal,
  isRequiredKeyPointOverdue,
  localHhMmFromInstant,
} from "./key-time-day-expectation";

const EXPECTATION_BATCH = 100;

type Db = PrismaClient;

const EMPTY: ScheduledEvaluationResult = {
  facilitiesScanned: 0,
  candidates: 0,
  transitions: 0,
  reevaluations: 0,
  failures: 0,
  outboxIds: [],
};

function utcDateWindow(now: Date): { from: Date; to: Date } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    from: new Date(day.getTime() - 24 * 60 * 60 * 1000),
    to: new Date(day.getTime() + 24 * 60 * 60 * 1000),
  };
}

export async function evaluateKeyPointOverdue(
  input: { db: Db; now: Date; facilityIds?: string[]; control?: { deadline: Date; owner?: string; renew: () => Promise<boolean> } },
): Promise<ScheduledEvaluationResult> {
  const result: ScheduledEvaluationResult = { ...EMPTY, outboxIds: [] };
  const window = utcDateWindow(input.now);
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "key-points.overdue");
  const discovered = await input.db.operationalCycleKeyTimeDayExpectation.findMany({
    where: {
      serviceDate: { gte: window.from, lte: window.to },
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
        const scanned = await evaluateFacility(input.db, facilityId, input.now, afterId);
        if (!afterId) result.facilitiesScanned += 1;
        result.candidates += scanned.candidates;
        result.transitions += scanned.transitions;
        result.outboxIds.push(...scanned.outboxIds);
        return { full: scanned.full, lastId: scanned.lastId };
      } catch (error) {
        result.failures += 1;
        result.facilitiesScanned += 1;
        console.info(
          JSON.stringify({
            event: "scheduled_evaluation",
            evaluator: "key-points.overdue",
            outcome: "facility_failed",
            facilityId,
            error: error instanceof Error ? error.name : "Error",
          }),
        );
        return { full: false, lastId: null };
      }
    },
  });
  result.cycleCompleted = input.facilityIds ? true : rotation.cycleCompleted;
  if (!input.facilityIds) {
    await writeEvaluationCheckpoint(input.db, "key-points.overdue", rotation.checkpoint, {
      owner: input.control?.owner,
      cycleCompleted: rotation.cycleCompleted,
      now: input.now,
    });
  }
  return result;
}

async function evaluateFacility(
  db: Db,
  facilityId: string,
  now: Date,
  afterId: string | null,
): Promise<Pick<ScheduledEvaluationResult, "candidates" | "transitions" | "outboxIds"> & { full: boolean; lastId: string | null }> {
  const timezone = await loadFacilityTimezone(db, facilityId);
  const serviceDate = getFacilityServiceDate(timezone, now);
  const serviceDateKey = toServiceDateKey(serviceDate);
  const nowLocal = localHhMmFromInstant(now, timezone);
  const expectations = await db.operationalCycleKeyTimeDayExpectation.findMany({
    where: { facilityId, serviceDate, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: [{ id: "asc" }],
    take: EXPECTATION_BATCH,
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      serviceDate: true,
      cycleId: true,
      cycleStableKey: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
      adjustedAt: true,
      spaceId: true,
      cycleLabel: true,
      space: { select: { name: true } },
      cycle: {
        select: { occurrenceTracking: true, keyPointGrain: true, nodeKind: true },
      },
    },
  });
  const cycleIds = [...new Set(expectations.map((row) => row.cycleId))];
  const adjustments = cycleIds.length
    ? await db.operationalCycleTimingAdjustment.findMany({
    where: {
      facilityId,
      serviceDate,
      adjustedDueLocal: { not: null },
      cycleId: { in: cycleIds },
    },
    orderBy: { recordedAt: "desc" },
    select: { cycleId: true, adjustedDueLocal: true, recordedAt: true },
  })
    : [];
  const latestAdjustment = new Map<string, { dueLocal: string; at: Date }>();
  for (const row of adjustments) {
    if (!row.adjustedDueLocal || latestAdjustment.has(row.cycleId)) continue;
    latestAdjustment.set(row.cycleId, { dueLocal: row.adjustedDueLocal, at: row.recordedAt });
  }
  const actuals = await db.operationalCycleKeyPointActual.findMany({
    where: {
      facilityId,
      serviceDate,
      spaceId: { not: null },
      cycleStableKey: { in: [...new Set(expectations.map((row) => row.cycleStableKey))] },
    },
    select: { cycleStableKey: true, spaceId: true },
  });
  const occurred = new Set(
    actuals.map((row) => `${row.cycleStableKey}:${row.spaceId}`),
  );

  const outboxIds: string[] = [];
  let candidates = 0;
  let transitions = 0;
  for (const row of expectations) {
    if (row.cycle.nodeKind !== "KEY_TIME") continue;
    if (row.cycle.keyPointGrain !== "LOCATION") continue;
    if (row.cycle.occurrenceTracking !== "REQUIRED") continue;
    candidates += 1;
    const adjustment = latestAdjustment.get(row.cycleId);
    const expectedLocal = effectiveKeyPointDueLocal({
      configuredDueLocal: row.configuredDueLocal,
      expectationAdjustedDueLocal: row.adjustedDueLocal,
      expectationAdjustedAt: row.adjustedAt,
      latestAdjustmentDueLocal: adjustment?.dueLocal,
      latestAdjustmentAt: adjustment?.at,
    });
    if (!expectedLocal) continue;
    const hasActual = occurred.has(`${row.cycleStableKey}:${row.spaceId}`);
    if (
      !isRequiredKeyPointOverdue({
        occurrenceTracking: "REQUIRED",
        configuredDueLocal: expectedLocal,
        adjustedDueLocal: null,
        hasActual,
        nowLocalHhMm: nowLocal,
      })
    ) {
      continue;
    }
    const created = await db.$transaction((tx) =>
      enqueueKeyPointOverdue(
        tx,
        {
          facilityId: row.facilityId,
          serviceDate: serviceDateKey,
          departmentId: row.departmentId,
          spaceId: row.spaceId,
          cycleStableKey: row.cycleStableKey,
          expectedLocal,
          locationLabel: row.space.name,
          keyPointLabel: row.cycleLabel,
        },
        now,
      ),
    );
    if (created) {
      transitions += 1;
      outboxIds.push(created);
    }
  }
  return {
    candidates,
    transitions,
    outboxIds,
    full: expectations.length === EXPECTATION_BATCH,
    lastId: expectations.at(-1)?.id ?? null,
  };
}
