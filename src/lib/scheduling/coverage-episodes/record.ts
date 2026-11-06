/**
 * Coverage-owned episode writes.
 *
 * Runs inside the caller's transaction, after the domain mutation and after
 * the before-snapshot. Notifications receive the episode id. They do not
 * create it.
 */

import { Prisma } from "@prisma/client";

import { coverageAttentionThreadKey } from "@/lib/notifications/thread-key";
import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";

import { decideCoverageEpisodeTransition, type CoverageEpisodeDecision } from "./decide";
import { loadCoverageSlotSnapshot, type CoverageSlotSnapshot } from "./observe";

const ATTENTION = new Set<CanonicalCoverageState>(["AT_RISK", "UNCOVERED"]);
const OPEN_SAVEPOINT = "coverage_episode_open";
const TRANSITION_SAVEPOINT = "coverage_episode_transition";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isAttention(state: CanonicalCoverageState | null): state is "AT_RISK" | "UNCOVERED" {
  return state != null && ATTENTION.has(state);
}

export function coverageServiceTiming(slot: CoverageSlotSnapshot, at: Date): {
  serviceState: "active" | "before";
  minutesUntilService?: number;
} {
  if (slot.cycleStartsAt && at.getTime() >= slot.cycleStartsAt.getTime()) {
    if (!slot.cycleEndsAt || at.getTime() < slot.cycleEndsAt.getTime()) {
      return { serviceState: "active" };
    }
  }
  if (slot.cycleStartsAt && at.getTime() < slot.cycleStartsAt.getTime()) {
    const minutes = Math.ceil((slot.cycleStartsAt.getTime() - at.getTime()) / 60000);
    return { serviceState: "before", minutesUntilService: Math.max(0, minutes) };
  }
  // No cycle clock. Stay at Needs Attention. Do not invent an imminent window.
  return { serviceState: "before", minutesUntilService: 10080 };
}

async function lastState(
  tx: Prisma.TransactionClient,
  episodeId: string,
): Promise<CanonicalCoverageState | null> {
  const row = await tx.coverageEpisodeTransition.findFirst({
    where: { episodeId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { toState: true },
  });
  if (!row) return null;
  return row.toState as CanonicalCoverageState;
}

async function findOpenEpisode(
  tx: Prisma.TransactionClient,
  slot: CoverageSlotSnapshot,
) {
  return tx.coverageEpisode.findFirst({
    where: {
      facilityId: slot.facilityId,
      departmentId: slot.departmentId,
      serviceDate: new Date(`${slot.serviceDate}T00:00:00.000Z`),
      spaceId: slot.spaceId,
      responsibility: slot.responsibility,
      cycleStableKey: slot.cycleStableKey,
      closedAt: null,
    },
    select: { id: true },
  });
}

export async function recordCoverageEpisodeTransitions(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDateKey: string;
    before: ReadonlyMap<string, CoverageSlotSnapshot>;
    occurredAt: Date;
    sourceType: string;
    sourceId: string;
  },
): Promise<string[]> {
  const after = await loadCoverageSlotSnapshot(tx, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDateKey: input.serviceDateKey,
  });
  const keys = new Set<string>([...input.before.keys(), ...after.keys()]);
  const outboxIds: string[] = [];

  for (const key of keys) {
    const beforeSlot = input.before.get(key) ?? null;
    const afterSlot = after.get(key) ?? null;
    const slot = afterSlot ?? beforeSlot;
    if (!slot) continue;
    const windowEnded = Boolean(
      afterSlot?.cycleEndsAt && input.occurredAt.getTime() >= afterSlot.cycleEndsAt.getTime() && isAttention(afterSlot.state),
    );
    const open = await findOpenEpisode(tx, slot);
    const previous = open ? await lastState(tx, open.id) : (beforeSlot?.state ?? null);
    const decision = decideCoverageEpisodeTransition(
      previous,
      windowEnded ? "WINDOW_ENDED" : (afterSlot?.state ?? null),
    );
    if (decision.action === "none") continue;
    if (decision.action === "open" && open) continue;
    if (decision.action === "close" && !open) continue;
    if (decision.action === "continue" && !open) continue;

    const episodeId =
      decision.action === "open"
        ? await openEpisode(tx, slot, decision, input.occurredAt)
        : open!.id;
    if (!episodeId) continue;
    if (decision.action === "close") {
      await tx.coverageEpisode.update({
        where: { id: episodeId },
        data: { closedAt: input.occurredAt, closeReason: decision.closeReason },
      });
    }
    const transitionId = await writeTransition(tx, {
      episodeId,
      facilityId: input.facilityId,
      fromState: previous,
      decision,
      occurredAt: input.occurredAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      grainKey: key,
    });
    if (!transitionId) continue;
    const threadKey = coverageAttentionThreadKey({
      kind: "coverage",
      facilityId: slot.facilityId,
      serviceDate: slot.serviceDate,
      departmentId: slot.departmentId,
      spaceId: slot.spaceId,
      responsibility: slot.responsibility,
      cycleStableKey: slot.cycleStableKey,
      episodeId,
    });
    if (!decision.eventType) {
      if (decision.action !== "close") continue;
      const endedReason =
        decision.closeReason === "SERVICE_WINDOW_ENDED" ? "service_window_ended" : "requirement_removed";
      const expired = await enqueueNotificationEvent(tx, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        eventType: "attention.expired",
        aggregateType: "coverage_responsibility",
        aggregateId: threadKey,
        occurredAt: input.occurredAt,
        dedupeKey: `attention-expired:${episodeId}`,
        payload: {
          serviceDate: slot.serviceDate,
          departmentId: slot.departmentId,
          spaceId: slot.spaceId,
          responsibility: slot.responsibility,
          cycleStableKey: slot.cycleStableKey,
          coverageEpisodeId: episodeId,
          endedReason,
          locationLabel: slot.locationLabel,
          cycleLabel: slot.cycleLabel,
          unitId: slot.unitId,
        },
      });
      outboxIds.push(expired.id);
      continue;
    }
    const timing = coverageServiceTiming(slot, input.occurredAt);
    const intake = await enqueueNotificationEvent(tx, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: decision.eventType,
      aggregateType: "coverage_responsibility",
      aggregateId: threadKey,
      occurredAt: input.occurredAt,
      dedupeKey: `coverage-transition:${transitionId}`,
      payload: {
        serviceDate: slot.serviceDate,
        departmentId: slot.departmentId,
        spaceId: slot.spaceId,
        responsibility: slot.responsibility,
        cycleStableKey: slot.cycleStableKey,
        coverageEpisodeId: episodeId,
        coverageState: decision.action === "close" ? "COVERED" : decision.toState,
        locationLabel: slot.locationLabel,
        cycleLabel: slot.cycleLabel,
        unitId: slot.unitId,
        ...(decision.eventType === "coverage.became_uncovered" ? timing : {}),
      },
    });
    outboxIds.push(intake.id);
  }

  return outboxIds;
}

async function openEpisode(
  tx: Prisma.TransactionClient,
  slot: CoverageSlotSnapshot,
  decision: Extract<CoverageEpisodeDecision, { action: "open" }>,
  openedAt: Date,
): Promise<string | null> {
  await tx.$executeRawUnsafe(`SAVEPOINT ${OPEN_SAVEPOINT}`);
  try {
    const created = await tx.coverageEpisode.create({
      data: {
        facilityId: slot.facilityId,
        departmentId: slot.departmentId,
        serviceDate: new Date(`${slot.serviceDate}T00:00:00.000Z`),
        spaceId: slot.spaceId,
        responsibility: slot.responsibility,
        cycleStableKey: slot.cycleStableKey,
        openedAt,
        openingState: decision.toState,
      },
      select: { id: true },
    });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${OPEN_SAVEPOINT}`);
    return created.id;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${OPEN_SAVEPOINT}`);
    if (!isUniqueViolation(error)) throw error;
    const existing = await findOpenEpisode(tx, slot);
    if (!existing) return null;
    const current = await lastState(tx, existing.id);
    if (current == null || current === decision.toState) return null;
    return existing.id;
  }
}

async function writeTransition(
  tx: Prisma.TransactionClient,
  input: {
    episodeId: string;
    facilityId: string;
    fromState: CanonicalCoverageState | null;
    decision: Exclude<CoverageEpisodeDecision, { action: "none" }>;
    occurredAt: Date;
    sourceType: string;
    sourceId: string;
    grainKey: string;
  },
): Promise<string | null> {
  const dedupeKey = [
    "coverage-transition",
    input.sourceType,
    input.sourceId,
    input.grainKey,
    input.decision.action,
    input.decision.toState,
    input.decision.action === "close" ? input.decision.closeReason : "",
  ].join(":");
  const existing = await tx.coverageEpisodeTransition.findUnique({
    where: { facilityId_dedupeKey: { facilityId: input.facilityId, dedupeKey } },
    select: { id: true },
  });
  if (existing) return existing.id;

  await tx.$executeRawUnsafe(`SAVEPOINT ${TRANSITION_SAVEPOINT}`);
  try {
    const created = await tx.coverageEpisodeTransition.create({
      data: {
        episodeId: input.episodeId,
        facilityId: input.facilityId,
        fromState: input.fromState,
        toState: input.decision.toState,
        occurredAt: input.occurredAt,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        dedupeKey,
      },
      select: { id: true },
    });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${TRANSITION_SAVEPOINT}`);
    return created.id;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${TRANSITION_SAVEPOINT}`);
    if (!isUniqueViolation(error)) throw error;
    const winner = await tx.coverageEpisodeTransition.findUnique({
      where: { facilityId_dedupeKey: { facilityId: input.facilityId, dedupeKey } },
      select: { id: true },
    });
    return winner?.id ?? null;
  }
}
