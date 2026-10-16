import assert from "node:assert/strict";
import test from "node:test";

import { presentRecordValues, projectScalarRecordResponses } from "./record-values";
import type { LogSubmissionSnapshotV2 } from "./snapshot";

const catalog: Pick<LogSubmissionSnapshotV2["catalog"], "fields" | "repeatingGroups" | "calculations"> = {
  fields: [],
  repeatingGroups: [{
    groupKey: "readings", label: "Readings", displaySequence: 1,
    columns: [
      { columnKey: "time", label: "Time", fieldType: "TIME", displaySequence: 1 },
      { columnKey: "ppm", label: "PPM", fieldType: "NUMBER", displaySequence: 2, unitLabel: "ppm", minNumber: 150, maxNumber: 400 },
    ],
  }],
  calculations: [
    { calculationKey: "average", label: "Average PPM", unitLabel: "ppm", decimalPrecision: 1, expression: { op: "AVERAGE", groupKey: "readings", columnKey: "ppm" } },
    { calculationKey: "min", label: "Minimum PPM", unitLabel: "ppm", expression: { op: "MIN", groupKey: "readings", columnKey: "ppm" } },
    { calculationKey: "count", label: "Reading Count", expression: { op: "COUNT", groupKey: "readings", columnKey: "ppm" } },
  ],
};

function cells(rowSequence: number, time: string, ppm: number) {
  const common = { groupKey: "readings", rowKey: `row-${rowSequence}`, rowSequence, valueSelections: [], valueBoolean: null };
  return [
    { ...common, fieldKey: "time", label: "Time", fieldType: "TIME", valueText: time, valueNumber: null, outOfStandard: false },
    { ...common, fieldKey: "ppm", label: "PPM", fieldType: "NUMBER", valueText: null, valueNumber: ppm, outOfStandard: ppm < 150 },
  ];
}

test("completed sanitizer records show pinned calculated totals and retain chronological rows", () => {
  const saved = [...cells(3, "14:45", 200), ...cells(1, "08:00", 200), ...cells(2, "11:30", 100)].reverse();
  const priorOrder = saved.map((value) => `${value.rowKey}:${value.fieldKey}`);
  const view = presentRecordValues(catalog, saved);
  assert.deepEqual(view.calculations.map((result) => result.display), ["166.7 ppm", "100 ppm", "3"]);
  assert.deepEqual(view.fields.map((field) => field.displayValue), ["8:00 AM", "200 ppm", "11:30 AM", "100 ppm", "2:45 PM", "200 ppm"]);
  assert.deepEqual(view.fields.map((field) => field.label), ["Readings · Row 1 · Time", "Readings · Row 1 · PPM", "Readings · Row 2 · Time", "Readings · Row 2 · PPM", "Readings · Row 3 · Time", "Readings · Row 3 · PPM"]);
  assert.equal(view.fields[3].rangeLabel, "150ppm–400ppm");
  assert.equal(view.rowCount, 3);
  assert.equal(view.exceptionRowCount, 1);
  assert.deepEqual(saved.map((value) => `${value.rowKey}:${value.fieldKey}`), priorOrder);
});

test("reused row identities in different groups stay separate and scalar calculations use scalar answers", () => {
  const view = presentRecordValues({
    ...catalog,
    calculations: [...catalog.calculations!, { calculationKey: "scalar", label: "Scalar", expression: { op: "FIELD", fieldKey: "ppm" } }],
  }, [
    ...cells(1, "08:00", 200),
    ...cells(1, "09:00", 100).map((value) => ({ ...value, groupKey: "other" })),
    { fieldKey: "ppm", label: "Scalar PPM", fieldType: "NUMBER", valueNumber: 42, outOfStandard: false },
  ]);
  assert.equal(view.rowCount, 2);
  assert.deepEqual(view.calculations.map((result) => result.value), [200, 200, 1, 42]);
  assert.equal(view.fields[0].displayValue, "42");
  assert.equal(new Set(view.fields.map((field) => field.valueKey)).size, 5);
});

test("older records without repeating metadata remain readable", () => {
  const view = presentRecordValues(undefined, [{ fieldKey: "temperature", label: "Temperature", fieldType: "TEMPERATURE", valueNumber: 38, outOfStandard: false }]);
  assert.equal(view.fields[0].displayValue, "38");
  assert.deepEqual(view.calculations, []);
  assert.equal(view.rowCount, 0);
});

test("checklist export retains every scalar answer including failed boolean and notes", () => {
  const fields = ["equipment", "notes", "attestation"].map((fieldKey, displaySequence) => ({
    fieldKey, displaySequence,
  })) as LogSubmissionSnapshotV2["catalog"]["fields"];
  const responses = projectScalarRecordResponses({ fields }, [
    { fieldKey: "notes", label: "Notes", fieldType: "LONG_TEXT", valueText: "Retested equipment", outOfStandard: false },
    { fieldKey: "attestation", label: "Attestation", fieldType: "ATTESTATION", valueBoolean: true, outOfStandard: false },
    { fieldKey: "equipment", label: "Equipment ready", fieldType: "YES_NO", valueBoolean: false, outOfStandard: true },
    ...cells(1, "08:00", 200),
  ]);
  assert.deepEqual(responses.map((row) => [row.column, row.value, row.outOfStandard]), [
    ["Equipment ready", "No", true], ["Notes", "Retested equipment", false], ["Attestation", "Confirmed", false],
  ]);
});
