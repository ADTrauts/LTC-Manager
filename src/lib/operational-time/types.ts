import type { MealType } from "@prisma/client";

import type { OperationContext } from "@/lib/operations-center";

/**
 * Shared operational clock for readiness and time-aware ops logic.
 * All consumers should interpret "now" through this context.
 */
export type OperationalTimeContext = {
  /** Injected or wall-clock instant (UTC epoch). */
  nowUtc: Date;
  /** Facility-local calendar date as YYYY-MM-DD. */
  facilityLocalDate: string;
  /** Facility-local wall time parts. */
  facilityLocal: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
  /** IANA timezone used for facility-local interpretation. */
  facilityTimezone: string;
  /** Active meal/operation when available. */
  mealType: MealType | null;
  mealLabel: string | null;
  operationPhase: OperationContext["phase"] | null;
  scheduledStartLocal: string | null;
  /** Minutes until scheduled start; negative when start has passed. */
  minutesUntilScheduledStart: number | null;
  /** Minutes since scheduled start; null when start is unknown or still in the future. */
  minutesSinceScheduledStart: number | null;
  /** True when scheduled start is known and now is at/after that instant. */
  hasScheduledStartPassed: boolean;
  /** Whether a concrete due timestamp is at/before now. */
  isDueTimePassed: (dueAt: Date | null | undefined) => boolean;
};

export type BuildOperationalTimeContextInput = {
  now?: Date;
  facilityTimezone?: string | null;
  mealType?: MealType | null;
  mealLabel?: string | null;
  operationPhase?: OperationContext["phase"] | null;
  scheduledStartLocal?: string | null;
  minutesUntilService?: number | null;
};
