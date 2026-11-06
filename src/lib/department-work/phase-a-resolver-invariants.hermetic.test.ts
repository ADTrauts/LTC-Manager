/**
 * Phase A resolver invariants.
 *
 * Superseded: OPERATIONAL_CYCLE with cycleStableKeys [] used to match every
 * published Cycle. Empty Cycle identity now means the Work item is not configured.
 *
 * Superseded: a closed function room set used to fall through to every room in
 * a matched unit. Empty bound rooms now mean no Work.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  boundSpaceIdsForOperationalTypeKeys,
  resolveWorkCycleRoomParticipation,
} from "@/lib/operational-cycles/cycle-applicability";
import { buildCyclesByStableKey } from "@/lib/operational-cycles/effective-cycle-spaces";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

import { resolveWorkRequirements } from "./resolve-requirements";
import type {
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
} from "./types";

function item(
  overrides: Partial<PublishedWorkPlanForResolve["items"][number]> &
    Pick<PublishedWorkPlanForResolve["items"][number], "id" | "itemKey" | "label">,
): PublishedWorkPlanForResolve["items"][number] {
  return {
    instructions: null,
    displaySequence: 10,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKeys: [],
    windowStartLocal: null,
    windowEndLocal: null,
    dueOffsetKind: null,
    dueOffsetMinutes: null,
    roleKeys: [],
    unitId: null,
    spaceId: null,
    assetId: null,
    knowledgeArticleId: null,
    procedureTitleSnapshot: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    supervisorVisible: true,
    ...overrides,
  };
}

function plan(
  items: PublishedWorkPlanForResolve["items"],
): PublishedWorkPlanForResolve {
  return {
    id: "plan-1",
    stableKey: "meal_support",
    version: 1,
    name: "Meal Support",
    status: "PUBLISHED",
    effectiveStartDate: null,
    effectiveEndDate: null,
    weekdays: [],
    applicabilities: [
      {
        kind: "DEPARTMENT_UNIT",
        unitId: null,
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
    items,
  };
}

function cycleWindow(
  overrides: Partial<PublishedCycleWindowForWorkResolve> &
    Pick<PublishedCycleWindowForWorkResolve, "stableKey">,
): PublishedCycleWindowForWorkResolve {
  return {
    label: overrides.stableKey,
    startLocal: "06:00",
    endLocal: "09:00",
    startsAt: new Date("2026-09-27T10:00:00.000Z"),
    endsAt: new Date("2026-09-27T13:00:00.000Z"),
    departmentWide: false,
    participatingUnitIds: ["unit-a"],
    participatingSpaceIds: [],
    ...overrides,
  };
}

function resolve(input: {
  plans: PublishedWorkPlanForResolve[];
  cycles: PublishedCycleWindowForWorkResolve[];
  spaces?: { id: string; spaceType: string; unitId: string; operationalTypeKey?: string | null }[];
  candidateUnitIds?: string[];
}) {
  return resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: input.candidateUnitIds ?? ["unit-a"],
    spaces: input.spaces,
    publishedPlans: input.plans,
    publishedCycles: input.cycles,
    confirmedAssignments: [],
    existingOccurrences: [],
  });
}

test("empty OPERATIONAL_CYCLE keys produce no WorkRequirements", () => {
  const cycles = [
    cycleWindow({ stableKey: "breakfast_service", label: "Service" }),
    cycleWindow({ stableKey: "lunch_service", label: "Service" }),
  ];
  const unconfigured = resolve({
    plans: [plan([item({ id: "tray", itemKey: "tray_line", label: "Tray line" })])],
    cycles,
  });
  assert.equal(unconfigured.length, 0);

  const breakfast = resolve({
    plans: [
      plan([
        item({
          id: "tray",
          itemKey: "tray_line",
          label: "Tray line",
          cycleStableKeys: ["breakfast_service"],
        }),
      ]),
    ],
    cycles,
  });
  assert.deepEqual(
    breakfast.map((row) => row.cycleStableKey),
    ["breakfast_service"],
  );

  const renamed = resolve({
    plans: [
      plan([
        item({
          id: "tray",
          itemKey: "tray_line",
          label: "Tray line",
          cycleStableKeys: ["breakfast_service"],
        }),
      ]),
    ],
    cycles: [
      cycleWindow({ stableKey: "breakfast_service", label: "Resident Meal Service" }),
      cycleWindow({ stableKey: "lunch_service", label: "Service" }),
    ],
  });
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0]!.cycleStableKey, "breakfast_service");
  assert.equal(renamed[0]!.label, "Tray line");
});

const rooms = [
  { id: "room-a", spaceType: "SERVICE_AREA", unitId: "unit-a", operationalTypeKey: "food_service_area" },
  { id: "room-b", spaceType: "SERVICE_AREA", unitId: "unit-a", operationalTypeKey: null },
];

test("function-targeted participation includes only bound rooms", () => {
  const work = plan([
    item({
      id: "clean",
      itemKey: "service_reset",
      label: "Service reset",
      cycleStableKeys: ["breakfast_service"],
    }),
  ]);
  const bound = resolve({
    plans: [work],
    spaces: rooms,
    cycles: [
      cycleWindow({
        stableKey: "breakfast_service",
        label: "Service",
        participatingUnitIds: [],
        participatingSpaceIds: ["room-a"],
        roomSetClosed: true,
      }),
    ],
  });
  assert.deepEqual(
    bound.map((row) => row.spaceId),
    ["room-a"],
  );

  const unbound = resolve({
    plans: [work],
    spaces: rooms,
    cycles: [
      cycleWindow({
        stableKey: "breakfast_service",
        participatingUnitIds: [],
        participatingSpaceIds: [],
        roomSetClosed: true,
      }),
    ],
  });
  assert.equal(unbound.length, 0);
});

test("explicit whole-department participation still projects Work", () => {
  const reqs = resolve({
    plans: [
      plan([
        item({
          id: "walk",
          itemKey: "department_walk",
          label: "Department walk",
          cycleStableKeys: ["day_cycle"],
        }),
      ]),
    ],
    spaces: rooms,
    candidateUnitIds: ["unit-a"],
    cycles: [
      cycleWindow({
        stableKey: "day_cycle",
        label: "Day",
        departmentWide: true,
        participatingUnitIds: [],
        participatingSpaceIds: [],
        roomSetClosed: true,
      }),
    ],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.unitId, "unit-a");
  assert.equal(reqs[0]!.spaceId, null);
  assert.equal(reqs[0]!.cycleStableKey, "day_cycle");
});

function definition(
  partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey" | "locationMode">,
): OperationalCycleDefinition {
  return {
    id: partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: 1,
    label: partial.label ?? "Service",
    description: null,
    cycleType: "CUSTOM",
    displaySequence: 10,
    startLocal: "07:00",
    endLocal: "09:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: null,
    locationMode: partial.locationMode,
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: partial.applicableOperationalTypeKeys,
    roomTypeKey: null,
    expectedMilestones: [],
    status: "PUBLISHED",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: [],
    keyTimeGroups: [],
  };
}

test("operational-type participation resolves bound keys and ignores room labels", () => {
  const parent = definition({
    stableKey: "breakfast",
    label: "Breakfast",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["food_service_area"],
  });
  const phase = definition({
    stableKey: "breakfast_service",
    label: "Service",
    locationMode: "EXPLICIT_UNITS",
    locationInheritFromParent: true,
    parentStableKey: "breakfast",
  });
  const spaces = [
    { id: "room-a", operationalTypeKey: "food_service_area" },
    { id: "room-b", operationalTypeKey: "resident_room" },
    { id: "room-named-servery", operationalTypeKey: null },
  ];
  const byKey = buildCyclesByStableKey([parent, phase]);
  const participation = resolveWorkCycleRoomParticipation(phase, byKey, spaces);
  assert.equal(participation.roomSetClosed, true);
  assert.deepEqual(participation.spaceIds, ["room-a"]);

  assert.deepEqual(
    boundSpaceIdsForOperationalTypeKeys(["food_service_area"], [
      { id: "named", operationalTypeKey: null },
      { id: "bound", operationalTypeKey: "food_service_area" },
    ]),
    ["bound"],
  );
  assert.deepEqual(boundSpaceIdsForOperationalTypeKeys([], spaces), []);
});
