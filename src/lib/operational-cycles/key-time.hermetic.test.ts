import assert from "node:assert/strict";
import test from "node:test";

import { buildCyclesByStableKey, effectiveCycleSpaceIds } from "./effective-cycle-spaces";
import type { OperationalCycleDefinition } from "./types";
import { validateCycle } from "./validate-cycle";

function cycle(partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey">): OperationalCycleDefinition {
  return {
    id: partial.id ?? partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: partial.version ?? 1,
    label: partial.label ?? partial.stableKey,
    description: partial.description ?? null,
    cycleType: partial.cycleType ?? "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    startLocal: partial.startLocal ?? "07:00",
    endLocal: partial.endLocal ?? "09:00",
    overnight: partial.overnight ?? false,
    applicableDaysOfWeek: partial.applicableDaysOfWeek ?? [1],
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-08-01"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: partial.applicableUnitTypes ?? [],
    roomTypeKey: partial.roomTypeKey ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    status: partial.status ?? "DRAFT",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: partial.milestoneTimes ?? [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

test("validateCycle rejects duplicate rooms across key time groups", () => {
  const result = validateCycle({
    label: "Due",
    cycleType: "CUSTOM",
    nodeKind: "KEY_TIME",
    parentStableKey: "breakfast",
    startLocal: null,
    endLocal: null,
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "EXPLICIT_UNITS",
    keyTimeGroups: [
      { dueLocal: "07:30", spaceIds: ["room-a"] },
      { dueLocal: "08:00", spaceIds: ["room-a"] },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "key_time_room_duplicate"));
});

test("effectiveCycleSpaceIds inherits parent explicit rooms", () => {
  const rows = [
    cycle({
      stableKey: "breakfast",
      spaceIds: ["servery-1", "servery-2"],
    }),
    cycle({
      stableKey: "breakfast_prep",
      parentStableKey: "breakfast",
      locationInheritFromParent: true,
      spaceIds: [],
    }),
  ];
  const byKey = buildCyclesByStableKey(rows);
  assert.deepEqual(
    effectiveCycleSpaceIds(rows[1]!, byKey),
    ["servery-1", "servery-2"],
  );
});

test("effectiveCycleSpaceIds unions key time group rooms", () => {
  const row = cycle({
    stableKey: "breakfast_due",
    parentStableKey: "breakfast",
    nodeKind: "KEY_TIME",
    startLocal: null,
    endLocal: null,
    keyTimeGroups: [
      { dueLocal: "07:30", spaceIds: ["room-a"] },
      { dueLocal: "08:00", spaceIds: ["room-b", "room-c"] },
    ],
  });
  const byKey = buildCyclesByStableKey([row]);
  assert.deepEqual(effectiveCycleSpaceIds(row, byKey), ["room-a", "room-b", "room-c"]);
});
