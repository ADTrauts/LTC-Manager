import {
  MealType,
  MenuItemEntryType,
  MenuWeekStartDay,
  type MenuItem,
  type MenuSettings,
} from "@prisma/client";

export type MenuPeriodConfig = {
  key: string;
  label: string;
  categories: string[];
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

export function ensureMenuSettingsDefaults(settings: Partial<MenuSettings> | null): {
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

function parsePeriodConfig(value: unknown): MenuPeriodConfig[] {
  if (!Array.isArray(value)) return DEFAULT_MENU_PERIODS;
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const cleaned = value
    .map((item): MenuPeriodConfig | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { key?: unknown; label?: unknown; categories?: unknown };
      const key = typeof raw.key === "string" ? raw.key.trim().toUpperCase() : "";
      const label = typeof raw.label === "string" ? raw.label.trim() : "";
      const normalizedLabel = label.toLowerCase();
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
      return { key, label, categories };
    })
    .filter((row): row is MenuPeriodConfig => row !== null);
  return cleaned.length > 0 ? cleaned : DEFAULT_MENU_PERIODS;
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

