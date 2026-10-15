/**
 * Phase 3.1 — scheduled Cooler recheck is follow-up evidence, not another slot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { auditOperationalRecords } from "@/lib/audit/audit-records";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import { projectLogExpectationHistory } from "./expectation-history";
import { resolveLogRequirementsForAttachment, type LogAttachmentForResolve } from "./resolve-log-requirements";
import { buildCanonicalLogSubmissionSnapshot, parseLogSubmissionSnapshot } from "./snapshot";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const SERVICE_DATE = "2026-10-14";
const TZ = "America/New_York";
const NOW = new Date("2026-10-14T18:00:00.000Z");

const cooler = CATALOG_SEED_DEFINITIONS.find((row) => row.stableKey === "cooler_temperature_log");
assert.ok(cooler);
const coolerField = cooler.fields.find((field) => field.fieldKey === "cooler_temperature");
assert.ok(coolerField);

function temperatureField(maxNumber: number): TemplateFieldSnapshot {
  return {
    fieldKey: coolerField!.fieldKey,
    label: coolerField!.label,
    fieldType: "TEMPERATURE",
    isRequired: true,
    displaySequence: coolerField!.displaySequence,
    helpText: null,
    unitLabel: "°F",
    minNumber: 33,
    maxNumber,
    allowedSelections: [],
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
  };
}

function attachment(): LogAttachmentForResolve {
  const windows = daypartWindowsForCadence("TWICE_DAILY");
  return {
    id: "att-cooler",
    stableKey: "att_cooler",
    facilityId: "fac",
    departmentId: "dept",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date(`${SERVICE_DATE}T00:00:00.000Z`),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Reach-In Cooler #1",
    localInstructions: null,
    targetKind: "ASSET",
    assetId: "asset-1",
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
      id: "cat-v1",
      name: "Cooler Temperature Log",
      purposeType: "LOG",
      instructions: null,
      status: "PUBLISHED",
      fields: [temperatureField(41)],
    },
  };
}

function slots(existing: Parameters<typeof resolveLogRequirementsForAttachment>[0]["existingRecords"] = []) {
  return resolveLogRequirementsForAttachment({
    attachment: attachment(),
    operationalDateKey: SERVICE_DATE,
    now: NOW,
    facilityTimezone: TZ,
    publishedCycles: [],
    existingRecords: existing,
  });
}

test("Phase 3.1 — Morning 55°F plus a 38°F recheck leaves Afternoon open", () => {
  const morning = slots().find((row) => row.cycleLabel === "Morning")!;
  const afternoon = slots().find((row) => row.cycleLabel === "Afternoon")!;
  const original = {
    id: "oer-55",
    requirementKey: morning.requirementKey,
    logRequirementKey: morning.requirementKey,
    status: "COMPLETED_WITH_CORRECTIVE_ACTION" as const,
    followsRecordId: null,
  };
  const recheck = {
    id: "oer-38",
    requirementKey: `followup|${original.id}|abc`,
    logRequirementKey: null,
    status: "COMPLETED" as const,
    followsRecordId: original.id,
  };

  const afterRecheck = slots([original, recheck]);
  assert.equal(afterRecheck.length, 2);
  assert.equal(afterRecheck.find((row) => row.requirementKey === morning.requirementKey)?.recordId, original.id);
  assert.equal(afterRecheck.find((row) => row.requirementKey === afternoon.requirementKey)?.recordId, null);
  assert.equal(afterRecheck.filter((row) => row.recordId).length, 1);

  const colliding = slots([
    {
      ...recheck,
      requirementKey: afternoon.requirementKey,
      logRequirementKey: afternoon.requirementKey,
    },
    original,
  ]);
  assert.equal(colliding.find((row) => row.requirementKey === afternoon.requirementKey)?.recordId, null);

  const history = projectLogExpectationHistory({
    segments: [attachment()],
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: SERVICE_DATE,
    now: NOW,
    facilityTimezone: TZ,
    submissions: [
      { ...original, operationalDateKey: SERVICE_DATE, valueNumber: 55, outOfStandard: true },
      { ...recheck, operationalDateKey: SERVICE_DATE, valueNumber: 38, outOfStandard: false },
    ],
  });
  assert.equal(history[0]!.slots.length, 2);
  assert.equal(history[0]!.slots.filter((slot) => slot.recordId).length, 1);
  assert.equal(history[0]!.unscheduledRecords.length, 1);
  assert.equal(history[0]!.unscheduledRecords[0]!.id, recheck.id);

  const audit = auditOperationalRecords({
    fromDateKey: SERVICE_DATE,
    toDateKey: SERVICE_DATE,
    todayKey: SERVICE_DATE,
    now: NOW,
    facilityTimezone: TZ,
    departmentId: "dept",
    segments: [attachment()],
    profiles: [],
    bindings: [],
    spaces: [],
    placeNames: [],
    records: [
      {
        id: original.id,
        requirementKey: original.requirementKey,
        logRequirementKey: original.logRequirementKey,
        followsRecordId: null,
        operationalDateKey: SERVICE_DATE,
        spaceId: null,
        templateVersion: 1,
        outOfStandard: true,
        valueNumber: 55,
        valueText: null,
        correctiveActionText: "Food moved to alternate cooler. Unit adjusted.",
        occurredAt: "2026-10-14T14:45:00.000Z",
        recordedAt: "2026-10-14T14:45:00.000Z",
        recordedByLabel: "Staff",
        placeLabelSnapshot: null,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        corrections: [],
      },
      {
        id: recheck.id,
        requirementKey: recheck.requirementKey,
        logRequirementKey: null,
        followsRecordId: original.id,
        operationalDateKey: SERVICE_DATE,
        spaceId: null,
        templateVersion: 1,
        outOfStandard: false,
        valueNumber: 38,
        valueText: null,
        correctiveActionText: null,
        occurredAt: "2026-10-14T15:15:00.000Z",
        recordedAt: "2026-10-14T15:15:00.000Z",
        recordedByLabel: "Staff",
        placeLabelSnapshot: null,
        status: "COMPLETED",
        corrections: [],
      },
    ],
    waivers: [],
  });
  assert.equal(audit.slots.length, 2);
  assert.equal(audit.slots.filter((slot) => slot.record).length, 1);
  assert.equal(audit.slots.find((slot) => slot.record)?.record?.valueNumber, 55);
});

test("Phase 3.1 — recheck standards stay on the originating snapshot", () => {
  const v1 = temperatureField(41);
  const submitted = validateEvidenceSubmission({
    fields: [v1],
    values: [{ fieldKey: v1.fieldKey, valueNumber: 55 }],
    correctiveActionText: "Food moved to alternate cooler. Unit adjusted.",
  });
  assert.equal(submitted.outOfStandard, true);

  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "cat-v1",
      stableKey: "cooler_temperature_log",
      version: 1,
      name: "Cooler Temperature Log",
      description: null,
      instructions: null,
      purposeType: "LOG",
      category: "TEMPERATURE",
      recommendedCadence: "TWICE_DAILY",
      fields: [v1],
      rules: [],
    },
    attachment: {
      id: "att-cooler",
      stableKey: "att_cooler",
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
      windowStartLocal: "06:00",
      windowEndLocal: "10:00",
      windowOrdinal: 1,
    },
  });
  const pinned = parseLogSubmissionSnapshot(snapshot);
  assert.ok(pinned);
  assert.equal(pinned.catalog.version, 1);
  assert.equal(pinned.catalog.fields[0]!.maxNumber, 41);

  const recheckOnV1 = validateEvidenceSubmission({
    fields: pinned.catalog.fields,
    values: [{ fieldKey: v1.fieldKey, valueNumber: 38 }],
  });
  assert.equal(recheckOnV1.outOfStandard, false);
  assert.equal(recheckOnV1.valid, true);

  const liveV2 = validateEvidenceSubmission({
    fields: [temperatureField(40)],
    values: [{ fieldKey: v1.fieldKey, valueNumber: 41 }],
  });
  const historical = validateEvidenceSubmission({
    fields: pinned.catalog.fields,
    values: [{ fieldKey: v1.fieldKey, valueNumber: 41 }],
  });
  assert.equal(liveV2.outOfStandard, true);
  assert.equal(historical.outOfStandard, false);
});

test("Phase 3.1 — recheck route is usable for scheduled attachments and ad hoc stays separate", () => {
  const recheckPage = source("src/app/(protected)/staffing/logs/records/[recordId]/recheck/page.tsx");
  const recheckLoader = source("src/lib/canonical-logs/load-canonical-recheck.ts");
  const recordPage = source("src/app/(protected)/staffing/logs/records/[recordId]/page.tsx");
  const adhoc = source("src/app/(protected)/staffing/logs/adhoc/[attachmentId]/page.tsx");
  const submit = source("src/lib/canonical-logs/submit-canonical-log.ts");
  const schema = source("prisma/schema.prisma");

  assert.match(recheckPage, /followsRecordId=\{form\.recordId\}/);
  assert.match(recheckPage, /Original reading/);
  assert.doesNotMatch(recheckPage, /timingMode/);
  assert.doesNotMatch(recheckLoader, /AD_HOC/);
  assert.match(recheckLoader, /parseLogSubmissionSnapshot/);
  assert.match(recheckLoader, /facilityId: input\.facilityId/);

  assert.match(recordPage, /\/staffing\/logs\/records\/\$\{view\.id\}\/recheck/);
  assert.match(recordPage, /view\.canRecheck/);
  assert.doesNotMatch(recordPage, /logs\/adhoc\/\$\{view\.logAttachmentId\}/);

  assert.match(adhoc, /timingMode: "AD_HOC"/);
  assert.doesNotMatch(adhoc, /followsRecordId/);

  assert.match(submit, /parseLogSubmissionSnapshot/);
  assert.match(submit, /originating Log attachment/);
  assert.match(submit, /followup\|/);
  assert.doesNotMatch(submit, /assetIssue\.create|createIssueFromRecord/);
  assert.doesNotMatch(schema, /model Recheck|model FollowUpTask|model CorrectiveActionCase/);
  assert.match(source("src/lib/route-registry/platform-routes.ts"), /\/staffing\/logs\/records\/\[recordId\]\/recheck/);
  assert.match(source("src/app/(protected)/staffing/log-book/page.tsx"), /Follow-up \/ recheck/);
});
