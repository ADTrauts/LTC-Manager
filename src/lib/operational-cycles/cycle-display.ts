/**
 * User-facing display helpers for Operational Cycles (no persistence changes).
 */

import type { CycleDraftChange } from "./cycle-lifecycle";
import type { CycleBuilderRow } from "./load-cycle-builder";
import type { DietaryDefaultCyclePlan } from "./defaults";
import { parseLocalTime } from "./cycle-windows";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatCycleClock(localHhMm: string): string {
  const parsed = parseLocalTime(localHhMm);
  if (!parsed) return localHhMm;
  const period = parsed.hours >= 12 ? "PM" : "AM";
  const hour12 = parsed.hours % 12 === 0 ? 12 : parsed.hours % 12;
  const minutes = String(parsed.minutes).padStart(2, "0");
  return `${hour12}:${minutes} ${period}`;
}

export function formatCycleWindow(startLocal: string | null, endLocal: string | null): string {
  if (!startLocal?.trim() || !endLocal?.trim()) return "Key Time";
  return `${formatCycleClock(startLocal)}–${formatCycleClock(endLocal)}`;
}

export function formatMealLabel(mealType: string | null | undefined): string | null {
  if (!mealType) return null;
  switch (mealType) {
    case "BREAKFAST":
      return "Breakfast";
    case "LUNCH":
      return "Lunch";
    case "DINNER":
      return "Dinner";
    default:
      return mealType
        .toLowerCase()
        .split("_")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
}

/** Avoid repeating “Breakfast · Breakfast” when label already carries the meal name. */
export function formatCycleRowSecondary(input: {
  label: string;
  startLocal: string;
  endLocal: string;
  mealType: string | null;
  daysSummary?: string | null;
  scopeLabel?: string | null;
  serviceTimeCount?: number | null;
}): string {
  const window = formatCycleWindow(input.startLocal, input.endLocal);
  const parts = [window];
  const meal = formatMealLabel(input.mealType);
  const labelNorm = input.label.trim().toLowerCase();
  if (meal) {
    const mealNorm = meal.toLowerCase();
    if (labelNorm !== mealNorm && !labelNorm.startsWith(mealNorm + " ")) {
      parts.push(meal);
    }
  }
  if (input.daysSummary) parts.push(input.daysSummary);
  if (input.scopeLabel) parts.push(input.scopeLabel);
  if (input.serviceTimeCount && input.serviceTimeCount > 0) {
    parts.push(
      `${input.serviceTimeCount} service start time${input.serviceTimeCount === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

export function formatDaysSummary(days: readonly number[]): string {
  const unique = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (unique.length === 7) return "Every day";
  if (unique.length === 0) return "No days selected";
  return unique.map((d) => WEEKDAY_SHORT[d]).join(" · ");
}

export function serializeDaysOfWeek(days: readonly number[]): string {
  return [...new Set(days.filter((d) => d >= 0 && d <= 6))]
    .sort((a, b) => a - b)
    .join(",");
}

export function parseDaysOfWeekCsv(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [0, 1, 2, 3, 4, 5, 6];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/** YYYY-MM-DD → August 12, 2026 (UTC date parts; service dates are calendar keys). */
export function formatServiceDateLong(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return dateKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export type DefaultPreviewRow = {
  stableKey: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  mealType: string | null;
  status: "add" | "exists";
};

export function previewDietaryDefaultsAgainstExisting(input: {
  plans: readonly DietaryDefaultCyclePlan[];
  existingStableKeys: ReadonlySet<string>;
  existingLabels?: ReadonlySet<string>;
}): DefaultPreviewRow[] {
  return input.plans.map((plan) => {
    const labelTaken =
      input.existingLabels?.has(normalizeCycleLabel(plan.label)) ?? false;
    const exists =
      input.existingStableKeys.has(plan.stableKey) || labelTaken;
    return {
      stableKey: plan.stableKey,
      label: plan.label,
      startLocal: plan.startLocal,
      endLocal: plan.endLocal,
      mealType: plan.mealType,
      status: exists ? "exists" : "add",
    };
  });
}

export function collectExistingCycleStableKeys(
  cycles: readonly Pick<CycleBuilderRow, "stableKey" | "status">[],
): Set<string> {
  const keys = new Set<string>();
  for (const c of cycles) {
    if (c.status === "DRAFT" || c.status === "PUBLISHED") {
      keys.add(c.stableKey);
    }
  }
  return keys;
}

export function normalizeCycleLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Active (draft/published) identity for defaults merge — stableKey + label. */
export function collectExistingCycleIdentity(cycles: readonly Pick<
  CycleBuilderRow,
  "stableKey" | "label" | "status"
>[]): {
  stableKeys: Set<string>;
  labels: Set<string>;
} {
  const stableKeys = new Set<string>();
  const labels = new Set<string>();
  for (const c of cycles) {
    if (c.status === "DRAFT" || c.status === "PUBLISHED") {
      stableKeys.add(c.stableKey);
      labels.add(normalizeCycleLabel(c.label));
    }
  }
  return { stableKeys, labels };
}

export type ReviewPresentation =
  | {
      mode: "first_setup";
      count: number;
      rows: { label: string; window: string; meal: string | null }[];
    }
  | {
      mode: "diff";
      lines: string[];
    };

/**
 * Compact review for first-time all-adds; otherwise preserve meaningful change lines.
 */
export function presentCycleReview(input: {
  changes: readonly CycleDraftChange[];
  drafts: readonly CycleBuilderRow[];
  currentCount: number;
}): ReviewPresentation {
  const allAdded =
    input.changes.length > 0 && input.changes.every((c) => c.kind === "added");
  if (input.currentCount === 0 && allAdded) {
    return {
      mode: "first_setup",
      count: input.drafts.length,
      rows: input.drafts.map((d) => ({
        label: d.label,
        window: formatCycleWindow(d.startLocal, d.endLocal),
        meal: formatMealLabel(d.mealType),
      })),
    };
  }

  const draftsByKey = new Map(input.drafts.map((d) => [d.stableKey, d]));
  const lines: string[] = [];
  for (const change of input.changes) {
    const draft = draftsByKey.get(change.stableKey);
    if (change.kind === "added" && draft) {
      lines.push(
        `${draft.label} · Added · ${formatCycleWindow(draft.startLocal, draft.endLocal)}`,
      );
      continue;
    }
    if (change.kind === "timing" && draft) {
      const match = /timing (.+?) → (.+)$/.exec(change.summary);
      if (match) {
        const [, fromRaw, toRaw] = match;
        const fromParts = fromRaw!.split("–");
        const toParts = toRaw!.split("–");
        if (fromParts.length === 2 && toParts.length === 2) {
          const startChanged = fromParts[0] !== toParts[0];
          const endChanged = fromParts[1] !== toParts[1];
          if (startChanged) {
            lines.push(
              `${draft.label} · Start time: ${formatCycleClock(fromParts[0]!)} → ${formatCycleClock(toParts[0]!)}`,
            );
          }
          if (endChanged) {
            lines.push(
              `${draft.label} · End time: ${formatCycleClock(fromParts[1]!)} → ${formatCycleClock(toParts[1]!)}`,
            );
          }
          if (!startChanged && !endChanged) {
            lines.push(`${draft.label} · Timing changed`);
          }
          continue;
        }
      }
    }
    if (change.kind === "type") {
      lines.push(
        change.summary
          .replace(/\bPREPARATION\b/g, "Preparation")
          .replace(/\bSERVICE\b/g, "Service")
          .replace(/\bTRANSITION\b/g, "Transition")
          .replace(/\bCLOSEOUT\b/g, "Closeout")
          .replace(/\bCUSTOM\b/g, "Custom"),
      );
      continue;
    }
    if (change.kind === "meal" && draft) {
      const meal = formatMealLabel(draft.mealType) ?? "None";
      lines.push(`${draft.label} · Meal: ${meal}`);
      continue;
    }
    if (change.kind === "applicable_days" && draft) {
      lines.push(
        `${draft.label} · Days: ${formatDaysSummary(draft.applicableDaysOfWeek)}`,
      );
      continue;
    }
    lines.push(change.summary);
  }

  return { mode: "diff", lines };
}

/** Move index in ordered id list (for ↑↓ reorder). */
export function moveOrderedId(
  orderedIds: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] {
  const next = [...orderedIds];
  const index = next.indexOf(id);
  if (index < 0) return next;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= next.length) return next;
  const tmp = next[index]!;
  next[index] = next[swapWith]!;
  next[swapWith] = tmp;
  return next;
}
