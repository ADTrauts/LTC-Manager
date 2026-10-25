/**
 * Phase 2 — Template Studio field system and generalized measurements.
 * Certifies authoring, stable keys, runtime shapes, and successor identity
 * without seed-file engineering.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { auditRecordsToCsv, type AuditRecordSlot } from "@/lib/audit/audit-records";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import {
  CANONICAL_EVIDENCE_FIELD_TYPES,
  resolveCatalogFieldKeys,
  validateCatalogForPublish,
} from "./catalog-authoring";
import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import {
  formatEvidenceFieldDisplay,
  serializeEvidenceFieldForCsv,
} from "./evidence-field-display";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function field(partial: Partial<TemplateFieldSnapshot> & Pick<TemplateFieldSnapshot, "fieldKey" | "fieldType" | "label">): TemplateFieldSnapshot {
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

const CERTIFICATION_TEMPLATE = {
  name: "Test Refrigeration Temperature",
  purposeType: "LOG" as const,
  category: "TEMPERATURE",
  recommendedCadence: "TWICE_DAILY" as const,
  recommendedScheduleKind: "FIXED_DAILY_WINDOW" as const,
  recommendedDaypartLabels: ["Morning", "Afternoon"],
  recommendedFixedWindows: [
    { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
    { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
  ],
  suggestions: {
    assetTypes: ["COOLER"],
    spaceTypes: [],
    departmentKeys: ["DIETARY"],
    keywords: ["refrigeration"],
  },
  fields: [
    {
      fieldKey: "refrigerator_temperature",
      label: "Refrigerator Temperature",
      fieldType: "TEMPERATURE" as const,
      isRequired: true,
      unitLabel: "°F",
      minNumber: 33,
      maxNumber: 41,
      correctiveActionTrigger: true,
      correctiveActionRequired: true,
    },
  ],
};

test("Phase 2 — Template Studio exposes every canonical field type", () => {
  const editor = source("src/components/harbor-console/harbor-catalog-editor.tsx");
  const actions = source("src/app/console/(staff)/catalog/actions.ts");
  const control = source("src/components/canonical-logs/canonical-evidence-field-control.tsx");
  for (const fieldType of CANONICAL_EVIDENCE_FIELD_TYPES) {
    assert.match(editor, new RegExp(`value: "${fieldType}"`));
    assert.match(actions, /CANONICAL_EVIDENCE_FIELD_TYPES/);
    assert.match(control, new RegExp(fieldType === "LONG_TEXT" ? "LONG_TEXT|textarea" : fieldType));
  }
  assert.match(editor, /fieldKey: field\.fieldKey/);
  assert.match(editor, /Changing the label does not change this key/);
  assert.match(editor, /Move up/);
  assert.match(editor, /recommendedScheduleKind/);
  assert.match(editor, /recommendedFixedWindowsJson/);
  assert.match(editor, /suggestedAssetTypes/);
  assert.match(editor, /Marketplace defaults only/);
  assert.match(editor, /Discovery hints only/);
  assert.match(control, /type="date"/);
  assert.match(control, /type="time"/);
  assert.match(control, /I confirm the above check was completed/);
  assert.match(control, /type="checkbox"/);
  assert.match(source("src/lib/canonical-logs/evidence-rules.ts"), /valueBoolean/);
  assert.match(source("src/lib/canonical-logs/evidence-rules.ts"), /valueSelections/);
  assert.match(source("src/components/canonical-logs/canonical-log-entry-form.tsx"), /formAnswersToValues/);
  assert.match(source("src/components/harbor-console/harbor-catalog-log-preview.tsx"), /CanonicalEvidenceFieldControl/);
});

test("Phase 2 — field keys survive label edits, reorder, and successor copy", () => {
  const renamed = [
    { fieldKey: "cooler_temperature", label: "Refrigerator Temperature" },
    { fieldKey: "notes", label: "Staff notes" },
  ];
  assert.deepEqual(resolveCatalogFieldKeys(renamed), ["cooler_temperature", "notes"]);

  const reordered = [
    { fieldKey: "notes", label: "Staff notes" },
    { fieldKey: "cooler_temperature", label: "Refrigerator Temperature" },
  ];
  assert.deepEqual(resolveCatalogFieldKeys(reordered), ["notes", "cooler_temperature"]);

  const newField = [
    { fieldKey: "cooler_temperature", label: "Refrigerator Temperature" },
    { fieldKey: "", label: "Sanitizer concentration" },
  ];
  assert.deepEqual(resolveCatalogFieldKeys(newField), [
    "cooler_temperature",
    "sanitizer_concentration",
  ]);

  const successor = source("src/lib/canonical-logs/catalog-service.ts");
  assert.match(successor, /fieldKey: f\.fieldKey/);
  assert.match(successor, /resolveCatalogFieldKeys/);
  assert.match(successor, /Published Catalog definitions are immutable/);
});

test("Phase 2 — new Cooler-equivalent template is authorable without seed code", () => {
  assert.equal(
    CATALOG_SEED_DEFINITIONS.some((row) => row.name === CERTIFICATION_TEMPLATE.name),
    false,
  );
  const publish = validateCatalogForPublish({
    name: CERTIFICATION_TEMPLATE.name,
    purposeType: CERTIFICATION_TEMPLATE.purposeType,
    fields: CERTIFICATION_TEMPLATE.fields,
    recommendedScheduleKind: CERTIFICATION_TEMPLATE.recommendedScheduleKind,
    recommendedFixedWindows: CERTIFICATION_TEMPLATE.recommendedFixedWindows,
  });
  assert.equal(publish.valid, true);
  assert.deepEqual(resolveCatalogFieldKeys(CERTIFICATION_TEMPLATE.fields), [
    "refrigerator_temperature",
  ]);

  const v2Draft = [
    {
      ...CERTIFICATION_TEMPLATE.fields[0]!,
      label: "Refrigerator Temperature",
      maxNumber: 40,
    },
  ];
  assert.deepEqual(resolveCatalogFieldKeys(v2Draft), ["refrigerator_temperature"]);

  const inRange = validateEvidenceSubmission({
    fields: [field({ ...CERTIFICATION_TEMPLATE.fields[0]! })],
    values: [{ fieldKey: "refrigerator_temperature", valueNumber: 38 }],
  });
  assert.equal(inRange.valid, true);
  assert.equal(inRange.outOfStandard, false);
});

test("Phase 2 — publish validation rejects incomplete select and inverted ranges", () => {
  const missingChoices = validateCatalogForPublish({
    name: "Select log",
    purposeType: "LOG",
    fields: [{ label: "Area", fieldType: "SINGLE_SELECT", allowedSelections: ["Only one"] }],
  });
  assert.equal(missingChoices.valid, false);
  assert.ok(missingChoices.errors.some((error) => error.code.includes("selections_required")));

  const inverted = validateCatalogForPublish({
    name: "Range log",
    purposeType: "LOG",
    fields: [{ label: "pH", fieldType: "NUMBER", minNumber: 9, maxNumber: 4 }],
  });
  assert.equal(inverted.valid, false);
  assert.ok(inverted.errors.some((error) => error.code.includes("min_max_order")));

  const badWindow = validateCatalogForPublish({
    name: "Window log",
    purposeType: "LOG",
    fields: [{ label: "Done", fieldType: "YES_NO" }],
    recommendedScheduleKind: "FIXED_DAILY_WINDOW",
    recommendedFixedWindows: [{ label: "Morning", startLocal: "11:00", endLocal: "05:00" }],
  });
  assert.equal(badWindow.valid, false);
  assert.ok(badWindow.errors.some((error) => error.code.includes("window_order")));
});

test("Phase 2 — numeric measurements support min only, max only, both, none, and decimals", () => {
  const minOnly = field({
    fieldKey: "hot_holding",
    label: "Hot holding",
    fieldType: "NUMBER",
    unitLabel: "°F",
    minNumber: 135,
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
  });
  const below = validateEvidenceSubmission({
    fields: [minOnly],
    values: [{ fieldKey: "hot_holding", valueNumber: 120 }],
  });
  assert.equal(below.outOfStandard, true);
  assert.equal(below.valid, false);
  const aboveMin = validateEvidenceSubmission({
    fields: [minOnly],
    values: [{ fieldKey: "hot_holding", valueNumber: 140.5 }],
  });
  assert.equal(aboveMin.valid, true);
  assert.equal(aboveMin.outOfStandard, false);

  const maxOnly = field({
    fieldKey: "psi",
    label: "Pressure",
    fieldType: "NUMBER",
    unitLabel: "psi",
    maxNumber: 30,
    correctiveActionTrigger: true,
  });
  assert.equal(
    validateEvidenceSubmission({
      fields: [maxOnly],
      values: [{ fieldKey: "psi", valueNumber: 31 }],
    }).outOfStandard,
    true,
  );
  assert.equal(
    validateEvidenceSubmission({
      fields: [maxOnly],
      values: [{ fieldKey: "psi", valueNumber: 29 }],
    }).outOfStandard,
    false,
  );

  const both = field({
    fieldKey: "sanitizer",
    label: "Sanitizer",
    fieldType: "NUMBER",
    unitLabel: "ppm",
    minNumber: 150,
    maxNumber: 400,
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
  });
  assert.equal(
    validateEvidenceSubmission({
      fields: [both],
      values: [{ fieldKey: "sanitizer", valueNumber: 200 }],
    }).outOfStandard,
    false,
  );
  const oos = validateEvidenceSubmission({
    fields: [both],
    values: [{ fieldKey: "sanitizer", valueNumber: 80 }],
    correctiveActionText: "Remixed sanitizer.",
  });
  assert.equal(oos.valid, true);
  assert.equal(oos.outOfStandard, true);

  const noStandard = field({
    fieldKey: "ph",
    label: "pH",
    fieldType: "NUMBER",
    unitLabel: "pH",
  });
  const measured = validateEvidenceSubmission({
    fields: [noStandard],
    values: [{ fieldKey: "ph", valueNumber: 7.2 }],
  });
  assert.equal(measured.valid, true);
  assert.equal(measured.outOfStandard, false);

  const zeroNotImplicit = field({
    fieldKey: "oz",
    label: "Weight",
    fieldType: "NUMBER",
    unitLabel: "oz",
    minNumber: null,
    maxNumber: null,
    correctiveActionTrigger: true,
  });
  assert.equal(
    validateEvidenceSubmission({
      fields: [zeroNotImplicit],
      values: [{ fieldKey: "oz", valueNumber: -1 }],
    }).outOfStandard,
    false,
  );
});

test("Phase 2 — every field type stores the canonical value shape", () => {
  const cases: Array<{
    snapshot: TemplateFieldSnapshot;
    value: Parameters<typeof validateEvidenceSubmission>[0]["values"][number];
    invalid?: Parameters<typeof validateEvidenceSubmission>[0]["values"][number];
  }> = [
    {
      snapshot: field({ fieldKey: "item", label: "Food item", fieldType: "SHORT_TEXT" }),
      value: { fieldKey: "item", valueText: "Chicken" },
    },
    {
      snapshot: field({ fieldKey: "notes", label: "Notes", fieldType: "LONG_TEXT" }),
      value: { fieldKey: "notes", valueText: "Longer operational note." },
    },
    {
      snapshot: field({ fieldKey: "ppm", label: "Sanitizer", fieldType: "NUMBER", unitLabel: "ppm" }),
      value: { fieldKey: "ppm", valueNumber: 200.5 },
      invalid: { fieldKey: "ppm", valueNumber: Number.NaN },
    },
    {
      snapshot: field({ fieldKey: "temp", label: "Temperature", fieldType: "TEMPERATURE", unitLabel: "°F" }),
      value: { fieldKey: "temp", valueNumber: 38 },
    },
    {
      snapshot: field({ fieldKey: "opening", label: "Opening complete", fieldType: "YES_NO" }),
      value: { fieldKey: "opening", valueBoolean: true },
    },
    {
      snapshot: field({
        fieldKey: "condition",
        label: "Condition",
        fieldType: "PASS_NEEDS_ATTENTION",
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      }),
      value: { fieldKey: "condition", valueText: "PASS" },
    },
    {
      snapshot: field({
        fieldKey: "shift",
        label: "Shift",
        fieldType: "SINGLE_SELECT",
        allowedSelections: ["Morning", "Afternoon"],
      }),
      value: { fieldKey: "shift", valueText: "Morning" },
      invalid: { fieldKey: "shift", valueText: "Night" },
    },
    {
      snapshot: field({
        fieldKey: "areas",
        label: "Cleaning areas",
        fieldType: "MULTI_SELECT",
        allowedSelections: ["Sink", "Counter", "Floor"],
      }),
      value: { fieldKey: "areas", valueSelections: ["Sink", "Floor"] },
      invalid: { fieldKey: "areas", valueSelections: ["Office"] },
    },
    {
      snapshot: field({ fieldKey: "inspected_on", label: "Inspection date", fieldType: "DATE" }),
      value: { fieldKey: "inspected_on", valueText: "2026-10-14" },
      invalid: { fieldKey: "inspected_on", valueText: "October 14" },
    },
    {
      snapshot: field({ fieldKey: "checked_at", label: "Check time", fieldType: "TIME" }),
      value: { fieldKey: "checked_at", valueText: "14:30" },
      invalid: { fieldKey: "checked_at", valueText: "2pm" },
    },
    {
      snapshot: field({ fieldKey: "attest", label: "Attestation", fieldType: "ATTESTATION" }),
      value: { fieldKey: "attest", valueBoolean: true },
      invalid: { fieldKey: "attest", valueBoolean: false },
    },
    {
      snapshot: field({
        fieldKey: "comment",
        label: "Comment",
        fieldType: "OPTIONAL_COMMENT",
        isRequired: false,
      }),
      value: { fieldKey: "comment", valueText: "Optional note" },
    },
  ];

  for (const row of cases) {
    const accepted = validateEvidenceSubmission({
      fields: [row.snapshot],
      values: [row.value],
    });
    assert.equal(accepted.valid, true, row.snapshot.fieldType);
    if (row.invalid) {
      const rejected = validateEvidenceSubmission({
        fields: [row.snapshot],
        values: [row.invalid],
      });
      assert.equal(rejected.valid, false, `${row.snapshot.fieldType} invalid`);
    }
  }

  const optionalEmpty = validateEvidenceSubmission({
    fields: [
      field({
        fieldKey: "comment",
        label: "Comment",
        fieldType: "OPTIONAL_COMMENT",
        isRequired: true,
      }),
    ],
    values: [],
  });
  assert.equal(optionalEmpty.valid, true);
});

test("Phase 2 — YES_NO uses valueBoolean and still treats No as out of standard", () => {
  const yesNo = field({
    fieldKey: "opening",
    label: "Opening complete",
    fieldType: "YES_NO",
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
  });
  const yes = validateEvidenceSubmission({
    fields: [yesNo],
    values: [{ fieldKey: "opening", valueBoolean: true }],
  });
  assert.equal(yes.valid, true);
  assert.equal(yes.outOfStandard, false);

  const no = validateEvidenceSubmission({
    fields: [yesNo],
    values: [{ fieldKey: "opening", valueBoolean: false }],
  });
  assert.equal(no.valid, false);
  assert.equal(no.outOfStandard, true);

  const legacyText = validateEvidenceSubmission({
    fields: [yesNo],
    values: [{ fieldKey: "opening", valueText: "NO" }],
    correctiveActionText: "Corrected opening task.",
  });
  assert.equal(legacyText.valid, true);
  assert.equal(legacyText.outOfStandard, true);
  assert.equal(legacyText.fieldOutOfStandard.opening, true);
});

test("Phase 2 — record detail and CSV serialize typed values into the existing value column", () => {
  assert.equal(
    formatEvidenceFieldDisplay({
      fieldType: "TEMPERATURE",
      valueNumber: 38,
      unitLabel: "°F",
    }),
    "38 °F",
  );
  assert.equal(
    formatEvidenceFieldDisplay({
      fieldType: "NUMBER",
      valueNumber: 200,
      unitLabel: "ppm",
    }),
    "200 ppm",
  );
  assert.equal(
    formatEvidenceFieldDisplay({ fieldType: "YES_NO", valueBoolean: true }),
    "Yes",
  );
  assert.equal(
    formatEvidenceFieldDisplay({ fieldType: "PASS_NEEDS_ATTENTION", valueText: "NEEDS_ATTENTION" }),
    "Needs attention",
  );
  assert.equal(
    formatEvidenceFieldDisplay({
      fieldType: "MULTI_SELECT",
      valueSelections: ["Sink", "Counter", "Floor"],
    }),
    "Sink, Counter, Floor",
  );
  assert.equal(
    formatEvidenceFieldDisplay({ fieldType: "DATE", valueText: "2026-10-14" }),
    "October 14, 2026",
  );
  assert.equal(
    formatEvidenceFieldDisplay({ fieldType: "TIME", valueText: "14:30" }),
    "2:30 PM",
  );
  assert.equal(
    formatEvidenceFieldDisplay({ fieldType: "ATTESTATION", valueBoolean: true }),
    "Confirmed",
  );

  const slots: AuditRecordSlot[] = [
    {
      serviceDate: "2026-10-14",
      departmentId: "dept-1",
      catalogStableKey: "test_refrigeration_temperature",
      catalogVersion: 1,
      definitionLabel: "Test Refrigeration Temperature",
      recordForm: "READING",
      requirementSegmentId: "att-1",
      attachmentStableKey: "att_1",
      locationFunctionKey: null,
      spaceId: null,
      assetId: "asset-1",
      unitId: null,
      cycleStableKey: null,
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
      requirementKey: "req-1",
      slotState: "COMPLETE",
      placeLabel: "Reach-In Cooler #1",
      placeLabelCertainty: "SNAPSHOT",
      record: {
        id: "rec-1",
        occurredAt: "2026-10-14T12:00:00.000Z",
        recordedAt: "2026-10-14T12:00:00.000Z",
        recordedByLabel: "Phase 2 Staff",
        valueNumber: 38,
        valueText: null,
        outOfStandard: false,
        correctiveActionText: null,
        templateVersion: 1,
        status: "COMPLETED",
      },
      followUps: [],
      corrections: [],
      waiver: null,
      waiverAllowed: false,
      source: "CANONICAL_RECORD",
    },
  ];
  const csv = auditRecordsToCsv(slots);
  assert.match(csv, /serviceDate,departmentId,definition/);
  assert.match(csv, /,38,/);
  assert.equal(serializeEvidenceFieldForCsv({ fieldType: "YES_NO", valueBoolean: false }), "No");
  assert.equal(
    serializeEvidenceFieldForCsv({ fieldType: "MULTI_SELECT", valueSelections: ["Sink", "Floor"] }),
    "Sink, Floor",
  );
});

test("Phase 2 — authority and flag stay unchanged", () => {
  assert.doesNotMatch(source("prisma/schema.prisma"), /model FormDefinition/);
  assert.match(source("src/lib/canonical-logs/catalog-service.ts"), /catalogLogDefinition/);
  assert.match(source(".env.example"), /CANONICAL_LOGS_ENABLED=true/);
  assert.match(source("src/lib/feature-flags.ts"), /parseEnvFlag\(process\.env\.CANONICAL_LOGS_ENABLED, false\)/);
});
