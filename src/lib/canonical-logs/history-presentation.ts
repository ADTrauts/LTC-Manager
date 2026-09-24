/**
 * Shared 14-day Log history table presentation.
 * Status labels come from projectLogExpectationHistory — do not re-derive here.
 */

import type { LogExpectationHistoryDay } from "./expectation-history";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type TargetRunLogHistoryCell = {
  slotLabel: string;
  state: string;
  stateLabel: string;
  displayValue: string | null;
  recordId: string | null;
  accessibleLabel: string;
};

export type TargetRunLogHistoryTable = {
  lineageKey: string;
  displayName: string;
  timingMode: string;
  columns: string[];
  days: Array<{
    operationalDateKey: string;
    dateLabel: string;
    cells: TargetRunLogHistoryCell[];
  }>;
  unscheduled: Array<{
    operationalDateKey: string;
    dateLabel: string;
    recordId: string;
    display: string | null;
    accessibleLabel: string;
  }>;
};

export function shortHistoryDateLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${SHORT_MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}`;
}

export function longHistoryDateLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${LONG_MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}`;
}

export function expandHistoryValueForA11y(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value
    .replace(/°F/g, " degrees Fahrenheit")
    .replace(/°C/g, " degrees Celsius")
    .replace(/\s+/g, " ")
    .trim();
}

export function accessibleHistoryCellLabel(input: {
  operationalDateKey: string;
  slotLabel: string;
  displayValue: string | null;
  stateLabel: string;
}): string {
  const parts = [
    longHistoryDateLabel(input.operationalDateKey),
    input.slotLabel.trim() || null,
    expandHistoryValueForA11y(input.displayValue),
    input.stateLabel.trim() || null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ");
}

export function presentHistoryTable(
  displayName: string,
  timingMode: string,
  days: LogExpectationHistoryDay[],
): TargetRunLogHistoryTable {
  const columns: string[] = [];
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.slotLabel && !columns.includes(slot.slotLabel)) columns.push(slot.slotLabel);
    }
  }
  if (columns.length === 0 && timingMode !== "AD_HOC") {
    const hasExpected = days.some((d) => d.expected);
    if (hasExpected) columns.push("Required");
  }

  return {
    lineageKey: displayName,
    displayName,
    timingMode,
    columns,
    days: [...days].reverse().map((day) => ({
      operationalDateKey: day.operationalDateKey,
      dateLabel: shortHistoryDateLabel(day.operationalDateKey),
      cells: columns.map((col) => {
        const slot =
          day.slots.find((s) => (s.slotLabel || "Required") === col) ??
          (columns.length === 1 ? day.slots[0] : undefined);
        if (!slot) {
          return {
            slotLabel: col,
            state: "NOT_REQUIRED",
            stateLabel: "",
            displayValue: null,
            recordId: null,
            accessibleLabel: accessibleHistoryCellLabel({
              operationalDateKey: day.operationalDateKey,
              slotLabel: col,
              displayValue: null,
              stateLabel: "Not required",
            }),
          };
        }
        return {
          slotLabel: col,
          state: slot.state,
          stateLabel: slot.stateLabel,
          displayValue: slot.valueSummary?.display ?? null,
          recordId: slot.recordId,
          accessibleLabel: accessibleHistoryCellLabel({
            operationalDateKey: day.operationalDateKey,
            slotLabel: col,
            displayValue: slot.valueSummary?.display ?? null,
            stateLabel: slot.stateLabel,
          }),
        };
      }),
    })),
    unscheduled: days.flatMap((day) =>
      day.unscheduledRecords.map((rec) => {
        const display =
          rec.valueNumber != null
            ? `${rec.valueNumber}${rec.unitLabel?.trim() ?? ""}`
            : "Submitted";
        return {
          operationalDateKey: day.operationalDateKey,
          dateLabel: shortHistoryDateLabel(day.operationalDateKey),
          recordId: rec.id,
          display,
          accessibleLabel: accessibleHistoryCellLabel({
            operationalDateKey: day.operationalDateKey,
            slotLabel: "As needed",
            displayValue: display,
            stateLabel: "Complete",
          }),
        };
      }),
    ),
  };
}
