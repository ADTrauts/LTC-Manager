/**
 * Parse Catalog recommended weekday labels into calendar daysOfWeek.
 * Operational defaults only — never treated as certified policy.
 */

export type ParsedRecommendedWeekdays = {
  daysOfWeek: number[];
  labels: string[];
};

const WEEKDAYS: ReadonlyArray<{ index: number; label: string; aliases: readonly string[] }> = [
  { index: 0, label: "Sunday", aliases: ["sunday", "sun"] },
  { index: 1, label: "Monday", aliases: ["monday", "mon"] },
  { index: 2, label: "Tuesday", aliases: ["tuesday", "tue", "tues"] },
  { index: 3, label: "Wednesday", aliases: ["wednesday", "wed"] },
  { index: 4, label: "Thursday", aliases: ["thursday", "thu", "thur", "thurs"] },
  { index: 5, label: "Friday", aliases: ["friday", "fri"] },
  { index: 6, label: "Saturday", aliases: ["saturday", "sat"] },
];

/**
 * Reads weekday names from Catalog `recommendedDaypartLabels`.
 * Unknown tokens (e.g. "Morning") are ignored so daily-window labels stay safe.
 */
export function parseRecommendedWeekdays(
  labels: readonly string[],
): ParsedRecommendedWeekdays {
  const daysOfWeek: number[] = [];
  const outLabels: string[] = [];
  const seen = new Set<number>();
  for (const raw of labels) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const match = WEEKDAYS.find(
      (day) => day.label.toLowerCase() === key || day.aliases.includes(key),
    );
    if (!match || seen.has(match.index)) continue;
    seen.add(match.index);
    daysOfWeek.push(match.index);
    outLabels.push(match.label);
  }
  return { daysOfWeek, labels: outLabels };
}
