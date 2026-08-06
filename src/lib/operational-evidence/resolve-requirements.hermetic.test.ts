import assert from "node:assert/strict";
import test from "node:test";

import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import { resolveEvidenceRequirements } from "./resolve-requirements";
import type {
  PublishedCycleWindowForResolve,
  PublishedTemplateForResolve,
  TemplateFieldSnapshot,
} from "./types";

const field: TemplateFieldSnapshot = {
  fieldKey: "temp",
  label: "Temp",
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

function template(
  overrides?: Partial<PublishedTemplateForResolve>,
): PublishedTemplateForResolve {
  return {
    id: "tmpl1",
    stableKey: "cooler_temp",
    version: 1,
    name: "Cooler Temperature Log",
    description: null,
    instructions: "Check cooler.",
    purposeType: "LOG",
    status: "PUBLISHED",
    allowAdHoc: false,
    fields: [field],
    applicabilities: [],
    schedules: [
      {
        kind: "FIXED_DAILY_WINDOW",
        cycleStableKey: null,
        windowStartLocal: "07:00",
        windowEndLocal: "09:00",
      },
    ],
    ...overrides,
  };
}

function cycleWindow(
  overrides?: Partial<PublishedCycleWindowForResolve>,
): PublishedCycleWindowForResolve {
  const startLocal = overrides?.startLocal ?? "07:00";
  const endLocal = overrides?.endLocal ?? "09:00";
  const operationalDateKey = "2026-08-06";
  const window =
    overrides?.startsAt && overrides?.endsAt
      ? { startsAt: overrides.startsAt, endsAt: overrides.endsAt }
      : resolveCycleWindowInstants({
          operationalDateKey,
          startLocal,
          endLocal,
          overnight: false,
          facilityTimezone: "UTC",
        });
  assert.ok(window);
  return {
    stableKey: overrides?.stableKey ?? "morning_prep",
    label: overrides?.label ?? "Morning Prep",
    startLocal,
    endLocal,
    overnight: false,
    startsAt: window!.startsAt,
    endsAt: window!.endsAt,
    ...overrides,
  };
}

test("draft templates never appear", () => {
  const reqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: [template({ status: "DRAFT" })],
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs.length, 0);
});

test("UPCOMING before window; DUE inside; NOT_CONFIRMED after", () => {
  const published = [template()];
  const upcoming = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T06:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0]!.state, "UPCOMING");
  assert.equal(upcoming[0]!.stateLabel, "Upcoming");

  const due = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(due[0]!.state, "DUE");

  const late = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T10:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(late[0]!.state, "NOT_CONFIRMED");
  assert.equal(late[0]!.stateLabel, "Record Not Submitted");
});

test("does not mark future window as NOT_CONFIRMED", () => {
  const reqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T05:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: [template()],
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs[0]!.state, "UPCOMING");
  assert.notEqual(reqs[0]!.state, "NOT_CONFIRMED");
});

test("existing record projects COMPLETED states", () => {
  const published = [template()];
  const due = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
  });
  const key = due[0]!.requirementKey;

  const completed = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T10:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [
      {
        id: "rec1",
        requirementKey: key,
        status: "COMPLETED",
        templateStableKey: "cooler_temp",
        templateVersion: 1,
      },
    ],
  });
  assert.equal(completed[0]!.state, "COMPLETED");
  assert.equal(completed[0]!.recordId, "rec1");

  const withCorrective = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T10:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [
      {
        id: "rec2",
        requirementKey: key,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        templateStableKey: "cooler_temp",
        templateVersion: 1,
      },
    ],
  });
  assert.equal(withCorrective[0]!.state, "COMPLETED_WITH_CORRECTIVE_ACTION");
});

test("pending offline key yields SAVED_ON_THIS_TABLET", () => {
  const published = [template()];
  const due = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
  });
  const key = due[0]!.requirementKey;
  const pending = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: [],
    existingRecords: [],
    pendingOfflineKeys: [key],
  });
  assert.equal(pending[0]!.state, "SAVED_ON_THIS_TABLET");
});

test("OPERATIONAL_CYCLE schedule uses published cycle windows", () => {
  const published = [
    template({
      schedules: [
        {
          kind: "OPERATIONAL_CYCLE",
          cycleStableKey: "morning_prep",
          windowStartLocal: null,
          windowEndLocal: null,
        },
      ],
    }),
  ];
  const cycles = [cycleWindow()];
  const due = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: published,
    publishedCycles: cycles,
    existingRecords: [],
  });
  assert.equal(due.length, 1);
  assert.equal(due[0]!.state, "DUE");
  assert.equal(due[0]!.cycleStableKey, "morning_prep");
  assert.equal(due[0]!.cycleLabel, "Morning Prep");
});

test("missing cycle yields NOT_CONFIGURED", () => {
  const reqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedTemplates: [
      template({
        schedules: [
          {
            kind: "OPERATIONAL_CYCLE",
            cycleStableKey: "missing_cycle",
            windowStartLocal: null,
            windowEndLocal: null,
          },
        ],
      }),
    ],
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs[0]!.state, "NOT_CONFIGURED");
});

test("facility-local and UTC windows agree via explicit now", () => {
  const nyWindow = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "07:00",
    endLocal: "09:00",
    overnight: false,
    facilityTimezone: "America/New_York",
  });
  assert.ok(nyWindow);

  const utcEquivalentNow = new Date(nyWindow!.startsAt.getTime() + 30 * 60 * 1000);

  const nyReqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: utcEquivalentNow,
    facilityTimezone: "America/New_York",
    publishedTemplates: [template()],
    publishedCycles: [],
    existingRecords: [],
  });

  const utcWindow = resolveCycleWindowInstants({
    operationalDateKey: "2026-08-06",
    startLocal: "07:00",
    endLocal: "09:00",
    overnight: false,
    facilityTimezone: "UTC",
  });
  assert.ok(utcWindow);
  const utcNow = new Date(utcWindow!.startsAt.getTime() + 30 * 60 * 1000);
  const utcReqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: utcNow,
    facilityTimezone: "UTC",
    publishedTemplates: [template()],
    publishedCycles: [],
    existingRecords: [],
  });

  assert.equal(nyReqs[0]!.state, "DUE");
  assert.equal(utcReqs[0]!.state, "DUE");
  assert.notEqual(nyReqs[0]!.windowStartsAt!.getTime(), utcReqs[0]!.windowStartsAt!.getTime());
});

test("ASSET_TYPE expands to matching assets", () => {
  const reqs = resolveEvidenceRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    assets: [
      { id: "a1", equipmentType: "COOLER", unitId: "u1" },
      { id: "a2", equipmentType: "DISHWASHER", unitId: "u1" },
    ],
    publishedTemplates: [
      template({
        applicabilities: [{ kind: "ASSET_TYPE", assetId: null, assetType: "COOLER", spaceId: null, spaceType: null, unitId: null }],
      }),
    ],
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.assetId, "a1");
});
