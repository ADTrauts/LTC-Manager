/**
 * Facility-local quiet window.
 *
 * The minutes are civil time in Facility.timezone. Intl supplies the wall
 * clock, including the repeated hour when clocks fall back and the skipped
 * hour when they spring forward. This module does not subtract a fixed offset.
 */

import { resolveFacilityTimezone } from "@/lib/operational-time/resolve-facility-timezone";
import { getFacilityLocalParts } from "@/lib/operational-time/zoned-parts";

export const QUIET_MINUTE_MAX = 24 * 60 - 1;

export function isQuietMinute(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= QUIET_MINUTE_MAX;
}

export function localMinuteOfDay(now: Date, timeZone: string): number {
  const parts = getFacilityLocalParts(now, resolveFacilityTimezone(timeZone));
  return parts.hour * 60 + parts.minute;
}

/**
 * End is exclusive. An equal start and end is an empty window.
 * A start after the end runs through midnight, for example 22:00–07:00.
 */
export function isInsideQuietWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}
