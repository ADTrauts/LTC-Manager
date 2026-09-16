import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  dayAfter,
  dayBefore,
  effectiveDateRangesOverlap,
  isCycleEffectiveOnDate,
  latestDraftEditedAt,
  minimumPublishEffectiveFrom,
  nextOperationalDayKey,
  partitionCyclesForLifecycle,
  reviewDraftChangesAgainstCurrent,
  type CycleLifecycleRow,
} from "@/lib/operational-cycles";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

function row(
  overrides: Partial<CycleLifecycleRow> &
    Pick<CycleLifecycleRow, "id" | "stableKey" | "label" | "status">,
): CycleLifecycleRow {
  const now = new Date("2026-08-10T12:00:00.000Z");
  return {
    version: 1,
    description: null,
    cycleType: "SERVICE",
    nodeKind: "PERIOD",
    displaySequence: 100,
    startLocal: "17:00",
    endLocal: "19:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: facilityLocalDateToServiceDate("2026-08-01"),
    effectiveTo: null,
    mealType: "DINNER",
    locationMode: "UNIT_TYPES",
    locationInheritFromParent: false,
    applicableUnitTypes: ["SERVERY"],
    expectedMilestones: ["READY"],
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    publishedAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    parentStableKey: overrides.parentStableKey ?? null,
  };
}

test("next operational day is calendar +1 (7-day week, not Mon–Fri)", () => {
  assert.equal(nextOperationalDayKey("2026-08-07"), "2026-08-08"); // Fri → Sat
  assert.equal(nextOperationalDayKey("2026-08-08"), "2026-08-09"); // Sat → Sun
  assert.equal(dayBefore("2026-08-10"), "2026-08-09");
  assert.equal(dayAfter("2026-08-10"), "2026-08-11");
});

test("minimum publish effectiveFrom protects current day when config exists", () => {
  assert.equal(
    minimumPublishEffectiveFrom({
      todayKey: "2026-08-10",
      hasCurrentEffectiveConfig: true,
    }),
    "2026-08-11",
  );
  assert.equal(
    minimumPublishEffectiveFrom({
      todayKey: "2026-08-10",
      hasCurrentEffectiveConfig: false,
    }),
    "2026-08-10",
  );
});

test("publishCycle documents allowImmediate for same-day activation", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /allowImmediate\?:/);
  assert.match(service, /"immediate"/);
});

test("publishCycle loads Key Time groups before publish validation", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  const publishFn = service.slice(service.indexOf("export async function publishCycle"));
  assert.match(publishFn, /departmentOperationalCycleKeyTimeGroup\.findMany/);
  assert.match(publishFn, /keyTimeGroups: keyTimeGroupRows/);
  assert.match(publishFn, /mapped\.keyTimeGroups/);
});

test("partitionCyclesForLifecycle separates current / draft / scheduled / history", () => {
  const today = "2026-08-10";
  const current = row({
    id: "c1",
    stableKey: "dinner",
    label: "Dinner",
    status: "PUBLISHED",
    startLocal: "17:00",
    effectiveFrom: facilityLocalDateToServiceDate("2026-08-01"),
  });
  const draft = row({
    id: "d1",
    stableKey: "dinner",
    label: "Dinner",
    status: "DRAFT",
    version: 2,
    startLocal: "17:15",
    effectiveFrom: facilityLocalDateToServiceDate("2026-08-11"),
    updatedAt: new Date("2026-08-10T15:00:00.000Z"),
  });
  const scheduled = row({
    id: "s1",
    stableKey: "breakfast",
    label: "Breakfast",
    status: "PUBLISHED",
    startLocal: "07:00",
    mealType: "BREAKFAST",
    effectiveFrom: facilityLocalDateToServiceDate("2026-08-15"),
  });
  const history = row({
    id: "h1",
    stableKey: "lunch",
    label: "Lunch",
    status: "RETIRED",
    version: 1,
    startLocal: "12:00",
    mealType: "LUNCH",
    effectiveFrom: facilityLocalDateToServiceDate("2026-07-01"),
    effectiveTo: facilityLocalDateToServiceDate("2026-07-31"),
    retiredAt: new Date("2026-08-01T00:00:00.000Z"),
  });

  const parts = partitionCyclesForLifecycle(
    [current, draft, scheduled, history],
    today,
  );
  assert.deepEqual(
    parts.current.map((c) => c.id),
    ["c1"],
  );
  assert.deepEqual(
    parts.drafts.map((c) => c.id),
    ["d1"],
  );
  assert.deepEqual(
    parts.scheduled.map((c) => c.id),
    ["s1"],
  );
  assert.deepEqual(
    parts.history.map((c) => c.id),
    ["h1"],
  );
  assert.equal(parts.currentEffectiveSince, "2026-08-01");
  assert.equal(isCycleEffectiveOnDate(current, today), true);
  assert.equal(isCycleEffectiveOnDate(scheduled, today), false);
});

test("partitionCyclesForLifecycle keeps only the latest draft per stableKey", () => {
  const parts = partitionCyclesForLifecycle(
    [
      row({
        id: "cleanup-v2",
        stableKey: "breakfast_cleanup",
        label: "Cleanup",
        status: "DRAFT",
        version: 2,
        parentStableKey: "breakfast",
        locationInheritFromParent: true,
      }),
      row({
        id: "cleanup-v3",
        stableKey: "breakfast_cleanup",
        label: "Cleanup",
        status: "DRAFT",
        version: 3,
        parentStableKey: "breakfast",
        locationInheritFromParent: true,
      }),
    ],
    "2026-08-17",
  );
  assert.deepEqual(
    parts.drafts.map((c) => c.id),
    ["cleanup-v3"],
  );
});

test("reviewDraftChangesAgainstCurrent surfaces timing and label changes", () => {
  const current = [
    row({
      id: "c1",
      stableKey: "dinner",
      label: "Dinner",
      status: "PUBLISHED",
      startLocal: "17:00",
      endLocal: "19:00",
    }),
  ];
  const drafts = [
    row({
      id: "d1",
      stableKey: "dinner",
      label: "Dinner service",
      status: "DRAFT",
      version: 2,
      startLocal: "17:15",
      endLocal: "19:00",
    }),
    row({
      id: "d2",
      stableKey: "snack",
      label: "Snack",
      status: "DRAFT",
      startLocal: "15:00",
      endLocal: "15:30",
      mealType: null,
    }),
  ];
  const changes = reviewDraftChangesAgainstCurrent({ drafts, current });
  assert.ok(changes.some((c) => c.kind === "label"));
  assert.ok(changes.some((c) => c.kind === "timing" && c.summary.includes("17:15")));
  assert.ok(changes.some((c) => c.kind === "added" && c.stableKey === "snack"));
});

test("review shows human-readable hierarchy moves and nested adds", () => {
  const current = [
    row({
      id: "c-breakfast",
      stableKey: "breakfast",
      label: "Breakfast",
      status: "PUBLISHED",
      parentStableKey: null,
    }),
    row({
      id: "c-lunch",
      stableKey: "lunch",
      label: "Lunch",
      status: "PUBLISHED",
      parentStableKey: null,
    }),
    row({
      id: "c-servery",
      stableKey: "servery",
      label: "Servery Service",
      status: "PUBLISHED",
      parentStableKey: "breakfast",
    }),
  ];
  const drafts = [
    row({
      id: "d-servery",
      stableKey: "servery",
      label: "Servery Service",
      status: "DRAFT",
      version: 2,
      parentStableKey: "lunch",
    }),
    row({
      id: "d-retail",
      stableKey: "retail",
      label: "Retail Breakfast",
      status: "DRAFT",
      parentStableKey: "breakfast",
      startLocal: "07:00",
      endLocal: "10:00",
    }),
  ];
  const changes = reviewDraftChangesAgainstCurrent({ drafts, current });
  const moved = changes.find((c) => c.kind === "parent" && c.stableKey === "servery");
  assert.ok(moved);
  assert.match(moved!.summary, /moved from “Breakfast” to “Lunch”/);
  assert.doesNotMatch(moved!.summary, /parentStableKey/);
  const added = changes.find((c) => c.kind === "added" && c.stableKey === "retail");
  assert.ok(added);
  assert.match(added!.summary, /Added “Retail Breakfast” under “Breakfast”/);
});

test("review shows scope and changed meal times only", () => {
  const current = [
    row({
      id: "c1",
      stableKey: "breakfast_service",
      label: "Breakfast Service",
      status: "PUBLISHED",
      locationMode: "ALL_DEPARTMENT_UNITS",
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      milestoneTimes: [
        { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:15" },
        { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
      ],
    }),
  ];
  const drafts = [
    row({
      id: "d1",
      stableKey: "breakfast_service",
      label: "Breakfast Service",
      status: "DRAFT",
      version: 2,
      locationMode: "ROOM_TYPE",
      roomTypeKey: "servery",
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      milestoneTimes: [
        { unitId: "np", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
        { unitId: "lh", milestone: "SERVICE_STARTED", configuredTime: "07:20" },
      ],
    }),
  ];
  const changes = reviewDraftChangesAgainstCurrent({
    drafts,
    current,
    unitNames: { np: "Naval Park", lh: "Lighthouse" },
  });
  assert.ok(changes.some((c) => c.kind === "location" && c.summary.includes("Room Type: Servery")));
  const times = changes.find((c) => c.kind === "service_times");
  assert.ok(times);
  assert.match(times!.summary, /Naval Park 07:15 → 07:20/);
  assert.doesNotMatch(times!.summary, /Lighthouse/);
});

test("effective date ranges overlap helper", () => {
  assert.equal(
    effectiveDateRangesOverlap("2026-08-01", null, "2026-08-10", "2026-08-20"),
    true,
  );
  assert.equal(
    effectiveDateRangesOverlap("2026-08-01", "2026-08-09", "2026-08-10", null),
    false,
  );
});

test("draft edits are independent of current row identity", () => {
  const current = row({
    id: "published-dinner",
    stableKey: "dinner",
    label: "Dinner",
    status: "PUBLISHED",
    startLocal: "17:00",
  });
  const draft = row({
    id: "draft-dinner",
    stableKey: "dinner",
    label: "Dinner",
    status: "DRAFT",
    version: 2,
    startLocal: "17:15",
  });
  assert.notEqual(current.id, draft.id);
  assert.equal(current.startLocal, "17:00");
  assert.equal(draft.startLocal, "17:15");
  const parts = partitionCyclesForLifecycle([current, draft], "2026-08-10");
  assert.equal(parts.current[0]?.startLocal, "17:00");
  assert.equal(parts.drafts[0]?.startLocal, "17:15");
});
