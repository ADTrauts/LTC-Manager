import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildDietaryStarterPreview,
  departmentHasCycleConfiguration,
  dietaryStarterPlansToCreate,
  dietaryStarterWouldCreateCount,
} from "./dietary-starter";
import { buildDietaryDefaultCyclePlans } from "./defaults";
import { projectCycleHierarchy } from "./cycle-hierarchy";

test("dietary starter preview is nested Breakfast/Lunch/Dinner with phases and key times", () => {
  const preview = buildDietaryStarterPreview();
  assert.deepEqual(
    preview.map((r) => r.label),
    ["Breakfast", "Lunch", "Dinner"],
  );
  for (const root of preview) {
    assert.ok(root.children.length >= 3);
    assert.ok(root.children.every((c) => c.label !== root.label));
    assert.ok(root.children.some((c) => c.label === "Prep"));
    assert.ok(root.children.some((c) => c.label.endsWith(" Due")));
    assert.ok(root.children.some((c) => c.label === "Cleanup"));
  }
});

test("starter plans persist parentStableKey and include KEY_TIME Due nodes", () => {
  const plans = buildDietaryDefaultCyclePlans();
  const tree = projectCycleHierarchy(plans);
  assert.equal(tree.roots.length, 3);
  assert.ok(tree.roots.every((r) => r.hasChildren));
  assert.ok(plans.some((p) => p.nodeKind === "KEY_TIME" && p.label === "Breakfast Due"));
  assert.ok(plans.some((p) => p.nodeKind === "KEY_TIME" && p.label === "Lunch Due"));
  assert.ok(
    plans.filter((p) => p.parentStableKey).every((p) => {
      return plans.some((parent) => parent.stableKey === p.parentStableKey && !parent.parentStableKey);
    }),
  );
});

test("starter duplicate detection is stableKey-only (rename-safe)", () => {
  const existing = new Set(["breakfast", "breakfast_due"]);
  const missing = dietaryStarterPlansToCreate(existing);
  assert.ok(missing.some((p) => p.stableKey === "lunch"));
  assert.ok(missing.some((p) => p.stableKey === "breakfast_prep"));
  assert.ok(!missing.some((p) => p.stableKey === "breakfast"));
  assert.ok(!missing.some((p) => p.stableKey === "breakfast_due"));
  assert.ok(missing.some((p) => p.label === "Prep" && p.parentStableKey === "lunch"));
});

test("departmentHasCycleConfiguration hides primary starter after setup", () => {
  assert.equal(
    departmentHasCycleConfiguration({ currentCount: 0, draftCount: 0, scheduledCount: 0 }),
    false,
  );
  assert.equal(
    departmentHasCycleConfiguration({ currentCount: 1, draftCount: 0, scheduledCount: 0 }),
    true,
  );
  assert.equal(
    departmentHasCycleConfiguration({ currentCount: 0, draftCount: 3, scheduledCount: 0 }),
    true,
  );
  assert.equal(dietaryStarterWouldCreateCount(new Set()), buildDietaryDefaultCyclePlans().length);
});

test("builder UI uses clickable open targets and nested starter language", () => {
  const root = join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]");
  const tree = readFileSync(join(root, "cycles-tree-list.tsx"), "utf8");
  const panel = readFileSync(join(root, "cycles-panel.tsx"), "utf8");
  assert.match(tree, /data-testid="cycle-open-target"/);
  assert.match(tree, /data-testid="cycle-expand"/);
  assert.match(tree, /data-testid="cycle-drag-handle"/);
  assert.match(tree, /data-cycle-role="major"/);
  assert.match(tree, /data-cycle-role=\{row\.nodeKind === "KEY_TIME" \? "key_time" : "phase"\}/);
  assert.match(tree, /\+ Add phase/);
  assert.match(tree, /\+ Add key time/);
  assert.match(tree, /Scope needs review/);
  assert.doesNotMatch(tree, /Legacy scope — edit to update/);
  assert.doesNotMatch(panel, /Already exists/);
  assert.doesNotMatch(panel, /Add from Dietary defaults/);
  assert.match(panel, /Start with a Dietary example|Add from Dietary starter/);
  assert.match(panel, /Add starter cycles/);
  assert.match(panel, /dietary-starter/);
});
