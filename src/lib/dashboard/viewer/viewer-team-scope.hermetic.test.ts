import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateViewerTeamScope,
  formatViewerTeamScopeLabel,
  keyTimeSpaceFilterFromTeamScope,
  narrowTeamScopeToCollectedRooms,
  uniqueRoomIds,
} from "./viewer-team-scope";

const base = {
  departmentId: "dept-dietary",
  departmentLabel: "Dietary",
  employeeId: "emp-sharon",
};

test("Department Manager and Facility Admin remain Department-wide even with Team membership", () => {
  const teams = [{ id: "t-rs", name: "Resident Services", roomIds: ["servery-1"] }];
  const manager = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: true,
    teams,
  });
  assert.equal(manager.mode, "DEPARTMENT_WIDE");
  assert.equal(manager.reason, "DEPARTMENT_MANAGER");
  assert.equal(formatViewerTeamScopeLabel(manager), "All Dietary");

  const admin = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: true,
    isDepartmentManager: false,
    teams,
  });
  assert.equal(admin.mode, "DEPARTMENT_WIDE");
  assert.equal(admin.reason, "FACILITY_ADMINISTRATOR");
});

test("Manager authority without Department headship is Team-scoped", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [{ id: "t-retail", name: "Retail", roomIds: ["retail"] }],
  });
  assert.equal(scope.mode, "TEAM_SCOPED");
  assert.equal(scope.reason, "ACTIVE_TEAM_MEMBERSHIP");
  assert.deepEqual(scope.roomIds, ["retail"]);
  assert.equal(formatViewerTeamScopeLabel(scope), "Retail");
});

test("no linked Employee and no Team membership fall back Department-wide", () => {
  const noEmployee = evaluateViewerTeamScope({
    ...base,
    employeeId: null,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [],
  });
  assert.equal(noEmployee.mode, "DEPARTMENT_WIDE");
  assert.equal(noEmployee.reason, "NO_LINKED_EMPLOYEE");

  const noTeam = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [],
  });
  assert.equal(noTeam.mode, "DEPARTMENT_WIDE");
  assert.equal(noTeam.reason, "NO_ACTIVE_TEAM_MEMBERSHIP");
  assert.equal(formatViewerTeamScopeLabel(noTeam), "All Dietary");
});

test("Team manager assignment is not inferred: empty membership stays Department-wide", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [],
  });
  assert.equal(scope.reason, "NO_ACTIVE_TEAM_MEMBERSHIP");
});

test("multiple Teams union Room IDs and dedupe overlaps", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [
      { id: "t-rs", name: "Resident Services", roomIds: ["a", "b", "shared"] },
      { id: "t-retail", name: "Retail", roomIds: ["retail", "shared"] },
    ],
  });
  assert.equal(scope.mode, "TEAM_SCOPED");
  assert.deepEqual(scope.roomIds, ["a", "b", "shared", "retail"]);
  assert.equal(formatViewerTeamScopeLabel(scope), "Resident Services + Retail");
  assert.deepEqual(
    uniqueRoomIds([
      { id: "t1", name: "A", roomIds: ["x", "x"] },
      { id: "t2", name: "B", roomIds: ["x", "y"] },
    ]),
    ["x", "y"],
  );
});

test("three Teams compact to a count label", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [
      { id: "1", name: "Resident Services", roomIds: ["a"] },
      { id: "2", name: "Retail", roomIds: ["b"] },
      { id: "3", name: "Utility", roomIds: ["c"] },
    ],
  });
  assert.equal(formatViewerTeamScopeLabel(scope), "3 Teams");
});

test("Team with zero Rooms is explicit, not Department-wide fallback", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [{ id: "t-mech", name: "Mechanical", roomIds: [] }],
  });
  assert.equal(scope.mode, "TEAM_WITHOUT_LOCATIONS");
  assert.equal(scope.reason, "TEAM_MEMBERSHIP_WITHOUT_ROOMS");
  assert.equal(formatViewerTeamScopeLabel(scope), "Mechanical");
});

test("stale Team rooms that miss the Department footprint become TEAM_WITHOUT_LOCATIONS", () => {
  const scoped = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [{ id: "t-rs", name: "Resident Services", roomIds: ["stale-room"] }],
  });
  const narrowed = narrowTeamScopeToCollectedRooms(scoped, new Set(["live-room"]));
  assert.equal(narrowed.mode, "TEAM_WITHOUT_LOCATIONS");
});

test("archived-only membership is modeled as no active Teams at evaluate time", () => {
  const scope = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [],
  });
  assert.equal(scope.mode, "DEPARTMENT_WIDE");
  assert.equal(scope.reason, "NO_ACTIVE_TEAM_MEMBERSHIP");
});

test("Key Time filter is omitted for Department-wide and empty for unconfigured Teams", () => {
  const wide = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: true,
    teams: [],
  });
  assert.equal(keyTimeSpaceFilterFromTeamScope(wide), undefined);
  const emptyTeam = evaluateViewerTeamScope({
    ...base,
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    teams: [{ id: "t", name: "Mechanical", roomIds: [] }],
  });
  const filter = keyTimeSpaceFilterFromTeamScope(emptyTeam);
  assert.ok(filter);
  assert.equal(filter.size, 0);
});
