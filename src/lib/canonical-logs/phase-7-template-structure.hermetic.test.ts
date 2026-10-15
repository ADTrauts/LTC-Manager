import assert from "node:assert/strict";
import test from "node:test";

import {
  calculationCycleErrors,
  evaluateCalculations,
  formatRepeatDetail,
  materializeReusableStructure,
  parseCalculations,
  repeatLogBookSummary,
  validateRepeatSubmission,
  validateRepeatingGroupsForPublish,
  type CalculationDefinition,
  type RepeatingGroupDefinition,
} from "./template-structure";
import { buildCanonicalLogSubmissionSnapshot, parseLogSubmissionSnapshot } from "./snapshot";

const sanitizer: RepeatingGroupDefinition = {
  groupKey: "sanitizer_readings",
  label: "Sanitizer Readings",
  sectionKey: "dishwasher",
  minRows: 1,
  maxRows: 40,
  displaySequence: 1,
  columns: [
    { columnKey: "reading_time", label: "Time", fieldType: "TIME", isRequired: true, displaySequence: 1 },
    {
      columnKey: "sanitizer_ppm",
      label: "PPM",
      fieldType: "NUMBER",
      isRequired: true,
      displaySequence: 2,
      unitLabel: "ppm",
      minNumber: 150,
      maxNumber: 400,
      correctiveActionTrigger: true,
      correctiveActionRequired: true,
    },
    { columnKey: "notes", label: "Notes", fieldType: "SHORT_TEXT", isRequired: false, displaySequence: 3 },
  ],
};

const calculations: CalculationDefinition[] = [
  {
    calculationKey: "average_ppm",
    label: "Average PPM",
    unitLabel: "ppm",
    decimalPrecision: 1,
    expression: { op: "AVERAGE", groupKey: "sanitizer_readings", columnKey: "sanitizer_ppm" },
  },
  {
    calculationKey: "minimum_ppm",
    label: "Minimum PPM",
    unitLabel: "ppm",
    decimalPrecision: 1,
    expression: { op: "MIN", groupKey: "sanitizer_readings", columnKey: "sanitizer_ppm" },
  },
  {
    calculationKey: "reading_count",
    label: "Reading Count",
    decimalPrecision: 0,
    expression: { op: "COUNT", groupKey: "sanitizer_readings", columnKey: "sanitizer_ppm" },
  },
];

const rows = [
  { groupKey: "sanitizer_readings", rowKey: "row_ab12", rowSequence: 1, cells: [{ columnKey: "reading_time", valueText: "08:00" }, { columnKey: "sanitizer_ppm", valueNumber: 200 }] },
  { groupKey: "sanitizer_readings", rowKey: "row_cd34", rowSequence: 2, cells: [{ columnKey: "reading_time", valueText: "11:30" }, { columnKey: "sanitizer_ppm", valueNumber: 100 }] },
  { groupKey: "sanitizer_readings", rowKey: "row_ef56", rowSequence: 3, cells: [{ columnKey: "reading_time", valueText: "14:45" }, { columnKey: "sanitizer_ppm", valueNumber: 200 }] },
];

test("sanitizer readings keep stable rows and roll the middle reading out of standard", () => {
  const result = validateRepeatSubmission({ groups: [sanitizer], rows });
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map((row) => row.rowKey), ["row_ab12", "row_cd34", "row_ef56"]);
  assert.equal(result.outOfStandard, true);
  assert.equal(result.correctiveActionRequired, true);
  assert.match(result.reasons[0] ?? "", /row 2/);
  assert.match(result.reasons[0] ?? "", /100/);
  assert.match(formatRepeatDetail(result)[1] ?? "", /Out of standard/);
  assert.equal(repeatLogBookSummary({ rowCount: 3, exceptionCount: 1 }), "3 readings · 1 exception");
});

test("repeat validation rejects missing required columns, unknown structure, and too many rows", () => {
  const missing = validateRepeatSubmission({
    groups: [sanitizer],
    rows: [{ groupKey: "sanitizer_readings", rowKey: "row_aa", rowSequence: 1, cells: [{ columnKey: "notes", valueText: "only notes" }] }],
  });
  assert.ok(missing.errors.some((error) => error.includes("Time")));
  const unknown = validateRepeatSubmission({
    groups: [sanitizer],
    rows: [{ groupKey: "other", rowKey: "row_aa", rowSequence: 1, cells: [{ columnKey: "nope", valueNumber: 1 }] }],
  });
  assert.ok(unknown.errors.some((error) => error.includes("Unknown")));
  const limited = validateRepeatSubmission({
    groups: [{ ...sanitizer, maxRows: 1 }],
    rows,
  });
  assert.ok(limited.errors.some((error) => error.includes("at most")));
  assert.ok(validateRepeatingGroupsForPublish([{ ...sanitizer, maxRows: 80 }]).length > 0);
});

test("calculations round 200, 100, and 200 to 166.7, 100, and 3", () => {
  const results = evaluateCalculations({ calculations, rows });
  assert.equal(results.find((row) => row.calculationKey === "average_ppm")?.value, 166.7);
  assert.equal(results.find((row) => row.calculationKey === "minimum_ppm")?.value, 100);
  assert.equal(results.find((row) => row.calculationKey === "reading_count")?.value, 3);
  assert.equal(results[0]?.display, "166.7 ppm");
});

test("scalar arithmetic, aggregates, and divide by zero stay deterministic", () => {
  const scalar = evaluateCalculations({
    calculations: [
      {
        calculationKey: "total",
        label: "Total",
        decimalPrecision: 2,
        expression: { op: "MULTIPLY", left: { op: "FIELD", fieldKey: "quantity" }, right: { op: "LITERAL", value: 2.5 } },
      },
      {
        calculationKey: "ratio",
        label: "Ratio",
        decimalPrecision: 1,
        expression: { op: "DIVIDE", left: { op: "LITERAL", value: 10 }, right: { op: "LITERAL", value: 0 } },
      },
    ],
    scalars: new Map([["quantity", 4]]),
    rows: [],
  });
  assert.equal(scalar[0]?.value, 10);
  assert.equal(scalar[1]?.value, null);
  assert.equal(scalar[1]?.display, "—");
  const aggregates = evaluateCalculations({
    calculations: (["SUM", "MAX"] as const).map((op) => ({
      calculationKey: op.toLowerCase(),
      label: op,
      decimalPrecision: 0,
      expression: { op, groupKey: "sanitizer_readings", columnKey: "sanitizer_ppm" },
    })),
    rows,
  });
  assert.equal(aggregates[0]?.value, 500);
  assert.equal(aggregates[1]?.value, 200);
});

test("publication rejects circular calculations and a renamed label does not change the key", () => {
  const cycle = calculationCycleErrors([
    {
      calculationKey: "a",
      label: "A",
      expression: { op: "ADD", left: { op: "FIELD", fieldKey: "calc:b" }, right: { op: "LITERAL", value: 1 } },
    },
    {
      calculationKey: "b",
      label: "B",
      expression: { op: "ADD", left: { op: "FIELD", fieldKey: "calc:a" }, right: { op: "LITERAL", value: 1 } },
    },
  ]);
  assert.ok(cycle.length > 0);
  const renamed = { ...calculations[0]!, label: "Mean concentration" };
  const value = evaluateCalculations({ calculations: [renamed], rows })[0];
  assert.equal(value?.calculationKey, "average_ppm");
  assert.equal(value?.value, 166.7);
});

test("a published snapshot keeps V1 structure after the live definition changes", () => {
  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "cat",
      stableKey: "sanitizer_reading_log",
      version: 1,
      name: "Sanitizer Reading Log — Certification",
      description: null,
      instructions: null,
      purposeType: "LOG",
      category: "SANITATION",
      recommendedCadence: null,
      sections: [{ sectionKey: "dishwasher", label: "Dishwasher", displaySequence: 1 }],
      fields: [],
      rules: [],
      repeatingGroups: [sanitizer],
      calculations,
    },
    attachment: {
      id: "att",
      stableKey: "att",
      departmentId: "dept",
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
  const pinned = parseLogSubmissionSnapshot(snapshot);
  assert.equal(pinned?.catalog.repeatingGroups?.[0]?.columns[1]?.maxNumber, 400);
  const v2 = { ...sanitizer, columns: sanitizer.columns.map((column) => column.columnKey === "sanitizer_ppm" ? { ...column, minNumber: 200 } : column) };
  assert.equal(pinned?.catalog.repeatingGroups?.[0]?.columns[1]?.minNumber, 150);
  assert.equal(v2.columns[1]?.minNumber, 200);
  const historical = evaluateCalculations({ calculations: parseCalculations(pinned?.catalog.calculations ?? []), rows });
  assert.equal(historical[0]?.value, 166.7);
});

test("inserting a reusable section copies structure and later component edits do not change the copy", () => {
  const component = {
    sections: [{ sectionKey: "supervisor_verification", label: "Supervisor Verification", displaySequence: 1 }],
    fields: [
      { fieldKey: "supervisor_notes", label: "Supervisor Notes", fieldType: "LONG_TEXT" },
      { fieldKey: "supervisor_attestation", label: "Attestation", fieldType: "ATTESTATION" },
      { fieldKey: "supervisor_signature", label: "Signature", fieldType: "SIGNATURE" },
    ],
    rules: [{ sourceFieldKey: "supervisor_attestation", actions: [{ targetFieldKey: "supervisor_notes" }] }],
  };
  const first = materializeReusableStructure({
    componentStableKey: "supervisor_verification",
    componentVersion: 1,
    structure: component,
    existingFieldKeys: ["supervisor_notes"],
    existingSectionKeys: [],
  });
  assert.equal(first.fields?.[0]?.fieldKey, "supervisor_notes_2");
  assert.equal(first.rules?.[0]?.sourceFieldKey, "supervisor_attestation");
  assert.equal(first.sections?.[0]?.sourceComponentVersion, 1);
  const second = materializeReusableStructure({
    componentStableKey: "supervisor_verification",
    componentVersion: 1,
    structure: component,
    existingFieldKeys: first.fields?.map((field) => field.fieldKey) ?? [],
    existingSectionKeys: ["supervisor_verification"],
  });
  assert.notEqual(second.sections?.[0]?.sectionKey, first.sections?.[0]?.sectionKey);
  component.fields.push({ fieldKey: "supervisor_title", label: "Title", fieldType: "SHORT_TEXT" });
  assert.equal(first.fields?.length, 3);
  assert.equal(first.sections?.[0]?.sourceComponentStableKey, "supervisor_verification");
});
