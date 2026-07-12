/**
 * Convert a facility-local civil date + wall time to a UTC Date.
 *
 * DST policy (deterministic):
 * - Spring-forward gap (nonexistent local time): snap forward hour-by-hour until the
 *   resulting local wall time is valid on the intended civil date (typically lands
 *   just after the transition).
 * - Fall-back overlap (ambiguous local time): the offset-probe method prefers the
 *   earlier occurrence (first offset encountered from a UTC probe).
 */
import { resolveFacilityTimezone } from "@/lib/operational-time/resolve-facility-timezone";
import { getFacilityLocalParts } from "@/lib/operational-time/zoned-parts";

function parseHhMm(dueTimeLocal: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(dueTimeLocal.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function probeLocalDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const probe = new Date(desiredAsUtcMs);
  const probeParts = getFacilityLocalParts(probe, timeZone);
  const probeAsLocalMs = Date.UTC(
    probeParts.year,
    probeParts.month - 1,
    probeParts.day,
    probeParts.hour,
    probeParts.minute,
    probeParts.second,
    0,
  );
  const offsetMs = probeAsLocalMs - desiredAsUtcMs;
  return new Date(desiredAsUtcMs - offsetMs);
}

export function facilityLocalDateTimeToUtc(
  localDate: string,
  dueTimeLocal: string,
  facilityTimezone?: string | null,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate.trim());
  const time = parseHhMm(dueTimeLocal);
  if (!dateMatch || !time) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const timeZone = resolveFacilityTimezone(facilityTimezone);

  let hours = time.hours;
  const minutes = time.minutes;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const utc = probeLocalDateTimeToUtc(year, month, day, hours, minutes, timeZone);
    const parts = getFacilityLocalParts(utc, timeZone);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hours &&
      parts.minute === minutes
    ) {
      return utc;
    }

    // Nonexistent local time (spring-forward): advance one hour and retry.
    hours += 1;
    if (hours > 23) return utc;
  }

  return probeLocalDateTimeToUtc(year, month, day, time.hours, time.minutes, timeZone);
}

export const DEFAULT_INSPECTION_DUE_TIME_LOCAL = "09:00";
