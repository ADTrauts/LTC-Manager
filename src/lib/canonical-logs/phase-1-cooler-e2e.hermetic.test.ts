/**
 * Phase 1 — Cooler Temperature Log end-to-end authority.
 * One shared attachment identity flows Catalog → install/attach shape → derived
 * Morning/Afternoon requirements → 38°F / 55°F validation → Review → CSV.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { auditOperationalRecords, auditRecordsToCsv } from "@/lib/audit/audit-records";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import { projectLogExpectationHistory } from "./expectation-history";
import { pinSubmittedStandard } from "./record-engine";
import { resolveLogRequirementsForAttachment, type LogAttachmentForResolve } from "./resolve-log-requirements";
import { presentRunLogRequirement } from "./run-presentation";
import { buildCanonicalLogSubmissionSnapshot } from "./snapshot";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const SERVICE_DATE = "2026-10-14";
const TZ = "America/New_York";
const FACILITY_ID = "fac-phase1-cooler";
const DEPARTMENT_ID = "dept-phase1-dietary";
const ASSET_ID = "asset-reach-in-1";
const ATTACHMENT_ID = "att-phase1-cooler";
const ATTACHMENT_STABLE = "att_phase1_cooler";
const CATALOG_ID = "cat-cooler-temperature-log-v1";

const cooler = CATALOG_SEED_DEFINITIONS.find((row) => row.stableKey === "cooler_temperature_log");
assert.ok(cooler);

const coolerField = cooler.fields.find((field) => field.fieldKey === "cooler_temperature");
assert.ok(coolerField);

function fieldSnapshot(): TemplateFieldSnapshot {
  return {
    fieldKey: coolerField!.fieldKey,
    label: coolerField!.label,
    fieldType: coolerField!.fieldType,
    isRequired: coolerField!.isRequired ?? true,
    displaySequence: coolerField!.displaySequence,
    helpText: coolerField!.helpText ?? null,
    unitLabel: coolerField!.unitLabel ?? null,
    minNumber: coolerField!.minNumber ?? null,
    maxNumber: coolerField!.maxNumber ?? null,
    allowedSelections: coolerField!.allowedSelections ?? [],
    correctiveActionTrigger: coolerField!.correctiveActionTrigger ?? false,
    correctiveActionRequired: coolerField!.correctiveActionRequired ?? false,
  };
}

function coolerAttachment(): LogAttachmentForResolve {
  const windows = daypartWindowsForCadence(cooler!.recommendedCadence);
  return {
    id: ATTACHMENT_ID,
    stableKey: ATTACHMENT_STABLE,
    facilityId: FACILITY_ID,
    departmentId: DEPARTMENT_ID,
    catalogStableKey: cooler!.stableKey,
    catalogVersion: cooler!.version,
    status: "ACTIVE",
    effectiveFrom: new Date(`${SERVICE_DATE}T00:00:00.000Z`),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "ASSET",
    assetId: ASSET_ID,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: windows.map((window, index) => ({
      label: window.label,
      startLocal: window.startLocal,
      endLocal: window.endLocal,
      displaySequence: (index + 1) * 10,
    })),
    cycleSelections: [],
    catalogDefinition: {
      id: CATALOG_ID,
      name: cooler!.name,
      purposeType: cooler!.purposeType,
      instructions: cooler!.instructions,
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: coolerField!.fieldKey,
          label: coolerField!.label,
          fieldType: coolerField!.fieldType,
          isRequired: coolerField!.isRequired ?? true,
          displaySequence: coolerField!.displaySequence,
          helpText: coolerField!.helpText ?? null,
          unitLabel: coolerField!.unitLabel ?? null,
          minNumber: coolerField!.minNumber ?? null,
          maxNumber: coolerField!.maxNumber ?? null,
          allowedSelections: coolerField!.allowedSelections ?? [],
          correctiveActionTrigger: coolerField!.correctiveActionTrigger ?? false,
          correctiveActionRequired: coolerField!.correctiveActionRequired ?? false,
        },
      ],
    },
  };
}

function derive(now: Date, existing: Parameters<typeof resolveLogRequirementsForAttachment>[0]["existingRecords"] = []) {
  return resolveLogRequirementsForAttachment({
    attachment: coolerAttachment(),
    operationalDateKey: SERVICE_DATE,
    now,
    facilityTimezone: TZ,
    publishedCycles: [],
    existingRecords: existing,
  });
}

test("Phase 1 — Cooler Temperature Log published definition", () => {
  assert.equal(cooler.stableKey, "cooler_temperature_log");
  assert.equal(cooler.purposeType, "LOG");
  assert.equal(cooler.category, "TEMPERATURE");
  assert.equal(cooler.recommendedCadence, "TWICE_DAILY");
  assert.equal(cooler.recommendedScheduleKind, "FIXED_DAILY_WINDOW");
  assert.deepEqual(cooler.recommendedDaypartLabels, ["Morning", "Afternoon"]);
  assert.ok(cooler.suggestions.assetTypes.includes("COOLER"));
  assert.ok(cooler.suggestions.departmentKeys.includes("DIETARY"));
  assert.equal(coolerField.fieldType, "TEMPERATURE");
  assert.equal(coolerField.unitLabel, "°F");
  assert.equal(coolerField.minNumber, 33);
  assert.equal(coolerField.maxNumber, 41);
  assert.equal(coolerField.correctiveActionTrigger, true);
  assert.equal(coolerField.correctiveActionRequired, true);
});

test("Phase 1 — attach to cooler asset derives distinct Morning and Afternoon slots", () => {
  const windows = daypartWindowsForCadence("TWICE_DAILY");
  assert.equal(windows[0]?.label, "Morning");
  assert.equal(windows[1]?.label, "Afternoon");

  const reqs = derive(new Date("2026-10-14T14:00:00.000Z"));
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0]!.cycleLabel, "Morning");
  assert.equal(reqs[1]!.cycleLabel, "Afternoon");
  assert.notEqual(reqs[0]!.requirementKey, reqs[1]!.requirementKey);
  assert.ok(reqs[0]!.requirementKey.includes(ATTACHMENT_STABLE));
  assert.ok(reqs[0]!.requirementKey.includes("cooler_temperature_log"));
  assert.equal(reqs[0]!.target.kind, "ASSET");
  assert.equal(reqs[0]!.target.kind === "ASSET" ? reqs[0]!.target.assetId : null, ASSET_ID);
  assert.equal(reqs[0]!.productState, "DUE");
  assert.equal(reqs[1]!.productState, "UPCOMING");
});

test("Phase 1 — staff card names the cooler, window, and Record temperature action", () => {
  const morning = derive(new Date("2026-10-14T14:00:00.000Z")).find((row) => row.cycleLabel === "Morning")!;
  const view = presentRunLogRequirement({
    requirement: morning,
    catalogDefinitionName: cooler.name,
    localDisplayLabel: null,
    localInstructions: null,
    catalogInstructions: cooler.instructions,
    targetLabel: "2B Cazenovia Park · Servery · Reach-In Cooler #1",
    isManager: false,
  });
  assert.equal(view.displayName, "Cooler Temperature Log");
  assert.match(view.targetLabel, /Reach-In Cooler #1/);
  assert.match(view.timingContextLabel, /Morning/);
  assert.equal(view.stateLabel, "Due now");
  assert.equal(view.primaryActionLabel, "Record temperature");
  assert.ok(view.openHref?.startsWith("/staffing/logs/open"));
  assert.match(view.openHref ?? "", /requirementKey=/);
});

test("Phase 1 — 38°F is in range; 55°F requires corrective action", () => {
  const fields = [fieldSnapshot()];
  const inRange = validateEvidenceSubmission({
    fields,
    values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
  });
  assert.equal(inRange.valid, true);
  assert.equal(inRange.outOfStandard, false);
  assert.equal(inRange.fieldOutOfStandard.cooler_temperature, false);

  const decimal = validateEvidenceSubmission({
    fields,
    values: [{ fieldKey: "cooler_temperature", valueNumber: 38.5 }],
  });
  assert.equal(decimal.valid, true);
  assert.equal(decimal.outOfStandard, false);

  const invalid = validateEvidenceSubmission({
    fields,
    values: [{ fieldKey: "cooler_temperature", valueNumber: Number.NaN }],
  });
  assert.equal(invalid.valid, false);

  const oosNoCa = validateEvidenceSubmission({
    fields,
    values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
  });
  assert.equal(oosNoCa.valid, false);
  assert.equal(oosNoCa.outOfStandard, true);
  assert.equal(oosNoCa.correctiveActionRequired, true);
  assert.ok(oosNoCa.errors.some((error) => error.code === "corrective_action_required"));

  const oosWithCa = validateEvidenceSubmission({
    fields,
    values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
    correctiveActionText: "Moved food to backup cooler and called maintenance.",
  });
  assert.equal(oosWithCa.valid, true);
  assert.equal(oosWithCa.outOfStandard, true);

  const pinned38 = pinSubmittedStandard({
    definitionVersion: cooler.version,
    minNumber: 33,
    maxNumber: 41,
    valueNumber: 38,
  });
  assert.equal(pinned38.outOfStandard, false);
  const pinned55 = pinSubmittedStandard({
    definitionVersion: cooler.version,
    minNumber: 33,
    maxNumber: 41,
    valueNumber: 55,
  });
  assert.equal(pinned55.outOfStandard, true);
});

test("Phase 1 — Morning 38°F satisfies only Morning; snapshot stays canonical", () => {
  const reqs = derive(new Date("2026-10-14T14:00:00.000Z"));
  const morning = reqs.find((row) => row.cycleLabel === "Morning")!;
  const afternoon = reqs.find((row) => row.cycleLabel === "Afternoon")!;
  const recordId = "oer-phase1-38";

  const afterMorning = derive(new Date("2026-10-14T16:30:00.000Z"), [
    {
      id: recordId,
      requirementKey: morning.requirementKey,
      logRequirementKey: morning.requirementKey,
      status: "COMPLETED",
    },
  ]);
  assert.equal(afterMorning.find((row) => row.requirementKey === morning.requirementKey)?.productState, "COMPLETED");
  assert.equal(afterMorning.find((row) => row.requirementKey === morning.requirementKey)?.recordId, recordId);
  assert.notEqual(
    afterMorning.find((row) => row.requirementKey === afternoon.requirementKey)?.productState,
    "COMPLETED",
  );

  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: CATALOG_ID,
      stableKey: cooler.stableKey,
      version: cooler.version,
      name: cooler.name,
      description: cooler.description,
      instructions: cooler.instructions,
      purposeType: cooler.purposeType,
      category: cooler.category,
      recommendedCadence: cooler.recommendedCadence,
      fields: [fieldSnapshot()],
    },
    attachment: {
      id: ATTACHMENT_ID,
      stableKey: ATTACHMENT_STABLE,
      departmentId: DEPARTMENT_ID,
      status: "ACTIVE",
      localDisplayLabel: null,
      localInstructions: null,
      timingMode: "DAILY_WINDOWS",
      targetKind: "ASSET",
      target: { kind: "ASSET", assetId: ASSET_ID },
      cycleStableKeys: [],
      dailyWindows: coolerAttachment().dailyWindows,
      calendar: null,
      allowAdHoc: false,
    },
    timingContext: {
      scheduleKind: "FIXED_DAILY_WINDOW",
      cycleStableKey: null,
      cycleLabel: morning.cycleLabel,
      windowStartLocal: morning.windowStartLocal,
      windowEndLocal: morning.windowEndLocal,
      windowOrdinal: null,
    },
  });
  assert.equal(snapshot.snapshotSchemaVersion, 2);
  assert.equal(snapshot.kind, "CANONICAL_LOG");
  assert.equal(snapshot.catalog.stableKey, "cooler_temperature_log");
  assert.equal(snapshot.attachment.id, ATTACHMENT_ID);
  assert.equal(snapshot.timingContext.cycleLabel, "Morning");
});

test("Phase 1 — Review and CSV use the same Morning requirement key as the 38°F fact", () => {
  const attachment = coolerAttachment();
  const morning = derive(new Date("2026-10-14T14:00:00.000Z")).find((row) => row.cycleLabel === "Morning")!;
  const afternoon = derive(new Date("2026-10-14T14:00:00.000Z")).find((row) => row.cycleLabel === "Afternoon")!;

  const emptyHistory = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: "2026-10-15",
    now: new Date("2026-10-15T16:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  });
  const emptySlots = emptyHistory[0]!.slots;
  assert.equal(emptySlots.length, 2);
  assert.equal(emptySlots.filter((slot) => slot.state === "NOT_COMPLETE").length, 2);

  const filledHistory = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: "2026-10-15",
    now: new Date("2026-10-15T16:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [
      {
        id: "oer-phase1-38",
        requirementKey: morning.requirementKey,
        logRequirementKey: morning.requirementKey,
        status: "COMPLETED",
        operationalDateKey: SERVICE_DATE,
        catalogVersion: 1,
        valueNumber: 38,
        unitLabel: "°F",
        outOfStandard: false,
      },
    ],
  });
  const morningSlot = filledHistory[0]!.slots.find((slot) => slot.requirementKey === morning.requirementKey)!;
  const afternoonSlot = filledHistory[0]!.slots.find((slot) => slot.requirementKey === afternoon.requirementKey)!;
  assert.equal(morningSlot.state, "COMPLETE");
  assert.equal(morningSlot.valueSummary?.display, "38°F");
  assert.equal(morningSlot.valueSummary?.outOfStandard, false);
  assert.equal(afternoonSlot.state, "NOT_COMPLETE");

  const exceptionHistory = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: "2026-10-15",
    now: new Date("2026-10-15T16:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [
      {
        id: "oer-phase1-55",
        requirementKey: afternoon.requirementKey,
        logRequirementKey: afternoon.requirementKey,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        operationalDateKey: SERVICE_DATE,
        catalogVersion: 1,
        valueNumber: 55,
        unitLabel: "°F",
        outOfStandard: true,
      },
    ],
  });
  const oosSlot = exceptionHistory[0]!.slots.find((slot) => slot.requirementKey === afternoon.requirementKey)!;
  assert.equal(oosSlot.state, "COMPLETE_WITH_CORRECTIVE_ACTION");
  assert.equal(oosSlot.valueSummary?.display, "55°F");
  assert.equal(oosSlot.valueSummary?.outOfStandard, true);

  const audit = auditOperationalRecords({
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: "2026-10-15",
    now: new Date("2026-10-15T16:00:00.000Z"),
    facilityTimezone: TZ,
    departmentId: DEPARTMENT_ID,
    catalogStableKey: "cooler_temperature_log",
    segments: [attachment],
    profiles: [],
    bindings: [],
    spaces: [],
    placeNames: [],
    records: [
      {
        id: "oer-phase1-38",
        requirementKey: morning.requirementKey,
        logRequirementKey: morning.requirementKey,
        followsRecordId: null,
        operationalDateKey: SERVICE_DATE,
        spaceId: null,
        templateVersion: 1,
        outOfStandard: false,
        valueNumber: 38,
        valueText: null,
        correctiveActionText: null,
        occurredAt: "2026-10-14T14:05:00.000Z",
        recordedAt: "2026-10-14T14:05:00.000Z",
        recordedByLabel: "Phase 1 Staff",
        placeLabelSnapshot: null,
        status: "COMPLETED",
        corrections: [],
      },
      {
        id: "oer-phase1-55",
        requirementKey: afternoon.requirementKey,
        logRequirementKey: afternoon.requirementKey,
        followsRecordId: null,
        operationalDateKey: SERVICE_DATE,
        spaceId: null,
        templateVersion: 1,
        outOfStandard: true,
        valueNumber: 55,
        valueText: null,
        correctiveActionText: "Moved food to backup cooler and called maintenance.",
        occurredAt: "2026-10-14T16:10:00.000Z",
        recordedAt: "2026-10-14T16:10:00.000Z",
        recordedByLabel: "Phase 1 Staff",
        placeLabelSnapshot: null,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        corrections: [],
      },
    ],
    waivers: [],
  });
  assert.equal(audit.slots.length, 2);
  assert.equal(audit.slots.filter((slot) => slot.record).length, 2);
  assert.ok(audit.slots.every((slot) => slot.source === "CANONICAL_RECORD"));

  const csv = auditRecordsToCsv(audit.slots);
  assert.match(csv, /serviceDate,departmentId,definition/);
  assert.match(csv, /,38,/);
  assert.match(csv, /,55,/);
  assert.match(csv, /false/);
  assert.match(csv, /true/);
  assert.match(csv, /Moved food to backup cooler and called maintenance/);
  assert.match(csv, /CANONICAL_RECORD/);
  assert.match(csv, /Phase 1 Staff/);
});

test("Phase 1 — canonical Cooler path does not write legacy engines", () => {
  const submit = source("src/lib/canonical-logs/submit-canonical-log.ts");
  assert.match(submit, /templateId: null/);
  assert.match(submit, /operationalEvidenceRecord\.create/);
  assert.doesNotMatch(submit, /logSubmission\.create/);
  assert.doesNotMatch(submit, /inspectionSubmission\.create/);
  assert.doesNotMatch(submit, /operationalTemplate\.create/);

  const action = source("src/app/(protected)/staffing/logs/actions.ts");
  assert.match(action, /submitCanonicalLogSubmission/);
  assert.match(action, /clientCommandId/);

  const form = source("src/components/canonical-logs/canonical-log-entry-form.tsx");
  assert.match(form, /submitCanonicalRunLogAction/);
  assert.match(form, /clientCommandId/);
  assert.match(form, /Within range/);
  assert.match(form, /Outside expected range/);

  const logBook = source("src/lib/operational-evidence/log-book.ts");
  assert.match(logBook, /operationalEvidenceRecord\.(count|findMany)/);
  assert.doesNotMatch(logBook, /logSubmission\.create/);

  assert.match(source("src/lib/canonical-logs/facility-catalog-install.ts"), /facilityCatalogInstall/);
  assert.doesNotMatch(source("src/lib/canonical-logs/facility-catalog-install.ts"), /operationalTemplate\.create/);
});
