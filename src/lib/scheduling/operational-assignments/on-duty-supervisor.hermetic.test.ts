import assert from "node:assert/strict";
import test from "node:test";

import { parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";

import {
  isSupervisoryResponsibilityRole,
  selectOnDutySupervisors,
  serviceDateWindow,
  supervisoryResponsibilityRoleKey,
  type OnDutyLocationGraph,
  type OnDutySupervisorCandidate,
} from "./on-duty-supervisor";

const zone = "America/New_York";
const day = serviceDateWindow("2026-10-29", zone)!;

const graph: OnDutyLocationGraph = {
  parentByUnitId: new Map([
    ["floor-1", null],
    ["neighborhood-1a", "floor-1"],
    ["neighborhood-1b", "floor-1"],
    ["other-floor", null],
  ]),
  unitIdBySpaceId: new Map([
    ["space-1b", "neighborhood-1b"],
    ["space-1a", "neighborhood-1a"],
  ]),
};

function at(time: string, date = "2026-10-29"): Date {
  const instant = parseFacilityLocalScheduledStartOnDate(time, date, zone);
  if (!instant) throw new Error(`bad time ${time}`);
  return instant;
}

function row(
  partial: Partial<OnDutySupervisorCandidate> & Pick<OnDutySupervisorCandidate, "assignmentId" | "employeeId">,
): OnDutySupervisorCandidate {
  return {
    roleKey: "DIETARY_SUPERVISOR_ROUNDING",
    status: "PLANNED",
    startsAt: at("07:00"),
    endsAt: at("15:30"),
    unitId: null,
    spaceIds: [],
    ...partial,
  };
}

function select(
  candidates: OnDutySupervisorCandidate[],
  extra: Partial<Parameters<typeof selectOnDutySupervisors>[0]> = {},
) {
  return selectOnDutySupervisors({
    roleKey: "DIETARY_SUPERVISOR_ROUNDING",
    at: at("11:30"),
    day,
    candidates,
    calledOffEmployeeIds: new Set(),
    graph,
    ...extra,
  });
}

test("supervisor rounding is the responsibility role for each operating department", () => {
  assert.equal(supervisoryResponsibilityRoleKey("DIETARY"), "DIETARY_SUPERVISOR_ROUNDING");
  assert.equal(supervisoryResponsibilityRoleKey("EVS"), "EVS_SUPERVISOR_ROUNDING");
  assert.equal(supervisoryResponsibilityRoleKey("PLANT"), "PLANT_SUPERVISOR_ROUNDING");
  assert.equal(supervisoryResponsibilityRoleKey("FUTURE"), null);
  assert.equal(isSupervisoryResponsibilityRole("ON_CALL_COVERAGE"), false);
  assert.equal(isSupervisoryResponsibilityRole("SERVER"), false);
});

test("the assigned supervisor is returned for the same department, location, and time", () => {
  const result = select([
    row({ assignmentId: "floor", employeeId: "supervisor-a", unitId: "floor-1" }),
    row({ assignmentId: "cook", employeeId: "cook", roleKey: "COOK", unitId: "neighborhood-1b" }),
  ], { unitId: "neighborhood-1b" });
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.deepEqual(result.assignments.map((item) => item.employeeId), ["supervisor-a"]);
    assert.deepEqual(result.assignments[0]?.scope, { kind: "unit", unitId: "floor-1" });
  }
});

test("a closer location wins over the floor and over the department", () => {
  const result = select(
    [
      row({ assignmentId: "department", employeeId: "department-supervisor" }),
      row({ assignmentId: "floor", employeeId: "floor-supervisor", unitId: "floor-1" }),
      row({
        assignmentId: "room",
        employeeId: "room-supervisor",
        unitId: null,
        spaceIds: ["space-1b"],
      }),
    ],
    { spaceId: "space-1b" },
  );
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.deepEqual(result.assignments.map((item) => item.employeeId), ["room-supervisor"]);
    assert.deepEqual(result.assignments[0]?.scope, { kind: "space", spaceId: "space-1b" });
  }
});

test("two assignments at the same specificity are both responsible", () => {
  const result = select(
    [
      row({ assignmentId: "b", employeeId: "second", unitId: "neighborhood-1b" }),
      row({ assignmentId: "a", employeeId: "first", unitId: "neighborhood-1b" }),
    ],
    { unitId: "neighborhood-1b" },
  );
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.deepEqual(
      result.assignments.map((item) => item.employeeId),
      ["first", "second"],
    );
  }
});

test("a called-off supervisor is skipped and a broader present assignment remains", () => {
  const calledOff = select(
    [
      row({ assignmentId: "room", employeeId: "called-off", spaceIds: ["space-1b"] }),
      row({ assignmentId: "floor", employeeId: "floor-supervisor", unitId: "floor-1" }),
    ],
    { spaceId: "space-1b", calledOffEmployeeIds: new Set(["called-off"]) },
  );
  assert.equal(calledOff.status, "resolved");
  if (calledOff.status === "resolved") {
    assert.deepEqual(calledOff.assignments.map((item) => item.employeeId), ["floor-supervisor"]);
  }

  const uncovered = select([row({ assignmentId: "only", employeeId: "called-off", unitId: "floor-1" })], {
    unitId: "neighborhood-1b",
    calledOffEmployeeIds: new Set(["called-off"]),
  });
  assert.deepEqual(uncovered, { status: "uncovered", reason: "called_off" });
});

test("reassignment follows the effective window", () => {
  const original = row({
    assignmentId: "morning",
    employeeId: "supervisor-a",
    unitId: "floor-1",
    startsAt: at("07:00"),
    endsAt: at("10:30"),
  });
  const replacement = row({
    assignmentId: "midday",
    employeeId: "supervisor-b",
    unitId: "floor-1",
    startsAt: at("10:30"),
    endsAt: at("15:30"),
  });
  const before = select([original, replacement], { unitId: "floor-1", at: at("10:00") });
  const after = select([original, replacement], { unitId: "floor-1", at: at("10:30") });
  assert.equal(before.status, "resolved");
  assert.equal(after.status, "resolved");
  if (before.status === "resolved" && after.status === "resolved") {
    assert.deepEqual(before.assignments.map((item) => item.employeeId), ["supervisor-a"]);
    assert.deepEqual(after.assignments.map((item) => item.employeeId), ["supervisor-b"]);
  }
});

test("an assignment outside its window or another department role is not returned", () => {
  const outside = select([row({ assignmentId: "later", employeeId: "later", startsAt: at("12:00") })], {
    at: at("11:00"),
  });
  assert.deepEqual(outside, { status: "uncovered", reason: "outside_window" });

  const otherDepartment = select([
    row({ assignmentId: "evs", employeeId: "evs", roleKey: "EVS_SUPERVISOR_ROUNDING" }),
  ]);
  assert.deepEqual(otherDepartment, { status: "uncovered", reason: "no_assignment" });

  const completed = select([
    row({ assignmentId: "done", employeeId: "done", status: "COMPLETED" }),
  ]);
  assert.deepEqual(completed, { status: "uncovered", reason: "no_assignment" });
});

test("a cross-midnight window stays on its service date", () => {
  const overnight = select(
    [
      row({
        assignmentId: "night",
        employeeId: "night-supervisor",
        unitId: "floor-1",
        startsAt: at("19:00"),
        endsAt: at("07:00", "2026-10-30"),
      }),
    ],
    { unitId: "floor-1", at: at("02:00", "2026-10-30") },
  );
  assert.equal(overnight.status, "resolved");
  if (overnight.status === "resolved") {
    assert.equal(overnight.assignments[0]?.employeeId, "night-supervisor");
  }
});

test("an unknown location does not fall back to a department-wide assignment", () => {
  const result = select([row({ assignmentId: "department", employeeId: "department-supervisor" })], {
    unitId: "missing-unit",
  });
  assert.deepEqual(result, { status: "uncovered", reason: "outside_location" });
});
