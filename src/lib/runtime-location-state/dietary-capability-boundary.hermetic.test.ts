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
  type RuntimeServeryEventRow,
  type RuntimeSpaceIdentityRow,
} from "./compose";

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

function compose(row: RuntimeSpaceIdentityRow) {
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
    runModelsByDepartmentId: new Map(),
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

function mealKinds(row: RuntimeSpaceIdentityRow) {
  return compose(row)
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
  const kinds = mealKinds(
    space({
      spaceId: "pod-1",
      name: "Pod 1",
      departmentKey: "DIETARY",
      departmentLabel: "Dietary",
      roomTypeKey: "service_area",
      roomTypeLabel: "Service Area",
    }),
  );
  assert.deepEqual(kinds, ["SERVERY_READY", "MEAL_SERVICE_STARTED"]);
});
