import assert from "node:assert/strict";
import test from "node:test";

import {
  attachmentHasBecomeEffective,
  attachmentLineageKey,
  attachmentRangesOverlap,
  classifyAttachmentUpdate,
  historicalSnapshotsEqual,
  retireCloseDateKey,
  successorEffectiveFromKey,
  timingSnapshotsEqual,
  type AttachmentHistoricalSnapshot,
} from "./attachment-update-policy";

function snap(overrides?: Partial<AttachmentHistoricalSnapshot>): AttachmentHistoricalSnapshot {
  return {
    timingMode: "DAILY_WINDOWS",
    dailyWindows: [
      { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
      { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
    ],
    cycleStableKeys: [],
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    allowAdHoc: false,
    catalogDefinitionId: "cat-v1",
    catalogVersion: 1,
    departmentId: "dept-1",
    targetKind: "ASSET",
    assetId: "asset-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    ...overrides,
  };
}

test("lineage key groups Catalog + target, not Attachment row id", () => {
  assert.equal(
    attachmentLineageKey({
      catalogStableKey: "cooler_temperature_log",
      targetKind: "ASSET",
      assetId: "a1",
      spaceId: null,
      unitId: null,
      targetDepartmentId: null,
    }),
    "cooler_temperature_log|ASSET|a1",
  );
});

test("not-yet-effective attachments may edit in place", () => {
  assert.equal(
    attachmentHasBecomeEffective({ effectiveFromKey: "2026-09-16", todayKey: "2026-09-15" }),
    false,
  );
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-16",
    todayKey: "2026-09-15",
    existing: snap(),
    next: snap({
      dailyWindows: [
        { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
        { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
        { label: "Evening", startLocal: "16:00", endLocal: "21:00" },
      ],
    }),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
    nextStatus: "ACTIVE",
  });
  assert.equal(classified.mode, "IN_PLACE");
});

test("effective timing change creates a successor starting next service day", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-15",
    existing: snap(),
    next: snap({
      dailyWindows: [
        { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
        { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
        { label: "Evening", startLocal: "16:00", endLocal: "21:00" },
      ],
    }),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
    nextStatus: "ACTIVE",
  });
  assert.equal(classified.mode, "SUCCESSOR");
  assert.equal(classified.closeEffectiveToKey, "2026-09-15");
  assert.equal(classified.successorFromKey, successorEffectiveFromKey("2026-09-15"));
  assert.equal(classified.successorFromKey, "2026-09-16");
});

test("label/instructions stay in-place even when already effective", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-15",
    existing: snap(),
    next: snap(),
    localDisplayLabelChanged: true,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
    nextStatus: "ACTIVE",
  });
  assert.equal(classified.mode, "IN_PLACE");
});

test("catalog version adopt is a successor", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-15",
    existing: snap({ catalogDefinitionId: "cat-v3", catalogVersion: 3 }),
    next: snap({ catalogDefinitionId: "cat-v4", catalogVersion: 4 }),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
    nextStatus: "ACTIVE",
  });
  assert.equal(classified.mode, "SUCCESSOR");
  assert.equal(historicalSnapshotsEqual(snap({ catalogVersion: 3 }), snap({ catalogVersion: 4 })), false);
});

test("retirement closes today for an effective Attachment", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-10",
    existing: snap(),
    next: snap(),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
    nextStatus: "RETIRED",
  });
  assert.equal(classified.mode, "CLOSE_ONLY");
  assert.equal(classified.closeEffectiveToKey, "2026-09-10");
  assert.equal(classified.successorFromKey, null);
});

test("retiring a future Attachment does not cover unintended dates", () => {
  assert.equal(
    retireCloseDateKey({ effectiveFromKey: "2026-09-16", todayKey: "2026-09-15" }),
    "2026-09-15",
  );
});

test("reactivation of a retired Attachment is a successor, not a reopen", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-15",
    existing: snap(),
    next: snap(),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "RETIRED",
    nextStatus: "ACTIVE",
    existingEffectiveToKey: "2026-09-10",
  });
  assert.equal(classified.mode, "SUCCESSOR");
  assert.equal(classified.closeEffectiveToKey, "2026-09-10");
  assert.equal(classified.successorFromKey, "2026-09-16");
});

test("inactive closed segment also reactivates as a successor", () => {
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-09-01",
    todayKey: "2026-09-15",
    existing: snap(),
    next: snap({
      dailyWindows: [{ label: "Morning", startLocal: "05:00", endLocal: "11:00" }],
    }),
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "INACTIVE",
    nextStatus: "ACTIVE",
    existingEffectiveToKey: "2026-09-14",
  });
  assert.equal(classified.mode, "SUCCESSOR");
  assert.equal(classified.successorFromKey, "2026-09-16");
});

test("cycle selection change is historical-significant", () => {
  assert.equal(
    timingSnapshotsEqual(
      {
        timingMode: "OPERATIONAL_CYCLE",
        dailyWindows: [],
        cycleStableKeys: ["breakfast", "lunch"],
        calendarCadence: null,
        calendarDaysOfWeek: [],
        calendarDayOfMonth: null,
        calendarDueTimeLocal: null,
        allowAdHoc: false,
      },
      {
        timingMode: "OPERATIONAL_CYCLE",
        dailyWindows: [],
        cycleStableKeys: ["breakfast", "lunch", "dinner"],
        calendarCadence: null,
        calendarDaysOfWeek: [],
        calendarDayOfMonth: null,
        calendarDueTimeLocal: null,
        allowAdHoc: false,
      },
    ),
    false,
  );
});

test("successor ranges do not overlap: old through today, new from tomorrow", () => {
  assert.equal(
    attachmentRangesOverlap(
      { fromKey: "2026-09-01", toKey: "2026-09-15" },
      { fromKey: "2026-09-16", toKey: null },
    ),
    false,
  );
  assert.equal(
    attachmentRangesOverlap(
      { fromKey: "2026-09-01", toKey: null },
      { fromKey: "2026-09-16", toKey: null },
    ),
    true,
  );
});
