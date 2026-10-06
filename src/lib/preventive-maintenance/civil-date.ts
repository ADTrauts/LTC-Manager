/**
 * Facility-local civil dates for Preventive Maintenance.
 *
 * PM due dates are YYYY-MM-DD, stored as Prisma @db.Date (UTC midnight).
 * Never interpret these as server-local calendar days.
 */

import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CivilDate = string;

export function isCivilDate(value: string): value is CivilDate {
  if (!CIVIL_DATE.test(value)) return false;
  const date = facilityLocalDateToServiceDate(value);
  return toServiceDateKey(date) === value;
}

export function parseCivilDate(value: string | Date): CivilDate {
  if (value instanceof Date) {
    return toServiceDateKey(value);
  }
  const trimmed = value.trim();
  if (!isCivilDate(trimmed)) {
    throw new Error(`Invalid civil date "${value}". Expected YYYY-MM-DD.`);
  }
  return trimmed;
}

export function civilDateToUtcMidnight(date: CivilDate): Date {
  return facilityLocalDateToServiceDate(parseCivilDate(date));
}

export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  const left = parseCivilDate(a);
  const right = parseCivilDate(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function facilityCivilToday(
  facilityTimezone?: string | null,
  now: Date = new Date(),
): CivilDate {
  return toServiceDateKey(getFacilityServiceDate(resolveFacilityTimezone(facilityTimezone), now));
}

export function civilDateParts(date: CivilDate): { year: number; month: number; day: number } {
  const key = parseCivilDate(date);
  const match = CIVIL_DATE.exec(key);
  if (!match) throw new Error(`Invalid civil date "${date}".`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function lastCivilDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function fromCivilParts(year: number, month: number, day: number): CivilDate {
  const dim = lastCivilDayOfMonth(year, month);
  if (day < 1 || month < 1 || month > 12) {
    throw new Error(`Invalid civil parts ${year}-${month}-${day}.`);
  }
  const clamped = Math.min(day, dim);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}
