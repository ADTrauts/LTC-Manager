/**
 * Authoritative pure Dietary Job Flow resolver (Phase 9B).
 * Testable without DB. Deterministic. Does not invent Breakfast.
 * Draft assignments never appear — caller must filter to frontline-visible confirmed plans.
 */

import type { OperationalCycleContext, ResolvedCycleOccurrence } from "@/lib/operational-cycles/types";
import {
  resolveCycleMilestoneStatus,
  type ServeryEventMilestoneSnapshot,
} from "@/lib/operational-cycles/milestone-cycle-status";
import { parseFacilityLocalScheduledStart } from "@/lib/operational-time";

import { resolveCurrentExpectation } from "./expectation";
import type {
  JobFlowAssignmentSnapshot,
  JobFlowAttentionItem,
  JobFlowContext,
  JobFlowCycleSnapshot,
  JobFlowMilestoneState,
  JobFlowPhaseStatus,
  JobFlowProgressPhase,
  JobFlowSyncState,
  JobFlowUnitSnapshot,
} from "./types";

export type JobFlowOfflineQueueSummary = {
  pendingCount: number;
  conflictCount: number;
  synchronizingCount?: number;
  lastSuccessfulSyncAt?: string | null;
  connectivity?: JobFlowSyncState["connectivity"];
};

export type JobFlowResolveInput = {
  now: Date;
  facilityTimezone: string;
  operationalDateKey: string;
  /** Frontline-visible confirmed assignments only (caller filtered drafts). */
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  /** Prior completed assignment today when between sequential windows. */
  previousAssignment?: JobFlowAssignmentSnapshot | null;
  /** All day assignments for progress (confirmed/frontline only). */
  dayAssignments?: readonly JobFlowAssignmentSnapshot[];
  cycleContext: OperationalCycleContext;
  /** Descriptions keyed by cycle id — never parsed into tasks. */
  cycleDescriptions?: Readonly<Record<string, string | null>>;
  mealTargetTime: string | null;
  milestoneEvent: ServeryEventMilestoneSnapshot | null;
  offlineQueue?: JobFlowOfflineQueueSummary | null;
  planStatus: string | null;
  reauthenticationRequired?: boolean;
  offlineStale?: boolean;
  assignmentUpdated?: boolean;
  unit?: JobFlowUnitSnapshot | null;
};

function emptyBase(
  input: JobFlowResolveInput,
  expectation: string,
): Pick<
  JobFlowContext,
  | "operationalDateKey"
  | "facilityTimezone"
  | "current"
  | "next"
  | "progress"
  | "attention"
  | "evidenceRequirements"
  | "workRequirements"
  | "spaceWorkSummaries"
> {
  return {
    operationalDateKey: input.operationalDateKey,
    facilityTimezone: input.facilityTimezone,
    current: {
      expectation,
      targetTime: input.mealTargetTime,
      syncState: syncFromQueue(input.offlineQueue),
    },
    next: {},
    progress: { phases: [] },
    attention: buildAttention(input, null),
    evidenceRequirements: [],
    workRequirements: [],
    spaceWorkSummaries: [],
  };
}

function syncFromQueue(
  queue: JobFlowOfflineQueueSummary | null | undefined,
): JobFlowSyncState | null {
  if (!queue) return null;
  return {
    connectivity: queue.connectivity ?? null,
    pendingCount: queue.pendingCount,
    conflictCount: queue.conflictCount,
    lastSuccessfulSyncAt: queue.lastSuccessfulSyncAt ?? null,
  };
}

function toCycleSnapshot(
  occ: ResolvedCycleOccurrence,
  descriptions: Readonly<Record<string, string | null>> | undefined,
): JobFlowCycleSnapshot {
  return {
    id: occ.id,
    label: occ.label,
    cycleType: occ.cycleType,
    description: descriptions?.[occ.id] ?? null,
    startLocal: occ.startLocal,
    endLocal: occ.endLocal,
    startsAt: occ.startsAt,
    endsAt: occ.endsAt,
    mealType: occ.mealType,
    expectedMilestones: occ.expectedMilestones,
  };
}

function primaryCycle(
  ctx: OperationalCycleContext,
  descriptions: Readonly<Record<string, string | null>> | undefined,
): JobFlowCycleSnapshot | null {
  switch (ctx.state) {
    case "ACTIVE":
      return toCycleSnapshot(ctx.primary, descriptions);
    case "UPCOMING":
    case "BETWEEN":
      return toCycleSnapshot(ctx.next, descriptions);
    case "DAY_COMPLETE":
      return toCycleSnapshot(ctx.last, descriptions);
    default:
      return null;
  }
}

function nextCycle(
  ctx: OperationalCycleContext,
  descriptions: Readonly<Record<string, string | null>> | undefined,
): JobFlowCycleSnapshot | null {
  switch (ctx.state) {
    case "ACTIVE":
      return ctx.next ? toCycleSnapshot(ctx.next, descriptions) : null;
    case "UPCOMING":
    case "BETWEEN":
      return toCycleSnapshot(ctx.next, descriptions);
    default:
      return null;
  }
}

function minutesUntilNext(ctx: OperationalCycleContext): number | null {
  switch (ctx.state) {
    case "ACTIVE":
      return ctx.minutesUntilNext;
    case "UPCOMING":
    case "BETWEEN":
      return ctx.minutesUntilNext;
    default:
      return null;
  }
}

function milestoneStateFor(
  input: JobFlowResolveInput,
  cycle: JobFlowCycleSnapshot | null,
): JobFlowMilestoneState | null {
  if (!cycle || cycle.expectedMilestones.length === 0) return null;
  let mealTargetAt: Date | null = null;
  if (input.mealTargetTime) {
    mealTargetAt = parseFacilityLocalScheduledStart(
      input.mealTargetTime,
      input.now,
      input.facilityTimezone,
    );
  }
  const status = resolveCycleMilestoneStatus({
    event: input.milestoneEvent,
    expectedMilestones: cycle.expectedMilestones,
    mealTargetAt,
    now: input.now,
  });
  return { key: status.key, label: status.label };
}

function phaseStatusFromMilestone(
  key: string | null,
  offline: JobFlowOfflineQueueSummary | null | undefined,
): JobFlowPhaseStatus {
  if (offline && offline.conflictCount > 0) return "ReviewRequired";
  if (offline && (offline.synchronizingCount ?? 0) > 0) return "Synchronizing";
  if (offline && offline.pendingCount > 0) return "SavedOnThisTablet";
  if (
    key === "READY_CONFIRMED" ||
    key === "SERVICE_STARTED" ||
    key === "SERVICE_STARTED_LATE" ||
    key === "CORRECTED"
  ) {
    return "Confirmed";
  }
  if (key === "CONFLICT_REVIEW") return "ReviewRequired";
  if (key == null) return "Upcoming";
  return "NotConfirmed";
}

function buildProgress(
  input: JobFlowResolveInput,
  cycle: JobFlowCycleSnapshot | null,
  milestone: JobFlowMilestoneState | null,
): JobFlowProgressPhase[] {
  const phases: JobFlowProgressPhase[] = [];
  const assignments = input.dayAssignments ?? [];
  for (const a of assignments) {
    let status: JobFlowPhaseStatus = "Upcoming";
    if (input.currentAssignment?.id === a.id) status = "Current";
    else if (a.endsAt && a.endsAt.getTime() <= input.now.getTime()) status = "Confirmed";
    phases.push({
      id: `assignment:${a.id}`,
      label: a.roleLabel,
      kind: "assignment",
      status,
    });
  }

  if (cycle) {
    const cycleStatus: JobFlowPhaseStatus =
      input.cycleContext.state === "ACTIVE" &&
      input.cycleContext.primary.id === cycle.id
        ? "Current"
        : input.cycleContext.state === "DAY_COMPLETE"
          ? "Confirmed"
          : cycle.startsAt.getTime() > input.now.getTime()
            ? "Upcoming"
            : "Confirmed";
    phases.push({
      id: `cycle:${cycle.id}`,
      label: cycle.label,
      kind: "cycle",
      status: cycleStatus,
      targetTime: input.mealTargetTime,
    });

    for (const m of cycle.expectedMilestones) {
      const label = m === "READY" ? "Servery Ready" : "Meal Service Started";
      const relevantKey =
        m === "READY"
          ? milestone?.key?.startsWith("READY") ||
            milestone?.key === "NOT_CONFIRMED" ||
            milestone?.key === "STARTED_WITHOUT_READY"
            ? milestone.key
            : null
          : milestone?.key ?? null;
      phases.push({
        id: `milestone:${cycle.id}:${m}`,
        label,
        kind: "milestone",
        status: phaseStatusFromMilestone(
          m === "READY"
            ? input.milestoneEvent?.mealServiceReadyAt
              ? "READY_CONFIRMED"
              : relevantKey
            : input.milestoneEvent?.mealServiceStartedAt
              ? milestone?.key === "SERVICE_STARTED_LATE"
                ? "SERVICE_STARTED_LATE"
                : "SERVICE_STARTED"
              : milestone?.key ?? "NOT_CONFIRMED",
          input.offlineQueue,
        ),
        targetTime: m === "SERVICE_STARTED" ? input.mealTargetTime : null,
      });
    }
  }

  return phases;
}

function buildAttention(
  input: JobFlowResolveInput,
  milestone: JobFlowMilestoneState | null,
): JobFlowAttentionItem[] {
  const items: JobFlowAttentionItem[] = [];

  if (input.offlineStale) {
    items.push({ kind: "stale", message: "Offline context is stale. Synchronize when online." });
  }

  if (input.planStatus === "DRAFT" || input.planStatus == null) {
    // Frontline should not see drafts; if plan is draft, surface not confirmed.
    if (!input.currentAssignment && !input.upcomingAssignment) {
      items.push({
        kind: "assignment_not_confirmed",
        message: "No confirmed Assignment for today.",
      });
    }
  }

  if (input.assignmentUpdated) {
    items.push({
      kind: "assignment_updated",
      message: "Your Assignment was updated. Showing the current Assignment.",
    });
  }

  if (milestone) {
    if (
      milestone.key === "SERVICE_STARTED_LATE" ||
      milestone.key === "STARTED_WITHOUT_READY"
    ) {
      items.push({
        kind: "milestone_late",
        message: milestone.label,
      });
    } else if (
      milestone.key === "NOT_CONFIRMED" ||
      milestone.key === "READY_NOT_CONFIRMED"
    ) {
      items.push({
        kind: "milestone_not_confirmed",
        message: "Milestone not confirmed for your unit.",
      });
    } else if (milestone.key === "CONFLICT_REVIEW") {
      items.push({
        kind: "conflict_review",
        message: "A milestone needs conflict review.",
      });
    }
  }

  if (input.offlineQueue && input.offlineQueue.conflictCount > 0) {
    if (!items.some((i) => i.kind === "conflict_review")) {
      items.push({
        kind: "conflict_review",
        message: "Offline work needs conflict review.",
      });
    }
  } else if (input.offlineQueue && input.offlineQueue.pendingCount > 0) {
    items.push({
      kind: "pending_sync",
      message: "Saved on this tablet — waiting to synchronize.",
    });
  }

  if (
    input.cycleContext.state === "NOT_CONFIGURED" &&
    (input.currentAssignment || input.upcomingAssignment)
  ) {
    items.push({
      kind: "missing_config",
      message: "Operational cycles are not configured for this department.",
    });
  }

  return items;
}

function expectationFor(
  input: JobFlowResolveInput,
  cycle: JobFlowCycleSnapshot | null,
  milestone: JobFlowMilestoneState | null,
): { expectation: string; nextMilestoneExpectation: string | null } {
  if (!cycle) {
    if (!input.currentAssignment && !input.upcomingAssignment) {
      return {
        expectation: "No confirmed Assignment for today.",
        nextMilestoneExpectation: null,
      };
    }
    if (input.upcomingAssignment && !input.currentAssignment) {
      return {
        expectation: `Your Assignment begins at ${
          input.upcomingAssignment.startsAt
            ? input.upcomingAssignment.startsAt.toISOString()
            : "the scheduled time"
        }.`,
        nextMilestoneExpectation: null,
      };
    }
    return {
      expectation: input.currentAssignment
        ? `Assigned: ${input.currentAssignment.roleLabel}.`
        : "No current operational cycle.",
      nextMilestoneExpectation: null,
    };
  }

  const readyConfirmed = Boolean(input.milestoneEvent?.mealServiceReadyAt);
  const startedConfirmed = Boolean(input.milestoneEvent?.mealServiceStartedAt);

  return resolveCurrentExpectation({
    cycleType: cycle.cycleType,
    description: cycle.description,
    label: cycle.label,
    expectedMilestones: cycle.expectedMilestones,
    mealTargetTime: input.mealTargetTime,
    milestoneKey: milestone?.key ?? null,
    readyConfirmed,
    startedConfirmed,
  });
}

function unitFrom(
  input: JobFlowResolveInput,
  assignment: JobFlowAssignmentSnapshot | null,
): JobFlowUnitSnapshot | null {
  if (input.unit) return input.unit;
  if (assignment?.unitId) {
    return { id: assignment.unitId, name: assignment.unitName ?? assignment.unitId };
  }
  return null;
}

/**
 * Resolve derived Job Flow context. Priority:
 * REAUTHENTICATION_REQUIRED → OFFLINE_STALE → NOT_APPLICABLE →
 * assignment timing states → cycle-bearing ACTIVE/READY → NOT_CONFIGURED → DAY_COMPLETE.
 */
export function resolveJobFlow(input: JobFlowResolveInput): JobFlowContext {
  const descriptions = input.cycleDescriptions;

  if (input.reauthenticationRequired) {
    const base = emptyBase(input, "Reauthentication is required.");
    return { ...base, state: "REAUTHENTICATION_REQUIRED" };
  }

  if (input.offlineStale) {
    const base = emptyBase(input, "Offline context is stale.");
    return { ...base, state: "OFFLINE_STALE", attention: buildAttention(input, null) };
  }

  if (input.cycleContext.state === "NOT_APPLICABLE") {
    const base = emptyBase(input, "Operational cycles do not apply to this location.");
    return { ...base, state: "NOT_APPLICABLE" };
  }

  const cycle = primaryCycle(input.cycleContext, descriptions);
  const upcomingCycle = nextCycle(input.cycleContext, descriptions);
  const milestone = milestoneStateFor(input, cycle);
  const { expectation, nextMilestoneExpectation } = expectationFor(input, cycle, milestone);
  const attention = buildAttention(input, milestone);
  const progress = { phases: buildProgress(input, cycle, milestone) };
  const syncState = syncFromQueue(input.offlineQueue);
  const unit = unitFrom(input, input.currentAssignment ?? input.upcomingAssignment);

  const shared = {
    operationalDateKey: input.operationalDateKey,
    facilityTimezone: input.facilityTimezone,
    current: {
      assignment: input.currentAssignment,
      unit,
      cycle,
      expectation,
      targetTime: input.mealTargetTime,
      milestoneState: milestone,
      syncState,
    },
    next: {
      cycle: upcomingCycle,
      assignment: input.upcomingAssignment,
      milestoneExpectation: nextMilestoneExpectation,
      minutesUntil: minutesUntilNext(input.cycleContext),
    },
    progress,
    attention,
    evidenceRequirements: [] as import("./types").JobFlowContext["evidenceRequirements"],
    workRequirements: [] as import("./types").JobFlowContext["workRequirements"],
    spaceWorkSummaries: [] as import("./types").JobFlowContext["spaceWorkSummaries"],
  };

  // No confirmed assignment at all.
  if (!input.currentAssignment && !input.upcomingAssignment) {
    if (input.cycleContext.state === "NOT_CONFIGURED") {
      return {
        ...shared,
        state: "NOT_CONFIGURED",
        reason: input.cycleContext.reason,
        current: {
          ...shared.current,
          expectation:
            input.cycleContext.reason === "NO_PUBLISHED_CYCLES"
              ? "No published operational cycles are configured."
              : "No operational cycles apply for this date.",
        },
      };
    }
    if (input.cycleContext.state === "DAY_COMPLETE") {
      return {
        ...shared,
        state: "DAY_COMPLETE",
        lastCycle: cycle,
        lastAssignment: input.previousAssignment ?? null,
        current: {
          ...shared.current,
          expectation: "All configured cycles for today have passed.",
        },
      };
    }
    return {
      ...shared,
      state: "NO_CONFIRMED_ASSIGNMENT",
      cycle,
      current: {
        ...shared.current,
        expectation: "No confirmed Assignment for today.",
      },
    };
  }

  // Upcoming only → before or between.
  if (!input.currentAssignment && input.upcomingAssignment) {
    if (input.previousAssignment) {
      return {
        ...shared,
        state: "BETWEEN_ASSIGNMENTS",
        previousAssignment: input.previousAssignment,
        nextAssignment: input.upcomingAssignment,
        cycle,
        current: {
          ...shared.current,
          assignment: null,
          expectation: `Between Assignments. Next: ${input.upcomingAssignment.roleLabel}.`,
        },
        next: {
          ...shared.next,
          assignment: input.upcomingAssignment,
        },
      };
    }
    return {
      ...shared,
      state: "BEFORE_ASSIGNMENT",
      assignment: input.upcomingAssignment,
      cycle,
      current: {
        ...shared.current,
        assignment: input.upcomingAssignment,
        expectation: expectation || `Your Assignment has not started yet.`,
      },
    };
  }

  const current = input.currentAssignment!;

  // Assignment ended (completed status or endsAt passed) without upcoming.
  const ended =
    current.endsAt != null && current.endsAt.getTime() <= input.now.getTime();
  if (ended && !input.upcomingAssignment) {
    if (input.cycleContext.state === "DAY_COMPLETE") {
      return {
        ...shared,
        state: "DAY_COMPLETE",
        lastCycle: cycle,
        lastAssignment: current,
      };
    }
    return {
      ...shared,
      state: "ASSIGNMENT_COMPLETE",
      assignment: current,
      cycle,
      current: {
        ...shared.current,
        assignment: current,
        expectation: "Your Assignment window has ended.",
      },
    };
  }

  // Active assignment + active cycle → ACTIVE.
  if (input.cycleContext.state === "ACTIVE" && cycle) {
    return {
      ...shared,
      state: "ACTIVE",
      assignment: current,
      cycle,
    };
  }

  // Active assignment, calm / between / upcoming cycle → READY.
  if (cycle || input.cycleContext.state === "NOT_CONFIGURED") {
    if (input.cycleContext.state === "NOT_CONFIGURED" && !cycle) {
      const missing: JobFlowAttentionItem = {
        kind: "missing_config",
        message: "Operational cycles are not configured for this department.",
      };
      return {
        ...shared,
        state: "READY",
        assignment: current,
        cycle: null,
        attention: [...attention, missing].filter(
          (item, idx, arr) =>
            arr.findIndex((x) => x.kind === item.kind && x.message === item.message) === idx,
        ),
      };
    }
    return {
      ...shared,
      state: "READY",
      assignment: current,
      cycle,
    };
  }

  if (input.cycleContext.state === "DAY_COMPLETE") {
    return {
      ...shared,
      state: "DAY_COMPLETE",
      lastCycle: cycle,
      lastAssignment: current,
    };
  }

  // Fallback: treat as READY with assignment.
  return {
    ...shared,
    state: "READY",
    assignment: current,
    cycle,
  };
}
