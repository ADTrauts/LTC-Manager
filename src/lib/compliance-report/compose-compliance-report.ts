/**
 * Derived compliance packet. PDF, XLSX, and CSV render this object.
 * It is not stored.
 */

import type { AuditRecordSlot } from "@/lib/audit/audit-records";
import {
  formatOccurrenceSummaryLine,
  occurrenceContributesInspectionScore,
  operationalOccurrenceLabel,
  summarizeOperationalOccurrences,
} from "@/lib/operational-occurrence/classify-operational-requirement";

import type {
  ComplianceAttachmentRef,
  ComplianceReport,
  ComplianceReportMetadata,
  ComplianceResponseRow,
} from "./types";

function responseRows(slot: AuditRecordSlot): ComplianceResponseRow[] {
  const location = slot.placeLabel ?? "";
  const recordId = slot.record?.id ?? "";
  const questions = slot.inspection?.questions ?? [];
  if (questions.length > 0) {
    return questions.map((question) => ({
      recordId,
      serviceDate: slot.serviceDate,
      location,
      section: question.section ?? "",
      field: question.field,
      response: question.response,
      unit: "",
      notApplicable: question.notApplicable,
      outOfStandard: question.outOfStandard,
      scoreWeight: question.scoreWeight ?? null,
      earned: question.earned ?? null,
      critical: question.critical === true,
    }));
  }
  const repeats = (slot.repeatResponses ?? []).map((row) => ({
    recordId,
    serviceDate: slot.serviceDate,
    location,
    section: "",
    field: row.column,
    response: row.value,
    unit: row.unit,
    notApplicable: false,
    outOfStandard: row.outOfStandard,
    scoreWeight: null,
    earned: null,
    critical: false,
    group: row.group,
    row: row.row,
  }));
  if (repeats.length > 0) return repeats;
  if (!slot.record) return [];
  const numeric = slot.record.valueNumber;
  return [
    {
      recordId,
      serviceDate: slot.serviceDate,
      location,
      section: "",
      field: slot.definitionLabel,
      response: numeric != null ? String(numeric) : (slot.record.valueText ?? ""),
      unit: "",
      notApplicable: false,
      outOfStandard: slot.record.outOfStandard,
      scoreWeight: null,
      earned: null,
      critical: false,
    },
  ];
}

export function composeComplianceReport(input: {
  metadata: ComplianceReportMetadata;
  slots: readonly AuditRecordSlot[];
  attachments?: readonly ComplianceAttachmentRef[];
  issuesByRecordId?: ReadonlyMap<string, string> | Record<string, string>;
}): ComplianceReport {
  const issues =
    input.issuesByRecordId instanceof Map
      ? input.issuesByRecordId
      : new Map(Object.entries(input.issuesByRecordId ?? {}));
  const records = input.slots.map((slot) => {
    const one = summarizeOperationalOccurrences([slot.slotState]);
    return {
      slot,
      recordId: slot.record?.id ?? null,
      statusLabel: operationalOccurrenceLabel(slot.slotState),
      countedAsScheduled: one.expected === 1,
      countedAsCompleted: one.completed === 1,
      countedAsMissed: one.missed === 1,
      corrected: slot.corrections.length > 0,
      issueLabel: slot.record ? (issues.get(slot.record.id) ?? null) : null,
    };
  });
  const occurrenceSummary = summarizeOperationalOccurrences(records.map((row) => row.slot.slotState));
  const scored = records.filter(
    (row) =>
      occurrenceContributesInspectionScore(row.slot.slotState) && row.slot.inspection?.percentage != null,
  );
  const averageInspectionScore =
    scored.length === 0
      ? null
      : Math.round(
          (scored.reduce((sum, row) => sum + (row.slot.inspection?.percentage ?? 0), 0) / scored.length) * 10,
        ) / 10;
  const versions = new Map<number, number>();
  for (const row of records) {
    if (!row.slot.record) continue;
    const version = row.slot.record.templateVersion || row.slot.catalogVersion;
    versions.set(version, (versions.get(version) ?? 0) + 1);
  }
  const byTemplate = new Map<string, { label: string; states: typeof records }>();
  for (const row of records) {
    const current = byTemplate.get(row.slot.catalogStableKey) ?? {
      label: row.slot.definitionLabel,
      states: [],
    };
    current.states.push(row);
    byTemplate.set(row.slot.catalogStableKey, current);
  }
  const exceptions = records.filter(
    (row) => row.slot.record?.outOfStandard || row.slot.followUps.length > 0 || row.slot.inspection?.outcome === "FAIL",
  );
  return {
    metadata: input.metadata,
    versions: [...versions.entries()]
      .map(([version, count]) => ({ version, records: count }))
      .sort((a, b) => a.version - b.version),
    summary: {
      expected: occurrenceSummary.expected,
      completed: occurrenceSummary.completed,
      missed: occurrenceSummary.missed,
      overdue: occurrenceSummary.overdue,
      waived: occurrenceSummary.waived,
      upcoming: occurrenceSummary.upcoming,
      notYetDue: occurrenceSummary.upcoming + occurrenceSummary.due,
      needsSetup: occurrenceSummary.needsSetup,
      needsReview: occurrenceSummary.needsReview,
      exceptions: occurrenceSummary.exceptions,
      averageInspectionScore,
      failedInspections: records.filter(
        (row) =>
          occurrenceContributesInspectionScore(row.slot.slotState) && row.slot.inspection?.outcome === "FAIL",
      ).length,
      criticalFailures: records.reduce(
        (sum, row) =>
          occurrenceContributesInspectionScore(row.slot.slotState)
            ? sum + (row.slot.inspection?.criticalFailureCount ?? 0)
            : sum,
        0,
      ),
    },
    templateLines: [...byTemplate.entries()]
      .map(([templateKey, group]) => {
        const summary = summarizeOperationalOccurrences(group.states.map((row) => row.slot.slotState));
        const scoredRows = group.states.filter(
          (row) =>
            occurrenceContributesInspectionScore(row.slot.slotState) && row.slot.inspection?.percentage != null,
        );
        return {
          templateKey,
          label: group.label,
          line: formatOccurrenceSummaryLine(group.label, summary),
          expected: summary.expected,
          completed: summary.completed,
          missed: summary.missed,
          overdue: summary.overdue,
          waived: summary.waived,
          exceptions: summary.exceptions,
          averageInspectionScore:
            scoredRows.length === 0
              ? null
              : Math.round(
                  (scoredRows.reduce((sum, row) => sum + (row.slot.inspection?.percentage ?? 0), 0) /
                    scoredRows.length) *
                    10,
                ) / 10,
          failedInspections: group.states.filter(
            (row) =>
              occurrenceContributesInspectionScore(row.slot.slotState) && row.slot.inspection?.outcome === "FAIL",
          ).length,
          criticalFailures: group.states.reduce(
            (sum, row) =>
              occurrenceContributesInspectionScore(row.slot.slotState)
                ? sum + (row.slot.inspection?.criticalFailureCount ?? 0)
                : sum,
            0,
          ),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
    records,
    responses: input.slots.flatMap(responseRows),
    exceptions,
    attachments: [...(input.attachments ?? [])],
    slots: [...input.slots],
  };
}

export function complianceReportDayCount(fromDateKey: string, toDateKey: string): number {
  const start = Date.parse(`${fromDateKey}T00:00:00Z`);
  const end = Date.parse(`${toDateKey}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}
