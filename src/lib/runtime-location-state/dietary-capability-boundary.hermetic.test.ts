/**
 * Phase A domain-capability boundary.
 *
 * Superseded: isServeryPlace admitted Dietary meal milestones when a room type,
 * room label, or facility display label contained "servery".
 * Admission is now Department.key === "DIETARY" via hasDietaryDomainCapabilities.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  composeRuntimeLocationStates,
  type RuntimeLocationComposeInput,
  type RuntimePublishedRunModel,
  type RuntimeServeryEventRow,
  type RuntimeSpaceIdentityRow,
} from "./compose";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

const event: RuntimeServeryEventRow = {
  id: "ev-1",
  unitId: "unit-1",
  mealType: "BREAKFAST",
  mealServiceReadyAt: new Date("2026-09-27T10:40:00.000Z"),
  mealServiceStartedAt: new Date("2026-09-27T11:00:00.000Z"),
  readyRecordedAt: new Date("2026-09-27T10:41:00.000Z"),
  startedRecordedAt: new Date("2026-09-27T11:01:00.000Z"),
};

function space(
  partial: Partial<RuntimeSpaceIdentityRow> &
    Pick<RuntimeSpaceIdentityRow, "spaceId" | "name" | "departmentKey">,
): RuntimeSpaceIdentityRow {
  return {
    unitId: "unit-1",
    unitName: "Unit A",
    departmentId: "dept-1",
    departmentLabel: partial.departmentLabel ?? null,
    floorName: null,
    neighborhoodName: null,
    roomTypeKey: partial.roomTypeKey ?? null,
    roomTypeLabel: partial.roomTypeLabel ?? null,
    facilityRoomTypeId: null,
    ...partial,
  };
}

function legacyBreakfastCycle(spaceId: string): OperationalCycleDefinition {
  return {
    id: "breakfast",
    stableKey: "breakfast",
    parentStableKey: null,
    nodeKind: "PERIOD",
    version: 3,
    label: "Breakfast",
    description: null,
    cycleType: "SERVICE",
    displaySequence: 10,
    startLocal: "06:00",
    endLocal: "10:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST",
    locationMode: "EXPLICIT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    roomTypeKey: null,
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    status: "PUBLISHED",
    unitIds: ["unit-1"],
    spaceIds: [spaceId],
    milestoneTimes: [],
    keyTimeGroups: [],
  };
}

function compose(row: RuntimeSpaceIdentityRow, cycles: OperationalCycleDefinition[] = []) {
  const model: RuntimePublishedRunModel | undefined =
    cycles.length === 0
      ? undefined
      : {
          cycles,
          timings: [],
          provenance: "NEW_PERIOD_KEY_TIME",
          timezone: "America/New_York",
          operationalDateKey: "2026-09-27",
          now: new Date("2026-09-27T12:00:00.000Z"),
          nowLocalHhMm: "08:00",
        };
  const input: RuntimeLocationComposeInput = {
    facilityId: "fac-1",
    facilityName: "Harbor",
    now: new Date("2026-09-27T12:00:00.000Z"),
    operationalDateKey: "2026-09-27",
    timezone: "America/New_York",
    nowLocalHhMm: "08:00",
    operationalAssignmentsEnabled: false,
    spaces: [row],
    profilesByDepartmentId: new Map(),
    operationalTypesBySpaceId: new Map(),
    runModelsByDepartmentId: new Map(
      model ? [[row.departmentId, model] as const] : [],
    ),
    coverageTemplatesByDepartmentId: new Map(),
    coveragePlanByDepartmentId: new Map(),
    assignmentsByDepartmentId: new Map(),
    evidenceBySpaceId: new Map(),
    assetsBySpaceId: new Map(),
    issuesBySpaceId: new Map(),
    serveryEventsByUnitId: new Map([["unit-1", [event]]]),
    programsBySpaceId: new Map(),
  };
  return composeRuntimeLocationStates(input)[0]!;
}

function mealKinds(row: RuntimeSpaceIdentityRow, cycles: OperationalCycleDefinition[] = []) {
  return compose(row, cycles)
    .milestones.items.filter((item) => item.kind === "SERVERY_READY" || item.kind === "MEAL_SERVICE_STARTED")
    .map((item) => item.kind);
}

test("a non-Dietary room named Servery does not receive meal milestones", () => {
  const kinds = mealKinds(
    space({
      spaceId: "evs-room",
      name: "Main Servery Cleaning Zone",
      departmentKey: "EVS",
      departmentLabel: "Main Servery Cleaning Zone",
      roomTypeKey: "servery",
      roomTypeLabel: "Servery",
    }),
  );
  assert.deepEqual(kinds, []);
});

test("a Dietary location keeps meal milestones without a servery label", () => {
  const row = space({
    spaceId: "pod-1",
    name: "Pod 1",
    departmentKey: "DIETARY",
    departmentLabel: "Dietary",
    roomTypeKey: "service_area",
    roomTypeLabel: "Service Area",
  });
  assert.deepEqual(mealKinds(row), []);
  assert.deepEqual(mealKinds(row, [legacyBreakfastCycle(row.spaceId)]), [
    "SERVERY_READY",
    "MEAL_SERVICE_STARTED",
  ]);
});
