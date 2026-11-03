import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateViewerTeamScope,
  formatViewerTeamScopeLabel,
  keyTimeSpaceFilterFromTeamScope,
  narrowTeamScopeToCollectedRooms,
} from "./operational-placement";

const base = {
  departmentId: "dept-dietary",
  departmentLabel: "Food & Nutrition",
  employeeId: "emp-andrew",
  isFacilityAdministrator: false,
  isDepartmentManager: false,
  hasDepartmentAuthority: false,
};

test("facility admin, department head, and supervisor authority stay department-wide", () => {
  const teams = [{ id: "resident-services", name: "Resident Services" }];
  const admin = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: true,
    assignedRoomIds: ["servery"],
    teams,
  });
  assert.equal(admin.mode, "DEPARTMENT_WIDE");
  assert.equal(admin.reason, "FACILITY_ADMINISTRATOR");

  const head = evaluateViewerTeamScope({
    ...base,
    isDepartmentManager: true,
    assignedRoomIds: [],
    teams,
  });
  assert.equal(head.reason, "DEPARTMENT_MANAGER");
  assert.equal(formatViewerTeamScopeLabel(head), "All Food & Nutrition");

  const supervisor = evaluateViewerTeamScope({
    ...base,
    hasDepartmentAuthority: true,
    assignedRoomIds: ["servery"],
    teams,
  });
  assert.equal(supervisor.mode, "DEPARTMENT_WIDE");
  assert.equal(supervisor.reason, "DEPARTMENT_AUTHORITY");
  assert.deepEqual(supervisor.roomIds, []);
});

test("a frontline employee sees today's assignment rooms, not their Team", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    assignedRoomIds: ["servery-1a"],
    teams: [{ id: "resident-services", name: "Resident Services" }],
  });
  assert.equal(scope.mode, "ASSIGNMENT_SCOPED");
  assert.equal(scope.reason, "TODAYS_ASSIGNMENT");
  assert.deepEqual(scope.roomIds, ["servery-1a"]);
  assert.equal(formatViewerTeamScopeLabel(scope), "Today's assignment");
});

test("team membership without an assignment does not open the department or invent rooms", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    assignedRoomIds: [],
    teams: [{ id: "resident-services", name: "Resident Services" }],
  });
  assert.equal(scope.mode, "ASSIGNMENT_WITHOUT_PLACEMENT");
  assert.equal(scope.reason, "NO_ASSIGNMENT_TODAY");
  assert.deepEqual(scope.roomIds, []);
  const filter = keyTimeSpaceFilterFromTeamScope(scope);
  assert.ok(filter);
  assert.equal(filter.size, 0);
});

test("an unlinked session stays department-wide", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    employeeId: null,
    assignedRoomIds: [],
  });
  assert.equal(scope.mode, "DEPARTMENT_WIDE");
  assert.equal(scope.reason, "NO_LINKED_EMPLOYEE");
});

test("assigned rooms outside the collected footprint do not fall back to every room", () => {
  const scoped = evaluateViewerTeamScope({
    ...base,
    assignedRoomIds: ["stale-room"],
  });
  const narrowed = narrowTeamScopeToCollectedRooms(scoped, new Set(["servery-1a"]));
  assert.equal(narrowed.mode, "ASSIGNMENT_WITHOUT_PLACEMENT");
  assert.deepEqual(narrowed.roomIds, []);
});

test("department-wide scope does not filter key times", () => {
  const wide = evaluateViewerTeamScope({
    ...base,
    hasDepartmentAuthority: true,
    assignedRoomIds: [],
  });
  assert.equal(keyTimeSpaceFilterFromTeamScope(wide), undefined);
});
