import assert from "node:assert/strict";
import test from "node:test";

import {
  describeKeyTimeStatus,
  expectedKeyTimeToday,
  summarizeKeyTimeGroups,
  type KeyTimeDayTiming,
} from "./key-time-day-expectation";
import { planKeyTimeDayExpectations } from "./plan-key-time-day-expectations";
import { addMinutesToLocalTime } from "./day-expectation";
import {
  buildCyclesByStableKey,
  effectiveCycleSpaceIds,
} from "./effective-cycle-spaces";
import type { OperationalCycleDefinition } from "./types";
import { cycleAppliesToSpace, cycleAppliesToUnit } from "./resolve-operational-cycle";
import { decideCompleteKeyTimeAuthority } from "./key-time-day-actions";

function cycle(
  partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey">,
): OperationalCycleDefinition {
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
    startLocal: partial.startLocal ?? "05:30",
    endLocal: partial.endLocal ?? "10:00",
    overnight: partial.overnight ?? false,
    applicableDaysOfWeek: partial.applicableDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-08-01"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: partial.applicableUnitTypes ?? [],
    roomTypeKey: partial.roomTypeKey ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    status: partial.status ?? "PUBLISHED",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: partial.milestoneTimes ?? [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

test("PERIOD effective rooms: top-level explicit, inherit, and override", () => {
  const breakfast = cycle({
    stableKey: "breakfast",
    spaceIds: ["a", "b", "c"],
  });
  const prep = cycle({
    stableKey: "prep",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: [],
  });
  const kitchenPrep = cycle({
    stableKey: "kitchen_prep",
    parentStableKey: "breakfast",
    locationInheritFromParent: false,
    spaceIds: ["e"],
  });
  const byKey = buildCyclesByStableKey([breakfast, prep, kitchenPrep]);

  assert.deepEqual(effectiveCycleSpaceIds(breakfast, byKey), ["a", "b", "c"]);
  assert.deepEqual(effectiveCycleSpaceIds(prep, byKey), ["a", "b", "c"]);
  assert.deepEqual(effectiveCycleSpaceIds(kitchenPrep, byKey), ["e"]);

  assert.equal(cycleAppliesToSpace(prep, "a", byKey), true);
  assert.equal(cycleAppliesToSpace(prep, "d", byKey), false);
  assert.equal(cycleAppliesToSpace(kitchenPrep, "e", byKey), true);
  assert.equal(cycleAppliesToSpace(kitchenPrep, "a", byKey), false);
});

test("new room does not join published PERIOD after publish snapshot", () => {
  const breakfast = cycle({
    stableKey: "breakfast",
    spaceIds: ["a", "b", "c"],
  });
  const byKey = buildCyclesByStableKey([breakfast]);
  assert.equal(cycleAppliesToSpace(breakfast, "new-servery", byKey), false);
});

test("planKeyTimeDayExpectations materializes one row per room/group", () => {
  const rows = [
    cycle({
      id: "breakfast-id",
      stableKey: "breakfast",
      label: "Breakfast",
      spaceIds: ["a", "b"],
    }),
    cycle({
      id: "due-id",
      stableKey: "breakfast_due",
      label: "Breakfast Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [
        { id: "g1", dueLocal: "08:00", spaceIds: ["a", "b"] },
        { id: "g2", dueLocal: "08:15", spaceIds: ["c"] },
      ],
    }),
  ];

  const planned = planKeyTimeDayExpectations({ cycles: rows });
  assert.equal(planned.length, 3);
  assert.deepEqual(
    planned.map((row) => `${row.spaceId}:${row.configuredDueLocal}`).sort(),
    ["a:08:00", "b:08:00", "c:08:15"],
  );
  assert.ok(planned.every((row) => row.displayPath.includes("Breakfast")));
});

test("planKeyTimeDayExpectations is idempotent against existing rows", () => {
  const due = cycle({
    id: "due-id",
    stableKey: "due",
    nodeKind: "KEY_TIME",
    startLocal: null,
    endLocal: null,
    keyTimeGroups: [{ id: "g1", dueLocal: "10:00", spaceIds: ["r1", "r2"] }],
  });
  const first = planKeyTimeDayExpectations({ cycles: [due] });
  assert.equal(first.length, 2);
  const second = planKeyTimeDayExpectations({
    cycles: [due],
    existing: first.map((row) => ({ cycleId: row.cycleId, spaceId: row.spaceId })),
  });
  assert.equal(second.length, 0);
});

test("EVS Key Time planning does not require mealType", () => {
  const morning = cycle({
    stableKey: "morning",
    label: "Morning Operations",
    mealType: null,
    spaceIds: ["room-1"],
  });
  const complete = cycle({
    id: "kt-1",
    stableKey: "rooms_complete",
    label: "Resident Rooms Complete",
    parentStableKey: "morning",
    nodeKind: "KEY_TIME",
    mealType: null,
    startLocal: null,
    endLocal: null,
    keyTimeGroups: [{ id: "g", dueLocal: "10:00", spaceIds: ["room-1", "room-2"] }],
  });
  const planned = planKeyTimeDayExpectations({ cycles: [morning, complete] });
  assert.equal(planned.length, 2);
  assert.ok(planned.every((row) => row.cycleLabel === "Resident Rooms Complete"));
});

test("configured → adjusted → actual remain distinct; no meal grace", () => {
  assert.equal(
    expectedKeyTimeToday({ configuredDueLocal: "08:00", adjustedDueLocal: "08:05" }),
    "08:05",
  );
  assert.equal(addMinutesToLocalTime("08:05", 5), "08:10");

  const overdue = describeKeyTimeStatus({
    configuredDueLocal: "08:00",
    adjustedDueLocal: null,
    actualDueLocal: null,
    nowLocalHhMm: "08:02",
  });
  assert.equal(overdue.key, "overdue");

  const lateComplete = describeKeyTimeStatus({
    configuredDueLocal: "08:00",
    adjustedDueLocal: "08:05",
    actualDueLocal: "08:07",
    nowLocalHhMm: "08:10",
  });
  assert.equal(lateComplete.key, "completed_late");

  const onTime = describeKeyTimeStatus({
    configuredDueLocal: "08:00",
    adjustedDueLocal: "08:05",
    actualDueLocal: "08:04",
    nowLocalHhMm: "08:10",
  });
  assert.equal(onTime.key, "completed_on_time");
});

test("group summary is derived from room-level timings", () => {
  const timings: KeyTimeDayTiming[] = Array.from({ length: 20 }, (_, index) => ({
    expectationId: `e${index}`,
    spaceId: `s${index}`,
    cycleId: "c1",
    cycleStableKey: "floor3",
    cycleVersion: 1,
    cycleLabel: "Floor 3 Complete",
    parentCycleLabel: "Morning Housekeeping",
    displayPath: "Morning Housekeeping → Floor 3 Complete",
    keyTimeGroupId: "g1",
    configuredDueLocal: "11:00",
    adjustedDueLocal: null,
    expectedToday: "11:00",
    actualDueLocal: index < 18 ? "10:55" : null,
    completedAt: index < 18 ? new Date() : null,
    adjustedAt: null,
  }));
  const summaries = summarizeKeyTimeGroups(timings);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.completed, 18);
  assert.equal(summaries[0]!.total, 20);
});

test("Key Time completion authority: employee once, supervisor correction", () => {
  const employeeOnce = decideCompleteKeyTimeAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f1",
    role: "STAFF",
    alreadyCompleted: false,
    allowCorrection: false,
  });
  assert.equal(employeeOnce.allowed, true);

  const employeeCorrection = decideCompleteKeyTimeAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f1",
    role: "STAFF",
    alreadyCompleted: true,
    allowCorrection: true,
  });
  assert.equal(employeeCorrection.allowed, false);

  const supervisorCorrection = decideCompleteKeyTimeAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f1",
    role: "SUPERVISOR",
    alreadyCompleted: true,
    allowCorrection: true,
  });
  assert.equal(supervisorCorrection.allowed, true);

  const crossFacility = decideCompleteKeyTimeAuthority({
    sessionFacilityId: "f1",
    expectationFacilityId: "f2",
    role: "MANAGER",
    alreadyCompleted: false,
    allowCorrection: false,
  });
  assert.equal(crossFacility.allowed, false);
});

test("inherited PERIOD applies via unit child spaces", () => {
  const breakfast = cycle({
    stableKey: "breakfast",
    spaceIds: ["naval-servery"],
  });
  const prep = cycle({
    stableKey: "prep",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: [],
  });
  const byKey = buildCyclesByStableKey([breakfast, prep]);
    assert.equal(
    cycleAppliesToUnit(
      prep,
      {
        id: "naval-park",
        unitType: "SERVERY",
        spaceIds: ["naval-servery"],
      },
      byKey,
    ),
    true,
  );
});
