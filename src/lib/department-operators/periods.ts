import {
  facilityLocalDateToServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";

import { DepartmentOperatorError } from "./types";

export type DatePeriod = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

/** Inclusive period coverage for a facility-local service date. */
export function periodCoversDate(period: DatePeriod, onDate: Date): boolean {
  const key = toServiceDateKey(onDate);
  const from = toServiceDateKey(period.effectiveFrom);
  if (from > key) return false;
  if (!period.effectiveTo) return true;
  return toServiceDateKey(period.effectiveTo) >= key;
}

/** Inclusive date-range overlap. Null effectiveTo is treated as open-ended. */
export function periodsOverlap(a: DatePeriod, b: DatePeriod): boolean {
  const aFrom = toServiceDateKey(a.effectiveFrom);
  const bFrom = toServiceDateKey(b.effectiveFrom);
  const aTo = a.effectiveTo ? toServiceDateKey(a.effectiveTo) : null;
  const bTo = b.effectiveTo ? toServiceDateKey(b.effectiveTo) : null;

  if (aTo !== null && aTo < aFrom) return false;
  if (bTo !== null && bTo < bFrom) return false;

  // a starts after b ends
  if (bTo !== null && aFrom > bTo) return false;
  // b starts after a ends
  if (aTo !== null && bFrom > aTo) return false;
  return true;
}

export function assertValidEffectiveDateKey(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey.trim())) {
    throw new DepartmentOperatorError(
      "INVALID_EFFECTIVE_DATE",
      "Effective date must be YYYY-MM-DD.",
    );
  }
  return dateKey.trim();
}

export function parseEffectiveDateKey(dateKey: string): Date {
  return facilityLocalDateToServiceDate(assertValidEffectiveDateKey(dateKey));
}

/** Calendar day before `date` (UTC-midnight @db.Date convention). */
export function dayBefore(date: Date): Date {
  const key = toServiceDateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return previous;
}

export function assertNoOverlaps(
  periods: Array<DatePeriod & { id?: string }>,
): void {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) {
        throw new DepartmentOperatorError(
          "OVERLAPPING_PERIOD",
          "A Department may have only one operating Organization for any given date.",
        );
      }
    }
  }
}

export function findPeriodForDate<T extends DatePeriod>(
  periods: T[],
  onDate: Date,
): T | null {
  const matches = periods.filter((period) => periodCoversDate(period, onDate));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new DepartmentOperatorError(
      "OVERLAPPING_PERIOD",
      "Multiple overlapping operator relationships exist for this date.",
    );
  }
  return matches[0] ?? null;
}
