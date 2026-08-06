import assert from "node:assert/strict";
import test from "node:test";

import {
  validateTemplate,
  validateTemplateApplicability,
  validateTemplateField,
  validateTemplateForPublish,
  validateTemplateSchedule,
} from "./validate-template";
import type { TemplateDraftInput } from "./types";

function baseDraft(overrides?: Partial<TemplateDraftInput>): TemplateDraftInput {
  return {
    name: "Cooler Log",
    purposeType: "LOG",
    fields: [
      {
        fieldKey: "temp",
        label: "Temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 10,
        minNumber: 33,
        maxNumber: 41,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      },
    ],
    applicabilities: [{ kind: "ASSET_TYPE", assetType: "COOLER" }],
    schedules: [{ kind: "OPERATIONAL_CYCLE", cycleStableKey: "morning_prep" }],
    ...overrides,
  };
}

test("name and fields are required", () => {
  const result = validateTemplate({
    name: "",
    purposeType: "LOG",
    fields: [],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "name_required"));
  assert.ok(result.errors.some((e) => e.code === "fields_required"));
});

test("field min/max order and type constraints", () => {
  const range = validateTemplateField(
    {
      label: "Temp",
      fieldType: "TEMPERATURE",
      displaySequence: 1,
      minNumber: 50,
      maxNumber: 40,
    },
    0,
  );
  assert.ok(range.some((e) => e.code === "fields[0].min_max_order"));

  const notRange = validateTemplateField(
    {
      label: "Note",
      fieldType: "SHORT_TEXT",
      displaySequence: 1,
      minNumber: 1,
    },
    0,
  );
  assert.ok(notRange.some((e) => e.code === "fields[0].range_not_applicable"));
});

test("select fields require selections; corrective required implies trigger", () => {
  const select = validateTemplateField(
    {
      label: "Choice",
      fieldType: "SINGLE_SELECT",
      displaySequence: 1,
      allowedSelections: [],
    },
    0,
  );
  assert.ok(select.some((e) => e.code === "fields[0].selections_required"));

  const corrective = validateTemplateField(
    {
      label: "Temp",
      fieldType: "TEMPERATURE",
      displaySequence: 1,
      correctiveActionRequired: true,
      correctiveActionTrigger: false,
    },
    0,
  );
  assert.ok(corrective.some((e) => e.code === "fields[0].corrective_required_without_trigger"));
});

test("OPTIONAL_COMMENT cannot be required", () => {
  const errors = validateTemplateField(
    {
      label: "Comment",
      fieldType: "OPTIONAL_COMMENT",
      displaySequence: 1,
      isRequired: true,
    },
    0,
  );
  assert.ok(errors.some((e) => e.code === "fields[0].optional_comment_required"));
});

test("applicability rows require matching identifiers", () => {
  assert.ok(
    validateTemplateApplicability({ kind: "SPECIFIC_ASSET" }, 0).some(
      (e) => e.code === "applicabilities[0].asset_required",
    ),
  );
  assert.ok(
    validateTemplateApplicability({ kind: "ASSET_TYPE" }, 0).some(
      (e) => e.code === "applicabilities[0].asset_type_required",
    ),
  );
  assert.ok(
    validateTemplateApplicability({ kind: "DEPARTMENT_UNIT" }, 0).some(
      (e) => e.code === "applicabilities[0].unit_required",
    ),
  );
});

test("schedule requires cycleStableKey or HH:mm window", () => {
  assert.ok(
    validateTemplateSchedule({ kind: "OPERATIONAL_CYCLE" }, 0).some(
      (e) => e.code === "schedules[0].cycle_required",
    ),
  );
  assert.ok(
    validateTemplateSchedule(
      { kind: "FIXED_DAILY_WINDOW", windowStartLocal: "bad", windowEndLocal: "07:00" },
      0,
    ).some((e) => e.code === "schedules[0].window_start_required"),
  );
  assert.ok(
    validateTemplateSchedule(
      { kind: "FIXED_DAILY_WINDOW", windowStartLocal: "08:00", windowEndLocal: "07:00" },
      0,
    ).some((e) => e.code === "schedules[0].window_order"),
  );
});

test("publish requires schedule or allowAdHoc", () => {
  const draft = validateTemplate(
    baseDraft({ schedules: [], allowAdHoc: false }),
  );
  assert.equal(draft.valid, true);

  const publish = validateTemplateForPublish(
    baseDraft({ schedules: [], allowAdHoc: false }),
  );
  assert.equal(publish.valid, false);
  assert.ok(publish.errors.some((e) => e.code === "schedule_or_adhoc_required"));

  const adhoc = validateTemplateForPublish(
    baseDraft({ schedules: [], allowAdHoc: true }),
  );
  assert.equal(adhoc.valid, true);
});

test("valid cooler-style draft passes", () => {
  const result = validateTemplateForPublish(baseDraft());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("duplicate field keys and display sequences are errors", () => {
  const result = validateTemplate(
    baseDraft({
      fields: [
        {
          fieldKey: "temp",
          label: "A",
          fieldType: "TEMPERATURE",
          displaySequence: 10,
        },
        {
          fieldKey: "temp",
          label: "B",
          fieldType: "NUMBER",
          displaySequence: 10,
        },
      ],
    }),
  );
  assert.ok(result.errors.some((e) => e.code.includes("field_key_duplicate")));
  assert.ok(result.errors.some((e) => e.code.includes("display_sequence_duplicate")));
});
