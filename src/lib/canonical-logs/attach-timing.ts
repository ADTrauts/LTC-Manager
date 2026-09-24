/**
 * Resolve Catalog recommended timing into Attachment create payload for BUILD confirm/customize.
 */

import type { CatalogRecommendedCadence, LogAttachmentTimingMode } from "@prisma/client";

import {
  daypartWindowsForCadence,
  resolveDefaultAttachmentTiming,
} from "@/lib/logs-architecture/timing";

import { catalogRecommendedScheduleLabel, formatTimingSummary, scheduleSourceLabel } from "./timing-display";

export type ResolvedAttachTiming = {
  timingMode: LogAttachmentTimingMode;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendarCadence: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
  needsSetup: boolean;
  needsSetupReason: string | null;
  usingRecommendedSchedule: boolean;
  timingSummary: string;
  scheduleSourceLabel: string | null;
  recommendedCadenceLabel: string;
};

export function resolveAttachTimingProposal(input: {
  recommendedCadence: CatalogRecommendedCadence;
  recommendedScheduleKind: string | null;
  recommendedDaypartLabels: string[];
  publishedCycleStableKeys: readonly string[];
  cycleLabelByKey: ReadonlyMap<string, string>;
  /** Optional overrides from Customize. */
  override?: Partial<{
    timingMode: LogAttachmentTimingMode;
    dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
    cycleStableKeys: string[];
    calendarCadence: "DAILY" | "WEEKLY" | "MONTHLY" | null;
    calendarDaysOfWeek: number[];
    calendarDayOfMonth: number | null;
    calendarDueTimeLocal: string | null;
    allowAdHoc: boolean;
  }>;
}): ResolvedAttachTiming {
  const defaults = resolveDefaultAttachmentTiming({
    catalog: {
      recommendedCadence: input.recommendedCadence,
      recommendedScheduleKind: input.recommendedScheduleKind as never,
      recommendedDaypartLabels: input.recommendedDaypartLabels,
      recommendedFixedWindows: [],
    },
    publishedCycleStableKeys: input.publishedCycleStableKeys,
  });

  let timingMode: LogAttachmentTimingMode =
    defaults.timing.source === "OPERATIONAL_CYCLE"
      ? "OPERATIONAL_CYCLE"
      : defaults.timing.source === "AD_HOC"
        ? "AD_HOC"
        : defaults.timing.source === "CALENDAR" || defaults.timing.calendar
          ? "CALENDAR"
          : "DAILY_WINDOWS";

  let dailyWindows = defaults.timing.dailyWindows.map((w) => ({
    label: w.label,
    startLocal: w.startLocal,
    endLocal: w.endLocal,
  }));
  let cycleStableKeys = [...defaults.timing.cycleStableKeys];
  let calendarCadence = defaults.timing.calendar?.cadenceType ?? null;
  let calendarDaysOfWeek = defaults.timing.calendar?.daysOfWeek ?? [];
  let calendarDayOfMonth = defaults.timing.calendar?.dayOfMonth ?? null;
  let calendarDueTimeLocal = defaults.timing.calendar?.dueTimeLocal ?? null;
  let allowAdHoc = defaults.timing.allowAdHoc;
  let needsSetup = defaults.needsSetup;
  let needsSetupReason = defaults.reason;
  let usingRecommended = true;

  if (input.override) {
    usingRecommended = false;
    if (input.override.timingMode) timingMode = input.override.timingMode;
    if (input.override.dailyWindows) dailyWindows = input.override.dailyWindows;
    if (input.override.cycleStableKeys) cycleStableKeys = input.override.cycleStableKeys;
    if (input.override.calendarCadence !== undefined) {
      calendarCadence = input.override.calendarCadence;
    }
    if (input.override.calendarDaysOfWeek) {
      calendarDaysOfWeek = input.override.calendarDaysOfWeek;
    }
    if (input.override.calendarDayOfMonth !== undefined) {
      calendarDayOfMonth = input.override.calendarDayOfMonth;
    }
    if (input.override.calendarDueTimeLocal !== undefined) {
      calendarDueTimeLocal = input.override.calendarDueTimeLocal;
    }
    if (input.override.allowAdHoc !== undefined) allowAdHoc = input.override.allowAdHoc;

    if (timingMode === "OPERATIONAL_CYCLE") {
      needsSetup = cycleStableKeys.length === 0;
      needsSetupReason = needsSetup
        ? "Select which Operational Cycles should require this Log."
        : null;
    } else if (timingMode === "DAILY_WINDOWS") {
      needsSetup = dailyWindows.length === 0 && !allowAdHoc;
      needsSetupReason = needsSetup ? "Add at least one daily window." : null;
    } else {
      needsSetup = false;
      needsSetupReason = null;
    }
  }

  // Prefer Catalog daypart labels when defaults came from cadence.
  if (
    usingRecommended &&
    timingMode === "DAILY_WINDOWS" &&
    input.recommendedDaypartLabels.length > 0 &&
    dailyWindows.length === input.recommendedDaypartLabels.length
  ) {
    dailyWindows = dailyWindows.map((w, i) => ({
      ...w,
      label: input.recommendedDaypartLabels[i] ?? w.label,
    }));
  }

  if (usingRecommended && timingMode === "DAILY_WINDOWS" && dailyWindows.length === 0) {
    dailyWindows = daypartWindowsForCadence(input.recommendedCadence).map((w) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
    }));
  }

  const cycleLabels = cycleStableKeys.map((k) => input.cycleLabelByKey.get(k) ?? k);
  const timingSummary = formatTimingSummary({
    timingMode,
    recommendedCadence: input.recommendedCadence,
    dailyWindows,
    cycleLabels,
    calendarCadence,
    calendarDaysOfWeek,
    calendarDayOfMonth,
    calendarDueTimeLocal,
    allowAdHoc,
  });

  return {
    timingMode,
    dailyWindows,
    cycleStableKeys,
    calendarCadence,
    calendarDaysOfWeek,
    calendarDayOfMonth,
    calendarDueTimeLocal,
    allowAdHoc,
    needsSetup,
    needsSetupReason,
    usingRecommendedSchedule: usingRecommended && !needsSetup,
    timingSummary,
    scheduleSourceLabel:
      timingMode === "AD_HOC" ? null : scheduleSourceLabel(usingRecommended && !needsSetup),
    recommendedCadenceLabel: catalogRecommendedScheduleLabel(
      input.recommendedCadence,
      input.recommendedDaypartLabels,
    ),
  };
}
