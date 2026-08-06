import assert from "node:assert/strict";
import test from "node:test";

import { validateEvidenceSubmission } from "./validate-evidence-submission";
import type { TemplateFieldSnapshot } from "./types";

const tempField: TemplateFieldSnapshot = {
  fieldKey: "cooler_temperature",
  label: "Cooler temperature",
  fieldType: "TEMPERATURE",
  isRequired: true,
  displaySequence: 10,
  helpText: null,
  unitLabel: "°F",
  minNumber: 33,
  maxNumber: 41,
  allowedSelections: [],
  correctiveActionTrigger: true,
  correctiveActionRequired: true,
};

const resultField: TemplateFieldSnapshot = {
  fieldKey: "result",
  label: "Result",
  fieldType: "PASS_NEEDS_ATTENTION",
  isRequired: true,
  displaySequence: 20,
  helpText: null,
  unitLabel: null,
  minNumber: null,
  maxNumber: null,
  allowedSelections: ["PASS", "NEEDS_ATTENTION"],
  correctiveActionTrigger: true,
  correctiveActionRequired: true,
};

test("required field missing is invalid", () => {
  const result = validateEvidenceSubmission({
    fields: [tempField],
    values: [],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code.includes("required")));
});

test("in-range temperature is completed-ready", () => {
  const result = validateEvidenceSubmission({
    fields: [tempField],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.outOfStandard, false);
  assert.equal(result.correctiveActionRequired, false);
});

test("out-of-range temperature requires corrective action", () => {
  const missing = validateEvidenceSubmission({
    fields: [tempField],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 50 }],
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.outOfStandard, true);
  assert.equal(missing.correctiveActionRequired, true);
  assert.ok(missing.errors.some((e) => e.code === "corrective_action_required"));

  const withAction = validateEvidenceSubmission({
    fields: [tempField],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 50 }],
    correctiveActionText: "Moved product; called maintenance.",
  });
  assert.equal(withAction.valid, true);
  assert.equal(withAction.outOfStandard, true);
});

test("PASS_NEEDS_ATTENTION out-of-standard detection", () => {
  const needs = validateEvidenceSubmission({
    fields: [resultField],
    values: [{ fieldKey: "result", valueText: "NEEDS_ATTENTION" }],
    correctiveActionText: "Re-ran cycle.",
  });
  assert.equal(needs.valid, true);
  assert.equal(needs.outOfStandard, true);
  assert.equal(needs.fieldOutOfStandard.result, true);

  const pass = validateEvidenceSubmission({
    fields: [resultField],
    values: [{ fieldKey: "result", valueText: "PASS" }],
  });
  assert.equal(pass.valid, true);
  assert.equal(pass.outOfStandard, false);
});

test("selection must be allowed", () => {
  const result = validateEvidenceSubmission({
    fields: [
      {
        ...resultField,
        fieldType: "SINGLE_SELECT",
        correctiveActionTrigger: false,
        correctiveActionRequired: false,
      },
    ],
    values: [{ fieldKey: "result", valueText: "MAYBE" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code.includes("selection_invalid")));
});

test("unknown field key is rejected", () => {
  const result = validateEvidenceSubmission({
    fields: [tempField],
    values: [
      { fieldKey: "cooler_temperature", valueNumber: 38 },
      { fieldKey: "extra", valueText: "nope" },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code.includes("unknown_field")));
});

test("trigger without required still flags outOfStandard but allows submit", () => {
  const field: TemplateFieldSnapshot = {
    ...tempField,
    correctiveActionRequired: false,
  };
  const result = validateEvidenceSubmission({
    fields: [field],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 10 }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.outOfStandard, true);
  assert.equal(result.correctiveActionRequired, false);
});
