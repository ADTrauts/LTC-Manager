import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { composeLocationProgram } from "@/lib/department-administration/location-program";
import { evaluateViewerTeamScope } from "@/lib/dashboard/viewer/operational-placement";
import { matchCoverageItemToLocation } from "@/lib/scheduling/coverage-expectations/match-expectation";

const servery = {
  spaceId: "space-1a-servery",
  name: "1A Servery",
  neighborhoodName: "1A",
  floorName: "1",
  facilityTypeLabel: "Servery",
  facilityRoomTypeId: "type-servery",
  responsible: true,
};

function program(department: { id: string; name: string }) {
  return composeLocationProgram({
    departmentId: department.id,
    departmentName: department.name,
    location: servery,
    teams: [],
    teamCycles: [],
    cyclePlacements: [],
    coverageNeeds: [
      {
        id: "need-server",
        roleLabel: "Server",
        requiredCount: 2,
        cycleLabel: "Breakfast",
      },
    ],
    spaceLogs: [],
    assetLogs: [],
    typeDefaults: [],
    suppressions: [],
    assets: [],
  });
}

test("a Team is an organizational grouping of people", () => {
  const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
  assert.match(service, /organizational grouping of people/);
  assert.match(service, /DepartmentTeamRoomMembership|roomMemberships/);
});

test("a responsible room stays visible with no Team", () => {
  const dietary = program({ id: "dietary", name: "Food & Nutrition" });
  assert.equal(dietary.location.responsible, true);
  assert.equal(dietary.location.name, "1A Servery");
  assert.deepEqual(dietary.teams, []);
});

test("coverage resolves for the room without a Team-room relationship", () => {
  const dietary = program({ id: "dietary", name: "Food & Nutrition" });
  assert.ok(dietary.location.responsible);
  assert.equal(
    matchCoverageItemToLocation(
      {
        id: "need-server",
        templateId: "template",
        templateStableKey: "coverage",
        templateVersion: 1,
        templateStatus: "PUBLISHED",
        effectiveFrom: null,
        effectiveTo: null,
        roleKey: "SERVER",
        roleLabel: "Server",
        requiredCount: 2,
        unitId: null,
        spaceId: "space-1a-servery",
        applicableOperationalCycleStableKeys: ["breakfast"],
      },
      {
        departmentId: "dietary",
        spaceId: "space-1a-servery",
        unitId: "unit-1a",
        operationalTypeKey: null,
        operationalTypeName: null,
      },
    ),
    "EXPLICIT_LOCATION",
  );
});

test("today's location comes from the assignment, not Team membership", () => {
  const scope = evaluateViewerTeamScope({
    departmentId: "dietary",
    departmentLabel: "Food & Nutrition",
    employeeId: "andrew",
    isFacilityAdministrator: false,
    isDepartmentManager: false,
    hasDepartmentAuthority: false,
    assignedRoomIds: ["space-1a-servery"],
    teams: [{ id: "resident-services", name: "Resident Services" }],
  });
  assert.equal(scope.mode, "ASSIGNMENT_SCOPED");
  assert.deepEqual(scope.roomIds, ["space-1a-servery"]);
});

test("a new responsible room does not need a Team", () => {
  const added = composeLocationProgram({
    departmentId: "dietary",
    departmentName: "Food & Nutrition",
    location: { ...servery, spaceId: "space-new", name: "New servery" },
    teams: [],
    teamCycles: [],
    cyclePlacements: [],
    coverageNeeds: [],
    spaceLogs: [],
    assetLogs: [],
    typeDefaults: [],
    suppressions: [],
    assets: [],
  });
  assert.equal(added.location.name, "New servery");
  assert.equal(added.location.responsible, true);
  assert.deepEqual(added.teams, []);
});

test("the same room can belong to two Departments without either Team owning it", () => {
  const dietary = program({ id: "dietary", name: "Food & Nutrition" });
  const evs = program({ id: "evs", name: "Environmental Services" });
  assert.equal(dietary.location.spaceId, evs.location.spaceId);
  assert.deepEqual(dietary.teams, []);
  assert.deepEqual(evs.teams, []);
  assert.notEqual(dietary.department.id, evs.department.id);
});

test("viewer placement does not read Location Function or Team rooms", () => {
  const scope = readFileSync(
    new URL("../dashboard/viewer/operational-placement.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(scope, /applicableOperationalTypeKeys/);
  assert.doesNotMatch(scope, /departmentTeamRoomMembership/);
  assert.doesNotMatch(scope, /departmentOperationalProfile/);
  assert.doesNotMatch(scope, /departmentRoomArchetype/);
  assert.match(scope, /operationalAssignment/);
});
