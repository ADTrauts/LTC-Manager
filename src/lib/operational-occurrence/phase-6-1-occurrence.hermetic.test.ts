import assert from "node:assert/strict";
import test from "node:test";

import type { AuditRecordSlot } from "@/lib/audit/audit-records";
import { composeComplianceReport } from "@/lib/compliance-report/compose-compliance-report";
import { renderComplianceCsv } from "@/lib/compliance-report/render-compliance-csv";
import { renderCompliancePdf } from "@/lib/compliance-report/render-compliance-pdf";
import { renderComplianceWorkbook } from "@/lib/compliance-report/render-compliance-workbook";
import type { ComplianceReportMetadata } from "@/lib/compliance-report/types";
import {
  classifyOperationalRequirement,
  formatOccurrenceSummaryLine,
  summarizeOperationalOccurrences,
} from "@/lib/operational-occurrence/classify-operational-requirement";
import { aggregateOperationalReviewDays } from "@/lib/operational-review/compose-operational-review-range";
import { presentOperationalReviewRange } from "@/lib/operational-review/present-operational-review-range";
import type {
  OperationalReviewDayViewModel,
  ReviewEvidenceOccurrence,
  ReviewEvidenceState,
} from "@/lib/operational-review/types";
import ExcelJS from "exceljs";

const TODAY = "2026-10-15";

function classify(input: {
  liveState: string;
  serviceDate: string;
  hasEvidence?: boolean;
  evidenceStatus?: string | null;
  outOfStandard?: boolean;
  hasCorrectiveAction?: boolean;
  hasWaiver?: boolean;
}) {
  return classifyOperationalRequirement({
    liveState: input.liveState,
    serviceDate: input.serviceDate,
    todayKey: TODAY,
    hasEvidence: input.hasEvidence === true,
    evidenceStatus: input.evidenceStatus,
    outOfStandard: input.outOfStandard,
    hasCorrectiveAction: input.hasCorrectiveAction,
    hasWaiver: input.hasWaiver === true,
  });
}

test("occurrence states keep completion, exception, waiver, overdue, and missed apart", () => {
  assert.equal(classify({ liveState: "DUE", serviceDate: "2026-10-14", hasEvidence: true, evidenceStatus: "COMPLETED" }), "COMPLETE");
  assert.equal(
    classify({
      liveState: "DUE",
      serviceDate: "2026-10-14",
      hasEvidence: true,
      evidenceStatus: "COMPLETED_WITH_CORRECTIVE_ACTION",
      outOfStandard: true,
      hasCorrectiveAction: true,
    }),
    "COMPLETE_WITH_CORRECTIVE_ACTION",
  );
  assert.equal(
    classify({ liveState: "DUE", serviceDate: "2026-10-14", hasEvidence: true, evidenceStatus: "NEEDS_REVIEW" }),
    "NEEDS_REVIEW",
  );
  assert.equal(classify({ liveState: "OVERDUE", serviceDate: "2026-10-14", hasWaiver: true }), "WAIVED");
  assert.equal(
    classify({
      liveState: "OVERDUE",
      serviceDate: "2026-10-14",
      hasEvidence: true,
      evidenceStatus: "COMPLETED",
      hasWaiver: true,
    }),
    "COMPLETE",
  );
  assert.equal(classify({ liveState: "OVERDUE", serviceDate: TODAY }), "OVERDUE");
  assert.equal(classify({ liveState: "OVERDUE", serviceDate: "2026-10-14" }), "NOT_COMPLETE");
  assert.equal(classify({ liveState: "UPCOMING", serviceDate: TODAY }), "UPCOMING");
  assert.equal(classify({ liveState: "DUE", serviceDate: "2026-10-16" }), "UPCOMING");
  assert.equal(classify({ liveState: "NEEDS_SETUP", serviceDate: "2026-10-14" }), "NEEDS_SETUP");

  const summary = summarizeOperationalOccurrences([
    "COMPLETE",
    "COMPLETE_WITH_CORRECTIVE_ACTION",
    "NEEDS_REVIEW",
    "WAIVED",
    "OVERDUE",
    "NOT_COMPLETE",
    "UPCOMING",
    "NEEDS_SETUP",
  ]);
  assert.equal(summary.expected, 7);
  assert.equal(summary.completed, 3);
  assert.equal(summary.missed, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.waived, 1);
  assert.equal(summary.upcoming, 1);
  assert.equal(summary.needsSetup, 1);
  assert.equal(summary.exceptions, 1);
  assert.equal(summary.needsReview, 1);
});

test("overdue stays fulfillable on the open service date and becomes missed after it closes", () => {
  const open = classifyOperationalRequirement({
    liveState: "OVERDUE",
    serviceDate: "2026-10-15",
    todayKey: "2026-10-15",
    hasEvidence: false,
    hasWaiver: false,
  });
  const closed = classifyOperationalRequirement({
    liveState: "OVERDUE",
    serviceDate: "2026-10-15",
    todayKey: "2026-10-16",
    hasEvidence: false,
    hasWaiver: false,
  });
  assert.equal(open, "OVERDUE");
  assert.equal(closed, "NOT_COMPLETE");
  assert.notEqual(open, closed);
});

const metadata: ComplianceReportMetadata = {
  facilityName: "Terrace View",
  departmentName: "Dietary",
  templateName: "Cooler Temperature Log",
  templateStableKey: "cooler",
  fromDateKey: "2026-10-14",
  toDateKey: "2026-10-16",
  generatedAt: "2026-10-15T12:00:00.000Z",
  generatedBy: "Manager",
  timezone: "America/New_York",
  filters: ["All locations"],
};

function slot(partial: Partial<AuditRecordSlot> & Pick<AuditRecordSlot, "serviceDate" | "slotState">): AuditRecordSlot {
  return {
    departmentId: "dep",
    catalogStableKey: "cooler",
    catalogVersion: 1,
    definitionLabel: "Cooler Temperature Log",
    recordForm: "Reading",
    requirementSegmentId: "seg",
    attachmentStableKey: "att",
    locationFunctionKey: null,
    spaceId: null,
    assetId: null,
    unitId: null,
    cycleStableKey: null,
    windowStartLocal: "06:00",
    windowEndLocal: "11:00",
    requirementKey: `${partial.serviceDate}-${partial.slotState}`,
    placeLabel: "Reach-In Cooler #1",
    placeLabelCertainty: "CURRENT_LABEL",
    record: null,
    followUps: [],
    corrections: [],
    waiver: partial.slotState === "WAIVED" ? { reason: "Cooler offline", actorLabel: "Bea", recordedAt: "2026-10-14T12:00:00.000Z" } : null,
    waiverAllowed: false,
    source: "CANONICAL_RECORD",
    ...partial,
  };
}

function occurrence(state: ReviewEvidenceState, inspection?: ReviewEvidenceOccurrence["inspection"]): ReviewEvidenceOccurrence {
  return {
    spaceId: null,
    parentUnitId: null,
    requirementKey: state,
    attachmentId: "att",
    attachmentStableKey: "att",
    catalogStableKey: "cooler",
    catalogVersion: 1,
    slotLabel: "Cooler Temperature Log",
    cycleStableKey: null,
    windowStartLocal: "06:00",
    windowEndLocal: "11:00",
    expected: true,
    state,
    recordId: null,
    occurredAt: null,
    recordedAt: null,
    operationalDateKey: "2026-10-15",
    inspection,
  };
}

function reviewDay(rows: ReviewEvidenceOccurrence[]): OperationalReviewDayViewModel {
  const empty = { status: "evaluated" as const, reason: null };
  return {
    facilityId: "fac",
    facilityLabel: "Terrace View",
    departmentId: "dep",
    departmentIds: ["dep"],
    serviceDate: "2026-10-15",
    timezone: "America/New_York",
    locations: [],
    evidence: { availability: empty, occurrences: rows },
    coverage: { availability: empty, slots: [], assignments: [] },
    cycles: { availability: empty, versions: [] },
    milestones: { availability: empty, items: [] },
    presence: { scheduled: [], exceptions: [], attendanceClaimed: false },
    work: { availability: empty },
    assets: { availability: empty, impacts: [] },
    menu: { availability: empty, findings: [] },
  };
}

test("Review and the compliance packet share one cooler summary", async () => {
  const slots = [
    slot({ serviceDate: "2026-10-14", slotState: "COMPLETE", record: { id: "a", occurredAt: null, recordedAt: null, recordedByLabel: "Jane", valueNumber: 38, valueText: null, outOfStandard: false, correctiveActionText: null, templateVersion: 1, status: "COMPLETED" } }),
    slot({ serviceDate: "2026-10-14", windowStartLocal: "14:00", slotState: "COMPLETE_WITH_CORRECTIVE_ACTION", record: { id: "b", occurredAt: null, recordedAt: null, recordedByLabel: "Jane", valueNumber: 55, valueText: null, outOfStandard: true, correctiveActionText: "Food moved", templateVersion: 1, status: "COMPLETED_WITH_CORRECTIVE_ACTION" } }),
    slot({ serviceDate: TODAY, slotState: "OVERDUE" }),
    slot({ serviceDate: "2026-10-16", slotState: "UPCOMING" }),
    slot({ serviceDate: "2026-10-13", slotState: "NOT_COMPLETE" }),
    slot({ serviceDate: "2026-10-13", windowStartLocal: "14:00", slotState: "WAIVED" }),
  ];
  const report = composeComplianceReport({ metadata, slots });
  const reviewRows = [
    occurrence("completed"),
    occurrence("completed_with_corrective_action"),
    occurrence("overdue"),
    occurrence("upcoming"),
    occurrence("not_complete"),
    occurrence("waived"),
  ];
  const totals = aggregateOperationalReviewDays([reviewDay(reviewRows)]);
  assert.equal(report.summary.expected, 6);
  assert.equal(report.summary.completed, 2);
  assert.equal(report.summary.missed, 1);
  assert.equal(report.summary.overdue, 1);
  assert.equal(report.summary.waived, 1);
  assert.equal(report.summary.upcoming, 1);
  assert.equal(report.summary.exceptions, 1);
  assert.equal(totals.evidenceExpected, report.summary.expected);
  assert.equal(totals.evidenceCompleted, report.summary.completed);
  assert.equal(totals.evidenceMissed, report.summary.missed);
  assert.equal(totals.evidenceOverdue, report.summary.overdue);
  assert.equal(totals.evidenceWaived, report.summary.waived);
  assert.equal(totals.evidenceCorrective, report.summary.exceptions);

  const presented = presentOperationalReviewRange({
    facilityId: "fac",
    facilityLabel: "Terrace View",
    departmentId: "dep",
    timezone: "America/New_York",
    days: [reviewDay(reviewRows)],
    startServiceDate: "2026-10-13",
    endServiceDate: "2026-10-16",
    todayKey: TODAY,
    totals,
    dayCount: 1,
  });
  const line = presented.summaryItems.find((item) => item.id === "template-cooler")?.label;
  assert.equal(line, report.templateLines[0]?.line);
  assert.equal(line, formatOccurrenceSummaryLine("Cooler Temperature Log", summarizeOperationalOccurrences(slots.map((row) => row.slotState))));

  const pdf = (await renderCompliancePdf(report)).toString("latin1");
  const decoded = [...pdf.matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => Buffer.from(match[1] ?? "", "hex").toString("latin1")).join("");
  assert.match(decoded, /Expected 6/);
  assert.match(decoded, /Completed 2/);
  assert.match(decoded, /Missed 1/);
  assert.match(decoded, /Overdue 1/);
  assert.match(decoded, /Waived 1/);
  assert.match(decoded, /Cooler offline/);

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await renderComplianceWorkbook(report));
  const summary = book.getWorksheet("Summary");
  const metric = (name: string) => {
    const found = summary?.getColumn(1).values.findIndex((value) => value === name) ?? 0;
    return summary?.getRow(found).getCell(2).value;
  };
  assert.equal(metric("Completed"), 2);
  assert.equal(metric("Missed"), 1);
  assert.equal(metric("Overdue"), 1);
  assert.equal(metric("Waived"), 1);
  assert.equal(book.getWorksheet("Records")?.getRow(2).getCell(9).value, "Completed");

  const csv = renderComplianceCsv(report, "slots");
  assert.match(csv, /occurrenceState/);
  assert.match(csv, /WAIVED/);
  assert.match(csv, /OVERDUE/);
  assert.match(csv, /NOT_COMPLETE/);
  assert.doesNotMatch(csv.split("\n").find((line) => line.includes("WAIVED")) ?? "", /COMPLETE,/);
});

test("a failed inspection counts as completed evidence and missed or waived audits are unscored", () => {
  const fail = slot({
    serviceDate: "2026-10-14",
    catalogStableKey: "audit",
    definitionLabel: "Kitchen Sanitation Audit",
    slotState: "COMPLETE_WITH_CORRECTIVE_ACTION",
    record: { id: "audit", occurredAt: null, recordedAt: null, recordedByLabel: "Jane", valueNumber: null, valueText: null, outOfStandard: true, correctiveActionText: "Corrected", templateVersion: 1, status: "COMPLETED_WITH_CORRECTIVE_ACTION" },
    inspection: { percentage: 61.5, outcome: "FAIL", criticalFailureCount: 1, questions: [] },
  });
  const missed = slot({ serviceDate: "2026-10-13", catalogStableKey: "audit", definitionLabel: "Kitchen Sanitation Audit", slotState: "NOT_COMPLETE", inspection: { percentage: 0, outcome: "FAIL", criticalFailureCount: 1, questions: [] } });
  const waived = slot({ serviceDate: "2026-10-12", catalogStableKey: "audit", definitionLabel: "Kitchen Sanitation Audit", slotState: "WAIVED", inspection: { percentage: 0, outcome: "FAIL", criticalFailureCount: 0, questions: [] } });
  const overdue = slot({ serviceDate: TODAY, catalogStableKey: "audit", definitionLabel: "Kitchen Sanitation Audit", slotState: "OVERDUE", inspection: { percentage: 0, outcome: "FAIL", criticalFailureCount: 0, questions: [] } });
  const report = composeComplianceReport({
    metadata: { ...metadata, templateName: "Kitchen Sanitation Audit", templateStableKey: "audit" },
    slots: [fail, missed, waived, overdue],
  });
  assert.equal(report.summary.expected, 4);
  assert.equal(report.summary.completed, 1);
  assert.equal(report.summary.missed, 1);
  assert.equal(report.summary.waived, 1);
  assert.equal(report.summary.overdue, 1);
  assert.equal(report.summary.averageInspectionScore, 61.5);
  assert.equal(report.summary.failedInspections, 1);
  assert.equal(report.summary.criticalFailures, 1);

  const totals = aggregateOperationalReviewDays([
    reviewDay([
      occurrence("completed_with_corrective_action", { percentage: 61.5, outcome: "FAIL", criticalFailureCount: 1, exceptionCount: 1 }),
      occurrence("not_complete", { percentage: 0, outcome: "FAIL", criticalFailureCount: 1, exceptionCount: 1 }),
      occurrence("waived", { percentage: 0, outcome: "FAIL", criticalFailureCount: 0, exceptionCount: 0 }),
      occurrence("overdue", { percentage: 0, outcome: "FAIL", criticalFailureCount: 0, exceptionCount: 0 }),
    ]),
  ]);
  assert.equal(totals.evidenceCompleted, 1);
  assert.equal(totals.evidenceMissed, 1);
  assert.equal(totals.evidenceWaived, 1);
  assert.equal(totals.evidenceOverdue, 1);
});
