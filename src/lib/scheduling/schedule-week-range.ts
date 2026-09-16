/**
 * Facility-local schedule week helpers (RUN Scheduler Phase 6).
 *
 * Convention: Monday-start weeks. No facility staffing week-start setting exists yet;
 * menu weekStartsOn is menus-only and is intentionally not reused here.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ScheduleWeekStartDay = "MONDAY";

/** Product default until a facility staffing week-start setting exists. */
export const SCHEDULE_WEEK_STARTS_ON: ScheduleWeekStartDay = "MONDAY";

export type ScheduleWeekRange = {
  /** Inclusive Monday YYYY-MM-DD (facility calendar date key). */
  weekStart: string;
  /** Inclusive Sunday YYYY-MM-DD. */
  weekEnd: string;
  /** Seven consecutive ISO dates Mon→Sun. */
  days: string[];
  startsOn: ScheduleWeekStartDay;
};

function toIsoDateParts(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseScheduleIsoDate(raw: string): string | null {
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return null;
  return toIsoDateParts(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10),
    Number.parseInt(match[3]!, 10),
  );
}

export function shiftScheduleIsoDate(iso: string, deltaDays: number): string {
  const parsed = parseScheduleIsoDate(iso);
  if (!parsed) throw new Error(`Invalid ISO date "${iso}".`);
  const [y, m, d] = parsed.split("-").map((p) => Number.parseInt(p, 10));
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  return toIsoDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday (UTC calendar from ISO key). */
export function scheduleIsoWeekday(iso: string): number {
  const parsed = parseScheduleIsoDate(iso);
  if (!parsed) throw new Error(`Invalid ISO date "${iso}".`);
  const [y, m, d] = parsed.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * Return the Monday of the week containing `iso` (Monday-start).
 * Sunday maps to the previous Monday.
 */
export function mondayOfWeekContaining(iso: string): string {
  const weekday = scheduleIsoWeekday(iso); // 0 Sun … 6 Sat
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return shiftScheduleIsoDate(iso, -daysFromMonday);
}

export function buildScheduleWeekRange(input: {
  /** Any date in the target week (facility-local ISO key). */
  anchorDate: string;
  startsOn?: ScheduleWeekStartDay;
}): ScheduleWeekRange {
  const startsOn = input.startsOn ?? SCHEDULE_WEEK_STARTS_ON;
  if (startsOn !== "MONDAY") {
    throw new Error(`Unsupported schedule week start "${startsOn}".`);
  }
  const weekStart = mondayOfWeekContaining(input.anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => shiftScheduleIsoDate(weekStart, i));
  return {
    weekStart,
    weekEnd: days[6]!,
    days,
    startsOn,
  };
}

export function previousScheduleWeek(weekStart: string): ScheduleWeekRange {
  return buildScheduleWeekRange({ anchorDate: shiftScheduleIsoDate(weekStart, -7) });
}

export function nextScheduleWeek(weekStart: string): ScheduleWeekRange {
  return buildScheduleWeekRange({ anchorDate: shiftScheduleIsoDate(weekStart, 7) });
}

export function currentScheduleWeek(facilityLocalTodayIso: string): ScheduleWeekRange {
  return buildScheduleWeekRange({ anchorDate: facilityLocalTodayIso });
}

/** Short weekday label for column headers (Mon, Tue, …). */
export function scheduleWeekdayShortLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** Accessible long label e.g. Monday September 14. */
export function scheduleWeekdayLongLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
