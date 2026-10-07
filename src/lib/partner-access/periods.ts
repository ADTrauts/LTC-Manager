import {
  FacilityPartnerError,
  type FacilityPartnerLifecycleState,
} from "./types";

export type TimestampPeriod = {
  startsAt: Date;
  endsAt: Date | null;
};

/**
 * Half-open interval: startsAt <= instant < endsAt (null endsAt = open-ended).
 * Security domain — immediate suspension without "end of service day" lag.
 */
export function periodContainsInstant(period: TimestampPeriod, instant: Date): boolean {
  const t = instant.getTime();
  if (period.startsAt.getTime() > t) return false;
  if (period.endsAt === null) return true;
  return t < period.endsAt.getTime();
}

/** Half-open overlap: [a, b) overlaps [c, d). */
export function periodsOverlap(a: TimestampPeriod, b: TimestampPeriod): boolean {
  const aStart = a.startsAt.getTime();
  const bStart = b.startsAt.getTime();
  const aEnd = a.endsAt ? a.endsAt.getTime() : Number.POSITIVE_INFINITY;
  const bEnd = b.endsAt ? b.endsAt.getTime() : Number.POSITIVE_INFINITY;
  return aStart < bEnd && bStart < aEnd;
}

export function assertNoOverlappingPeriods(
  periods: TimestampPeriod[],
  message = "Overlapping authorization periods are not allowed.",
): void {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) {
        throw new FacilityPartnerError("OVERLAPPING_PERIOD", message);
      }
    }
  }
}

export function findPeriodContainingInstant<T extends TimestampPeriod>(
  periods: T[],
  instant: Date,
): T | null {
  const matches = periods.filter((period) => periodContainsInstant(period, instant));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new FacilityPartnerError(
      "OVERLAPPING_PERIOD",
      "Multiple overlapping authorization periods contain this instant.",
    );
  }
  return matches[0] ?? null;
}

/**
 * Derived lifecycle (not persisted):
 * - ENDED: partnership.endedAt is set and <= now
 * - ACTIVE: an access period contains now
 * - PENDING: not ended, never had a period that has started (includes future-only schedules)
 * - SUSPENDED: not ended, not active, but at least one period has already started
 */
export function deriveFacilityPartnerLifecycleState(input: {
  endedAt: Date | null;
  accessPeriods: TimestampPeriod[];
  now?: Date;
}): FacilityPartnerLifecycleState {
  const now = input.now ?? new Date();
  if (input.endedAt && input.endedAt.getTime() <= now.getTime()) {
    return "ENDED";
  }
  if (findPeriodContainingInstant(input.accessPeriods, now)) {
    return "ACTIVE";
  }
  const anyPeriodStarted = input.accessPeriods.some(
    (period) => period.startsAt.getTime() <= now.getTime(),
  );
  if (!anyPeriodStarted) {
    return "PENDING";
  }
  return "SUSPENDED";
}

export function isPartnerRelationshipActive(input: {
  endedAt: Date | null;
  accessPeriods: TimestampPeriod[];
  now?: Date;
}): boolean {
  return deriveFacilityPartnerLifecycleState(input) === "ACTIVE";
}
