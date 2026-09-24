/**
 * Pure Range Review presenter. Aggregates daily presentations.
 */

import { composeOperationalReviewRange } from "./compose-operational-review-range";
import {
  formatServiceDateLabel,
  presentOperationalReviewDay,
  type LocationFilterOption,
  type OperationalReviewDayPresentation,
  type ReviewSummaryItem,
} from "./present-operational-review-day";
import type { OperationalReviewDayViewModel, OperationalReviewRangeViewModel } from "./types";

export type PresentedRangeDayRow = {
  serviceDate: string;
  serviceDateLabel: string;
  href: string;
  quiet: boolean;
  empty: boolean;
  exceptionLabels: string[];
  unavailableLabels: string[];
};

export type PresentedRepeatedException = {
  id: string;
  label: string;
  missedDays: number;
  href: string;
};

export type OperationalReviewRangePresentation = {
  startServiceDate: string;
  endServiceDate: string;
  rangeLabel: string;
  dayCount: number;
  empty: boolean;
  quiet: boolean;
  summaryItems: ReviewSummaryItem[];
  unavailableItems: ReviewSummaryItem[];
  evidenceEvaluated: string | null;
  locationOptions: LocationFilterOption[];
  days: PresentedRangeDayRow[];
  repeatedEvidence: PresentedRepeatedException[];
  correctiveDays: PresentedRangeDayRow[];
  presence: {
    scheduledCount: number;
    exceptionCount: number;
  };
  assets: {
    impactCount: number;
    impactDays: number;
  };
  presentedDays: OperationalReviewDayPresentation[];
};

function filterDayToSpace(
  day: OperationalReviewDayViewModel,
  spaceId: string,
): OperationalReviewDayViewModel {
  const locations = day.locations.filter((row) => row.spaceId === spaceId);
  return {
    ...day,
    locations,
    evidence: {
      ...day.evidence,
      occurrences: day.evidence.occurrences.filter((row) => row.spaceId === spaceId),
    },
    coverage: {
      ...day.coverage,
      slots: day.coverage.slots.filter((row) => row.spaceId === spaceId),
      assignments: day.coverage.assignments.filter(
        (row) =>
          row.coveredSpaceIds.includes(spaceId) ||
          locations.some((location) => location.parentUnitId === row.unitId),
      ),
    },
    cycles: {
      ...day.cycles,
      versions: day.cycles.versions.filter(
        (cycle) => cycle.spaceIds.length === 0 || cycle.spaceIds.includes(spaceId),
      ),
    },
    milestones: {
      ...day.milestones,
      items: day.milestones.items.filter((row) => !row.spaceId || row.spaceId === spaceId),
    },
    assets: {
      ...day.assets,
      impacts: day.assets.impacts.filter((row) => row.spaceId === spaceId),
    },
  };
}

export function presentOperationalReviewRange(
  model: OperationalReviewRangeViewModel,
  options?: { spaceId?: string | null },
): OperationalReviewRangePresentation {
  const spaceId = options?.spaceId?.trim() || null;
  const scopedDays = spaceId ? model.days.map((day) => filterDayToSpace(day, spaceId)) : model.days;
  const scoped = composeOperationalReviewRange({
    days: scopedDays,
    startServiceDate: model.startServiceDate,
    endServiceDate: model.endServiceDate,
    todayKey: model.todayKey,
  });
  const totals = scoped.totals;

  const presentedDays = scopedDays.map((day) =>
    presentOperationalReviewDay(day, { spaceId, todayKey: model.todayKey }),
  );

  const dayRows: PresentedRangeDayRow[] = presentedDays.map((day) => ({
    serviceDate: day.serviceDate,
    serviceDateLabel: day.serviceDateLabel,
    href: spaceId ? `/reports?date=${day.serviceDate}&spaceId=${spaceId}` : `/reports?date=${day.serviceDate}`,
    quiet: day.quiet,
    empty: day.empty,
    exceptionLabels: day.summaryItems.map((item) => item.label),
    unavailableLabels: day.unavailableDomains.map((item) => item.label),
  }));

  const missedByRequirement = new Map<string, { label: string; days: Set<string>; spaceId: string | null }>();
  for (const day of scopedDays) {
    if (day.evidence.availability.status === "unavailable") continue;
    for (const row of day.evidence.occurrences) {
      if (row.state !== "not_complete") continue;
      const key = `${row.spaceId ?? "none"}:${row.catalogStableKey}:${row.slotLabel}`;
      const current = missedByRequirement.get(key) ?? {
        label: `${row.slotLabel || row.catalogStableKey}${row.spaceId ? "" : ""}`,
        days: new Set<string>(),
        spaceId: row.spaceId,
      };
      const location = day.locations.find((loc) => loc.spaceId === row.spaceId)?.displayLabel;
      current.label = location ? `${row.slotLabel || row.catalogStableKey} — ${location}` : row.slotLabel || row.catalogStableKey;
      current.days.add(day.serviceDate);
      missedByRequirement.set(key, current);
    }
  }
  const repeatedEvidence = [...missedByRequirement.entries()]
    .filter(([, row]) => row.days.size >= 2)
    .sort((a, b) => b[1].days.size - a[1].days.size || a[1].label.localeCompare(b[1].label))
    .map(([id, row]) => ({
      id,
      label: `${row.label} missed on ${row.days.size} service days`,
      missedDays: row.days.size,
      href: `/reports?date=${[...row.days].sort()[0]}${spaceId ? `&spaceId=${spaceId}` : ""}`,
    }));

  const summaryItems: ReviewSummaryItem[] = [];
  if (totals.evidenceMissed > 0) {
    summaryItems.push({
      id: "evidence-missed",
      name: "Evidence missed",
      count: totals.evidenceMissed,
      label: `${totals.evidenceMissed} missed evidence occurrence${totals.evidenceMissed === 1 ? "" : "s"}`,
    });
  }
  if (totals.evidenceCorrective > 0) {
    summaryItems.push({
      id: "evidence-corrective",
      name: "Corrective actions",
      count: totals.evidenceCorrective,
      label: `${totals.evidenceCorrective} completed with corrective action`,
    });
  }
  if (totals.coverageAtRisk + totals.coverageUncovered > 0) {
    const gaps = totals.coverageAtRisk + totals.coverageUncovered;
    summaryItems.push({
      id: "coverage-gaps",
      name: "Coverage gaps",
      count: gaps,
      label: `${gaps} coverage gap${gaps === 1 ? "" : "s"}`,
    });
  }
  if (totals.serviceLate > 0) {
    summaryItems.push({
      id: "service-late",
      name: "Late service milestones",
      count: totals.serviceLate,
      label: `${totals.serviceLate} late service milestone${totals.serviceLate === 1 ? "" : "s"}`,
    });
  } else if (totals.serviceNotRecorded > 0) {
    summaryItems.push({
      id: "service-missing",
      name: "Service not recorded",
      count: totals.serviceNotRecorded,
      label: `${totals.serviceNotRecorded} service milestone${totals.serviceNotRecorded === 1 ? "" : "s"} not recorded`,
    });
  }
  if (totals.assetImpacts > 0) {
    summaryItems.push({
      id: "assets",
      name: "Asset impacts",
      count: totals.assetImpacts,
      label: `${totals.assetImpacts} asset operational impact${totals.assetImpacts === 1 ? "" : "s"}`,
    });
  }

  const unavailableItems: ReviewSummaryItem[] = [];
  if (totals.evidenceUnavailableDays > 0) {
    unavailableItems.push({
      id: "evidence-unavailable-days",
      name: "Evidence unavailable",
      count: totals.evidenceUnavailableDays,
      label: `Historical evidence unavailable on ${totals.evidenceUnavailableDays} service day${totals.evidenceUnavailableDays === 1 ? "" : "s"}`,
    });
  }
  if (totals.coverageUnavailableDays > 0) {
    unavailableItems.push({
      id: "coverage-unavailable-days",
      name: "Coverage unavailable",
      count: totals.coverageUnavailableDays,
      label: `Historical coverage unavailable on ${totals.coverageUnavailableDays} service day${totals.coverageUnavailableDays === 1 ? "" : "s"}`,
    });
  }
  if (totals.serviceUnavailableDays > 0) {
    unavailableItems.push({
      id: "service-unavailable-days",
      name: "Service unavailable",
      count: totals.serviceUnavailableDays,
      label: `Historical service unavailable on ${totals.serviceUnavailableDays} service day${totals.serviceUnavailableDays === 1 ? "" : "s"}`,
    });
  }

  const locationOptions = new Map<string, string>();
  for (const day of model.days) {
    for (const location of day.locations) {
      if (!locationOptions.has(location.spaceId)) {
        locationOptions.set(location.spaceId, location.displayLabel);
      }
    }
  }

  const hasAnyItem =
    presentedDays.some((day) => !day.empty) ||
    summaryItems.length > 0 ||
    unavailableItems.length > 0;

  return {
    startServiceDate: model.startServiceDate,
    endServiceDate: model.endServiceDate,
    rangeLabel: `${formatServiceDateLabel(model.startServiceDate)} – ${formatServiceDateLabel(model.endServiceDate)}`,
    dayCount: model.dayCount,
    empty: !hasAnyItem,
    quiet: hasAnyItem && summaryItems.length === 0 && unavailableItems.length === 0,
    summaryItems,
    unavailableItems,
    evidenceEvaluated:
      totals.evidenceExpected > 0
        ? `${totals.evidenceCompleted} of ${totals.evidenceExpected} expected evidence items completed`
        : null,
    locationOptions: [...locationOptions.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([spaceId, displayLabel]) => ({ spaceId, displayLabel })),
    days: dayRows,
    repeatedEvidence,
    correctiveDays: dayRows.filter((row) =>
      row.exceptionLabels.some((label) => /corrective/i.test(label)),
    ),
    presence: {
      scheduledCount: totals.scheduledPresence,
      exceptionCount: totals.presenceExceptions,
    },
    assets: {
      impactCount: totals.assetImpacts,
      impactDays: totals.assetImpactDays,
    },
    presentedDays,
  };
}
