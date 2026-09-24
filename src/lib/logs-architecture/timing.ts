/**
 * Needs-setup and default timing resolution rules (Phase 2 pure contract).
 */

import { parseRecommendedWeekdays } from "./recommended-weekdays";
import type {
  CatalogLogDefinition,
  CatalogRecommendedCadence,
  LogAttachment,
  LogAttachmentDailyWindow,
  LogAttachmentTimingConfig,
  LogAttachmentTimingSource,
} from "./types";

/** Platform default daypart windows — labels + clocks for Catalog DEFAULT resolution only. */
export const DEFAULT_DAYPART_WINDOWS: readonly LogAttachmentDailyWindow[] = [
  { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
  { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
  { label: "Evening", startLocal: "16:00", endLocal: "21:00" },
] as const;

export function daypartWindowsForCadence(
  cadence: CatalogRecommendedCadence | null,
): LogAttachmentDailyWindow[] {
  switch (cadence) {
    case "ONCE_DAILY":
      return [DEFAULT_DAYPART_WINDOWS[0]!];
    case "TWICE_DAILY":
      return [DEFAULT_DAYPART_WINDOWS[0]!, DEFAULT_DAYPART_WINDOWS[1]!];
    case "THREE_TIMES_DAILY":
      return [...DEFAULT_DAYPART_WINDOWS];
    default:
      return [];
  }
}

/**
 * Resolve initial Attachment timing from Catalog defaults when attach happens.
 * Returns null when Catalog requires cycles/calendar that cannot be auto-resolved.
 */
export function resolveDefaultAttachmentTiming(input: {
  catalog: Pick<
    CatalogLogDefinition,
    | "recommendedCadence"
    | "recommendedScheduleKind"
    | "recommendedDaypartLabels"
    | "recommendedFixedWindows"
  >;
  publishedCycleStableKeys: readonly string[];
}): { timing: LogAttachmentTimingConfig; needsSetup: boolean; reason: string | null } {
  const { catalog, publishedCycleStableKeys } = input;

  if (catalog.recommendedCadence === "AD_HOC" || catalog.recommendedScheduleKind === "AD_HOC") {
    return {
      timing: {
        source: "AD_HOC",
        cycleStableKeys: [],
        dailyWindows: [],
        calendar: null,
        allowAdHoc: true,
      },
      needsSetup: false,
      reason: null,
    };
  }

  if (catalog.recommendedScheduleKind === "OPERATIONAL_CYCLE") {
    if (publishedCycleStableKeys.length === 0) {
      return {
        timing: {
          source: "OPERATIONAL_CYCLE",
          cycleStableKeys: [],
          dailyWindows: [],
          calendar: null,
          allowAdHoc: false,
        },
        needsSetup: true,
        reason: "Catalog requires Operational Cycles, but none are published for this Department.",
      };
    }
    // Safe default: once-per-cycle with published cycles → preselect all (no MealType mapping).
    if (catalog.recommendedCadence === "ONCE_PER_OPERATIONAL_CYCLE") {
      return {
        timing: {
          source: "OPERATIONAL_CYCLE",
          cycleStableKeys: [...publishedCycleStableKeys],
          dailyWindows: [],
          calendar: null,
          allowAdHoc: false,
        },
        needsSetup: false,
        reason: null,
      };
    }
    // Ambiguous Catalog cycle recommendation — facility must choose explicitly.
    return {
      timing: {
        source: "OPERATIONAL_CYCLE",
        cycleStableKeys: [],
        dailyWindows: [],
        calendar: null,
        allowAdHoc: false,
      },
      needsSetup: true,
      reason: "Select which Operational Cycles should require this Log.",
    };
  }

  if (catalog.recommendedFixedWindows.length > 0) {
    return {
      timing: {
        source: "DAILY_WINDOWS",
        cycleStableKeys: [],
        dailyWindows: catalog.recommendedFixedWindows.map((w, i) => ({
          label: catalog.recommendedDaypartLabels[i] ?? `Window ${i + 1}`,
          startLocal: w.startLocal,
          endLocal: w.endLocal,
        })),
        calendar: null,
        allowAdHoc: false,
      },
      needsSetup: false,
      reason: null,
    };
  }

  const fromCadence = daypartWindowsForCadence(catalog.recommendedCadence);
  if (fromCadence.length > 0) {
    return {
      timing: {
        source: "CATALOG_DEFAULT",
        cycleStableKeys: [],
        dailyWindows: fromCadence,
        calendar: null,
        allowAdHoc: false,
      },
      needsSetup: false,
      reason: null,
    };
  }

  if (catalog.recommendedCadence === "WEEKLY") {
    const weekdays = parseRecommendedWeekdays(catalog.recommendedDaypartLabels);
    const hasSuggestedDay = weekdays.daysOfWeek.length > 0;
    return {
      timing: {
        source: "CALENDAR",
        cycleStableKeys: [],
        dailyWindows: [],
        calendar: {
          cadenceType: "WEEKLY",
          daysOfWeek: weekdays.daysOfWeek,
          dayOfMonth: null,
          dueTimeLocal: null,
        },
        allowAdHoc: false,
      },
      needsSetup: !hasSuggestedDay,
      reason: hasSuggestedDay
        ? null
        : "Weekly calendar timing requires at least one weekday.",
    };
  }

  if (catalog.recommendedCadence === "MONTHLY") {
    return {
      timing: {
        source: "CALENDAR",
        cycleStableKeys: [],
        dailyWindows: [],
        calendar: {
          cadenceType: "MONTHLY",
          daysOfWeek: [],
          dayOfMonth: null,
          dueTimeLocal: null,
        },
        allowAdHoc: false,
      },
      needsSetup: true,
      reason: "Monthly calendar timing requires a day of month.",
    };
  }

  // Once-per-date default when cadence is unspecified but attach should still work.
  return {
    timing: {
      source: "CATALOG_DEFAULT",
      cycleStableKeys: [],
      dailyWindows: [],
      calendar: {
        cadenceType: "DAILY",
        daysOfWeek: [],
        dayOfMonth: null,
        dueTimeLocal: null,
      },
      allowAdHoc: false,
    },
    needsSetup: false,
    reason: null,
  };
}

export function evaluateAttachmentNeedsSetup(input: {
  attachment: Pick<LogAttachment, "timing" | "status" | "target">;
  publishedCycleStableKeys: readonly string[];
}): { needsSetup: boolean; reason: string | null } {
  if (input.attachment.status !== "ACTIVE") {
    return { needsSetup: false, reason: null };
  }

  const { timing } = input.attachment;
  const published = new Set(input.publishedCycleStableKeys);

  if (timing.source === "OPERATIONAL_CYCLE") {
    if (timing.cycleStableKeys.length === 0) {
      return {
        needsSetup: true,
        reason: "Select one or more published Operational Cycles.",
      };
    }
    const missing = timing.cycleStableKeys.filter((k) => !published.has(k));
    if (missing.length > 0) {
      return {
        needsSetup: true,
        reason: "One or more selected Operational Cycles are no longer available.",
      };
    }
  }

  if (timing.source === "DAILY_WINDOWS" || timing.source === "CATALOG_DEFAULT") {
    if (timing.dailyWindows.length === 0 && !timing.calendar && !timing.allowAdHoc) {
      // Once-per-date via empty windows + calendar DAILY is valid.
      if (!timing.calendar) {
        return {
          needsSetup: true,
          reason: "Daily window timing has no windows configured.",
        };
      }
    }
    for (const window of timing.dailyWindows) {
      if (!window.startLocal.trim() || !window.endLocal.trim()) {
        return {
          needsSetup: true,
          reason: `Window "${window.label}" is missing start or end time.`,
        };
      }
    }
  }

  if (timing.source === "CALENDAR") {
    if (!timing.calendar) {
      return { needsSetup: true, reason: "Calendar timing is missing a cadence rule." };
    }
    if (timing.calendar.cadenceType === "WEEKLY" && timing.calendar.daysOfWeek.length === 0) {
      return { needsSetup: true, reason: "Weekly calendar timing requires at least one weekday." };
    }
    if (
      timing.calendar.cadenceType === "MONTHLY" &&
      (timing.calendar.dayOfMonth == null || timing.calendar.dayOfMonth < 1)
    ) {
      return { needsSetup: true, reason: "Monthly calendar timing requires a day of month." };
    }
  }

  return { needsSetup: false, reason: null };
}

export function isValidTimingSource(value: string): value is LogAttachmentTimingSource {
  return (
    value === "CATALOG_DEFAULT" ||
    value === "DAILY_WINDOWS" ||
    value === "OPERATIONAL_CYCLE" ||
    value === "CALENDAR" ||
    value === "AD_HOC"
  );
}
