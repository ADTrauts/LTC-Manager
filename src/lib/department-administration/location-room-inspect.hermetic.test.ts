import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { composeLocationRoomInspect } from "./location-room-inspect";

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
    catalogOptions: [{ stableKey: "temp", name: "Temperature" }],
    logsEnabled: true,
  };
}

describe("Location room inspect", () => {
  it("does not attach a Team to a room", () => {
    const view = composeLocationRoomInspect(baseInput());
    assert.deepEqual(view.teams, []);
    assert.deepEqual(view.cycles, []);
    assert.deepEqual(view.coverage, []);
    assert.doesNotMatch(JSON.stringify(view), /Mary|employee/i);
  });

  it("includes a cycle placed on the room even when no team works here", () => {
    const input = baseInput();
    input.location.spaceId = "retail";
    input.location.facilityRoomTypeId = "type-retail";
    const view = composeLocationRoomInspect(input);
    assert.equal(view.teams.length, 0);
    assert.equal(view.cycles[0]?.label, "Retail window");
    assert.equal(view.cycles[0]?.provenance.detail, "Cycle placed on this room");
  });

  it("keeps explicit room and asset logs with provenance", () => {
    const view = composeLocationRoomInspect(baseInput());
    const labels = view.logs.map((row) => row.label);
    assert.deepEqual(labels, ["Dish machine", "Temp log"]);
    assert.equal(view.logs.some((row) => row.kind === "TYPE_DEFAULT"), false);
    const assetLog = view.logs.find((row) => row.kind === "ASSET");
    assert.equal(assetLog?.canRemove, false);
    assert.match(assetLog?.provenance.detail ?? "", /Hobart 1/);
    const roomLog = view.logs.find((row) => row.kind === "ROOM");
    assert.equal(roomLog?.canRemove, true);
    assert.equal(view.assets[0]?.href, "/assets/asset-1");
    assert.match(view.addLogHref ?? "", /targetKind=SPACE/);
    assert.match(decodeURIComponent(view.addLogHref ?? ""), /tab=locations/);
  });

  it("does not offer Facility Room Type inheritance on the room", () => {
    const input = baseInput();
    input.suppressions = [{ defaultId: "def-1", spaceId: "servery-3a" }];
    const view = composeLocationRoomInspect(input);
    assert.equal(view.logs.some((row) => row.kind === "TYPE_DEFAULT"), false);
  });
});

describe("Locations modal contracts", () => {
  it("inspector authors logs and inspects derived program without employees", () => {
    const client = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(client, /Teams that work here/);
    assert.match(client, /Cycles that landed here/);
    assert.match(client, /location-program-coverage/);
    assert.match(client, /Add log/);
    assert.doesNotMatch(client, /Inherited from Facility type/);
    assert.doesNotMatch(client, /Add log to all/);
    assert.doesNotMatch(client, /Coverage Expectations/);
    assert.doesNotMatch(client, /How we use this room/);
    assert.doesNotMatch(client, /location-program-experiences/);
    assert.doesNotMatch(client, /Mary assigned/);
    assert.doesNotMatch(client, /locations-view-by-type/);
  });
});
