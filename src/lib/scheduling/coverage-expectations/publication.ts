/**
 * Coverage expectation publication boundary.
 *
 * Working/Build: latest DRAFT for a stableKey, else the current published row.
 * Runtime: PUBLISHED + effective on the service date. Draft never leaks into Run.
 */

import type {
  CoverageExpectationItemInput,
  CoverageExpectationStatus,
  CoveragePerspective,
} from "./types";

export type CoverageTemplateVersionRow = {
  id: string;
  stableKey: string;
  version: number;
  status: CoverageExpectationStatus;
  isActive: boolean;
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
  items: readonly Omit<
    CoverageExpectationItemInput,
    "templateId" | "templateStableKey" | "templateVersion" | "templateStatus" | "effectiveFrom" | "effectiveTo"
  >[];
};

function toDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function isCoverageTemplateEffectiveOnDate(
  template: Pick<CoverageTemplateVersionRow, "effectiveFrom" | "effectiveTo" | "isActive" | "status">,
  serviceDateKey: string,
): boolean {
  if (!template.isActive) return false;
  if (template.status !== "PUBLISHED") return false;
  return coverageIntervalContainsDate(template, serviceDateKey);
}

/**
 * Historical Review: a published (or retired-but-interval-closed) template remains
 * valid for a service date when its effective interval contains that date.
 * `isActive === false` does not erase a prior interval.
 */
export function isHistoricalCoverageTemplateEffectiveOnDate(
  template: Pick<CoverageTemplateVersionRow, "effectiveFrom" | "effectiveTo" | "status">,
  serviceDateKey: string,
): boolean {
  if (template.status !== "PUBLISHED" && template.status !== "RETIRED") return false;
  return coverageIntervalContainsDate(template, serviceDateKey);
}

function coverageIntervalContainsDate(
  template: Pick<CoverageTemplateVersionRow, "effectiveFrom" | "effectiveTo">,
  serviceDateKey: string,
): boolean {
  const from = toDateKey(template.effectiveFrom);
  const to = toDateKey(template.effectiveTo);
  if (from && serviceDateKey < from) return false;
  if (to && serviceDateKey > to) return false;
  return true;
}

/**
 * One working row per stableKey: DRAFT if present, otherwise latest PUBLISHED.
 * RETIRED rows are never working.
 */
export function selectWorkingCoverageTemplates<T extends CoverageTemplateVersionRow>(
  templates: readonly T[],
): T[] {
  const byKey = new Map<string, T[]>();
  for (const template of templates) {
    if (template.status === "RETIRED") continue;
    const list = byKey.get(template.stableKey) ?? [];
    list.push(template);
    byKey.set(template.stableKey, list);
  }

  const selected: T[] = [];
  for (const group of byKey.values()) {
    const draft = [...group]
      .filter((row) => row.status === "DRAFT")
      .sort((a, b) => b.version - a.version)[0];
    if (draft) {
      selected.push(draft);
      continue;
    }
    const published = [...group]
      .filter((row) => row.status === "PUBLISHED")
      .sort((a, b) => b.version - a.version)[0];
    if (published) selected.push(published);
  }
  return selected.sort((a, b) => a.stableKey.localeCompare(b.stableKey));
}

/**
 * Runtime-effective published versions for a service date.
 * Historical published rows remain queryable via effectiveFrom/effectiveTo.
 */
export function selectRuntimeCoverageTemplates<T extends CoverageTemplateVersionRow>(
  templates: readonly T[],
  serviceDateKey: string,
): T[] {
  const byKey = new Map<string, T[]>();
  for (const template of templates) {
    if (!isCoverageTemplateEffectiveOnDate(template, serviceDateKey)) continue;
    const list = byKey.get(template.stableKey) ?? [];
    list.push(template);
    byKey.set(template.stableKey, list);
  }

  const selected: T[] = [];
  for (const group of byKey.values()) {
    const latest = [...group].sort((a, b) => b.version - a.version)[0];
    if (latest) selected.push(latest);
  }
  return selected.sort((a, b) => a.stableKey.localeCompare(b.stableKey));
}

export function selectCoverageTemplatesForPerspective<T extends CoverageTemplateVersionRow>(
  templates: readonly T[],
  perspective: CoveragePerspective,
  serviceDateKey: string,
): T[] {
  return perspective === "working"
    ? selectWorkingCoverageTemplates(templates)
    : selectRuntimeCoverageTemplates(templates, serviceDateKey);
}

export type HistoricalCoverageSelection<T extends CoverageTemplateVersionRow> =
  | { status: "evaluated"; templates: T[] }
  | { status: "unavailable"; reason: "coverage_interval_ambiguous"; templates: T[] };

/**
 * Date-effective published coverage for Review.
 * Does not use `isActive`. Overlapping same-key intervals are fail-closed
 * (never "latest row wins") because same-day republish cannot be reconstructed.
 */
export function selectHistoricalCoverageTemplates<T extends CoverageTemplateVersionRow>(
  templates: readonly T[],
  serviceDateKey: string,
): HistoricalCoverageSelection<T> {
  const byKey = new Map<string, T[]>();
  for (const template of templates) {
    if (!isHistoricalCoverageTemplateEffectiveOnDate(template, serviceDateKey)) continue;
    const list = byKey.get(template.stableKey) ?? [];
    list.push(template);
    byKey.set(template.stableKey, list);
  }

  const selected: T[] = [];
  for (const group of byKey.values()) {
    if (group.length > 1) {
      return { status: "unavailable", reason: "coverage_interval_ambiguous", templates: [] };
    }
    selected.push(group[0]!);
  }
  return {
    status: "evaluated",
    templates: selected.sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
  };
}

/**
 * Newly published coverage must not rewrite an already-started facility service day.
 * Requested dates on or before today become the next facility service day.
 * Future dates are preserved.
 */
export function resolveCoveragePublishEffectiveFromKey(input: {
  requestedEffectiveFromKey: string | null | undefined;
  currentFacilityServiceDateKey: string;
}): string {
  const earliest = dayAfter(input.currentFacilityServiceDateKey);
  const requested = input.requestedEffectiveFromKey?.trim() || "";
  if (!requested || requested <= input.currentFacilityServiceDateKey) {
    return earliest;
  }
  return requested;
}

export function flattenCoverageTemplateItems(
  templates: readonly CoverageTemplateVersionRow[],
): CoverageExpectationItemInput[] {
  return templates.flatMap((template) =>
    template.items.map((item) => ({
      ...item,
      templateId: template.id,
      templateStableKey: template.stableKey,
      templateVersion: template.version,
      templateStatus: template.status,
      effectiveFrom: toDateKey(template.effectiveFrom),
      effectiveTo: toDateKey(template.effectiveTo),
    })),
  );
}

export function dayBefore(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year!, (month ?? 1) - 1, day ?? 1);
  const prior = new Date(utc - 24 * 60 * 60 * 1000);
  return prior.toISOString().slice(0, 10);
}

export function dayAfter(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year!, (month ?? 1) - 1, day ?? 1);
  const next = new Date(utc + 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}
