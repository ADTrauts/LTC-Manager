/**
 * Phase 3 — declarative exceptions, conditional fields, and corrective-action rollup.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import { validateCatalogForPublish } from "./catalog-authoring";
import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import {
  dropHiddenFieldValues,
  evaluateEvidenceRules,
  evidenceCanCreateIssue,
  recordStatusFromException,
  type CatalogEvidenceRule,
} from "./evidence-rules";
import { buildCanonicalLogSubmissionSnapshot } from "./snapshot";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function field(
  partial: Partial<TemplateFieldSnapshot> & Pick<TemplateFieldSnapshot, "fieldKey" | "fieldType" | "label">,
): TemplateFieldSnapshot {
  return {
    isRequired: true,
    displaySequence: 10,
    helpText: null,
    unitLabel: null,
    minNumber: null,
    maxNumber: null,
    allowedSelections: [],
    correctiveActionTrigger: false,
    correctiveActionRequired: false,
    ...partial,
  };
}

const equipmentFields = [
  field({
    fieldKey: "equipment_operational",
    label: "Equipment operational?",
    fieldType: "YES_NO",
    displaySequence: 10,
  }),
  field({
    fieldKey: "problem_description",
    label: "Describe the issue",
    fieldType: "LONG_TEXT",
    isRequired: false,
    displaySequence: 20,
  }),
  field({
    fieldKey: "supervisor_comment",
    label: "Supervisor comment",
    fieldType: "OPTIONAL_COMMENT",
    isRequired: false,
    displaySequence: 30,
  }),
];

const equipmentRules: CatalogEvidenceRule[] = [
  {
    ruleKey: "equipment_down",
    sourceFieldKey: "equipment_operational",
    operator: "EQUALS",
    compareValue: "NO",
    actions: [
      { kind: "MARK_OUT_OF_STANDARD" },
      { kind: "SHOW_FIELD", targetFieldKey: "problem_description" },
      { kind: "REQUIRE_FIELD", targetFieldKey: "problem_description" },
      { kind: "REQUIRE_CORRECTIVE_ACTION" },
    ],
  },
];

test("Phase 3 — Equipment Condition Check yes path is complete without exception", () => {
  const yes = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [{ fieldKey: "equipment_operational", valueBoolean: true }],
  });
  assert.equal(yes.valid, true);
  assert.equal(yes.outOfStandard, false);
  assert.equal(yes.correctiveActionRequired, false);
  assert.equal(yes.visibleFieldKeys.includes("problem_description"), false);
  assert.equal(
    recordStatusFromException({ outOfStandard: false, correctiveActionText: null }),
    "COMPLETED",
  );
});

test("Phase 3 — No without description or corrective action is rejected by the server", () => {
  const missingDescription = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [{ fieldKey: "equipment_operational", valueBoolean: false }],
  });
  assert.equal(missingDescription.valid, false);
  assert.ok(missingDescription.errors.some((error) => error.code.includes("problem_description")));
  assert.ok(missingDescription.errors.some((error) => error.code === "corrective_action_required"));

  const missingAction = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [
      { fieldKey: "equipment_operational", valueBoolean: false },
      { fieldKey: "problem_description", valueText: "Belt slipping." },
    ],
  });
  assert.equal(missingAction.valid, false);
  assert.equal(missingAction.outOfStandard, true);
  assert.equal(missingAction.correctiveActionRequired, true);
});

test("Phase 3 — complete No path stores exception and corrective action", () => {
  const complete = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [
      { fieldKey: "equipment_operational", valueBoolean: false },
      { fieldKey: "problem_description", valueText: "Belt slipping." },
    ],
    correctiveActionText: "Stopped the line and called maintenance.",
  });
  assert.equal(complete.valid, true);
  assert.equal(complete.outOfStandard, true);
  assert.equal(
    recordStatusFromException({
      outOfStandard: true,
      correctiveActionText: "Stopped the line and called maintenance.",
    }),
    "COMPLETED_WITH_CORRECTIVE_ACTION",
  );
});

test("Phase 3 — hidden values are dropped and inactive required fields do not block", () => {
  const evaluation = evaluateEvidenceRules({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [
      { fieldKey: "equipment_operational", valueBoolean: true },
      { fieldKey: "problem_description", valueText: "stale" },
    ],
  });
  const kept = dropHiddenFieldValues(
    [
      { fieldKey: "equipment_operational", valueBoolean: true },
      { fieldKey: "problem_description", valueText: "stale" },
    ],
    evaluation.visibleFieldKeys,
  );
  assert.deepEqual(
    kept.map((row) => row.fieldKey),
    ["equipment_operational"],
  );
});

test("Phase 3 — Cooler 38 stays complete and 55 still requires corrective action", () => {
  const cooler = CATALOG_SEED_DEFINITIONS.find((row) => row.stableKey === "cooler_temperature_log")!;
  const seed = cooler.fields[0]!;
  const temp = field({
    fieldKey: seed.fieldKey,
    label: seed.label,
    fieldType: seed.fieldType,
    unitLabel: seed.unitLabel,
    minNumber: seed.minNumber,
    maxNumber: seed.maxNumber,
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
  });
  const inRange = validateEvidenceSubmission({
    fields: [temp],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
  });
  assert.equal(inRange.valid, true);
  assert.equal(inRange.outOfStandard, false);
  const oos = validateEvidenceSubmission({
    fields: [temp],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
  });
  assert.equal(oos.valid, false);
  assert.equal(oos.outOfStandard, true);
  const resolved = validateEvidenceSubmission({
    fields: [temp],
    values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
    correctiveActionText: "Moved food to backup cooler.",
  });
  assert.equal(resolved.valid, true);
  assert.match(oos.errors[0]?.message ?? "", /Cooler temperature/);
});

test("Phase 3 — select and pass answers become exceptions only through configured rules", () => {
  const select = field({
    fieldKey: "condition",
    label: "Condition",
    fieldType: "SINGLE_SELECT",
    allowedSelections: ["Good", "Damaged"],
  });
  const rule: CatalogEvidenceRule = {
    ruleKey: "damaged",
    sourceFieldKey: "condition",
    operator: "EQUALS",
    compareValue: "Damaged",
    actions: [{ kind: "MARK_OUT_OF_STANDARD" }, { kind: "SET_NEEDS_REVIEW" }],
  };
  const damaged = validateEvidenceSubmission({
    fields: [select],
    rules: [rule],
    values: [{ fieldKey: "condition", valueText: "Damaged" }],
  });
  assert.equal(damaged.outOfStandard, true);
  assert.equal(damaged.needsReview, true);
  assert.equal(
    recordStatusFromException({ outOfStandard: true, correctiveActionText: null }),
    "NEEDS_REVIEW",
  );
  const good = validateEvidenceSubmission({
    fields: [select],
    rules: [rule],
    values: [{ fieldKey: "condition", valueText: "Good" }],
  });
  assert.equal(good.outOfStandard, false);

  const needs = field({
    fieldKey: "result",
    label: "Result",
    fieldType: "PASS_NEEDS_ATTENTION",
    correctiveActionTrigger: true,
  });
  assert.equal(
    validateEvidenceSubmission({
      fields: [needs],
      values: [{ fieldKey: "result", valueText: "NEEDS_ATTENTION" }],
    }).outOfStandard,
    true,
  );
});

test("Phase 3 — label rename keeps the rule; a deleted field blocks publish", () => {
  const renamed = validateCatalogForPublish({
    name: "Equipment Condition Check",
    purposeType: "CHECKLIST",
    fields: [
      { fieldKey: "equipment_operational", label: "Is the unit running?", fieldType: "YES_NO" },
      { fieldKey: "problem_description", label: "Describe problem", fieldType: "LONG_TEXT", isRequired: false },
    ],
    rules: equipmentRules,
  });
  assert.equal(renamed.valid, true);

  const broken = validateCatalogForPublish({
    name: "Equipment Condition Check",
    purposeType: "CHECKLIST",
    fields: [{ fieldKey: "equipment_operational", label: "Equipment operational?", fieldType: "YES_NO" }],
    rules: equipmentRules,
  });
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.some((error) => error.code.includes("target_missing")));
});

test("Phase 3 — V1 snapshot rules stay pinned when V2 changes the threshold", () => {
  const v1 = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "cat-v1",
      stableKey: "test_refrigeration_temperature",
      version: 1,
      name: "Test Refrigeration Temperature",
      description: null,
      instructions: null,
      purposeType: "LOG",
      category: "TEMPERATURE",
      recommendedCadence: "TWICE_DAILY",
      fields: [
        {
          fieldKey: "refrigerator_temperature",
          label: "Refrigerator Temperature",
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
        },
      ],
      rules: [],
    },
    attachment: {
      id: "att",
      stableKey: "att",
      departmentId: "dept",
      status: "ACTIVE",
      localDisplayLabel: null,
      localInstructions: null,
      timingMode: "DAILY_WINDOWS",
      targetKind: "ASSET",
      target: { kind: "ASSET", assetId: "asset-1" },
      cycleStableKeys: [],
      dailyWindows: [],
      calendar: null,
      allowAdHoc: false,
    },
    timingContext: {
      scheduleKind: "FIXED_DAILY_WINDOW",
      cycleStableKey: null,
      cycleLabel: "Morning",
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
      windowOrdinal: 1,
    },
  });
  const historical = validateEvidenceSubmission({
    fields: v1.catalog.fields,
    rules: v1.catalog.rules,
    values: [{ fieldKey: "refrigerator_temperature", valueNumber: 41 }],
  });
  assert.equal(historical.outOfStandard, false);
  const v2Rule: CatalogEvidenceRule = {
    ruleKey: "above_40",
    sourceFieldKey: "refrigerator_temperature",
    operator: "GREATER_THAN",
    compareValue: 40,
    actions: [{ kind: "MARK_OUT_OF_STANDARD" }],
  };
  const reinterpreted = validateEvidenceSubmission({
    fields: [{ ...v1.catalog.fields[0]!, maxNumber: 40 }],
    rules: [v2Rule],
    values: [{ fieldKey: "refrigerator_temperature", valueNumber: 41 }],
  });
  assert.equal(reinterpreted.outOfStandard, true);
  assert.equal(historical.outOfStandard, false);
});

test("Phase 3 — Issue eligibility and follow-up lineage stay on existing models", () => {
  assert.equal(evidenceCanCreateIssue({ assetId: "asset", unitId: "unit", outOfStandard: true }), true);
  assert.equal(evidenceCanCreateIssue({ assetId: null, unitId: "unit", outOfStandard: true }), false);
  assert.match(source("src/lib/asset-operations/corrective-maintenance.ts"), /originEvidenceRecordId: record.id/);
  assert.match(source("src/lib/canonical-logs/submit-canonical-log.ts"), /followsRecordId/);
  assert.doesNotMatch(source("src/lib/canonical-logs/evidence-rules.ts"), /eval\(/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model Finding\b/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model CorrectiveActionCase/);
});
