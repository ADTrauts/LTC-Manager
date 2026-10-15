/**
 * Phase 4 — photos, files, and signatures on OperationalEvidenceRecord.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import {
  EVIDENCE_MEDIA_MAX_BYTES,
  evidenceMediaStorageKey,
  inspectEvidenceMedia,
  prepareEvidenceMedia,
} from "./evidence-media";
import { buildCanonicalLogSubmissionSnapshot, parseLogSubmissionSnapshot } from "./snapshot";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function field(partial: Partial<TemplateFieldSnapshot> & Pick<TemplateFieldSnapshot, "fieldKey" | "fieldType">): TemplateFieldSnapshot {
  return {
    label: partial.label ?? partial.fieldKey,
    isRequired: partial.isRequired ?? false,
    displaySequence: partial.displaySequence ?? 10,
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
  field({ fieldKey: "equipment_operational", fieldType: "YES_NO", isRequired: true }),
  field({ fieldKey: "problem_description", fieldType: "LONG_TEXT" }),
  field({ fieldKey: "condition_photo", fieldType: "PHOTO" }),
];

const equipmentRules = [
  {
    ruleKey: "not_operational",
    sourceFieldKey: "equipment_operational",
    operator: "EQUALS",
    compareValue: "NO",
    actions: [
      { kind: "MARK_OUT_OF_STANDARD" },
      { kind: "SHOW_FIELD", targetFieldKey: "problem_description" },
      { kind: "REQUIRE_FIELD", targetFieldKey: "problem_description" },
      { kind: "SHOW_FIELD", targetFieldKey: "condition_photo" },
      { kind: "REQUIRE_FIELD", targetFieldKey: "condition_photo" },
      { kind: "REQUIRE_CORRECTIVE_ACTION" },
    ],
  },
];

test("Phase 4 — Yes hides the photo and No requires it with corrective action", () => {
  const yes = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [{ fieldKey: "equipment_operational", valueBoolean: true }],
  });
  assert.equal(yes.valid, true);
  assert.equal(yes.outOfStandard, false);
  assert.equal(yes.visibleFieldKeys.includes("condition_photo"), false);

  const missing = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [
      { fieldKey: "equipment_operational", valueBoolean: false },
      { fieldKey: "problem_description", valueText: "Door seal torn." },
    ],
    correctiveActionText: "Food moved and maintenance notified.",
  });
  assert.equal(missing.valid, false);
  assert.match(missing.errors.map((row) => row.message).join(" "), /Condition photo|condition_photo/i);

  const complete = validateEvidenceSubmission({
    fields: equipmentFields,
    rules: equipmentRules,
    values: [
      { fieldKey: "equipment_operational", valueBoolean: false },
      { fieldKey: "problem_description", valueText: "Door seal torn." },
    ],
    correctiveActionText: "Food moved and maintenance notified.",
    providedMediaFieldKeys: ["condition_photo"],
  });
  assert.equal(complete.valid, true);
  assert.equal(complete.outOfStandard, true);
  assert.equal(complete.correctiveActionRequired, true);
});

test("Phase 4 — file policy rejects the wrong type and oversized bytes", () => {
  const png = Buffer.from(PNG, "base64");
  const photo = inspectEvidenceMedia({
    kind: "PHOTO",
    filename: "../secrets.png",
    contentType: "image/png",
    bytes: new Uint8Array(png),
  });
  assert.equal(photo.ok, true);
  if (photo.ok) assert.equal(photo.filename.includes(".."), false);

  const html = inspectEvidenceMedia({
    kind: "FILE",
    filename: "note.html",
    contentType: "text/html",
    bytes: new Uint8Array(Buffer.from("<html><script>alert(1)</script></html>")),
  });
  assert.equal(html.ok, false);

  const exe = inspectEvidenceMedia({
    kind: "FILE",
    filename: "run.pdf",
    contentType: "application/pdf",
    bytes: new Uint8Array([0x4d, 0x5a, 0x00, 0x00]),
  });
  assert.equal(exe.ok, false);

  const oversize = inspectEvidenceMedia({
    kind: "FILE",
    filename: "report.pdf",
    contentType: "application/pdf",
    bytes: new Uint8Array(EVIDENCE_MEDIA_MAX_BYTES + 1),
  });
  assert.equal(oversize.ok, false);

  const pdf = inspectEvidenceMedia({
    kind: "FILE",
    filename: "dishwasher-service-report.pdf",
    contentType: "application/pdf",
    bytes: new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n")),
  });
  assert.equal(pdf.ok, true);

  const signature = inspectEvidenceMedia({
    kind: "SIGNATURE",
    filename: "ignored.png",
    contentType: "image/png",
    bytes: new Uint8Array(png),
  });
  assert.equal(signature.ok, true);
  if (signature.ok) assert.equal(signature.filename, "signature.png");

  assert.throws(
    () =>
      evidenceMediaStorageKey({
        facilityId: "../other",
        recordId: "rec",
        attachmentId: "emat_1",
        extension: ".png",
      }),
    /Invalid facility/,
  );
  const key = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_1",
    attachmentId: "emat_1",
    extension: ".png",
  });
  assert.equal(key, "evidence/fac_1/rec_1/emat_1.png");

  const prepared = prepareEvidenceMedia(
    [
      {
        fieldKey: "condition_photo",
        kind: "PHOTO",
        filename: "seal.png",
        contentType: "image/png",
        dataBase64: PNG,
      },
    ],
    new Set(["condition_photo"]),
  );
  assert.equal(prepared.ok, true);
});

test("Phase 4 — snapshot keeps a photo field and submit does not duplicate or copy media", () => {
  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "cat-v1",
      stableKey: "equipment_condition_check",
      version: 1,
      name: "Equipment Condition Check",
      description: null,
      instructions: null,
      purposeType: "LOG",
      category: "SANITATION",
      recommendedCadence: null,
      fields: [field({ fieldKey: "condition_photo", fieldType: "PHOTO", isRequired: false, label: "Condition photo" })],
      rules: equipmentRules,
    },
    attachment: {
      id: "att",
      stableKey: "att",
      departmentId: "dept",
      status: "ACTIVE",
      localDisplayLabel: null,
      localInstructions: null,
      timingMode: "AD_HOC",
      targetKind: "ASSET",
      target: { kind: "ASSET", assetId: "asset-1" },
      cycleStableKeys: [],
      dailyWindows: [],
      calendar: null,
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
  assert.equal(pinned?.catalog.fields[0]?.fieldType, "PHOTO");
  assert.equal(pinned?.catalog.rules[0]?.actions.some((action) => action.kind === "REQUIRE_FIELD"), true);

  const submit = source("src/lib/canonical-logs/submit-canonical-log.ts");
  const idempotent = submit.indexOf("if (existing) return existing");
  const write = submit.indexOf("await putEvidenceObjects");
  assert.ok(idempotent >= 0 && write > idempotent);
  assert.doesNotMatch(submit, /origin\.attachments|copyAttachment|attachment\.createMany/);
  assert.doesNotMatch(source("src/lib/operational-evidence/correct-evidence.ts"), /operationalEvidenceAttachment\.delete/);
  assert.match(source("prisma/schema.prisma"), /model OperationalEvidenceAttachment/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model FormSubmissionAttachment|model LogPhoto|model CorrectiveActionPhoto/);
  assert.match(source("src/app/api/evidence-attachments/[id]/route.ts"), /facilityId: session.facilityId/);
  assert.match(source("src/components/harbor-console/harbor-catalog-editor.tsx"), /PHOTO/);
  assert.match(source("src/components/canonical-logs/canonical-evidence-field-control.tsx"), /SIGNATURE/);
  assert.match(source("src/app/(protected)/staffing/log-book/page.tsx"), /attachment/);
});
