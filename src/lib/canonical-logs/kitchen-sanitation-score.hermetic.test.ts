import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_DEPARTMENT_FORMS } from "../../../prisma/standard-department-forms.mjs";
import { evaluateInspectionScore, inspectionFailureMarksOutOfStandard } from "./inspection-score";

const form = STANDARD_DEPARTMENT_FORMS.find((row) => row.stableKey === "kitchen_sanitation_audit");

test("kitchen sanitation audit scores a pass and a critical miss", () => {
  assert.ok(form);
  const fields = form.fields.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    fieldType: field.fieldType,
    scoreWeight: field.scoreWeight,
    critical: field.critical,
    creditValues: field.creditValues,
    sectionKey: field.sectionKey,
  }));
  const visible = fields.map((field) => field.fieldKey);
  const passed = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: form.passingScore,
    criticalFailureForcesFailure: form.criticalFailureForcesFailure,
    sections: form.sections,
    fields,
    values: [
      { fieldKey: "hand_sinks", valueText: "COMPLIANT" },
      { fieldKey: "food_contact", valueText: "COMPLIANT" },
    ],
    visibleFieldKeys: visible,
  });
  assert.equal(passed?.outcome, "PASS");
  assert.equal(inspectionFailureMarksOutOfStandard(passed?.outcome), false);

  const failed = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: form.passingScore,
    criticalFailureForcesFailure: form.criticalFailureForcesFailure,
    sections: form.sections,
    fields,
    values: [
      { fieldKey: "hand_sinks", valueText: "COMPLIANT" },
      { fieldKey: "food_contact", valueText: "NON_COMPLIANT" },
    ],
    visibleFieldKeys: visible,
  });
  assert.equal(failed?.outcome, "FAIL");
  assert.equal(failed?.criticalFailures.length, 1);
  assert.equal(inspectionFailureMarksOutOfStandard(failed?.outcome), true);
});
