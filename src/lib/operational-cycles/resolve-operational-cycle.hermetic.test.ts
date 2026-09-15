import assert from "node:assert/strict";
import test from "node:test";

import { resolveOperationalCycle } from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "id" | "label" | "startLocal" | "endLocal">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST",
    locationMode: "ALL_DEPARTMENT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    ...overrides,
    parentStableKey: overrides.parentStableKey ?? null,
  };
}

test("no published cycles yields NOT_CONFIGURED", () => {
  const ctx = resolveOperationalCycle({
    cycles: [],
    now: new Date("2026-08-06T12:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
  if (ctx.state === "NOT_CONFIGURED") {
    assert.equal(ctx.reason, "NO_PUBLISHED_CYCLES");
  }
});

test("drafts are ignored for runtime", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "d1",
        label: "Draft Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        status: "DRAFT",
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
});

test("ROOM_TYPE scope uses child Room Type keys not Unit.unitType", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast Service",
        startLocal: "07:00",
        endLocal: "09:00",
        locationMode: "ROOM_TYPE",
        roomTypeKey: "servery",
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u1", unitType: "RESIDENT_AREA", childRoomTypeKeys: ["servery"] },
  });
  assert.notEqual(ctx.state, "NOT_APPLICABLE");

  const other = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast Service",
        startLocal: "07:00",
        endLocal: "09:00",
        locationMode: "ROOM_TYPE",
        roomTypeKey: "servery",
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u2", unitType: "SERVERY", childRoomTypeKeys: ["production_area"] },
  });
  assert.equal(other.state, "NOT_APPLICABLE");
});

test("unit not in location scope yields NOT_APPLICABLE", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        locationMode: "UNIT_TYPES",
        applicableUnitTypes: ["SERVERY"],
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u1", unitType: "RESIDENT_AREA" },
  });
  assert.equal(ctx.state, "NOT_APPLICABLE");
});

test("ACTIVE primary is lowest displaySequence then stableKey then id", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "b",
        stableKey: "beta",
        label: "Beta",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 20,
      }),
      cycle({
        id: "a",
        stableKey: "alpha",
        label: "Alpha",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 10,
      }),
      cycle({
        id: "c",
        stableKey: "alpha",
        label: "Alpha2",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 10,
      }),
    ],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.primary.id, "a");
    assert.equal(ctx.activeCycles.length, 3);
  }
});

test("mealTargetTime comes from UnitMealTime input not cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        mealType: "BREAKFAST",
      }),
    ],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    mealTargets: [{ mealType: "BREAKFAST", scheduledTime: "07:45" }],
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.mealTargetTime, "07:45");
  }
});

test("does not invent Breakfast when no cycles", () => {
  const ctx = resolveOperationalCycle({
    cycles: [],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
  assert.ok(!("primary" in ctx));
  assert.ok(!("next" in ctx && ctx.state !== "NOT_CONFIGURED"));
});

test("UPCOMING BEFORE first cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Lunch",
        startLocal: "11:30",
        endLocal: "13:30",
        mealType: "LUNCH",
      }),
    ],
    now: new Date("2026-08-06T10:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "UPCOMING");
  if (ctx.state === "UPCOMING") {
    assert.equal(ctx.next.label, "Lunch");
    assert.ok(ctx.minutesUntilNext > 0);
  }
});

test("DAY_COMPLETE after last cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
      }),
    ],
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "DAY_COMPLETE");
  if (ctx.state === "DAY_COMPLETE") {
    assert.equal(ctx.last.label, "Breakfast");
  }
});

function breakfastHierarchy(): OperationalCycleDefinition[] {
  return [
    cycle({
      id: "bfast",
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "05:30",
      endLocal: "10:00",
      displaySequence: 10,
      mealType: "BREAKFAST",
      expectedMilestones: [],
      locationMode: "ALL_DEPARTMENT_UNITS",
      parentStableKey: null,
    }),
    cycle({
      id: "mk",
      stableKey: "breakfast_main_kitchen_prep",
      label: "Main Kitchen Prep",
      startLocal: "05:30",
      endLocal: "07:10",
      displaySequence: 11,
      mealType: null,
      expectedMilestones: [],
      locationMode: "EXPLICIT_UNITS",
      unitIds: ["main-kitchen"],
      spaceIds: [],
      parentStableKey: "breakfast",
    }),
    cycle({
      id: "ss",
      stableKey: "breakfast_servery_service",
      label: "Servery Service",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 12,
      mealType: null,
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "ROOM_TYPE",
      roomTypeKey: "servery",
      parentStableKey: "breakfast",
    }),
    cycle({
      id: "rb",
      stableKey: "breakfast_retail",
      label: "Retail Breakfast",
      startLocal: "07:00",
      endLocal: "10:00",
      displaySequence: 13,
      mealType: null,
      expectedMilestones: [],
      locationMode: "EXPLICIT_UNITS",
      unitIds: ["retail"],
      spaceIds: [],
      parentStableKey: "breakfast",
    }),
  ];
}

test("hierarchy projection preserves parent path depth and ordering", () => {
  const ctx = resolveOperationalCycle({
    cycles: breakfastHierarchy(),
    now: new Date("2026-08-06T07:05:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state !== "ACTIVE") return;

  assert.ok(ctx.activeCycles.length >= 3);
  const servery = ctx.activeCycles.find((c) => c.stableKey === "breakfast_servery_service");
  assert.ok(servery);
  assert.equal(servery!.parentStableKey, "breakfast");
  assert.equal(servery!.depth, 1);
  assert.equal(servery!.displayPath, "Breakfast → Servery Service");
  assert.deepEqual(servery!.ancestorLabels, ["Breakfast"]);
  assert.equal(servery!.mealType, "BREAKFAST");

  // Pure umbrella must not win primary over actionable children.
  assert.notEqual(ctx.primary.stableKey, "breakfast");
});

test("multiple child phases can be simultaneously active", () => {
  const ctx = resolveOperationalCycle({
    cycles: breakfastHierarchy(),
    now: new Date("2026-08-06T07:05:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state !== "ACTIVE") return;
  const keys = new Set(ctx.activeCycles.map((c) => c.stableKey));
  assert.ok(keys.has("breakfast_main_kitchen_prep"));
  assert.ok(keys.has("breakfast_servery_service"));
  assert.ok(keys.has("breakfast_retail"));
});

test("location filtering returns only applicable phase for each location", () => {
  const cycles = breakfastHierarchy();
  const now = new Date("2026-08-06T07:05:00.000Z");

  const servery = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "naval", unitType: "RESIDENT_AREA", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(servery.state, "ACTIVE");
  if (servery.state === "ACTIVE") {
    assert.equal(servery.primary.stableKey, "breakfast_servery_service");
    assert.equal(servery.primary.displayPath, "Breakfast → Servery Service");
    assert.ok(
      !servery.activeCycles.some((c) => c.stableKey === "breakfast_retail"),
    );
    assert.ok(
      !servery.activeCycles.some((c) => c.stableKey === "breakfast_main_kitchen_prep"),
    );
  }

  const kitchen = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "main-kitchen", unitType: "KITCHEN", childRoomTypeKeys: [] },
  });
  assert.equal(kitchen.state, "ACTIVE");
  if (kitchen.state === "ACTIVE") {
    assert.equal(kitchen.primary.stableKey, "breakfast_main_kitchen_prep");
    assert.equal(kitchen.primary.displayPath, "Breakfast → Main Kitchen Prep");
  }

  const retail = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "retail", unitType: "RETAIL", childRoomTypeKeys: [] },
  });
  assert.equal(retail.state, "ACTIVE");
  if (retail.state === "ACTIVE") {
    assert.equal(retail.primary.stableKey, "breakfast_retail");
    assert.equal(retail.primary.displayPath, "Breakfast → Retail Breakfast");
  }
});

test("parent window does not activate child early", () => {
  const ctx = resolveOperationalCycle({
    cycles: breakfastHierarchy(),
    now: new Date("2026-08-06T06:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "naval", unitType: "RESIDENT_AREA", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.ok(!ctx.activeCycles.some((c) => c.stableKey === "breakfast_servery_service"));
    // Servery location still sees umbrella Breakfast as applicable until servery phase starts.
    assert.ok(ctx.activeCycles.some((c) => c.stableKey === "breakfast"));
  }
});

test("simple EVS root with no children remains actionable", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "morn",
        stableKey: "morning_ops",
        label: "Morning Operations",
        startLocal: "06:00",
        endLocal: "14:00",
        mealType: null,
        expectedMilestones: [],
        locationMode: "ALL_DEPARTMENT_UNITS",
        parentStableKey: null,
      }),
    ],
    now: new Date("2026-08-06T12:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.primary.stableKey, "morning_ops");
    assert.equal(ctx.primary.depth, 0);
    assert.equal(ctx.primary.displayPath, "Morning Operations");
  }
});

test("historical parentStableKey on governing versions reconstructs path", () => {
  // Day A published versions — Breakfast → Servery Service
  const dayA = [
    cycle({
      id: "bfast-v1",
      stableKey: "breakfast",
      version: 1,
      label: "Breakfast",
      startLocal: "05:30",
      endLocal: "10:00",
      displaySequence: 10,
      expectedMilestones: [],
      parentStableKey: null,
    }),
    cycle({
      id: "ss-v1",
      stableKey: "servery",
      version: 1,
      label: "Servery Service",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 12,
      expectedMilestones: ["SERVICE_STARTED"],
      locationMode: "ROOM_TYPE",
      roomTypeKey: "servery",
      parentStableKey: "breakfast",
    }),
  ];
  const dayACtx = resolveOperationalCycle({
    cycles: dayA,
    now: new Date("2026-08-06T07:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u1", unitType: "SERVERY", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(dayACtx.state, "ACTIVE");
  if (dayACtx.state === "ACTIVE") {
    assert.equal(dayACtx.primary.displayPath, "Breakfast → Servery Service");
  }

  // Later Build: same child reparented under Morning Meal (different effective set)
  const dayB = [
    cycle({
      id: "morning-v1",
      stableKey: "morning_meal",
      version: 1,
      label: "Morning Meal",
      startLocal: "05:30",
      endLocal: "10:00",
      displaySequence: 10,
      expectedMilestones: [],
      parentStableKey: null,
    }),
    cycle({
      id: "ss-v2",
      stableKey: "servery",
      version: 2,
      label: "Servery Service",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 12,
      expectedMilestones: ["SERVICE_STARTED"],
      locationMode: "ROOM_TYPE",
      roomTypeKey: "servery",
      parentStableKey: "morning_meal",
    }),
  ];
  const dayBCtx = resolveOperationalCycle({
    cycles: dayB,
    now: new Date("2026-09-01T07:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-01",
    unit: { id: "u1", unitType: "SERVERY", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(dayBCtx.state, "ACTIVE");
  if (dayBCtx.state === "ACTIVE") {
    assert.equal(dayBCtx.primary.displayPath, "Morning Meal → Servery Service");
  }

  // Replaying Day A effective versions still yields original hierarchy.
  const replay = resolveOperationalCycle({
    cycles: dayA,
    now: new Date("2026-08-06T07:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u1", unitType: "SERVERY", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(replay.state, "ACTIVE");
  if (replay.state === "ACTIVE") {
    assert.equal(replay.primary.displayPath, "Breakfast → Servery Service");
  }
});

test("draft hierarchy rows are ignored by Run resolver", () => {
  const cycles = [
    ...breakfastHierarchy(),
    cycle({
      id: "ss-draft",
      stableKey: "breakfast_servery_service",
      version: 2,
      label: "Servery Service",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 12,
      status: "DRAFT",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "ROOM_TYPE",
      roomTypeKey: "servery",
      parentStableKey: "lunch",
    }),
  ];
  const ctx = resolveOperationalCycle({
    cycles,
    now: new Date("2026-08-06T07:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "naval", unitType: "RESIDENT_AREA", childRoomTypeKeys: ["servery"] },
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.primary.parentStableKey, "breakfast");
    assert.equal(ctx.primary.displayPath, "Breakfast → Servery Service");
  }
});
