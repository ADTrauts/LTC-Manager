import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rootCycleLabelConflicts } from "./team-cycles";

describe("Team cycle identity", () => {
  it("rejects a second root cycle with the same name", () => {
    const existing = [
      { label: "Breakfast", parentStableKey: null, status: "PUBLISHED" },
      { label: "Prep", parentStableKey: "breakfast", status: "DRAFT" },
    ];
    assert.equal(rootCycleLabelConflicts("breakfast", existing), true);
    assert.equal(rootCycleLabelConflicts("Breakfast", existing), true);
    assert.equal(rootCycleLabelConflicts("Lunch", existing), false);
    assert.equal(rootCycleLabelConflicts("Prep", existing), false);
  });
});

describe("Team cycle authoring contracts", () => {
  it("Teams panel hosts create, link, and need — not a Coverage tab", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/team-cycles-panel.tsx",
      ),
      "utf8",
    );
    assert.match(panel, /Cycles this team runs/);
    assert.match(panel, /Create cycle/);
    assert.match(panel, /Link existing/);
    assert.match(panel, /per room/);
    assert.match(panel, /requiredCount/);
    assert.match(panel, /Add phase/);
    assert.match(panel, /Add key time/);
    assert.doesNotMatch(panel, /Add expectation/);
  });

  it("Department Builder redirects Coverage and Cycles into Teams", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      "utf8",
    );
    assert.match(page, /requestedTab === "coverage" \|\| requestedTab === "cycles"/);
    assert.match(page, /departmentAdminHref\(departmentId, "teams"\)/);
    assert.doesNotMatch(page, /CoveragePanel/);
    assert.doesNotMatch(page, /CyclesPanel/);
  });

  it("compact cycle create can be a top-level department cycle", () => {
    const editor = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls.tsx",
      ),
      "utf8",
    );
    const requireBlock = editor.match(/const requireParent =[\s\S]{0,280};/);
    assert.ok(requireBlock);
    assert.doesNotMatch(requireBlock[0], /compactCreate/);
  });
});
