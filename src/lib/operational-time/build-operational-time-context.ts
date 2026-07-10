import { resolveFacilityTimezone } from "./resolve-facility-timezone";
import type { BuildOperationalTimeContextInput, OperationalTimeContext } from "./types";
import { formatFacilityLocalDate, getFacilityLocalParts } from "./zoned-parts";

/**
 * Parses "HH:MM" against the facility-local calendar day of `now` and returns a UTC Date
 * approximating that local wall time in the given timezone.
 */
export function parseFacilityLocalScheduledStart(
  scheduledStartLocal: string | null | undefined,
  now: Date,
  timeZone: string,
): Date | null {
  if (!scheduledStartLocal) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(scheduledStartLocal.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const local = getFacilityLocalParts(now, timeZone);
  // Construct a UTC probe then adjust by the zone offset at that local civil time.
  const probe = new Date(Date.UTC(local.year, local.month - 1, local.day, hours, minutes, 0, 0));
  const probeParts = getFacilityLocalParts(probe, timeZone);
  const desiredAsUtcMs = Date.UTC(local.year, local.month - 1, local.day, hours, minutes, 0, 0);
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

export function buildOperationalTimeContext(
  input: BuildOperationalTimeContextInput = {},
): OperationalTimeContext {
  const nowUtc = input.now ?? new Date();
  const facilityTimezone = resolveFacilityTimezone(input.facilityTimezone);
  const facilityLocal = getFacilityLocalParts(nowUtc, facilityTimezone);
  const facilityLocalDate = formatFacilityLocalDate(facilityLocal);

  let minutesUntilScheduledStart = input.minutesUntilService ?? null;
  let minutesSinceScheduledStart: number | null = null;

  if (minutesUntilScheduledStart == null && input.scheduledStartLocal) {
    const scheduled = parseFacilityLocalScheduledStart(
      input.scheduledStartLocal,
      nowUtc,
      facilityTimezone,
    );
    if (scheduled) {
      minutesUntilScheduledStart = Math.round((scheduled.getTime() - nowUtc.getTime()) / 60_000);
    }
  }

  if (minutesUntilScheduledStart != null && minutesUntilScheduledStart <= 0) {
    minutesSinceScheduledStart = Math.abs(minutesUntilScheduledStart);
  }

  const hasScheduledStartPassed =
    minutesUntilScheduledStart != null ? minutesUntilScheduledStart <= 0 : false;

  return {
    nowUtc,
    facilityLocalDate,
    facilityLocal,
    facilityTimezone,
    mealType: input.mealType ?? null,
    mealLabel: input.mealLabel ?? null,
    operationPhase: input.operationPhase ?? null,
    scheduledStartLocal: input.scheduledStartLocal ?? null,
    minutesUntilScheduledStart,
    minutesSinceScheduledStart,
    hasScheduledStartPassed,
    isDueTimePassed: (dueAt) => {
      if (!dueAt) return false;
      return dueAt.getTime() <= nowUtc.getTime();
    },
  };
}

/** Facility-local midnight → next midnight as UTC Date bounds for DateTime-scoped queries. */
export function getFacilityLocalTodayWindow(
  facilityTimezone?: string | null,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  const local = getFacilityLocalParts(now, timeZone);
  const start = parseFacilityLocalScheduledStart("00:00", now, timeZone);
  if (!start) {
    const fallback = new Date(now);
    fallback.setHours(0, 0, 0, 0);
    const end = new Date(fallback);
    end.setDate(end.getDate() + 1);
    return { start: fallback, end };
  }

  let cursor = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  for (let i = 0; i < 48; i += 1) {
    const parts = getFacilityLocalParts(cursor, timeZone);
    if (parts.year !== local.year || parts.month !== local.month || parts.day !== local.day) {
      const end = parseFacilityLocalScheduledStart("00:00", cursor, timeZone);
      if (end) return { start, end };
      break;
    }
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }

  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
