import { resolveFacilityTimezone } from "./resolve-facility-timezone";
import { formatFacilityLocalDate, getFacilityLocalParts } from "./zoned-parts";

/**
 * Calendar service-date key as UTC midnight for the given YYYY-MM-DD.
 * Used for Prisma `@db.Date` fields — stores the civil date without a local wall-time offset.
 */
export function facilityLocalDateToServiceDate(localDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate.trim());
  if (!match) {
    throw new Error(`Invalid facility-local date "${localDate}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Facility-local calendar day of `now`, as a UTC-midnight serviceDate Date. */
export function getFacilityServiceDate(
  facilityTimezone?: string | null,
  now: Date = new Date(),
): Date {
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  const parts = getFacilityLocalParts(now, timeZone);
  return facilityLocalDateToServiceDate(formatFacilityLocalDate(parts));
}

/** Stable YYYY-MM-DD key for comparing `@db.Date` / serviceDate values. */
export function toServiceDateKey(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
