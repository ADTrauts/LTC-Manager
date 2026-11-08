/**
 * Coverage time-boundary evaluator.
 *
 * The scheduler calls this. Coverage still derives the answer.
 * Time alone does not open an episode. An open episode can close, expire
 * attention, or ask Attention Policy to raise priority on the same thread.
 */

import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";
import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { COVERAGE_TIME_EPISODE_BATCH, SCHEDULED_EVALUATION_FACILITY_BATCH } from "@/lib/scheduled-evaluation/cadence";
import {
  forFacilityRotation,
  readEvaluationCheckpoint,
  writeEvaluationCheckpoint,
} from "@/lib/scheduled-evaluation/continuation";
import type { ScheduledEvaluationDb, ScheduledEvaluationResult } from "@/lib/scheduled-evaluation/types";

import { coverageGrainKey } from "./decide";
import { loadCoverageSlotSnapshot, type CoverageSlotSnapshot } from "./observe";
import { coverageServiceTiming, recordCoverageEpisodeTransitions } from "./record";

const ATTENTION = new Set<CanonicalCoverageState>(["AT_RISK", "UNCOVERED"]);

export type CoveragePriorityBand = "needs_attention" | "urgent" | "critical";

/**
 * Material attention bands for an open Uncovered slot.
 * Null means the window has ended or the state is not Uncovered.
 * The 120-minute line stays Needs Attention and is not a separate band.
 */
export function coveragePriorityBand(input: {
  state: CanonicalCoverageState;
  cycleStartsAt: Date | null;
  cycleEndsAt: Date | null;
  at: Date;
}): CoveragePriorityBand | null {
  if (input.state !== "UNCOVERED") return null;
  if (input.cycleEndsAt && input.at.getTime() >= input.cycleEndsAt.getTime()) return null;
  const timing = coverageServiceTiming(
    {
      cycleStartsAt: input.cycleStartsAt,
      cycleEndsAt: input.cycleEndsAt,
    } as CoverageSlotSnapshot,
    input.at,
  );
  if (timing.serviceState === "active") return "critical";
  const minutes = timing.minutesUntilService ?? Number.POSITIVE_INFINITY;
  if (minutes <= 30) return "urgent";
  return "needs_attention";
}

export async function evaluateCoverageTimeBoundaries(input: {
  db: ScheduledEvaluationDb;
  now: Date;
  facilityIds?: string[];
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
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "coverage.time-boundaries");
  const discovered = await input.db.coverageEpisode.findMany({
    where: {
      closedAt: null,
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
        const produced = await evaluateFacility(input.db, facilityId, input.now, afterId);
        if (!afterId) result.facilitiesScanned += 1;
        result.candidates += produced.candidates;
        result.transitions += produced.transitions;
        result.reevaluations += produced.reevaluations;
        result.failures += produced.failures;
        result.outboxIds.push(...produced.outboxIds);
        return { full: produced.full, lastId: produced.lastEpisodeId };
      } catch (error) {
        result.failures += 1;
        result.facilitiesScanned += 1;
        console.info(
          JSON.stringify({
            event: "scheduled_evaluation_failure",
            evaluator: "coverage.time-boundaries",
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
    await writeEvaluationCheckpoint(input.db, "coverage.time-boundaries", rotation.checkpoint, {
      owner: input.control?.owner,
      cycleCompleted: rotation.cycleCompleted,
      now: input.now,
    });
  }
  return result;
}

async function evaluateFacility(
  db: ScheduledEvaluationDb,
  facilityId: string,
  now: Date,
  afterEpisodeId: string | null,
): Promise<
  Pick<ScheduledEvaluationResult, "candidates" | "transitions" | "reevaluations" | "failures" | "outboxIds"> & {
    full: boolean;
    lastEpisodeId: string | null;
  }
> {
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { timezone: true },
  });
  const produced = {
    candidates: 0,
    transitions: 0,
    reevaluations: 0,
    failures: 0,
    outboxIds: [] as string[],
  };
  if (!facility) return { ...produced, full: false, lastEpisodeId: null };
  const today = getFacilityServiceDate(facility.timezone, now);
  const episodes = await db.coverageEpisode.findMany({
    where: {
      facilityId,
      closedAt: null,
      serviceDate: { lte: today },
      ...(afterEpisodeId ? { id: { gt: afterEpisodeId } } : {}),
    },
    orderBy: [{ id: "asc" }],
    take: COVERAGE_TIME_EPISODE_BATCH,
  });
  produced.candidates = episodes.length;
  const groups = new Map<string, typeof episodes>();
  for (const episode of episodes) {
    const key = `${episode.departmentId}:${toServiceDateKey(episode.serviceDate)}`;
    const group = groups.get(key) ?? [];
    group.push(episode);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    const separator = key.indexOf(":");
    const departmentId = key.slice(0, separator);
    const serviceDateKey = key.slice(separator + 1);
    try {
      const written = await db.$transaction(
        async (tx) => {
          const snapshot = await loadCoverageSlotSnapshot(tx, { facilityId, departmentId, serviceDateKey });
          const before = new Map(snapshot);
          for (const episode of group) {
            const grain = grainOf(episode);
            if (!before.has(grain.key)) before.set(grain.key, missingSlot(grain, episode.openingState));
          }
          const recorded = await recordCoverageEpisodeTransitions(tx, {
            facilityId,
            departmentId,
            serviceDateKey,
            before,
            occurredAt: now,
            sourceType: "scheduled_evaluation",
            sourceId: `coverage-time:${departmentId}:${serviceDateKey}`,
          });
          const openIds = group.map((episode) => episode.id);
          const stillOpen = await tx.coverageEpisode.findMany({
            where: { id: { in: openIds }, closedAt: null },
          });
          const reevaluationIds: string[] = [];
          for (const episode of stillOpen) {
            const slot = snapshot.get(grainOf(episode).key);
            if (!slot) continue;
            const band = coveragePriorityBand({
              state: slot.state,
              cycleStartsAt: slot.cycleStartsAt,
              cycleEndsAt: slot.cycleEndsAt,
              at: now,
            });
            if (band !== "urgent" && band !== "critical") continue;
            const timing = coverageServiceTiming(slot, now);
            const intake = await enqueueNotificationEvent(tx, {
              facilityId,
              departmentId,
              eventType: "attention.reevaluate",
              aggregateType: "coverage_responsibility",
              aggregateId: episode.id,
              occurredAt: now,
              dedupeKey: `coverage-episode:${episode.id}:priority:${band}`,
              payload: {
                serviceDate: slot.serviceDate,
                departmentId: slot.departmentId,
                spaceId: slot.spaceId,
                responsibility: slot.responsibility,
                cycleStableKey: slot.cycleStableKey,
                coverageEpisodeId: episode.id,
                coverageState: "UNCOVERED",
                locationLabel: slot.locationLabel,
                cycleLabel: slot.cycleLabel,
                unitId: slot.unitId,
                serviceState: timing.serviceState,
                ...(timing.minutesUntilService != null ? { minutesUntilService: timing.minutesUntilService } : {}),
              },
            });
            if (intake.outcome === "created") reevaluationIds.push(intake.id);
          }
          return { recorded, reevaluationIds };
        },
        { timeout: 15000 },
      );
      produced.transitions += written.recorded.length;
      produced.reevaluations += written.reevaluationIds.length;
      produced.outboxIds.push(...written.recorded, ...written.reevaluationIds);
    } catch (error) {
      produced.failures += 1;
      console.info(
        JSON.stringify({
          event: "scheduled_evaluation_failure",
          evaluator: "coverage.time-boundaries",
          facilityId,
          departmentId,
          error: error instanceof Error ? error.name : "Error",
        }),
      );
    }
  }
  return {
    ...produced,
    full: episodes.length === COVERAGE_TIME_EPISODE_BATCH,
    lastEpisodeId: episodes.at(-1)?.id ?? null,
  };
}

function grainOf(episode: {
  facilityId: string;
  serviceDate: Date;
  departmentId: string;
  spaceId: string;
  responsibility: string;
  cycleStableKey: string;
}) {
  const serviceDate = toServiceDateKey(episode.serviceDate);
  const fields = {
    facilityId: episode.facilityId,
    serviceDate,
    departmentId: episode.departmentId,
    spaceId: episode.spaceId,
    responsibility: episode.responsibility,
    cycleStableKey: episode.cycleStableKey,
  };
  return { ...fields, key: coverageGrainKey(fields) };
}

function missingSlot(
  grain: ReturnType<typeof grainOf>,
  openingState: string,
): CoverageSlotSnapshot {
  const state = ATTENTION.has(openingState as CanonicalCoverageState)
    ? (openingState as CanonicalCoverageState)
    : "UNCOVERED";
  return {
    key: grain.key,
    facilityId: grain.facilityId,
    departmentId: grain.departmentId,
    serviceDate: grain.serviceDate,
    spaceId: grain.spaceId,
    responsibility: grain.responsibility,
    cycleStableKey: grain.cycleStableKey,
    state,
    locationLabel: "Location",
    cycleLabel: "Service",
    unitId: null,
    cycleStartsAt: null,
    cycleEndsAt: null,
  };
}
