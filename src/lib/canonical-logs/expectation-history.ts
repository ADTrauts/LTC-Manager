/**
 * Pure Log expected-slot history projection.
 *
 * Reconstructs what was expected on each facility service date from
 * effective-dated Attachment config segments + submissions.
 * Does not persist missed occurrences.
 *
 * Reconstruction is correct only when schedule/timing changes are prospective
 * segments (close prior `effectiveTo`, open a successor). In-place mutation of
 * one Attachment row cannot reconstruct a prior cadence.
 */

import { nextOperationalDayKey } from "@/lib/operational-cycles/cycle-lifecycle";
import { toServiceDateKey } from "@/lib/operational-time";
import {
  historySlotStateLabel,
  toHistorySlotState,
  type LogHistorySlotState,
} from "@/lib/logs-architecture/history-slot-state";

import {
  resolveLogRequirementsForAttachment,
  type ExistingLogEvidenceForResolve,
  type LogAttachmentForResolve,
  type PublishedCycleForLogs,
} from "./resolve-log-requirements";

export type LogExpectationHistorySegment = LogAttachmentForResolve;

export type LogHistorySubmission = ExistingLogEvidenceForResolve & {
  operationalDateKey: string;
  catalogVersion?: number;
  valueNumber?: number | null;
  unitLabel?: string | null;
  outOfStandard?: boolean;
};

export type LogHistoryValueSummary = {
  display: string | null;
  outOfStandard: boolean;
};

export type LogExpectationHistorySlot = {
  operationalDateKey: string;
  requirementKey: string;
  attachmentId: string;
  attachmentStableKey: string;
  catalogStableKey: string;
  catalogVersion: number;
  slotLabel: string;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  state: LogHistorySlotState;
  stateLabel: string;
  recordId: string | null;
  valueSummary: LogHistoryValueSummary | null;
};

export type LogExpectationHistoryDay = {
  operationalDateKey: string;
  expected: boolean;
  slots: LogExpectationHistorySlot[];
  /** Ad hoc / unmatched submissions on this date — never create Not complete. */
  unscheduledRecords: LogHistorySubmission[];
};

export type ProjectLogExpectationHistoryInput = {
  segments: readonly LogExpectationHistorySegment[];
  fromDateKey: string;
  toDateKey: string;
  todayKey: string;
  now: Date;
  facilityTimezone?: string | null;
  /** Published cycles for a given service date (date-effective cycle versions). */
  publishedCyclesByDate?: Readonly<Record<string, readonly PublishedCycleForLogs[]>>;
  publishedCycles?: readonly PublishedCycleForLogs[];
  submissions: readonly LogHistorySubmission[];
};

export function enumerateServiceDateKeys(fromKey: string, toKey: string): string[] {
  if (fromKey > toKey) return [];
  const keys: string[] = [];
  let current = fromKey;
  while (current <= toKey) {
    keys.push(current);
    current = nextOperationalDayKey(current);
  }
  return keys;
}

export function segmentCoversDate(
  segment: Pick<LogExpectationHistorySegment, "effectiveFrom" | "effectiveTo">,
  operationalDateKey: string,
): boolean {
  const fromKey = toServiceDateKey(segment.effectiveFrom);
  if (operationalDateKey < fromKey) return false;
  if (segment.effectiveTo && operationalDateKey > toServiceDateKey(segment.effectiveTo)) {
    return false;
  }
  return true;
}

/**
 * Choose the config that was in force on a service date.
 * Overlapping segments: latest effectiveFrom wins (successor should close the prior range).
 */
export function selectSegmentForDate(
  segments: readonly LogExpectationHistorySegment[],
  operationalDateKey: string,
): LogExpectationHistorySegment | null {
  const covering = segments.filter((segment) => segmentCoversDate(segment, operationalDateKey));
  if (covering.length === 0) return null;
  return covering.reduce((latest, row) =>
    toServiceDateKey(row.effectiveFrom) >= toServiceDateKey(latest.effectiveFrom) ? row : latest,
  );
}

function slotLabel(req: {
  cycleLabel: string | null;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
}): string {
  if (req.cycleLabel?.trim()) return req.cycleLabel.trim();
  if (req.cycleStableKey?.trim()) return req.cycleStableKey.trim();
  return "";
}

function valueSummaryFor(
  submission: LogHistorySubmission | undefined,
): LogHistoryValueSummary | null {
  if (!submission) return null;
  if (submission.valueNumber != null && Number.isFinite(submission.valueNumber)) {
    const unit = submission.unitLabel?.trim() ? submission.unitLabel.trim() : "";
    return {
      display: unit ? `${formatNumber(submission.valueNumber)}${unit}` : String(submission.valueNumber),
      outOfStandard: submission.outOfStandard === true,
    };
  }
  return {
    display: null,
    outOfStandard: submission.outOfStandard === true,
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function submissionHasCorrectiveAction(status: LogHistorySubmission["status"]): boolean {
  return status === "COMPLETED_WITH_CORRECTIVE_ACTION" || status === "NEEDS_REVIEW";
}

/**
 * Project expected slots across a service-date range.
 * Missing submission on a past expected slot → Not complete, never "nothing required".
 * Dates with no covering segment → no slots (not Not complete).
 * Ad hoc segments produce no expected slots.
 */
export function projectLogExpectationHistory(
  input: ProjectLogExpectationHistoryInput,
): LogExpectationHistoryDay[] {
  const dateKeys = enumerateServiceDateKeys(input.fromDateKey, input.toDateKey);
  const submissions = input.submissions;

  return dateKeys.map((operationalDateKey) => {
    const segment = selectSegmentForDate(input.segments, operationalDateKey);
    const dateSubmissions = submissions.filter((row) => row.operationalDateKey === operationalDateKey);

    if (!segment) {
      return {
        operationalDateKey,
        expected: false,
        slots: [],
        unscheduledRecords: dateSubmissions,
      };
    }

    const publishedCycles =
      input.publishedCyclesByDate?.[operationalDateKey] ?? input.publishedCycles ?? [];

    const requirements = resolveLogRequirementsForAttachment({
      attachment: { ...segment, status: "ACTIVE" },
      operationalDateKey,
      now: input.now,
      facilityTimezone: input.facilityTimezone,
      publishedCycles,
      existingRecords: dateSubmissions,
    });

    const matchedKeys = new Set(requirements.map((req) => req.requirementKey));
    const unscheduledRecords = dateSubmissions.filter(
      (row) =>
        !matchedKeys.has(row.logRequirementKey ?? "") &&
        !matchedKeys.has(row.requirementKey),
    );

    const slots: LogExpectationHistorySlot[] = requirements
      .filter((req) => req.productState !== "NEEDS_SETUP")
      .map((req) => {
        const record =
          dateSubmissions.find(
            (row) =>
              row.logRequirementKey === req.requirementKey || row.requirementKey === req.requirementKey,
          ) ?? null;
        const state = toHistorySlotState({
          liveState: req.productState,
          operationalDateKey,
          todayKey: input.todayKey,
          hasSubmission: record != null,
          submissionHasCorrectiveAction: record
            ? submissionHasCorrectiveAction(record.status)
            : false,
        });
        return {
          operationalDateKey,
          requirementKey: req.requirementKey,
          attachmentId: req.attachmentId,
          attachmentStableKey: req.attachmentStableKey,
          catalogStableKey: req.catalogStableKey,
          catalogVersion: record?.catalogVersion ?? req.catalogVersion,
          slotLabel: slotLabel(req),
          cycleStableKey: req.cycleStableKey,
          windowStartLocal: req.windowStartLocal,
          windowEndLocal: req.windowEndLocal,
          state,
          stateLabel: historySlotStateLabel(state),
          recordId: record?.id ?? null,
          valueSummary: valueSummaryFor(record ?? undefined),
        };
      });

    return {
      operationalDateKey,
      expected: slots.length > 0,
      slots,
      unscheduledRecords,
    };
  });
}
