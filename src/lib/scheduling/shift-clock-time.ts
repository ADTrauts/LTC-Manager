/**
 * Canonical Shift clock-time helpers (RUN Staffing Phase 3).
 *
 * Storage remains facility-local HH:MM strings on ScheduleEntry.plannedStart/End.
 * Overnight rule: if end <= start, the Shift ends on the following calendar day.
 * Service date is always the start operational date.
 */

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export type ParsedClockTime = {
  hours: number;
  minutes: number;
  /** Minutes from midnight on the service (start) date. */
  minutesFromMidnight: number;
};

export function parseClockTimeHhMm(raw: string): ParsedClockTime {
  // HTML <input type="time"> may submit HH:MM or HH:MM:SS.
  const normalized = raw.trim().slice(0, 5);
  const match = HH_MM.exec(normalized);
  if (!match) {
    throw new Error(`Invalid clock time "${raw}". Expected HH:MM (24-hour).`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return { hours, minutes, minutesFromMidnight: hours * 60 + minutes };
}

export function isValidClockTimeHhMm(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  return HH_MM.test(raw.trim().slice(0, 5));
}

/**
 * Normalize a Shift interval.
 * When end <= start, the end is treated as the next calendar day (overnight).
 */
export function normalizeShiftInterval(input: {
  plannedStart: string;
  plannedEnd: string;
}): {
  startMinutes: number;
  /** End minutes relative to service-date midnight; may exceed 24h for overnight. */
  endMinutes: number;
  isOvernight: boolean;
} {
  const start = parseClockTimeHhMm(input.plannedStart);
  const end = parseClockTimeHhMm(input.plannedEnd);
  const isOvernight = end.minutesFromMidnight <= start.minutesFromMidnight;
  return {
    startMinutes: start.minutesFromMidnight,
    endMinutes: isOvernight ? end.minutesFromMidnight + 24 * 60 : end.minutesFromMidnight,
    isOvernight,
  };
}

/** Duration in minutes. Overnight intervals are supported. */
export function shiftDurationMinutes(input: {
  plannedStart: string;
  plannedEnd: string;
}): number {
  const { startMinutes, endMinutes } = normalizeShiftInterval(input);
  return endMinutes - startMinutes;
}

/** Human duration such as `8h 30m` or `8h`. Not persisted. */
export function formatShiftDuration(input: {
  plannedStart: string;
  plannedEnd: string;
}): string {
  const total = shiftDurationMinutes(input);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (minutes === 0) return `${hours}h`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** 12-hour display for a single HH:MM clock time. */
export function formatClockTime12h(raw: string): string {
  const { hours, minutes } = parseClockTimeHhMm(raw);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * User-facing Shift window.
 * Overnight example: `11:00 PM–7:00 AM`
 */
export function formatShiftWindow12h(input: {
  plannedStart: string | null;
  plannedEnd: string | null;
}): string | null {
  if (!input.plannedStart || !input.plannedEnd) return null;
  if (!isValidClockTimeHhMm(input.plannedStart) || !isValidClockTimeHhMm(input.plannedEnd)) {
    return `${input.plannedStart}–${input.plannedEnd}`;
  }
  return `${formatClockTime12h(input.plannedStart)}–${formatClockTime12h(input.plannedEnd)}`;
}

/**
 * Compact grid label for weekly scheduler cells.
 * Examples: `7–3`, `7:30–3:15`, `7p–4a`, `11p–7a`.
 * Overnight stays on the service (start) date — not split across columns.
 */
export function formatShiftWindowCompact(input: {
  plannedStart: string | null;
  plannedEnd: string | null;
}): string | null {
  if (!input.plannedStart || !input.plannedEnd) return null;
  if (!isValidClockTimeHhMm(input.plannedStart) || !isValidClockTimeHhMm(input.plannedEnd)) {
    return `${input.plannedStart}–${input.plannedEnd}`;
  }

  const formatSide = (raw: string): string => {
    const { hours, minutes } = parseClockTimeHhMm(raw);
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const period = hours >= 12 ? "p" : "a";
    const usePeriod = hours < 7 || hours >= 17;
    const minutePart = minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
    if (usePeriod) return `${hour12}${minutePart}${period}`;
    return `${hour12}${minutePart}`;
  };

  return `${formatSide(input.plannedStart)}–${formatSide(input.plannedEnd)}`;
}

/**
 * True when two Shift intervals overlap on the same service date.
 * Overnight intervals are expanded past midnight for comparison.
 * Adjacent boundaries (end === next start) do not overlap.
 */
export function shiftIntervalsOverlap(
  a: { plannedStart: string; plannedEnd: string },
  b: { plannedStart: string; plannedEnd: string },
): boolean {
  const left = normalizeShiftInterval(a);
  const right = normalizeShiftInterval(b);
  return left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
}
