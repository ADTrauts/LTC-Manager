import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Department Locations programming contracts", () => {
  it("inspector separates physical, Department note, and engine overlays without Role or Experiences", () => {
    const client = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
      ),
      "utf8",
    );
    assert.match(client, /Physical room/);
    assert.match(client, /Facility type/);
    assert.match(client, /is responsible/);
    assert.match(client, /updateDepartmentSpaceNoteAction/);
    assert.match(client, /GuardedModal/);
    assert.doesNotMatch(client, /Teams that work here/);
    assert.match(client, /Operating Rhythm/);
    assert.match(client, /Menus/);
    assert.match(client, /location-program-coverage/);
    assert.match(client, /Add log/);
    assert.doesNotMatch(client, /Coverage Expectations/);
    assert.doesNotMatch(client, /groupRoomsByFacilityRoomType/);
    assert.doesNotMatch(client, /Create new/);
    assert.doesNotMatch(client, /location-role-create/);
    assert.doesNotMatch(client, /assignLocationOperationalTypeAction/);
    assert.doesNotMatch(client, /clearLocationOperationalTypeAction/);
    assert.doesNotMatch(client, /location-program-experiences/);
    assert.doesNotMatch(client, /Prepare roles/);
    assert.doesNotMatch(client, /By role/);
    assert.doesNotMatch(client, /Covered/);
    assert.doesNotMatch(client, /Mary assigned/);
    assert.doesNotMatch(client, /Room Archetype/);
    assert.doesNotMatch(client, /Operational Profile/);
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
