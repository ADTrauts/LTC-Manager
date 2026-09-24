import assert from "node:assert/strict";
import test from "node:test";

import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";

import { attachmentHistoryReliability, catalogDefinitionForHistory } from "./historical-attachment";
import type { ReviewAttachmentSegmentFact } from "./types";

const TZ = "America/New_York";

function segment(overrides?: Partial<ReviewAttachmentSegmentFact>): ReviewAttachmentSegmentFact {
  return {
    id: "att-1",
    stableKey: "att_cooler_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
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
    assetId: "cooler-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: daypartWindowsForCadence("TWICE_DAILY").map((w, i) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      displaySequence: (i + 1) * 10,
    })),
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-1",
      name: "Cooler Temperature Log",
      purposeType: "LOG",
      instructions: null,
      status: "PUBLISHED",
      fields: [],
    },
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

test("successor lineage remains reliable for the closed prior interval", () => {
  const prior = segment({
    id: "att-1",
    stableKey: "att_cooler_1",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
    status: "INACTIVE",
    updatedAt: new Date("2026-09-02T16:00:00.000Z"),
  });
  const successor = segment({
    id: "att-2",
    stableKey: "att_cooler_2",
    effectiveFrom: new Date("2026-09-02T00:00:00.000Z"),
    dailyWindows: daypartWindowsForCadence("THREE_TIMES_DAILY").map((w, i) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      displaySequence: (i + 1) * 10,
    })),
  });
  const result = attachmentHistoryReliability({
    segments: [prior, successor],
    lineageSegments: [prior, successor],
    serviceDateKey: "2026-09-01",
    timezone: TZ,
  });
  assert.equal(result.status, "reliable");
  if (result.status !== "reliable") return;
  assert.equal(result.covering.id, "att-1");
});

test("in-place mutation without a successor is unavailable for earlier dates", () => {
  const mutated = segment({
    updatedAt: new Date("2026-09-06T16:00:00.000Z"),
    dailyWindows: daypartWindowsForCadence("THREE_TIMES_DAILY").map((w, i) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      displaySequence: (i + 1) * 10,
    })),
  });
  const result = attachmentHistoryReliability({
    segments: [mutated],
    lineageSegments: [mutated],
    serviceDateKey: "2026-09-03",
    timezone: TZ,
  });
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") return;
  assert.equal(result.reason, "attachment_history_not_reliable");
});

test("retired catalog definition is still usable for historical resolution", () => {
  const retired = catalogDefinitionForHistory(
    segment({
      catalogDefinition: {
        id: "cat-1",
        name: "Cooler Temperature Log",
        purposeType: "LOG",
        instructions: null,
        status: "RETIRED",
        fields: [],
      },
    }),
  );
  assert.equal(retired.catalogDefinition.status, "PUBLISHED");
  assert.equal(retired.catalogDefinition.id, "cat-1");
});
