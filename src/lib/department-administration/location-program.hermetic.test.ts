import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  composeLocationProgram,
  emptyLocationProgram,
  formatNeedSummary,
  locationProgramIsAttached,
} from "./location-program";

function baseInput() {
  return {
    departmentId: "dept-1",
    departmentName: "Dietary",
    location: {
      spaceId: "servery-3a",
      name: "3A Servery",
      neighborhoodName: "3A",
      floorName: "Third",
      facilityTypeLabel: "Servery",
      facilityRoomTypeId: "type-servery",
      responsible: true,
    },
    teams: [
      { id: "servery-am", name: "Servery AM", spaceIds: ["servery-3a", "servery-3b"] },
      { id: "culinary", name: "Culinary", spaceIds: ["kitchen"] },
    ],
    teamCycles: [
      {
        teamId: "servery-am",
        cycleStableKey: "breakfast",
        label: "Breakfast",
        startLocal: "05:30",
        endLocal: "10:00",
        requiredCount: 1,
        grain: "PER_ROOM" as const,
      },
      {
        teamId: "culinary",
        cycleStableKey: "breakfast",
        label: "Breakfast",
        startLocal: "05:30",
        endLocal: "10:00",
        requiredCount: 5,
        grain: "TOTAL" as const,
      },
    ],
    cyclePlacements: [
      {
        cycleStableKey: "retail-window",
        label: "Retail window",
        startLocal: "08:00",
        endLocal: "16:00",
        spaceIds: ["retail"],
      },
    ],
    spaceLogs: [{ id: "att-1", label: "Temp log" }],
    assetLogs: [{ id: "att-2", label: "Dish machine", assetName: "Hobart 1" }],
    typeDefaults: [
      {
        id: "def-1",
        label: "Sanitizer check",
        facilityRoomTypeId: "type-servery",
        typeLabel: "Servery",
      },
    ],
    suppressions: [] as Array<{ defaultId: string; spaceId: string }>,
    assets: [{ id: "asset-1", name: "Hobart 1", code: "DM-1" }],
  };
}

describe("Location Program", () => {
  it("composes place, Facility type, teams, cycles, need, logs, and assets with provenance", () => {
    const program = composeLocationProgram(baseInput());
    assert.equal(program.location.name, "3A Servery");
    assert.equal(program.location.place, "3A · Third");
    assert.equal(program.location.facilityTypeLabel, "Servery");
    assert.deepEqual(
      program.teams.map((row) => row.name),
      ["Servery AM"],
    );
    assert.equal(program.teams[0]?.provenance.source, "TEAM_ROOM_MEMBERSHIP");
    assert.equal(program.cycles[0]?.label, "Breakfast");
    assert.equal(program.cycles[0]?.teams[0]?.requiredCount, 1);
    assert.equal(formatNeedSummary(1, "PER_ROOM"), "1 per room");
    assert.deepEqual(
      program.logs.map((row) => row.label),
      ["Dish machine", "Sanitizer check", "Temp log"],
    );
    assert.equal(program.logs.find((row) => row.kind === "ROOM")?.provenance.source, "ROOM_LOG");
    assert.equal(program.assets[0]?.name, "Hobart 1");
  });

  it("does not carry Experiences, Role, Coverage, or named employees", () => {
    const json = JSON.stringify(composeLocationProgram(baseInput()));
    assert.doesNotMatch(json, /experience/i);
    assert.doesNotMatch(json, /operationalType|How we use this room|Coverage Expectations/);
    assert.doesNotMatch(json, /Mary|employee/i);
    assert.doesNotMatch(json, /addLogHref|catalogOptions/);
  });

  it("keeps a placed cycle when no team works the room", () => {
    const input = baseInput();
    input.location.spaceId = "retail";
    input.location.facilityRoomTypeId = "type-retail";
    const program = composeLocationProgram(input);
    assert.equal(program.teams.length, 0);
    assert.equal(program.cycles[0]?.label, "Retail window");
    assert.equal(program.cycles[0]?.provenance.source, "CYCLE_PLACEMENT");
  });

  it("treats Facility type alone as not attached", () => {
    const empty = emptyLocationProgram({
      departmentId: "dept-1",
      departmentName: "Dietary",
      spaceId: "retail",
      name: "Retail",
      facilityTypeLabel: "Retail",
    });
    assert.equal(locationProgramIsAttached(empty), false);
    assert.equal(locationProgramIsAttached(composeLocationProgram(baseInput())), true);
  });

  it("marks a type default suppressed on that room only", () => {
    const input = baseInput();
    input.suppressions = [{ defaultId: "def-1", spaceId: "servery-3a" }];
    const program = composeLocationProgram(input);
    const typeLog = program.logs.find((row) => row.kind === "TYPE_DEFAULT");
    assert.equal(typeLog?.suppressed, true);
    assert.match(typeLog?.provenance.detail ?? "", /Suppressed on this room/);
  });
});

describe("Location Program contracts", () => {
  it("is a composed read model, not a Prisma table", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const barrel = readFileSync(
      join(process.cwd(), "src/lib/department-administration/index.ts"),
      "utf8",
    );
    const inspectLoader = readFileSync(
      join(process.cwd(), "src/lib/department-administration/load-location-room-inspect.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      "utf8",
    );
    assert.doesNotMatch(schema, /model LocationProgram\b/);
    assert.match(barrel, /composeLocationProgram/);
    assert.doesNotMatch(barrel, /from "\.\/load-location-program"/);
    assert.match(inspectLoader, /loadLocationPrograms/);
    assert.match(inspectLoader, /toLocationRoomInspect/);
    assert.doesNotMatch(page, /loadDepartmentLocationPrograms/);
    assert.doesNotMatch(page, /loadEffectiveLocationProgram/);
  });
});
