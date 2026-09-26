import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Department Locations programming contracts", () => {
  it("Locations actions use pattern authoring, not the full Profiles flag", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/actions.ts"),
      "utf8",
    );
    const assignStart = actions.indexOf("export async function assignLocationOperationalTypeAction");
    const assignEnd = actions.indexOf(
      "export async function clearLocationOperationalTypeAction",
    );
    const assignBlock = actions.slice(assignStart, assignEnd);
    assert.match(assignBlock, /ROLE_BINDING_RETIRED/);
    assert.doesNotMatch(assignBlock, /bindRoomToArchetype/);
    assert.doesNotMatch(assignBlock, /requireFeature\(/);

    const createStart = actions.indexOf("export async function createLocationOperationalTypeAction");
    const createBlock = actions.slice(createStart);
    assert.match(createBlock, /ROLE_BINDING_RETIRED/);
    assert.doesNotMatch(createBlock, /bindRoomToArchetype/);
  });

  it("inspector shows Facility type and overlays without Role or Experiences", () => {
    const client = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
      ),
      "utf8",
    );
    assert.match(client, /Facility type/);
    assert.match(client, /is responsible/);
    assert.match(client, /GuardedModal/);
    assert.match(client, /Teams that work here/);
    assert.match(client, /Cycles that landed here/);
    assert.match(client, /Staffing need/);
    assert.match(client, /Add log/);
    assert.doesNotMatch(client, /Coverage Expectations/);
    assert.doesNotMatch(client, /groupRoomsByFacilityRoomType/);
    assert.doesNotMatch(client, /How we use this room/);
    assert.doesNotMatch(client, /Create new/);
    assert.doesNotMatch(client, /location-role-create/);
    assert.doesNotMatch(client, /assignLocationOperationalTypeAction/);
    assert.doesNotMatch(client, /clearLocationOperationalTypeAction/);
    assert.doesNotMatch(client, /location-program-experiences/);
    assert.doesNotMatch(client, /Prepare roles/);
    assert.doesNotMatch(client, /By role/);
    assert.doesNotMatch(client, /Covered/);
    assert.doesNotMatch(client, /Mary assigned/);
  });

  it("Locations panel still sends responsibility edits to Facility Builder", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
      ),
      "utf8",
    );
    assert.match(panel, /\/admin\/facility\/builder/);
    assert.match(panel, /LocationsProgrammingClient/);
  });
});
