import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertDepartmentSpaceNoteLength,
  DEPARTMENT_SPACE_NOTE_MAX_LENGTH,
  normalizeDepartmentSpaceNote,
} from "./department-space-notes";

describe("Department space notes", () => {
  it("normalizes blank notes to null without inventing content", () => {
    assert.equal(normalizeDepartmentSpaceNote(null), null);
    assert.equal(normalizeDepartmentSpaceNote(undefined), null);
    assert.equal(normalizeDepartmentSpaceNote(""), null);
    assert.equal(normalizeDepartmentSpaceNote("   "), null);
    assert.equal(normalizeDepartmentSpaceNote("  Keep carts clear  "), "Keep carts clear");
  });

  it("rejects oversized notes", () => {
    assert.doesNotThrow(() => assertDepartmentSpaceNoteLength("ok"));
    assert.doesNotThrow(() => assertDepartmentSpaceNoteLength(null));
    assert.throws(
      () => assertDepartmentSpaceNoteLength("x".repeat(DEPARTMENT_SPACE_NOTE_MAX_LENGTH + 1)),
      /2000 characters/,
    );
  });

  it("keeps notes on responsibility membership and out of operational engines", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    assert.match(schema, /model UnitSpaceResponsibility \{[\s\S]*notes\s+String\?/);
    assert.doesNotMatch(
      readFileSync(
        join(process.cwd(), "src/lib/department-administration/department-space-notes.ts"),
        "utf8",
      ),
      /DepartmentOperationalProfile|DepartmentRoomArchetype|operationalType/,
    );
  });

  it("classifies the note write in the CDA write manifest", () => {
    const manifest = readFileSync(
      join(process.cwd(), "src/lib/department-authority/write-manifest.ts"),
      "utf8",
    );
    assert.match(manifest, /updateDepartmentSpaceNoteAction:\s*department\("department"\)/);
  });

  it("Facility Room Type copy does not claim automatic operational configuration", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/facility/builder/room-types-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /does not automatically create Logs/);
    assert.match(panel, /Physical classifications/);
  });
});
