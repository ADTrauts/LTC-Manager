import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyAttachmentUpdate, type AttachmentHistoricalSnapshot } from "@/lib/canonical-logs/attachment-update-policy";
import type { LogExpectationHistorySegment } from "@/lib/canonical-logs/expectation-history";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import type { ReviewOtBindingFact, ReviewProfileFact } from "@/lib/operational-review/types";

import { auditOperationalRecords, auditRecordsToCsv, type AuditRecordFact } from "./audit-records";
import { ASSET_HISTORY_SOURCES } from "./history-boundaries";
import { resolvePlaceLabel } from "./place-name";
import { composeOperationalTimingAudit } from "./timing-audit";
import { waiverCreateDecision } from "./waiver";

const TZ = "America/New_York";

function windows(cadence: "TWICE_DAILY" | "THREE_TIMES_DAILY") {
  return daypartWindowsForCadence(cadence).map((window, index) => ({
    label: window.label,
    startLocal: window.startLocal,
    endLocal: window.endLocal,
    displaySequence: (index + 1) * 10,
  }));
}

function segment(
  overrides: Partial<LogExpectationHistorySegment> & Pick<LogExpectationHistorySegment, "id" | "effectiveFrom">,
): LogExpectationHistorySegment {
  return {
    stableKey: "cooler_requirement",
    facilityId: "facility-1",
    departmentId: "dietary",
    catalogStableKey: "cooler_temperature",
    catalogVersion: 2,
    status: "ACTIVE",
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Cooler Temperature",
    localInstructions: "Record the cooler temperature.",
    targetKind: "OPERATIONAL_TYPE",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: "food_service_area",
    dailyWindows: windows("TWICE_DAILY"),
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-v2",
      name: "Cooler Temperature",
      purposeType: "LOG",
      instructions: "Acceptable range 33–41°F.",
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: "temperature",
          label: "Temperature",
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
    },
    ...overrides,
  };
}

function profile(
  overrides: Partial<ReviewProfileFact> & Pick<ReviewProfileFact, "id" | "version" | "activatedAt">,
): ReviewProfileFact {
  return {
    departmentId: "dietary",
    status: "RETIRED",
    retiredAt: null,
    ...overrides,
  };
}

const earlyProfile = profile({
  id: "profile-sept-1",
  version: 1,
  status: "RETIRED",
  activatedAt: new Date("2026-09-01T14:00:00.000Z"),
  retiredAt: new Date("2026-09-11T14:00:00.000Z"),
});
const laterProfile = profile({
  id: "profile-sept-11",
  version: 2,
  status: "RETIRED",
  activatedAt: new Date("2026-09-11T14:00:00.000Z"),
  retiredAt: new Date("2026-10-01T14:00:00.000Z"),
});
const currentProfile = profile({
  id: "profile-oct-1",
  version: 3,
  status: "ACTIVE",
  activatedAt: new Date("2026-10-01T14:00:00.000Z"),
  retiredAt: null,
});

const bindings: ReviewOtBindingFact[] = [
  { profileId: earlyProfile.id, spaceId: "room-a", operationalTypeKey: "food_service_area", operationalTypeName: "Food Service Area", archetypeIsActive: true },
  { profileId: earlyProfile.id, spaceId: "room-b", operationalTypeKey: "food_service_area", operationalTypeName: "Food Service Area", archetypeIsActive: true },
  { profileId: laterProfile.id, spaceId: "room-b", operationalTypeKey: "food_service_area", operationalTypeName: "Food Service Area", archetypeIsActive: true },
  { profileId: currentProfile.id, spaceId: "room-a", operationalTypeKey: "food_service_area", operationalTypeName: "Food Service Area", archetypeIsActive: true },
  { profileId: currentProfile.id, spaceId: "room-b", operationalTypeKey: "food_service_area", operationalTypeName: "Food Service Area", archetypeIsActive: true },
];

const twice = segment({
  id: "seg-twice",
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveTo: new Date("2026-09-14T00:00:00.000Z"),
  dailyWindows: windows("TWICE_DAILY"),
  catalogVersion: 2,
});
const thrice = segment({
  id: "seg-thrice",
  stableKey: "cooler_requirement_v2",
  effectiveFrom: new Date("2026-09-15T00:00:00.000Z"),
  effectiveTo: null,
  dailyWindows: windows("THREE_TIMES_DAILY"),
  catalogVersion: 3,
  catalogDefinition: {
    ...twice.catalogDefinition,
    id: "cat-v3",
    instructions: "Acceptable range 33–45°F.",
    fields: [
      {
        ...twice.catalogDefinition.fields[0]!,
        maxNumber: 45,
      },
    ],
  },
});

const spaces = [
  { spaceId: "room-a", currentLabel: "Naval Park Dining Pantry" },
  { spaceId: "room-b", currentLabel: "Harbor Kitchen" },
];

function audit(overrides?: Partial<Parameters<typeof auditOperationalRecords>[0]>) {
  return auditOperationalRecords({
    fromDateKey: "2026-09-01",
    toDateKey: "2026-09-30",
    todayKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    facilityTimezone: TZ,
    departmentId: "dietary",
    catalogStableKey: "cooler_temperature",
    locationFunctionKey: "food_service_area",
    segments: [twice, thrice],
    profiles: [earlyProfile, laterProfile, currentProfile],
    bindings,
    spaces,
    placeNames: [],
    records: [],
    waivers: [],
    ...overrides,
  });
}

test("September cooler audit uses each day's cadence and location binding", () => {
  const result = audit();
  const sept5 = result.slots.filter((slot) => slot.serviceDate === "2026-09-05");
  const sept12 = result.slots.filter((slot) => slot.serviceDate === "2026-09-12");
  const sept20 = result.slots.filter((slot) => slot.serviceDate === "2026-09-20");
  assert.equal(new Set(sept5.map((slot) => slot.spaceId)).size, 2);
  assert.equal(sept5.filter((slot) => slot.spaceId === "room-a").length, 2);
  assert.equal(sept12.every((slot) => slot.spaceId === "room-b"), true);
  assert.equal(sept12.length, 2);
  assert.equal(sept20.length, 3);
  assert.equal(sept20.some((slot) => slot.spaceId === "room-a"), false);
  assert.equal(sept5[0]?.catalogVersion, 2);
  assert.equal(sept20[0]?.catalogVersion, 3);
  assert.equal(sept20.every((slot) => slot.slotState === "NOT_COMPLETE"), true);
  assert.equal(result.slots.length, 10 * 4 + 4 * 2 + 16 * 3);

  const oneDay = audit({ fromDateKey: "2026-09-12", toDateKey: "2026-09-12" });
  assert.deepEqual(
    oneDay.slots.map((slot) => [slot.requirementKey, slot.slotState]),
    result.slots
      .filter((slot) => slot.serviceDate === "2026-09-12")
      .map((slot) => [slot.requirementKey, slot.slotState]),
  );
});

test("a closed slot with no Record and no waiver is not complete, and nothing is persisted", () => {
  const result = audit({ fromDateKey: "2026-09-01", toDateKey: "2026-09-01" });
  assert.equal(result.slots.length, 4);
  assert.equal(result.slots.every((slot) => slot.slotState === "NOT_COMPLETE" && slot.record == null), true);
});

test("records, waivers, follow-ups, and corrections stay distinct", () => {
  const preview = audit({ fromDateKey: "2026-09-02", toDateKey: "2026-09-02" });
  const originalKey = preview.slots[0]!.requirementKey;
  const waivedKey = preview.slots[1]!.requirementKey;
  const original: AuditRecordFact = {
    id: "rec-45",
    requirementKey: originalKey,
    logRequirementKey: originalKey,
    followsRecordId: null,
    operationalDateKey: "2026-09-02",
    spaceId: preview.slots[0]!.spaceId,
    templateVersion: 2,
    outOfStandard: true,
    valueNumber: 45,
    valueText: null,
    correctiveActionText: "Door had been left open. Closed door.",
    occurredAt: "2026-09-02T11:04:00.000Z",
    recordedAt: "2026-09-02T11:05:00.000Z",
    recordedByLabel: "Ada",
    placeLabelSnapshot: "Naval Park Servery",
    status: "COMPLETED_WITH_CORRECTIVE_ACTION",
    corrections: [
      {
        previousValue: "37",
        reason: "Entry error",
        actorLabel: "Ada",
        recordedAt: "2026-09-02T11:06:00.000Z",
      },
    ],
  };
  const followUp: AuditRecordFact = {
    ...original,
    id: "rec-38",
    requirementKey: `followup|${original.id}|abc`,
    logRequirementKey: null,
    followsRecordId: original.id,
    valueNumber: 38,
    outOfStandard: false,
    correctiveActionText: null,
    corrections: [],
    occurredAt: "2026-09-02T11:36:00.000Z",
  };
  const result = audit({
    fromDateKey: "2026-09-02",
    toDateKey: "2026-09-02",
    records: [original, followUp],
    waivers: [
      {
        requirementKey: waivedKey,
        operationalDateKey: "2026-09-02",
        reason: "Cooler was empty and offline.",
        actorLabel: "Bea",
        recordedAt: "2026-09-02T12:00:00.000Z",
      },
    ],
  });
  const completed = result.slots.find((slot) => slot.requirementKey === originalKey);
  const waived = result.slots.find((slot) => slot.requirementKey === waivedKey);
  assert.equal(completed?.slotState, "COMPLETE_WITH_CORRECTIVE_ACTION");
  assert.equal(completed?.record?.valueNumber, 45);
  assert.equal(completed?.record?.outOfStandard, true);
  assert.equal(completed?.record?.templateVersion, 2);
  assert.equal(completed?.catalogVersion, 2);
  assert.equal(completed?.followUps[0]?.valueNumber, 38);
  assert.equal(completed?.corrections[0]?.previousValue, "37");
  assert.equal(completed?.placeLabel, "Naval Park Servery");
  assert.equal(completed?.placeLabelCertainty, "SNAPSHOT");
  assert.equal(waived?.slotState, "WAIVED");
  assert.equal(waived?.waiver?.actorLabel, "Bea");
  assert.equal(result.slots.filter((slot) => slot.record?.id === "rec-38").length, 0);
});

test("place names follow recorded renames and do not invent earlier certainty", () => {
  const beforeTracking = resolvePlaceLabel({
    serviceDateKey: "2026-09-03",
    currentLabel: "Naval Park Dining Pantry",
    history: [],
  });
  assert.equal(beforeTracking.certainty, "CURRENT_LABEL");
  assert.equal(beforeTracking.label, "Naval Park Dining Pantry");

  const history = [
    {
      placeId: "room-a",
      placeKind: "SPACE" as const,
      previousLabel: "Naval Park Servery",
      newLabel: "Naval Park Dining Pantry",
      effectiveFromKey: "2026-10-10",
    },
  ];
  assert.equal(
    resolvePlaceLabel({ serviceDateKey: "2026-10-09", currentLabel: "Naval Park Dining Pantry", history }).label,
    "Naval Park Servery",
  );
  assert.equal(
    resolvePlaceLabel({ serviceDateKey: "2026-10-10", currentLabel: "Naval Park Dining Pantry", history }).label,
    "Naval Park Dining Pantry",
  );
  const missing = audit({
    fromDateKey: "2026-09-05",
    toDateKey: "2026-09-05",
    placeNames: history,
  }).slots.find((slot) => slot.spaceId === "room-a");
  assert.equal(missing?.placeLabel, "Naval Park Servery");
  assert.equal(missing?.placeLabelCertainty, "HISTORICAL");
  assert.equal(missing?.record, null);
});

test("waiver policy rejects disallowed and already-recorded slots", () => {
  assert.equal(
    waiverCreateDecision({
      waiverAllowed: false,
      slotAlreadyRecorded: false,
      actorMaySubmit: true,
      reason: "Offline",
    }).ok,
    false,
  );
  assert.equal(
    waiverCreateDecision({
      waiverAllowed: true,
      slotAlreadyRecorded: true,
      actorMaySubmit: true,
      reason: "Offline",
    }).ok,
    false,
  );
  assert.equal(
    waiverCreateDecision({
      waiverAllowed: true,
      slotAlreadyRecorded: false,
      actorMaySubmit: true,
      reason: "Cooler empty.",
    }).ok,
    true,
  );
});

test("operational instructions close and succeed; display labels stay in place", () => {
  const base: AttachmentHistoricalSnapshot = {
    timingMode: "DAILY_WINDOWS",
    dailyWindows: windows("TWICE_DAILY").map(({ label, startLocal, endLocal }) => ({
      label,
      startLocal,
      endLocal,
    })),
    cycleStableKeys: [],
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    allowAdHoc: false,
    catalogDefinitionId: "cat-v2",
    catalogVersion: 2,
    departmentId: "dietary",
    targetKind: "OPERATIONAL_TYPE",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: "food_service_area",
  };
  const instructions = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-14",
    existing: base,
    next: base,
    localDisplayLabelChanged: false,
    localInstructionsChanged: true,
    existingStatus: "ACTIVE",
  });
  assert.equal(instructions.mode, "SUCCESSOR");
  const label = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-14",
    existing: base,
    next: base,
    localDisplayLabelChanged: true,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
  });
  assert.equal(label.mode, "IN_PLACE");
});

test("timing audit uses one source per service date", () => {
  const rows = composeOperationalTimingAudit([
    {
      serviceDateKey: "2026-09-01",
      model: "LEGACY_MILESTONES",
      keyPointStableKey: "breakfast_service_started",
      keyPointLabel: "Service Started",
      cycleVersion: null,
      plannedLocal: "08:00",
      adjustedLocal: null,
      locationId: "room-a",
      locationLabel: "Naval Park",
      canonicalActual: { actualLocal: "08:10", recordedAt: "2026-09-01T12:10:00.000Z", cycleVersion: 4 },
      legacyActual: { occurredAt: "08:05", recordedAt: "2026-09-01T12:06:00.000Z" },
    },
    {
      serviceDateKey: "2026-09-15",
      model: "CANONICAL_KEY_POINTS",
      keyPointStableKey: "breakfast_service_started",
      keyPointLabel: "Service Started",
      cycleVersion: 4,
      plannedLocal: "08:00",
      adjustedLocal: "08:15",
      locationId: "room-a",
      locationLabel: "Naval Park",
      canonicalActual: { actualLocal: "08:12", recordedAt: "2026-09-15T12:12:00.000Z", cycleVersion: 4 },
      legacyActual: { occurredAt: "08:05", recordedAt: "2026-09-15T12:06:00.000Z" },
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.source, "LEGACY_MILESTONE");
  assert.equal(rows[0]?.actual, "08:05");
  assert.equal(rows[1]?.source, "CANONICAL_KEY_POINT_ACTUAL");
  assert.equal(rows[1]?.actual, "08:12");
  assert.equal(rows[1]?.cycleVersion, 4);
});

test("legacy dates stay outside canonical Record slots", () => {
  const result = audit({
    fromDateKey: "2026-08-28",
    toDateKey: "2026-09-02",
    legacyLogDates: ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"],
  });
  assert.deepEqual(result.legacyDates, ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"]);
  assert.equal(result.slots.some((slot) => slot.serviceDate.startsWith("2026-08")), false);
  assert.match(auditRecordsToCsv(result.slots), /CANONICAL_RECORD/);
});

test("audit loads facts in batches and Log Book stays submitted records", () => {
  const loader = readFileSync(new URL("./load-audit-records.ts", import.meta.url), "utf8");
  assert.match(loader, /Promise\.all/);
  assert.match(loader, /operationalEvidenceRecord\.findMany/);
  assert.doesNotMatch(loader, /for \(const slot/);
  const logBook = readFileSync(
    new URL("../operational-evidence/log-book.ts", import.meta.url),
    "utf8",
  );
  assert.match(logBook, /operationalEvidenceRecord\.findMany/);
  assert.doesNotMatch(logBook, /auditOperationalRecords/);
  const timing = readFileSync(new URL("./load-timing-audit.ts", import.meta.url), "utf8");
  assert.match(timing, /Promise\.all/);
  assert.match(timing, /selectDietaryMealTimingModel/);
  assert.match(timing, /operationalCycleKeyPointActual\.findMany/);
  assert.doesNotMatch(timing, /for \(const slot/);
  const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  for (const model of ASSET_HISTORY_SOURCES) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.doesNotMatch(schema, /model AssetHistoryEntry/);
  assert.doesNotMatch(schema, /model LocationHistoryEntry/);
});
