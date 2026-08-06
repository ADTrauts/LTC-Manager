import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStart,
  resolveFacilityTimezone,
} from "@/lib/operational-time";

const HH_MM = /^(\d{1,2}):(\d{2})$/;

export type ParsedLocalTime = {
  hours: number;
  minutes: number;
};

/** Parse facility-local `HH:mm` (or `H:mm`). Returns null when unreadable. */
export function parseLocalTime(value: string | null | undefined): ParsedLocalTime | null {
  if (!value?.trim()) return null;
  const match = HH_MM.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Format parsed local time as zero-padded `HH:mm`. */
export function formatLocalTime(parsed: ParsedLocalTime): string {
  return `${String(parsed.hours).padStart(2, "0")}:${String(parsed.minutes).padStart(2, "0")}`;
}

/**
 * True when the cycle structurally spans midnight: overnight flag, or endLocal is
 * strictly before startLocal on the clock (same-day non-overnight forbids that).
 */
export function isStructurallyOvernight(
  startLocal: string,
  endLocal: string,
  overnight: boolean,
): boolean {
  if (overnight) return true;
  const start = parseLocalTime(startLocal);
  const end = parseLocalTime(endLocal);
  if (!start || !end) return overnight;
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  return endMin < startMin;
}

/**
 * Resolve cycle start/end instants for an operational date in the facility timezone.
 * When overnight (or end < start structurally), end falls on the next facility-local day.
 */
export function resolveCycleWindowInstants(input: {
  operationalDateKey: string;
  startLocal: string;
  endLocal: string;
  overnight?: boolean;
  facilityTimezone?: string | null;
}): { startsAt: Date; endsAt: Date } | null {
  const timezone = resolveFacilityTimezone(input.facilityTimezone);
  const overnight = isStructurallyOvernight(
    input.startLocal,
    input.endLocal,
    input.overnight ?? false,
  );

  const serviceDate = facilityLocalDateToServiceDate(input.operationalDateKey);
  const startProbe = new Date(
    Date.UTC(
      serviceDate.getUTCFullYear(),
      serviceDate.getUTCMonth(),
      serviceDate.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );

  const startsAt = parseFacilityLocalScheduledStart(input.startLocal, startProbe, timezone);
  if (!startsAt) return null;

  let endProbe = startProbe;
  if (overnight) {
    const nextDay = new Date(serviceDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    endProbe = new Date(
      Date.UTC(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth(),
        nextDay.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
  }

  const endsAt = parseFacilityLocalScheduledStart(input.endLocal, endProbe, timezone);
  if (!endsAt) return null;

  return { startsAt, endsAt };
}

/**
 * Phase 9A write-time overlap: same-day non-overnight windows only.
 * Overnight cycles are excluded from this check (structural overnight is rare in Dietary defaults).
 */
export function windowsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * True when the operational date's civil weekday is in applicableDays (0=Sun … 6=Sat).
 * Civil YYYY-MM-DD weekday is timezone-invariant for facility service-date keys.
 */
export function isApplicableWeekday(
  applicableDaysOfWeek: readonly number[],
  operationalDateKey: string,
  _facilityTimezone?: string | null,
): boolean {
  void _facilityTimezone;
  if (applicableDaysOfWeek.length === 0) return false;
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const weekday = serviceDate.getUTCDay();
  return applicableDaysOfWeek.includes(weekday);
}

/** Intersection of two weekday sets. */
export function weekdaySetsIntersect(
  a: readonly number[],
  b: readonly number[],
): boolean {
  const setB = new Set(b);
  return a.some((d) => setB.has(d));
}
