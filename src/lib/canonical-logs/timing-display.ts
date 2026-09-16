/**
 * Product-facing timing copy for Canonical Logs BUILD UX.
 * Never expose raw timing enums (DAILY_WINDOWS, OPERATIONAL_CYCLE, AD_HOC, MealType).
 */

import type {
  CatalogRecommendedCadence,
  LogAttachmentCalendarCadence,
  LogAttachmentTimingMode,
} from "@prisma/client";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Convert HH:mm (24h) to 12-hour display, e.g. "5:00 AM". */
export function formatLocalTime12h(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  let hour = Number(match[1]);
  const minute = match[2]!;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return hhmm;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
}

export function catalogCadenceLabel(cadence: CatalogRecommendedCadence | null | undefined): string {
  switch (cadence) {
    case "ONCE_DAILY":
      return "Once daily";
    case "TWICE_DAILY":
      return "Twice daily";
    case "THREE_TIMES_DAILY":
      return "Three times daily";
    case "ONCE_PER_OPERATIONAL_CYCLE":
      return "Each operational cycle";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "AD_HOC":
      return "As needed";
    default:
      return "As configured";
  }
}

export function formatWindowSummary(
  windows: ReadonlyArray<{ label: string; startLocal?: string; endLocal?: string }>,
): string {
  if (windows.length === 0) return "";
  const labels = windows.map((w) => w.label.trim()).filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function formatCycleSummary(cycleLabels: readonly string[]): string {
  if (cycleLabels.length === 0) return "";
  return cycleLabels.join(" · ");
}

export function formatCalendarSummary(input: {
  cadence: LogAttachmentCalendarCadence | null;
  daysOfWeek: readonly number[];
  dayOfMonth: number | null;
  dueTimeLocal?: string | null;
}): string {
  const due =
    input.dueTimeLocal && input.dueTimeLocal.trim()
      ? ` · Due ${formatLocalTime12h(input.dueTimeLocal)}`
      : "";
  switch (input.cadence) {
    case "DAILY":
      return `Daily${due}`;
    case "WEEKLY": {
      const days = [...input.daysOfWeek]
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABELS[d]!);
      if (days.length === 0) return `Weekly${due}`;
      if (days.length === 1) return `Every ${days[0]}${due}`;
      return `Weekly · ${days.join(", ")}${due}`;
    }
    case "MONTHLY":
      return input.dayOfMonth != null
        ? `Monthly on the ${ordinal(input.dayOfMonth)}${due}`
        : `Monthly${due}`;
    default:
      return "Calendar schedule";
  }
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type TimingSummaryInput = {
  timingMode: LogAttachmentTimingMode;
  recommendedCadence?: CatalogRecommendedCadence | null;
  dailyWindows: ReadonlyArray<{ label: string; startLocal?: string; endLocal?: string }>;
  cycleLabels: readonly string[];
  calendarCadence: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek: readonly number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal?: string | null;
  allowAdHoc: boolean;
  /** True when windows/cycles match Catalog recommended defaults. */
  usingRecommendedSchedule?: boolean;
};

/**
 * Compact schedule line for Attachment cards.
 * Examples: "Twice daily · Morning and afternoon", "Breakfast · Lunch · Dinner", "As needed"
 */
export function formatTimingSummary(input: TimingSummaryInput): string {
  if (input.timingMode === "AD_HOC") {
    return "As needed";
  }

  switch (input.timingMode) {
    case "DAILY_WINDOWS": {
      const cadence = catalogCadenceLabel(input.recommendedCadence);
      const windows = formatWindowSummary(input.dailyWindows);
      if (windows && input.recommendedCadence && cadence !== "As configured") {
        return `${cadence} · ${windows}`;
      }
      if (windows) return windows;
      return cadence;
    }
    case "OPERATIONAL_CYCLE": {
      const cycles = formatCycleSummary(input.cycleLabels);
      return cycles || "Operational cycles";
    }
    case "CALENDAR":
      return formatCalendarSummary({
        cadence: input.calendarCadence,
        daysOfWeek: input.calendarDaysOfWeek,
        dayOfMonth: input.calendarDayOfMonth,
        dueTimeLocal: input.calendarDueTimeLocal,
      });
    default:
      return "Schedule";
  }
}

export function scheduleSourceLabel(usingRecommended: boolean): string {
  return usingRecommended ? "Using recommended schedule" : "Custom schedule";
}
