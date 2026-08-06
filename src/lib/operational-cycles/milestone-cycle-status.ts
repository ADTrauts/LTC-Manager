import type { MealType, ServeryMilestone } from "@prisma/client";

/**
 * Runtime milestone presentation for SERVICE cycles.
 * Absence of confirmation is "Not Confirmed" — never "service did not happen".
 */
export type CycleMilestoneStatusKey =
  | "READY_CONFIRMED"
  | "READY_NOT_CONFIRMED"
  | "SERVICE_STARTED"
  | "SERVICE_STARTED_LATE"
  | "STARTED_WITHOUT_READY"
  | "NOT_CONFIRMED"
  | "CORRECTED"
  | "CONFLICT_REVIEW";

export type CycleMilestoneStatus = {
  key: CycleMilestoneStatusKey;
  label: string;
};

export type ServeryEventMilestoneSnapshot = {
  mealType: MealType;
  mealServiceReadyAt: Date | null;
  mealServiceStartedAt: Date | null;
  /** True when any CORRECTION entry exists for this event. */
  hasCorrection?: boolean;
  /** True when Ready and Started timestamps are inconsistent (e.g. started before ready by large margin after correction conflict). */
  conflictReview?: boolean;
};

export type MilestoneStatusInput = {
  event: ServeryEventMilestoneSnapshot | null;
  expectedMilestones: readonly ServeryMilestone[];
  /** UnitMealTime target for the cycle meal — not from the cycle row. */
  mealTargetAt: Date | null;
  now: Date;
  /** Grace after target before Started counts as late (default 15 minutes). */
  lateGraceMs?: number;
};

const DEFAULT_LATE_GRACE_MS = 15 * 60 * 1000;

function status(key: CycleMilestoneStatusKey, label: string): CycleMilestoneStatus {
  return { key, label };
}

/**
 * Map a ServeryMealServiceEvent (or its absence) to cycle-facing milestone status.
 * Never emits "service did not happen".
 */
export function resolveCycleMilestoneStatus(input: MilestoneStatusInput): CycleMilestoneStatus {
  const expected = new Set(input.expectedMilestones);
  const expectsReady = expected.has("READY");
  const expectsStarted = expected.has("SERVICE_STARTED");
  const event = input.event;

  if (!event) {
    if (expectsReady || expectsStarted) {
      return status("NOT_CONFIRMED", "Not Confirmed");
    }
    return status("NOT_CONFIRMED", "Not Confirmed");
  }

  if (input.event?.conflictReview || event.conflictReview) {
    return status("CONFLICT_REVIEW", "Conflict Review");
  }

  if (event.hasCorrection) {
    return status("CORRECTED", "Corrected");
  }

  const readyAt = event.mealServiceReadyAt;
  const startedAt = event.mealServiceStartedAt;
  const lateGrace = input.lateGraceMs ?? DEFAULT_LATE_GRACE_MS;
  const targetMs = input.mealTargetAt?.getTime() ?? null;

  if (startedAt && !readyAt && expectsReady) {
    return status("STARTED_WITHOUT_READY", "Started Without Ready");
  }

  if (startedAt) {
    if (targetMs != null && startedAt.getTime() > targetMs + lateGrace) {
      return status("SERVICE_STARTED_LATE", "Late");
    }
    return status("SERVICE_STARTED", "Service Started");
  }

  if (readyAt) {
    if (expectsStarted && targetMs != null && input.now.getTime() > targetMs + lateGrace) {
      // Ready recorded but service start missing past grace — still Not Confirmed for start,
      // surface Ready Confirmed as the current fact when only ready exists mid-window.
      return status("READY_CONFIRMED", "Ready Confirmed");
    }
    return status("READY_CONFIRMED", "Ready Confirmed");
  }

  if (expectsReady) {
    return status("READY_NOT_CONFIRMED", "Not Confirmed");
  }

  return status("NOT_CONFIRMED", "Not Confirmed");
}

/** Labels used by supervisor overview cards. */
export function cycleMilestoneStatusLabel(key: CycleMilestoneStatusKey): string {
  switch (key) {
    case "READY_CONFIRMED":
      return "Ready Confirmed";
    case "READY_NOT_CONFIRMED":
      return "Not Confirmed";
    case "SERVICE_STARTED":
      return "Service Started";
    case "SERVICE_STARTED_LATE":
      return "Late";
    case "STARTED_WITHOUT_READY":
      return "Started Without Ready";
    case "NOT_CONFIRMED":
      return "Not Confirmed";
    case "CORRECTED":
      return "Corrected";
    case "CONFLICT_REVIEW":
      return "Conflict Review";
  }
}
