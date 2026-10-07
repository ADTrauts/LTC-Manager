import { OrganizationMembershipError } from "./types";

export type TimestampPeriod = {
  startsAt: Date;
  endsAt: Date | null;
};

/** Half-open: startsAt <= instant < endsAt (null endsAt = open). */
export function periodContainsInstant(period: TimestampPeriod, instant: Date): boolean {
  const t = instant.getTime();
  if (period.startsAt.getTime() > t) return false;
  if (period.endsAt === null) return true;
  return t < period.endsAt.getTime();
}

export function periodsOverlap(a: TimestampPeriod, b: TimestampPeriod): boolean {
  const aStart = a.startsAt.getTime();
  const bStart = b.startsAt.getTime();
  const aEnd = a.endsAt ? a.endsAt.getTime() : Number.POSITIVE_INFINITY;
  const bEnd = b.endsAt ? b.endsAt.getTime() : Number.POSITIVE_INFINITY;
  return aStart < bEnd && bStart < aEnd;
}

export function assertNoOverlappingPeriods(
  periods: TimestampPeriod[],
  message = "Overlapping Organization role periods are not allowed.",
): void {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) {
        throw new OrganizationMembershipError("OVERLAPPING_PERIOD", message);
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
    throw new OrganizationMembershipError(
      "OVERLAPPING_PERIOD",
      "Multiple overlapping Organization role periods contain this instant.",
    );
  }
  return matches[0] ?? null;
}
