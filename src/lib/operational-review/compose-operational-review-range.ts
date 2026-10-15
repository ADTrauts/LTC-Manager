/**
 * Pure range aggregator. Daily Review models remain authority.
 * No Prisma. No current-config × day-count math.
 */

import {
  occurrenceFromReviewEvidenceState,
  summarizeOperationalOccurrences,
  type OperationalOccurrenceState,
} from "@/lib/operational-occurrence/classify-operational-requirement";

import { milestoneVarianceLabel } from "./milestone-variance";
import type {
  OperationalReviewDayViewModel,
  OperationalReviewRangeTotals,
  OperationalReviewRangeViewModel,
} from "./types";

function emptyTotals(): OperationalReviewRangeTotals {
  return {
    evidenceExpected: 0,
    evidenceCompleted: 0,
    evidenceMissed: 0,
    evidenceOverdue: 0,
    evidenceWaived: 0,
    evidenceUpcoming: 0,
    evidenceNeedsReview: 0,
    evidenceCorrective: 0,
    evidenceUnavailableOccurrences: 0,
    evidenceUnavailableDays: 0,
    evidenceEvaluatedDays: 0,
    coverageExpectedSlots: 0,
    coverageCovered: 0,
    coverageAtRisk: 0,
    coverageUncovered: 0,
    coverageUnavailableSlots: 0,
    coverageUnavailableDays: 0,
    coverageEvaluatedDays: 0,
    serviceExpected: 0,
    serviceRecorded: 0,
    serviceNotRecorded: 0,
    serviceLate: 0,
    serviceUnavailableDays: 0,
    serviceEvaluatedDays: 0,
    assetImpacts: 0,
    assetImpactDays: 0,
    scheduledPresence: 0,
    presenceExceptions: 0,
    menuFindings: 0,
    menuEvaluatedDays: 0,
    menuUnavailableDays: 0,
  };
}

export function aggregateOperationalReviewDays(
  days: readonly OperationalReviewDayViewModel[],
): OperationalReviewRangeTotals {
  const totals = emptyTotals();
  for (const day of days) {
    if (day.evidence.availability.status === "unavailable") {
      totals.evidenceUnavailableDays += 1;
      totals.evidenceUnavailableOccurrences += day.evidence.occurrences.filter(
        (row) => row.state === "unavailable",
      ).length;
    } else {
      totals.evidenceEvaluatedDays += 1;
      const states: OperationalOccurrenceState[] = [];
      for (const row of day.evidence.occurrences) {
        if (row.state === "unavailable") {
          totals.evidenceUnavailableOccurrences += 1;
          continue;
        }
        const state = occurrenceFromReviewEvidenceState(row.state);
        if (state) states.push(state);
      }
      const summary = summarizeOperationalOccurrences(states);
      totals.evidenceExpected += summary.expected;
      totals.evidenceCompleted += summary.completed;
      totals.evidenceMissed += summary.missed;
      totals.evidenceOverdue += summary.overdue;
      totals.evidenceWaived += summary.waived;
      totals.evidenceUpcoming += summary.upcoming + summary.due;
      totals.evidenceNeedsReview += summary.needsReview;
      totals.evidenceCorrective += summary.exceptions;
    }

    if (day.coverage.availability.status === "unavailable") {
      totals.coverageUnavailableDays += 1;
      totals.coverageUnavailableSlots += day.coverage.slots.filter((row) => row.state === "unavailable").length;
    } else {
      totals.coverageEvaluatedDays += 1;
      for (const row of day.coverage.slots) {
        if (row.state === "unavailable") {
          totals.coverageUnavailableSlots += 1;
          continue;
        }
        totals.coverageExpectedSlots += 1;
        if (row.state === "covered") totals.coverageCovered += 1;
        if (row.state === "at_risk") totals.coverageAtRisk += 1;
        if (row.state === "uncovered") totals.coverageUncovered += 1;
      }
    }

    if (day.milestones.availability.status === "unavailable") {
      totals.serviceUnavailableDays += 1;
    } else {
      totals.serviceEvaluatedDays += 1;
      for (const row of day.milestones.items) {
        totals.serviceExpected += 1;
        if (row.actualOccurredAt) totals.serviceRecorded += 1;
        else totals.serviceNotRecorded += 1;
        const variance = milestoneVarianceLabel({
          serviceDate: day.serviceDate,
          timezone: day.timezone,
          expectedTimeLocal: row.expectedTimeLocal,
          actualOccurredAt: row.actualOccurredAt,
        });
        if (variance?.includes("late")) totals.serviceLate += 1;
      }
    }

    totals.assetImpacts += day.assets.impacts.length;
    if (day.assets.impacts.length > 0) totals.assetImpactDays += 1;
    totals.scheduledPresence += day.presence.scheduled.length;
    totals.presenceExceptions += day.presence.exceptions.length;

    if (day.menu.availability.status === "unavailable") {
      totals.menuUnavailableDays += 1;
    } else {
      totals.menuEvaluatedDays += 1;
      totals.menuFindings += day.menu.findings.length;
    }
  }
  return totals;
}

export function composeOperationalReviewRange(input: {
  days: OperationalReviewDayViewModel[];
  startServiceDate: string;
  endServiceDate: string;
  todayKey: string;
}): OperationalReviewRangeViewModel {
  const first = input.days[0];
  return {
    facilityId: first?.facilityId ?? "",
    facilityLabel: first?.facilityLabel ?? "",
    departmentId: first?.departmentId ?? null,
    timezone: first?.timezone ?? "",
    startServiceDate: input.startServiceDate,
    endServiceDate: input.endServiceDate,
    dayCount: input.days.length,
    todayKey: input.todayKey,
    days: input.days,
    totals: aggregateOperationalReviewDays(input.days),
  };
}
