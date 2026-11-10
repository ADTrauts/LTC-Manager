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
  it("Team authoring does not link a cycle or store a count", () => {
    const actions = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/team-cycle-actions.ts",
      ),
      "utf8",
    );
    const workspace = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx",
      ),
      "utf8",
    );
    assert.match(actions, /A Team does not run a cycle/);
    assert.doesNotMatch(workspace, /Cycles this team runs/);
    assert.doesNotMatch(workspace, /TeamCyclesPanel/);
    const rhythm = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/operating-rhythm-panel.tsx",
      ),
      "utf8",
    );
    assert.match(rhythm, /OperatingRhythmPanel|function OperatingRhythm/);
  });

  it("retired Coverage and Cycles tabs redirect, and Coverage stays its own section", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      "utf8",
    );
    assert.match(page, /isDepartmentAdminRetiredTabId/);
    assert.match(page, /DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT/);
    assert.match(page, /departmentAdminHref\(departmentId, dest, setupWorkspace\)/);
    assert.match(page, /CoveragePanel/);
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
