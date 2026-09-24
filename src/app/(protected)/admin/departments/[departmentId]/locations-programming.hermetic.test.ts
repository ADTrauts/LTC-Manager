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
    assert.match(assignBlock, /ensureWorkingDraftForPatterns/);
    assert.match(assignBlock, /bindRoomToArchetype/);
    assert.match(assignBlock, /archetypeKey/);
    assert.doesNotMatch(assignBlock, /requireFeature\(/);
  });

  it("inspector distinguishes Physical Type from Operational Type and identifies cycle source", () => {
    const client = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
      ),
      "utf8",
    );
    assert.match(client, /Physical Type/);
    assert.match(client, /Operational Type/);
    assert.match(client, /No Operational Type/);
    assert.match(client, /inherit from this room/);
    assert.match(client, /OPERATIONAL_TYPE_DEFAULT/);
    assert.match(client, /Manage Operational Cycles/);
    assert.match(client, /Manage Logs/);
    assert.match(client, /Manage Teams/);
    assert.match(client, /Manage Coverage/);
    assert.match(client, /Configured Teams/);
    assert.match(client, /Coverage Expectations/);
    assert.match(client, /Staffing \/ Coverage Expectations/);
    assert.doesNotMatch(client, /Covered/);
    assert.doesNotMatch(client, /Mary assigned/);
    assert.match(client, /Logs & Evidence/);
    assert.match(client, /groupRoomsByOperationalType/);
    assert.match(client, /assignLocationOperationalTypeAction/);
    assert.match(client, /clearLocationOperationalTypeAction/);
    assert.match(client, /locations-draft-boundary/);
    assert.match(client, /Run keeps the active Operational Types/);
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
