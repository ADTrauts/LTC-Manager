import assert from "node:assert/strict";
import test from "node:test";

import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import { mapTimingModeToScheduleKind } from "./schedule-kind";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import { buildCanonicalLogSubmissionSnapshot } from "./snapshot";
import { normalizeAttachmentTarget } from "./attachment-validate";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";

test("seed includes cooler, dishwashers, opening checklist, food temp, ice machine, receiving, freezer, sanitizer", () => {
  const keys = [...new Set(CATALOG_SEED_DEFINITIONS.map((d) => d.stableKey))].sort();
  assert.deepEqual(keys, [
    "cooler_temperature_log",
    "food_temperature_log",
    "freezer_temperature_log",
    "high_temp_dishwasher_log",
    "ice_machine_cleaning_log",
    "low_temp_chemical_dishwasher_log",
    "opening_checklist",
    "receiving_temperature_log",
    "three_bay_sink_sanitizer_log",
  ]);
  assert.equal(
    CATALOG_SEED_DEFINITIONS.find((d) => d.stableKey === "cooler_temperature_log")?.recommendedCadence,
    "TWICE_DAILY",
  );
  const iceV2 = CATALOG_SEED_DEFINITIONS.find(
    (d) => d.stableKey === "ice_machine_cleaning_log" && d.version === 2,
  );
  assert.equal(iceV2?.recommendedCadence, "WEEKLY");
  assert.deepEqual(iceV2?.recommendedDaypartLabels, ["Tuesday"]);
  assert.match(iceV2?.description ?? "", /operational default/i);
  assert.doesNotMatch(iceV2?.description ?? "", /regulat/i);
  assert.equal(
    CATALOG_SEED_DEFINITIONS.find((d) => d.stableKey === "opening_checklist")?.purposeType,
    "CHECKLIST",
  );
});

test("timing mode maps to Evidence scheduleKind without MealType", () => {
  assert.equal(mapTimingModeToScheduleKind("DAILY_WINDOWS"), "FIXED_DAILY_WINDOW");
  assert.equal(mapTimingModeToScheduleKind("OPERATIONAL_CYCLE"), "OPERATIONAL_CYCLE");
  assert.equal(mapTimingModeToScheduleKind("CALENDAR"), "ONCE_PER_OPERATIONAL_DATE");
  assert.equal(mapTimingModeToScheduleKind("AD_HOC"), "AD_HOC");
});

test("normalizeAttachmentTarget rejects multi-target combinations", () => {
  assert.throws(() =>
    normalizeAttachmentTarget({
      kind: "ASSET",
      assetId: "a1",
      spaceId: "s1",
    }),
  );
  assert.deepEqual(normalizeAttachmentTarget({ kind: "FACILITY" }).target, { kind: "FACILITY" });
});

function coolerAttachment(overrides?: Partial<Parameters<typeof resolveLogRequirementsForAttachment>[0]["attachment"]>) {
  const windows = daypartWindowsForCadence("TWICE_DAILY");
  return {
    id: "att1",
    stableKey: "att_cooler_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE" as const,
    effectiveFrom: new Date("2026-09-13T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS" as const,
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [] as number[],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "ASSET" as const,
    assetId: "cooler-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: windows.map((w, i) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      displaySequence: (i + 1) * 10,
    })),
    cycleSelections: [] as Array<{ cycleStableKey: string; displaySequence: number }>,
    catalogDefinition: {
      id: "cat1",
      name: "Cooler Temperature Log",
      purposeType: "LOG" as const,
      instructions: "Check cooler.",
      status: "PUBLISHED" as const,
      fields: [
        {
          fieldKey: "cooler_temperature",
          label: "Cooler temperature",
          fieldType: "TEMPERATURE" as const,
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

test("twice-daily Attachment yields two deterministic requirements; refresh is idempotent", () => {
  const attachment = coolerAttachment();
  const now = new Date("2026-09-13T14:00:00.000Z"); // afternoon in NY roughly
  const a = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  const b = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(a.length, 2);
  assert.deepEqual(
    a.map((r) => r.requirementKey),
    b.map((r) => r.requirementKey),
  );
  assert.ok(a.every((r) => r.productState !== "NEEDS_SETUP"));
});

test("Evidence completion satisfies one window; other remains open", () => {
  const attachment = coolerAttachment();
  const now = new Date("2026-09-13T14:00:00.000Z");
  const first = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  const key = first[0]!.requirementKey;
  const after = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [
      {
        id: "rec1",
        requirementKey: key,
        logRequirementKey: key,
        status: "COMPLETED",
      },
    ],
  });
  assert.equal(after.find((r) => r.requirementKey === key)?.productState, "COMPLETED");
  assert.equal(
    after.filter((r) => r.productState === "COMPLETED").length,
    1,
  );
  assert.equal(after.length, 2);
});

test("missing cycleStableKey yields Needs Setup; no MealType dependency", () => {
  const attachment = coolerAttachment({
    timingMode: "OPERATIONAL_CYCLE",
    dailyWindows: [],
    cycleSelections: [{ cycleStableKey: "breakfast", displaySequence: 10 }],
  });
  const reqs = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now: new Date("2026-09-13T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.productState, "NEEDS_SETUP");
  assert.equal(reqs[0]!.cycleStableKey, "breakfast");
});

test("cycle stable key resolves through published window version change", () => {
  const attachment = coolerAttachment({
    timingMode: "OPERATIONAL_CYCLE",
    dailyWindows: [],
    cycleSelections: [
      { cycleStableKey: "breakfast", displaySequence: 10 },
      { cycleStableKey: "lunch", displaySequence: 20 },
    ],
  });
  const window = resolveCycleWindowInstants({
    operationalDateKey: "2026-09-13",
    startLocal: "05:30",
    endLocal: "10:00",
    overnight: false,
    facilityTimezone: "America/New_York",
  });
  assert.ok(window);
  const lunch = resolveCycleWindowInstants({
    operationalDateKey: "2026-09-13",
    startLocal: "10:00",
    endLocal: "14:00",
    overnight: false,
    facilityTimezone: "America/New_York",
  });
  assert.ok(lunch);

  const reqs = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now: new Date("2026-09-13T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [
      {
        stableKey: "breakfast",
        label: "Breakfast",
        startLocal: "05:30",
        endLocal: "10:00",
        overnight: false,
        startsAt: window!.startsAt,
        endsAt: window!.endsAt,
      },
      {
        stableKey: "lunch",
        label: "Lunch",
        startLocal: "10:00",
        endLocal: "14:00",
        overnight: false,
        startsAt: lunch!.startsAt,
        endsAt: lunch!.endsAt,
      },
    ],
    existingRecords: [],
  });
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.productState !== "NEEDS_SETUP"));
  assert.deepEqual(
    reqs.map((r) => r.cycleStableKey).sort(),
    ["breakfast", "lunch"],
  );
});

test("ad hoc Attachment generates no scheduled requirements", () => {
  const attachment = coolerAttachment({
    timingMode: "AD_HOC",
    allowAdHoc: true,
    dailyWindows: [],
  });
  const reqs = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now: new Date(),
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs.length, 0);
});

test("snapshot schema version 2 includes Catalog + Attachment", () => {
  const snap = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: "c1",
      stableKey: "cooler_temperature_log",
      version: 1,
      name: "Cooler Temperature Log",
      description: null,
      instructions: "Check",
      purposeType: "LOG",
      category: "TEMPERATURE",
      recommendedCadence: "TWICE_DAILY",
      fields: [],
    },
    attachment: {
      id: "a1",
      stableKey: "att1",
      departmentId: "d1",
      status: "ACTIVE",
      localDisplayLabel: null,
      localInstructions: null,
      timingMode: "DAILY_WINDOWS",
      targetKind: "ASSET",
      target: { kind: "ASSET", assetId: "cooler-1" },
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
      windowOrdinal: 0,
    },
  });
  assert.equal(snap.snapshotSchemaVersion, 2);
  assert.equal(snap.kind, "CANONICAL_LOG");
  assert.equal(snap.catalog.stableKey, "cooler_temperature_log");
  assert.equal(snap.attachment.stableKey, "att1");
});
