import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { auditRecordsToCsv, type AuditRecordSlot } from "@/lib/audit/audit-records";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";

import { formatEvidenceFieldDisplay } from "./evidence-field-display";
import {
  evaluateInspectionScore,
  inspectionEvidenceToCsv,
  scoreInspectionSnapshot,
  summarizeInspectionReviews,
  type InspectionScoreField,
  type InspectionSectionDefinition,
} from "./inspection-score";
import { buildCanonicalLogSubmissionSnapshot } from "./snapshot";

const root = process.cwd();
const sections: InspectionSectionDefinition[] = [
  { sectionKey: "food_storage", label: "Food Storage", displaySequence: 1 },
  { sectionKey: "sanitation", label: "Sanitation", displaySequence: 2 },
  { sectionKey: "equipment", label: "Equipment", displaySequence: 3 },
];

function question(
  fieldKey: string,
  label: string,
  sectionKey: string,
  scoreWeight: number | null,
  extra: Partial<InspectionScoreField> = {},
): InspectionScoreField {
  return {
    fieldKey,
    label,
    fieldType: "COMPLIANCE",
    sectionKey,
    scoreWeight,
    displaySequence: 1,
    ...extra,
  };
}

const certificationFields: InspectionScoreField[] = [
  question("labeled", "All refrigerated foods labeled and dated?", "food_storage", 5, {
    critical: true,
    displaySequence: 10,
  }),
  question("off_floor", "Food stored at least 6 inches off the floor?", "food_storage", 5, {
    displaySequence: 20,
  }),
  question("dry_storage", "Dry storage organized?", "food_storage", 10, { displaySequence: 30 }),
  question("surfaces", "Food-contact surfaces clean?", "sanitation", 20, { displaySequence: 40 }),
  question("sanitizer", "Sanitizer concentration in range?", "equipment", 20, {
    critical: true,
    displaySequence: 50,
  }),
  question("handwash", "Handwashing sink stocked?", "equipment", 10, { displaySequence: 60 }),
  {
    fieldKey: "walk_in",
    label: "Walk-in cooler temperature",
    fieldType: "TEMPERATURE",
    sectionKey: "food_storage",
    scoreWeight: 5,
    minNumber: 33,
    maxNumber: 41,
    unitLabel: "°F",
    displaySequence: 70,
  },
  {
    fieldKey: "notes",
    label: "Inspector notes",
    fieldType: "LONG_TEXT",
    sectionKey: "sanitation",
    scoreWeight: null,
    displaySequence: 80,
  },
  {
    fieldKey: "signature",
    label: "Inspector signature",
    fieldType: "SIGNATURE",
    scoreWeight: null,
    displaySequence: 90,
  },
  {
    fieldKey: "photo",
    label: "Exception photo",
    fieldType: "PHOTO",
    scoreWeight: 10,
    displaySequence: 100,
  },
];

test("Kitchen Sanitation Audit certification math excludes N/A and unscored evidence", () => {
  const visible = certificationFields.filter((field) => field.fieldKey !== "photo").map((field) => field.fieldKey);
  const score = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    criticalFailureForcesFailure: true,
    sections,
    fields: certificationFields,
    visibleFieldKeys: visible,
    values: [
      { fieldKey: "labeled", valueText: "COMPLIANT" },
      { fieldKey: "off_floor", valueText: "NON_COMPLIANT" },
      { fieldKey: "dry_storage", valueText: "NOT_APPLICABLE" },
      { fieldKey: "surfaces", valueText: "COMPLIANT" },
      { fieldKey: "sanitizer", valueText: "NON_COMPLIANT" },
      { fieldKey: "handwash", valueText: "COMPLIANT" },
      { fieldKey: "walk_in", valueNumber: 38 },
      { fieldKey: "notes", valueText: "Mop sink was wet." },
    ],
  });
  assert.ok(score);
  // Prompt core: 5 + 0 + excluded 10 + 20 + 0 + 10 = 35 earned / 60 possible.
  // In-range walk-in adds 5 / 5. Hidden photo weight 10 is excluded. Notes and signature are unscored.
  // 40 / 65 = 61.5%. Critical sanitizer miss forces FAIL.
  assert.equal(score.earnedPoints, 40);
  assert.equal(score.possiblePoints, 65);
  assert.equal(score.percentage, 61.5);
  assert.equal(score.outcome, "FAIL");
  assert.equal(score.criticalFailures.length, 1);
  assert.equal(score.criticalFailures[0]?.fieldKey, "sanitizer");
  const food = score.sectionScores.find((section) => section.sectionKey === "food_storage");
  assert.equal(food?.earnedPoints, 10);
  assert.equal(food?.possiblePoints, 15);
  assert.equal(formatEvidenceFieldDisplay({ fieldType: "COMPLIANCE", valueText: "NOT_APPLICABLE" }), "N/A");
});

test("N/A is a valid response and is distinct from unanswered", () => {
  const fields = [
    {
      fieldKey: "q",
      label: "Labeled",
      fieldType: "COMPLIANCE" as const,
      isRequired: true,
      displaySequence: 1,
      helpText: null,
      unitLabel: null,
      minNumber: null,
      maxNumber: null,
      allowedSelections: [],
      correctiveActionTrigger: true,
      correctiveActionRequired: false,
    },
  ];
  const na = validateEvidenceSubmission({ fields, values: [{ fieldKey: "q", valueText: "NOT_APPLICABLE" }] });
  assert.equal(na.valid, true);
  const blank = validateEvidenceSubmission({ fields, values: [{ fieldKey: "q", valueText: "" }] });
  assert.equal(blank.valid, false);
  assert.equal(blank.errors.some((error) => error.code.endsWith(".required")), true);
  const junk = validateEvidenceSubmission({ fields, values: [{ fieldKey: "q", valueText: "n/a" }] });
  assert.equal(junk.valid, false);
});

test("numeric compliance is full credit inside the range and zero outside", () => {
  const field: InspectionScoreField = {
    fieldKey: "temp",
    label: "Walk-in",
    fieldType: "TEMPERATURE",
    scoreWeight: 5,
    minNumber: 33,
    maxNumber: 41,
  };
  const inside = evaluateInspectionScore({
    purposeType: "INSPECTION",
    fields: [field],
    values: [{ fieldKey: "temp", valueNumber: 38 }],
    visibleFieldKeys: ["temp"],
  });
  const outside = evaluateInspectionScore({
    purposeType: "INSPECTION",
    fields: [field],
    values: [{ fieldKey: "temp", valueNumber: 55 }],
    visibleFieldKeys: ["temp"],
  });
  assert.equal(inside?.earnedPoints, 5);
  assert.equal(outside?.earnedPoints, 0);
  assert.equal(outside?.possiblePoints, 5);
});

test("hidden conditional questions do not enter the denominator", () => {
  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "cat",
      stableKey: "kitchen_audit",
      version: 1,
      name: "Kitchen Sanitation Audit — Certification",
      description: null,
      instructions: null,
      purposeType: "INSPECTION",
      category: "SANITATION",
      recommendedCadence: null,
      passingScore: 85,
      criticalFailureForcesFailure: true,
      sections,
      fields: [
        {
          fieldKey: "q1",
          label: "Labeled",
          fieldType: "COMPLIANCE",
          isRequired: true,
          displaySequence: 1,
          helpText: null,
          unitLabel: null,
          minNumber: null,
          maxNumber: null,
          allowedSelections: [],
          correctiveActionTrigger: true,
          correctiveActionRequired: false,
          scoreWeight: 5,
          critical: false,
          creditValues: ["COMPLIANT"],
        },
        {
          fieldKey: "photo",
          label: "Photo",
          fieldType: "PHOTO",
          isRequired: false,
          displaySequence: 2,
          helpText: null,
          unitLabel: null,
          minNumber: null,
          maxNumber: null,
          allowedSelections: [],
          correctiveActionTrigger: false,
          correctiveActionRequired: false,
          scoreWeight: 10,
        },
      ],
      rules: [
        {
          ruleKey: "show_photo",
          sourceFieldKey: "q1",
          operator: "EQUALS",
          compareValue: "NON_COMPLIANT",
          actions: [{ kind: "SHOW_FIELD", targetFieldKey: "photo" }],
        },
      ],
    },
    attachment: {
      id: "att",
      stableKey: "att",
      departmentId: "dep",
      status: "ACTIVE",
      localDisplayLabel: null,
      localInstructions: null,
      timingMode: "AD_HOC",
      targetKind: "DEPARTMENT",
      target: { kind: "DEPARTMENT", departmentId: "dep" },
      cycleStableKeys: [],
      dailyWindows: [],
      calendar: { cadence: null, daysOfWeek: [], dayOfMonth: null, dueTimeLocal: null },
      allowAdHoc: true,
    },
    timingContext: {
      scheduleKind: "AD_HOC",
      cycleStableKey: null,
      cycleLabel: null,
      windowStartLocal: null,
      windowEndLocal: null,
      windowOrdinal: null,
    },
  });
  const hidden = scoreInspectionSnapshot({
    snapshot,
    values: [{ fieldKey: "q1", valueText: "COMPLIANT" }],
  });
  assert.equal(hidden?.possiblePoints, 5);
  assert.equal(hidden?.earnedPoints, 5);
  const shown = scoreInspectionSnapshot({
    snapshot,
    values: [{ fieldKey: "q1", valueText: "NON_COMPLIANT" }],
  });
  assert.equal(shown?.possiblePoints, 15);
});

test("critical policy and threshold produce pass, pass with exceptions, and fail", () => {
  const base = {
    purposeType: "INSPECTION" as const,
    passingScore: 85,
    criticalFailureForcesFailure: true,
    fields: [
      question("a", "A", "food_storage", 23),
      question("b", "B", "food_storage", 2),
    ],
    visibleFieldKeys: ["a", "b"],
  };
  const clean = evaluateInspectionScore({
    ...base,
    fields: [question("a", "A", "food_storage", 50), question("b", "B", "food_storage", 50)],
    values: [
      { fieldKey: "a", valueText: "COMPLIANT" },
      { fieldKey: "b", valueText: "COMPLIANT" },
    ],
  });
  assert.equal(clean?.percentage, 100);
  assert.equal(clean?.outcome, "PASS");

  const critical = evaluateInspectionScore({
    ...base,
    fields: [
      question("a", "A", "food_storage", 23),
      question("b", "B", "food_storage", 2, { critical: true }),
    ],
    values: [
      { fieldKey: "a", valueText: "COMPLIANT" },
      { fieldKey: "b", valueText: "NON_COMPLIANT" },
    ],
  });
  assert.equal(critical?.percentage, 92);
  assert.equal(critical?.outcome, "FAIL");

  const below = evaluateInspectionScore({
    ...base,
    fields: [question("a", "A", "food_storage", 41), question("b", "B", "food_storage", 9)],
    values: [
      { fieldKey: "a", valueText: "COMPLIANT" },
      { fieldKey: "b", valueText: "NON_COMPLIANT" },
    ],
  });
  assert.equal(below?.percentage, 82);
  assert.equal(below?.outcome, "FAIL");

  const exceptions = evaluateInspectionScore({
    ...base,
    criticalFailureForcesFailure: true,
    fields: [question("a", "A", "food_storage", 9), question("b", "B", "food_storage", 1)],
    values: [
      { fieldKey: "a", valueText: "COMPLIANT" },
      { fieldKey: "b", valueText: "NON_COMPLIANT" },
    ],
  });
  assert.equal(exceptions?.percentage, 90);
  assert.equal(exceptions?.outcome, "PASS_WITH_EXCEPTIONS");
});

test("historical V1 score stays on the V1 snapshot when V2 changes weights", () => {
  const answers = [{ fieldKey: "q", valueText: "COMPLIANT" }];
  const v1 = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    fields: [question("q", "Labeled", "food_storage", 5)],
    values: answers,
    visibleFieldKeys: ["q"],
  });
  const v2 = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 90,
    fields: [question("q", "Labeled", "food_storage", 10)],
    values: answers,
    visibleFieldKeys: ["q"],
  });
  assert.equal(v1?.possiblePoints, 5);
  assert.equal(v2?.possiblePoints, 10);
  assert.notEqual(v1?.possiblePoints, v2?.possiblePoints);
});

test("a recheck answer set does not change the original audit score", () => {
  const originalValues = [{ fieldKey: "q", valueText: "NON_COMPLIANT" as const }];
  const original = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    criticalFailureForcesFailure: true,
    fields: [question("q", "Labeled", "food_storage", 10, { critical: true })],
    values: originalValues,
    visibleFieldKeys: ["q"],
  });
  const recheck = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    criticalFailureForcesFailure: true,
    fields: [question("q", "Labeled", "food_storage", 10, { critical: true })],
    values: [{ fieldKey: "q", valueText: "COMPLIANT" }],
    visibleFieldKeys: ["q"],
  });
  assert.equal(original?.outcome, "FAIL");
  assert.equal(original?.percentage, 0);
  assert.equal(recheck?.outcome, "PASS");
  assert.equal(originalValues[0]?.valueText, "NON_COMPLIANT");
});

test("review average ignores missed inspections and keeps completion separate from score", () => {
  const pass = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    fields: [question("q", "Q", "food_storage", 10)],
    values: [{ fieldKey: "q", valueText: "COMPLIANT" }],
    visibleFieldKeys: ["q"],
  });
  const fail = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: 85,
    criticalFailureForcesFailure: true,
    fields: [question("q", "Q", "food_storage", 10, { critical: true })],
    values: [{ fieldKey: "q", valueText: "NON_COMPLIANT" }],
    visibleFieldKeys: ["q"],
  });
  const summary = summarizeInspectionReviews([
    { templateKey: "kitchen", label: "Kitchen Sanitation Audit", score: pass },
    { templateKey: "kitchen", label: "Kitchen Sanitation Audit", score: fail },
    { templateKey: "kitchen", label: "Kitchen Sanitation Audit", score: null },
  ]);
  assert.equal(summary.completed, 2);
  assert.equal(summary.averagePercentage, 50);
  assert.equal(summary.failed, 1);
  assert.equal(summary.criticalFailures, 1);
  assert.equal(summary.byTemplate[0]?.completed, 2);
});

test("audit export carries score, outcome, N/A, and the question response", () => {
  const csv = inspectionEvidenceToCsv([
    {
      template: "Kitchen Sanitation Audit",
      version: 1,
      operationalDate: "2026-10-01",
      location: "Kitchen",
      actor: "Supervisor",
      score: "61.5",
      outcome: "FAIL",
      criticalFailureCount: 1,
      field: "Dry storage organized?",
      response: "N/A",
      notApplicable: true,
      outOfStandard: false,
      correctiveAction: "Relabeled the open pan.",
    },
  ]);
  assert.match(csv, /auditScore,auditOutcome/);
  assert.match(csv, /N\/A/);
  assert.match(csv, /FAIL/);
  assert.match(csv, /61\.5/);

  const slot: AuditRecordSlot = {
    serviceDate: "2026-10-01",
    departmentId: "dep",
    catalogStableKey: "kitchen",
    catalogVersion: 1,
    definitionLabel: "Kitchen Sanitation Audit",
    recordForm: "INSPECTION",
    requirementSegmentId: "seg",
    attachmentStableKey: "att",
    locationFunctionKey: null,
    spaceId: null,
    assetId: null,
    unitId: null,
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    requirementKey: "req",
    slotState: "COMPLETED",
    placeLabel: "Kitchen",
    placeLabelCertainty: "CURRENT_LABEL",
    record: {
      id: "rec",
      occurredAt: null,
      recordedAt: "2026-10-01T12:00:00.000Z",
      recordedByLabel: "Supervisor",
      valueNumber: null,
      valueText: null,
      outOfStandard: true,
      correctiveActionText: "Relabeled",
      templateVersion: 1,
      status: "COMPLETED_WITH_CORRECTIVE_ACTION",
    },
    followUps: [],
    corrections: [],
    waiver: null,
    waiverAllowed: false,
    source: "CANONICAL_RECORD",
    inspection: {
      percentage: 61.5,
      outcome: "FAIL",
      criticalFailureCount: 1,
      questions: [
        { field: "Dry storage", response: "N/A", notApplicable: true, outOfStandard: false },
      ],
    },
  };
  const auditCsv = auditRecordsToCsv([slot]);
  assert.match(auditCsv, /N\/A/);
  assert.match(auditCsv, /FAIL/);
});

test("canonical logs stay off by default and inspections are not a second evidence model", () => {
  const flags = readFileSync(join(root, "src/lib/feature-flags.ts"), "utf8");
  assert.match(flags, /CANONICAL_LOGS_ENABLED[\s\S]*parseEnvFlag\([^)]*false\)/);
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  assert.doesNotMatch(schema, /model AuditSubmission/);
  assert.doesNotMatch(schema, /model Finding /);
  assert.match(schema, /COMPLIANCE/);
  assert.match(readFileSync(join(root, "src/lib/canonical-logs/submit-canonical-log.ts"), "utf8"), /passingScore/);
});
