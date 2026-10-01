/**
 * Phase B — Product-owned Location Function identity.
 *
 * Superseded: new Dietary Work presets targeted operational type "servery",
 * and new EVS presets targeted physical SPACE_TYPE plus cycle keys the EVS
 * starter does not publish. Future drafts use Product function keys and the
 * EVS starter's stable keys. Published facility rows are not rewritten.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { operationalTypeKeyFromName } from "@/lib/department-administration/operational-type";
import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";
import {
  buildWorkPlanPresetDraft,
  EVS_WORK_PRESET_KEYS,
  unadoptedPresetLocationFunctions,
} from "@/lib/department-work/work-presets";
import type { PublishedWorkPlanForResolve } from "@/lib/department-work/types";
import { resolveWorkCycleRoomParticipation } from "@/lib/operational-cycles/cycle-applicability";
import { buildEvsDefaultCyclePlans } from "@/lib/operational-cycles/defaults";
import { buildCyclesByStableKey } from "@/lib/operational-cycles/effective-cycle-spaces";
import { presentDepartmentRunOperation } from "@/lib/operational-cycles/present-run-operation";
import { cycleAppliesToSpace } from "@/lib/operational-cycles/resolve-operational-cycle";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

import {
  getLocationFunction,
  resolveLocationFunctionAdoption,
} from "./location-functions";

test("food_service_area stays the identity when display wording changes", () => {
  const fn = getLocationFunction("DIETARY", "food_service_area");
  assert.ok(fn);
  assert.equal(fn.functionKey, "food_service_area");
  assert.equal(fn.label, "Food Service Area");
  assert.notEqual(fn.functionKey, fn.label);

  const adopted = resolveLocationFunctionAdoption({
    productKey: "DIETARY",
    functionKey: "food_service_area",
    displayName: "Naval Park Servery",
  });
  assert.equal(adopted?.key, "food_service_area");
  assert.equal(adopted?.name, "Food Service Area");
  assert.notEqual(adopted?.key, operationalTypeKeyFromName("Naval Park Servery"));
  assert.notEqual(adopted?.key, operationalTypeKeyFromName("Servery"));
});

test("Product adoption does not slug a local label into the key", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/department-administration/profile-service.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function adoptProductLocationFunction");
  const end = source.indexOf("export async function createRoomArchetype");
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /resolveLocationFunctionAdoption/);
  assert.doesNotMatch(body, /operationalTypeKeyFromName|uniqueOperationalTypeKey/);
});

function cycle(partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey" | "locationMode">): OperationalCycleDefinition {
  return {
    id: partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: null,
    nodeKind: "PERIOD",
    version: 1,
    label: partial.label ?? "Service",
    description: null,
    cycleType: "CUSTOM",
    displaySequence: 10,
    startLocal: "10:00",
    endLocal: "14:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: null,
    locationMode: partial.locationMode,
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: partial.applicableOperationalTypeKeys,
    roomTypeKey: null,
    expectedMilestones: [],
    status: "PUBLISHED",
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
  };
}

const rooms = [
  { id: "room-a", operationalTypeKey: "food_service_area" },
  { id: "room-b", operationalTypeKey: null },
  { id: "room-c", operationalTypeKey: null },
];

test("function-targeted Cycle, Work, and presentation share the bound room", () => {
  const service = cycle({
    stableKey: "breakfast_service",
    label: "Service",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["food_service_area"],
  });
  const byKey = buildCyclesByStableKey([service]);
  const participation = resolveWorkCycleRoomParticipation(service, byKey, rooms);
  assert.deepEqual(participation.spaceIds, ["room-a"]);
  assert.equal(participation.roomSetClosed, true);

  assert.equal(
    cycleAppliesToSpace(service, "room-a", byKey, { operationalTypeKey: "food_service_area" }),
    true,
  );
  assert.equal(cycleAppliesToSpace(service, "room-b", byKey, { operationalTypeKey: null }), false);
  assert.equal(cycleAppliesToSpace(service, "room-c", byKey, { operationalTypeKey: null }), false);

  const presented = presentDepartmentRunOperation({
    cycles: [service],
    timings: [],
    now: new Date(Date.UTC(2026, 7, 17, 12, 0, 0)),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-17",
    nowLocalHhMm: "12:00",
    functionSpaces: rooms,
  });
  assert.equal(presented.currentOperations[0]?.phases[0]?.roomCount, participation.spaceIds.length);

  const withoutBindings = presentDepartmentRunOperation({
    cycles: [service],
    timings: [],
    now: new Date(Date.UTC(2026, 7, 17, 12, 0, 0)),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-17",
    nowLocalHhMm: "12:00",
  });
  assert.equal(withoutBindings.currentOperations[0]?.phases[0]?.roomCount, 0);

  const plan: PublishedWorkPlanForResolve = {
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
    items: [
      {
        id: "tray",
        itemKey: "tray_line",
        label: "Tray line",
        instructions: null,
        displaySequence: 10,
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["breakfast_service"],
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
      },
    ],
  };
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["unit-a"],
    spaces: rooms.map((room) => ({
      id: room.id,
      unitId: "unit-a",
      spaceType: room.id === "room-c" ? "PATIENT_ROOM" : "SERVICE_AREA",
      operationalTypeKey: room.operationalTypeKey,
    })),
    publishedPlans: [plan],
    publishedCycles: [
      {
        stableKey: "breakfast_service",
        label: "Service",
        startLocal: "07:00",
        endLocal: "09:00",
        startsAt: new Date("2026-09-27T11:00:00.000Z"),
        endsAt: new Date("2026-09-27T13:00:00.000Z"),
        departmentWide: false,
        participatingUnitIds: [],
        participatingSpaceIds: participation.spaceIds,
        roomSetClosed: participation.roomSetClosed,
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(requirements.map((row) => row.spaceId), ["room-a"]);
});

test("physical PATIENT_ROOM does not become resident_care without a binding", () => {
  const cleaning = cycle({
    stableKey: "morning_routine",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["resident_care"],
  });
  const spaces = [
    { id: "room-physical", operationalTypeKey: null },
    { id: "room-bound", operationalTypeKey: "resident_care" },
  ];
  const ids = resolveWorkCycleRoomParticipation(
    cleaning,
    buildCyclesByStableKey([cleaning]),
    spaces,
  ).spaceIds;
  assert.deepEqual(ids, ["room-bound"]);
});

test("a published servery Work plan still resolves servery and is not remapped", () => {
  const plan: PublishedWorkPlanForResolve = {
    id: "historical",
    stableKey: "servery_opening",
    version: 3,
    name: "Servery Opening Checks",
    status: "PUBLISHED",
    effectiveStartDate: null,
    effectiveEndDate: null,
    weekdays: [],
    applicabilities: [
      {
        kind: "OPERATIONAL_TYPE",
        unitId: null,
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
        operationalTypeKey: "servery",
      },
    ],
    items: [
      {
        id: "stations",
        itemKey: "verify_stations",
        label: "Verify stations ready",
        instructions: null,
        displaySequence: 10,
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
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
      },
    ],
  };
  const spaces = [
    { id: "old-servery", spaceType: "SERVICE_AREA", unitId: "unit-a", operationalTypeKey: "servery" },
    { id: "new-pod", spaceType: "SERVICE_AREA", unitId: "unit-a", operationalTypeKey: "food_service_area" },
  ];
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["unit-a"],
    spaces,
    publishedPlans: [plan],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(requirements.map((row) => row.spaceId), ["old-servery"]);
  assert.equal(plan.applicabilities[0]?.operationalTypeKey, "servery");
});

test("one room keeps separate Dietary and EVS function identities", () => {
  const shared = "room-1";
  const dietaryCycle = cycle({
    stableKey: "breakfast_service",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["food_service_area"],
  });
  const evsCare = cycle({
    stableKey: "morning_routine",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["resident_care"],
  });
  const evsSupport = cycle({
    stableKey: "day_cleaning",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["service_support"],
  });
  const dietaryRooms = [{ id: shared, operationalTypeKey: "food_service_area" }];
  const evsRooms = [{ id: shared, operationalTypeKey: "service_support" }];
  assert.deepEqual(
    resolveWorkCycleRoomParticipation(dietaryCycle, buildCyclesByStableKey([dietaryCycle]), dietaryRooms).spaceIds,
    [shared],
  );
  assert.deepEqual(
    resolveWorkCycleRoomParticipation(evsCare, buildCyclesByStableKey([evsCare]), evsRooms).spaceIds,
    [],
  );
  assert.deepEqual(
    resolveWorkCycleRoomParticipation(evsSupport, buildCyclesByStableKey([evsSupport]), evsRooms).spaceIds,
    [shared],
  );
});

test("EVS cycle-bound Work presets use EVS Cycle starter stable keys", () => {
  const starterKeys = new Set(buildEvsDefaultCyclePlans().map((plan) => plan.stableKey));
  assert.ok(starterKeys.has("morning_routine"));
  assert.ok(starterKeys.has("day_cleaning"));
  assert.ok(starterKeys.has("evening_closeout"));
  for (const presetKey of EVS_WORK_PRESET_KEYS) {
    const draft = buildWorkPlanPresetDraft(presetKey);
    for (const item of draft.items) {
      if (item.scheduleKind !== "OPERATIONAL_CYCLE") continue;
      for (const key of item.cycleStableKeys ?? []) {
        assert.equal(starterKeys.has(key), true, `${presetKey} references missing cycle ${key}`);
      }
    }
  }
  const common = buildWorkPlanPresetDraft("COMMON_AREA_ROUND");
  assert.deepEqual(common.items[0]?.cycleStableKeys, ["day_cleaning"]);
  const closeout = buildWorkPlanPresetDraft("SHIFT_CLOSEOUT");
  assert.deepEqual(closeout.items[0]?.cycleStableKeys, ["evening_closeout"]);
});

test("a preset cannot be applied until its Location Function is adopted", () => {
  const draft = buildWorkPlanPresetDraft("MEAL_SERVICE_SUPPORT");
  assert.deepEqual(unadoptedPresetLocationFunctions(draft, []), ["food_service_area"]);
  assert.deepEqual(unadoptedPresetLocationFunctions(draft, ["servery"]), ["food_service_area"]);
  assert.deepEqual(unadoptedPresetLocationFunctions(draft, ["food_service_area"]), []);
  const closeout = buildWorkPlanPresetDraft("SHIFT_CLOSEOUT");
  assert.deepEqual(unadoptedPresetLocationFunctions(closeout, []), []);
});
