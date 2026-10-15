import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { AuditRecordSlot } from "@/lib/audit/audit-records";
import ExcelJS from "exceljs";

import { complianceReportAccessDecision } from "./authorize-compliance-report";
import { composeComplianceReport } from "./compose-compliance-report";
import { renderComplianceCsv } from "./render-compliance-csv";
import { renderCompliancePdf } from "./render-compliance-pdf";
import { renderComplianceWorkbook } from "./render-compliance-workbook";
import { complianceReportFilename } from "./report-filename";
import type { ComplianceReportMetadata } from "./types";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
    assetId: "asset",
    unitId: null,
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    requirementKey: `${partial.serviceDate}-${partial.windowStartLocal ?? partial.slotState}`,
    placeLabel: "Reach-In Cooler #1",
    placeLabelCertainty: "CURRENT_LABEL",
    record: null,
    followUps: [],
    corrections: [],
    waiver: null,
    waiverAllowed: false,
    source: "CANONICAL_RECORD",
    ...partial,
  };
}

const metadata: ComplianceReportMetadata = {
  facilityName: "Terrace View",
  departmentName: "Dietary",
  templateName: "Cooler Temperature Log",
  templateStableKey: "cooler",
  fromDateKey: "2026-10-14",
  toDateKey: "2026-10-15",
  generatedAt: "2026-10-15T12:14:00.000Z",
  generatedBy: "Manager",
  timezone: "America/New_York",
  filters: ["All locations"],
};

test("cooler packet counts scheduled checks without the recheck", async () => {
  const report = composeComplianceReport({
    metadata,
    slots: [
      slot({
        serviceDate: "2026-10-14",
        windowStartLocal: "06:00",
        slotState: "COMPLETE",
        record: record("r1", 38, false, 1),
      }),
      slot({
        serviceDate: "2026-10-14",
        windowStartLocal: "14:00",
        slotState: "COMPLETE",
        record: record("r2", 39, false, 1),
      }),
      slot({
        serviceDate: "2026-10-15",
        windowStartLocal: "06:00",
        slotState: "COMPLETE_WITH_CORRECTIVE_ACTION",
        record: record("r3", 55, true, 1, "Food moved to another cooler."),
        followUps: [
          {
            id: "recheck",
            valueNumber: 38,
            occurredAt: null,
            recordedAt: "2026-10-15T11:00:00.000Z",
            recordedByLabel: "Jane Smith",
            outOfStandard: false,
          },
        ],
      }),
      slot({
        serviceDate: "2026-10-15",
        windowStartLocal: "14:00",
        slotState: "NOT_COMPLETE",
      }),
    ],
    attachments: [
      {
        id: "photo1",
        recordId: "r3",
        kind: "PHOTO",
        filename: "cooler.jpg",
        contentType: "image/png",
        signedBy: null,
        signedAt: null,
      },
    ],
  });
  assert.equal(report.summary.expected, 4);
  assert.equal(report.summary.completed, 3);
  assert.equal(report.summary.missed, 1);
  assert.equal(report.summary.exceptions, 1);
  const pdf = decodePdfText(await renderCompliancePdf(report, new Map([["photo1", png]])));
  assert.match(pdf, /%PDF/);
  assert.match(pdf, /Expected 4/);
  assert.match(pdf, /Completed 3/);
  assert.match(pdf, /Missed 1/);
  assert.match(pdf, /Food moved to another cooler/);
  assert.match(pdf, /Recheck: 38/);
  assert.match(pdf, /cooler.jpg/);
  const book = await readBook(await renderComplianceWorkbook(report));
  assert.deepEqual(book.worksheets.map((sheet) => sheet.name), ["Summary", "Records", "Responses", "Exceptions"]);
  assert.equal(book.getWorksheet("Summary")?.getCell("B13").value, 3);
  assert.equal(book.getWorksheet("Records")?.getRow(2).getCell(12).value, 38);
  const csv = renderComplianceCsv(report, "slots");
  assert.match(csv, /NOT_COMPLETE/);
  assert.match(csv, /,55,/);
  assert.equal(complianceReportFilename({
    facilityName: "Terrace View",
    templateName: "Cooler Temperature Log",
    fromDateKey: "2026-10-14",
    toDateKey: "2026-10-15",
    extension: "pdf",
  }), "Terrace_View_Cooler_Temperature_Log_2026-10-14_to_2026-10-15.pdf");
});

test("inspection packet reuses the derived 61.5% failure across renderers", async () => {
  const audit = composeComplianceReport({
    metadata: {
      ...metadata,
      templateName: "Kitchen Sanitation Audit — Certification",
      templateStableKey: "kitchen",
    },
    slots: [
      slot({
        serviceDate: "2026-10-15",
        slotState: "COMPLETE_WITH_CORRECTIVE_ACTION",
        catalogStableKey: "kitchen",
        catalogVersion: 1,
        definitionLabel: "Kitchen Sanitation Audit — Certification",
        recordForm: "Inspection",
        placeLabel: "Kitchen",
        record: record("audit1", null, true, 1, "Relabeled the open pan."),
        inspection: {
          percentage: 61.5,
          outcome: "FAIL",
          criticalFailureCount: 1,
          sectionScores: [
            { sectionKey: "food_storage", label: "Food Storage", earnedPoints: 10, possiblePoints: 15, percentage: 66.7 },
          ],
          questions: [
            { field: "Labeled", response: "Compliant", notApplicable: false, outOfStandard: false, section: "food_storage", scoreWeight: 5, earned: 5, critical: true },
            { field: "Dry storage", response: "N/A", notApplicable: true, outOfStandard: false, section: "food_storage", scoreWeight: 10, earned: null, critical: false },
            { field: "Sanitizer", response: "Non-Compliant", notApplicable: false, outOfStandard: true, section: "equipment", scoreWeight: 20, earned: 0, critical: true },
          ],
        },
      }),
    ],
    attachments: [
      {
        id: "sig",
        recordId: "audit1",
        kind: "SIGNATURE",
        filename: "signature.png",
        contentType: "image/png",
        signedBy: "Jane Smith",
        signedAt: "2026-10-15T18:47:00.000Z",
      },
      {
        id: "file",
        recordId: "audit1",
        kind: "FILE",
        filename: "service-report.pdf",
        contentType: "application/pdf",
        signedBy: null,
        signedAt: null,
      },
    ],
  });
  assert.equal(audit.summary.averageInspectionScore, 61.5);
  assert.equal(audit.summary.failedInspections, 1);
  assert.equal(audit.summary.criticalFailures, 1);
  const pdf = decodePdfText(await renderCompliancePdf(audit, new Map([["sig", png]])));
  assert.match(pdf, /61\.5%/);
  assert.match(pdf, /FAIL/);
  assert.match(pdf, /Critical failures 1/);
  assert.match(pdf, /N\/A/);
  assert.match(pdf, /Food Storage 10\/15/);
  assert.match(pdf, /Signed by: Jane Smith/);
  assert.match(pdf, /service-report.pdf/);
  assert.doesNotMatch(pdf, /DOH Certified|CMS Approved/);
  const book = await readBook(await renderComplianceWorkbook(audit));
  assert.equal(book.getWorksheet("Summary")?.getCell("B18").value, 0.615);
  const response = book.getWorksheet("Responses");
  const texts = response?.getSheetValues().flat().map(String) ?? [];
  assert.ok(texts.includes("N/A"));
  const csv = renderComplianceCsv(audit, "responses");
  assert.match(csv, /61\.5,FAIL/);
  assert.match(csv, /N\/A/);
  assert.match(csv, /notApplicable/);
});

test("mixed template versions stay on the records that used them", () => {
  const report = composeComplianceReport({
    metadata,
    slots: [
      slot({ serviceDate: "2026-10-01", slotState: "COMPLETE", record: record("a", 38, false, 1) }),
      slot({ serviceDate: "2026-10-16", slotState: "COMPLETE", catalogVersion: 2, record: record("b", 40, false, 2) }),
    ],
  });
  assert.deepEqual(report.versions, [
    { version: 1, records: 1 },
    { version: 2, records: 1 },
  ]);
  assert.equal(report.records[0]?.slot.record?.valueNumber, 38);
  assert.equal(report.records[1]?.slot.record?.templateVersion, 2);
});

test("export authorization stays inside the signed-in facility and department", () => {
  const denied = complianceReportAccessDecision({
    sessionFacilityId: "fac",
    requestedDepartmentId: "other",
    facilityDepartmentIds: ["dietary"],
    memberDepartmentIds: ["dietary"],
  });
  assert.equal(denied.ok, false);
  const outsider = complianceReportAccessDecision({
    sessionFacilityId: "fac",
    requestedDepartmentId: "dietary",
    facilityDepartmentIds: ["dietary"],
    memberDepartmentIds: ["housekeeping"],
  });
  assert.equal(outsider.ok, false);
  const admin = complianceReportAccessDecision({
    sessionFacilityId: "fac",
    requestedDepartmentId: "all",
    facilityDepartmentIds: ["dietary", "housekeeping"],
    memberDepartmentIds: "ALL",
  });
  assert.equal(admin.ok, true);
  if (admin.ok) assert.deepEqual(admin.departmentIds, ["dietary", "housekeeping"]);
  const route = readFileSync(join(process.cwd(), "src/app/(protected)/reports/export/route.ts"), "utf8");
  assert.match(route, /session\.facilityId/);
  assert.match(route, /complianceReportAccessDecision/);
  assert.doesNotMatch(route, /access:\s*"public"/);
  assert.doesNotMatch(readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8"), /model ReportRecord/);
});

function decodePdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const decoded = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1] ?? "", "hex").toString("latin1"))
    .join("");
  return `${raw}\n${decoded}`;
}

function record(
  id: string,
  value: number | null,
  outOfStandard: boolean,
  version: number,
  correctiveActionText: string | null = null,
): NonNullable<AuditRecordSlot["record"]> {
  return {
    id,
    occurredAt: "2026-10-15T12:00:00.000Z",
    recordedAt: "2026-10-15T12:05:00.000Z",
    recordedByLabel: "Jane Smith",
    valueNumber: value,
    valueText: null,
    outOfStandard,
    correctiveActionText,
    templateVersion: version,
    status: outOfStandard ? "COMPLETED_WITH_CORRECTIVE_ACTION" : "COMPLETED",
  };
}

async function readBook(bytes: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  return book;
}
