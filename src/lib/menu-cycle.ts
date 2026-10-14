import {
  MealType,
  MenuItemEntryType,
  MenuWeekStartDay,
  type MenuItem,
} from "@prisma/client";

import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

export type MenuCycleSettingsInput = {
  cycleLengthWeeks?: number | null;
  weekStartsOn?: MenuWeekStartDay | null;
  cycleAnchorDate?: Date | null;
  periodConfigJson?: unknown;
};

export type MenuPeriodConfig = {
  key: string;
  label: string;
  categories: string[];
  cycleStableKey?: string | null;
};

export const DEFAULT_MENU_PERIODS: MenuPeriodConfig[] = [
  { key: "BREAKFAST", label: "Breakfast", categories: ["Beverages", "Entrees", "Snack"] },
  { key: "LUNCH", label: "Lunch", categories: ["Beverages", "Entrees", "Sides", "Snacks/Dessert"] },
  { key: "DINNER", label: "Dinner", categories: ["Beverages", "Entrees", "Sides", "Dessert/Snacks"] },
];

const DAYS_SUNDAY_FIRST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_MONDAY_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dayLabelsForWeekStart(weekStartsOn: MenuWeekStartDay) {
  return weekStartsOn === "MONDAY" ? DAYS_MONDAY_FIRST : DAYS_SUNDAY_FIRST;
}

export function ensureMenuSettingsDefaults(settings: MenuCycleSettingsInput | null): {
  cycleLengthWeeks: 3 | 4;
  weekStartsOn: MenuWeekStartDay;
  cycleAnchorDate: Date;
  periods: MenuPeriodConfig[];
} {
  const cycleLengthWeeks = settings?.cycleLengthWeeks === 4 ? 4 : 3;
  const weekStartsOn = settings?.weekStartsOn ?? "SUNDAY";
  const cycleAnchorDate = settings?.cycleAnchorDate ?? startOfDay(new Date());
  const periods = parsePeriodConfig(settings?.periodConfigJson);
  return { cycleLengthWeeks, weekStartsOn, cycleAnchorDate, periods };
}

function cleanPeriodConfig(value: unknown): MenuPeriodConfig[] {
  if (!Array.isArray(value)) return [];
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  return value
    .map((item): MenuPeriodConfig | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as {
        key?: unknown;
        label?: unknown;
        categories?: unknown;
        cycleStableKey?: unknown;
      };
      const key = typeof raw.key === "string" ? raw.key.trim().toUpperCase() : "";
      const label = typeof raw.label === "string" ? raw.label.trim() : "";
      const normalizedLabel = label.toLowerCase();
      const cycleStableKey =
        typeof raw.cycleStableKey === "string" && raw.cycleStableKey.trim().length > 0
          ? raw.cycleStableKey.trim()
          : null;
      const categoriesRaw = Array.isArray(raw.categories)
        ? raw.categories.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean)
        : [];
      const categories = Array.from(new Set(categoriesRaw.map((value) => value.toLowerCase()))).map(
        (normalized) => categoriesRaw.find((value) => value.toLowerCase() === normalized)!,
      );
      if (!key || !label || categories.length === 0) return null;
      if (seenKeys.has(key) || seenLabels.has(normalizedLabel)) return null;
      seenKeys.add(key);
      seenLabels.add(normalizedLabel);
      return { key, label, categories, cycleStableKey };
    })
    .filter((row): row is MenuPeriodConfig => row !== null);
}

function parsePeriodConfig(value: unknown): MenuPeriodConfig[] {
  return cleanPeriodConfig(value);
}

export function periodKeyFromLabel(label: string, takenKeys: readonly string[] = []): string {
  const taken = new Set(takenKeys.map((key) => key.toUpperCase()));
  const base =
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "PERIOD";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const next = `${base.slice(0, 28)}_${n}`;
    if (!taken.has(next)) return next;
  }
  return `${base.slice(0, 24)}_${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
}

/**
 * Runtime period authority from stored JSON only.
 * Does not substitute Breakfast/Lunch/Dinner defaults.
 */
export function storedMenuPeriodConfigs(value: unknown): MenuPeriodConfig[] {
  return cleanPeriodConfig(value);
}

export function startOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function cyclePositionForDate(
  date: Date,
  settings: { cycleLengthWeeks: number; cycleAnchorDate: Date },
): { weekNumber: number } {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const totalDays = settings.cycleLengthWeeks * 7;
  const diffDays = Math.floor((startOfDay(date).getTime() - startOfDay(settings.cycleAnchorDate).getTime()) / oneDayMs);
  const normalized = ((diffDays % totalDays) + totalDays) % totalDays;
  return { weekNumber: Math.floor(normalized / 7) + 1 };
}

export function dayIndexForDate(date: Date, weekStartsOn: MenuWeekStartDay): number {
  const day = date.getDay();
  if (weekStartsOn === "SUNDAY") return day;
  return (day + 6) % 7;
}

export type MenuRuntimeCycleSettings = {
  cycleLengthWeeks: number;
  weekStartsOn: MenuWeekStartDay;
  cycleAnchorDate: Date;
};

/**
 * Usable Runtime rotation settings. Missing or invalid values stay null —
 * Runtime does not fabricate 3-week / Sunday / today defaults.
 */
export function usableMenuRuntimeCycleSettings(
  settings: {
    cycleLengthWeeks?: number | null;
    weekStartsOn?: MenuWeekStartDay | null;
    cycleAnchorDate?: Date | null;
  } | null,
): { cycleLengthWeeks: 3 | 4; weekStartsOn: MenuWeekStartDay; cycleAnchorDate: Date } | null {
  if (!settings) return null;
  const cycleLengthWeeks = settings.cycleLengthWeeks === 4 ? 4 : settings.cycleLengthWeeks === 3 ? 3 : null;
  const weekStartsOn = settings.weekStartsOn === "MONDAY" || settings.weekStartsOn === "SUNDAY" ? settings.weekStartsOn : null;
  const cycleAnchorDate = settings.cycleAnchorDate;
  if (!cycleLengthWeeks || !weekStartsOn || !cycleAnchorDate || Number.isNaN(cycleAnchorDate.getTime())) {
    return null;
  }
  return { cycleLengthWeeks, weekStartsOn, cycleAnchorDate };
}

/**
 * Civil-date-safe Menu week/day for a facility service date key (YYYY-MM-DD).
 * Uses UTC calendar parts only. Do not pass the key through host-timezone Date#getDay.
 */
export function rotationForServiceDateKey(
  serviceDateKey: string,
  settings: MenuRuntimeCycleSettings,
): { weekNumber: number; dayIndex: number } {
  const usable = usableMenuRuntimeCycleSettings(settings);
  if (!usable) {
    throw new Error("Menu Runtime rotation requires usable cycle settings.");
  }
  const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
  const anchorDate = facilityLocalDateToServiceDate(toServiceDateKey(usable.cycleAnchorDate));
  const oneDayMs = 24 * 60 * 60 * 1000;
  const totalDays = usable.cycleLengthWeeks * 7;
  const diffDays = Math.round((serviceDate.getTime() - anchorDate.getTime()) / oneDayMs);
  const normalized = ((diffDays % totalDays) + totalDays) % totalDays;
  const weekNumber = Math.floor(normalized / 7) + 1;
  const utcDay = serviceDate.getUTCDay();
  const dayIndex = usable.weekStartsOn === "SUNDAY" ? utcDay : (utcDay + 6) % 7;
  return { weekNumber, dayIndex };
}

export function formatMenuLineDisplay(item: {
  itemName: string;
  portionValue: string | null;
  portionUnit: string | null;
  entryType: MenuItemEntryType;
}): string {
  const name = item.itemName.trim();
  if (item.entryType === "CHOICE_PLACEHOLDER") return name;
  const pv = (item.portionValue ?? "").trim();
  const pu = (item.portionUnit ?? "").trim();
  if (!pv && !pu) return name;
  if (pv && pu) return `${name} · ${pv} ${pu}`;
  if (pv) return `${name} · ${pv}`;
  return `${name} · ${pu}`;
}

export function menuForDate(args: {
  date: Date;
  settings: { cycleLengthWeeks: number; weekStartsOn: MenuWeekStartDay; cycleAnchorDate: Date };
  periods: MenuPeriodConfig[];
  menuItems: Pick<
    MenuItem,
    | "weekNumber"
    | "dayIndex"
    | "mealPeriodKey"
    | "category"
    | "itemName"
    | "portionValue"
    | "portionUnit"
    | "entryType"
    | "displayOrder"
  >[];
}) {
  const { weekNumber } = cyclePositionForDate(args.date, args.settings);
  const dayIndex = dayIndexForDate(args.date, args.settings.weekStartsOn);
  const grouped = menuForCycleSlot({
    weekNumber,
    dayIndex,
    periods: args.periods,
    menuItems: args.menuItems,
  });
  return { weekNumber, dayIndex, grouped };
}

export function menuForCycleSlot(args: {
  weekNumber: number;
  dayIndex: number;
  periods: MenuPeriodConfig[];
  menuItems: Pick<
    MenuItem,
    | "weekNumber"
    | "dayIndex"
    | "mealPeriodKey"
    | "category"
    | "itemName"
    | "portionValue"
    | "portionUnit"
    | "entryType"
    | "displayOrder"
  >[];
}) {
  const matches = args.menuItems
    .filter((item) => item.weekNumber === args.weekNumber && item.dayIndex === args.dayIndex)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.itemName.localeCompare(b.itemName));

  const grouped: Record<string, Record<string, string[]>> = Object.fromEntries(
    args.periods.map((period) => [period.key, Object.fromEntries(period.categories.map((category) => [category, []]))]),
  );
  for (const item of matches) {
    const list = grouped[item.mealPeriodKey]?.[item.category] ?? [];
    list.push(formatMenuLineDisplay(item));
    if (!grouped[item.mealPeriodKey]) grouped[item.mealPeriodKey] = {};
    grouped[item.mealPeriodKey][item.category] = list;
  }
  return grouped;
}

export function menuPeriodKeyForMealType(mealType: MealType, periods: MenuPeriodConfig[]): string | null {
  const exact = periods.find((period) => period.key.toUpperCase() === mealType);
  if (exact) return exact.key;
  const fallback = periods.find((period) => period.label.toUpperCase() === mealType);
  return fallback?.key ?? null;
}

