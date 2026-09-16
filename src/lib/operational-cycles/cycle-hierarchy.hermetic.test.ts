import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveMealType,
  parentOptionsForCycle,
  projectCycleHierarchy,
  wouldCreateHierarchyCycle,
} from "./cycle-hierarchy";

test("existing cycle with no parent is root", () => {
  const tree = projectCycleHierarchy([
    { stableKey: "breakfast", label: "Breakfast", parentStableKey: null, displaySequence: 10 },
    { stableKey: "lunch", label: "Lunch", displaySequence: 20 },
  ]);
  assert.equal(tree.roots.length, 2);
  assert.equal(tree.roots[0]!.depth, 0);
  assert.equal(tree.roots[0]!.parentStableKey, null);
  assert.equal(tree.byStableKey.get("lunch")!.depth, 0);
});

test("root can have child and child can have child with correct depth/path", () => {
  const tree = projectCycleHierarchy([
    { stableKey: "breakfast", label: "Breakfast", parentStableKey: null, displaySequence: 10 },
    {
      stableKey: "servery",
      label: "Servery Service",
      parentStableKey: "breakfast",
      displaySequence: 20,
    },
    {
      stableKey: "floor",
      label: "Floor Service",
      parentStableKey: "servery",
      displaySequence: 30,
    },
  ]);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0]!.hasChildren, true);
  assert.equal(tree.roots[0]!.children[0]!.stableKey, "servery");
  assert.equal(tree.roots[0]!.children[0]!.depth, 1);
  assert.equal(tree.roots[0]!.children[0]!.children[0]!.depth, 2);
  assert.equal(
    tree.roots[0]!.children[0]!.children[0]!.displayPath,
    "Breakfast → Servery Service → Floor Service",
  );
  // Root → leaf order (matches display path / depth walk).
  assert.deepEqual(tree.byStableKey.get("floor")!.ancestorStableKeys, [
    "breakfast",
    "servery",
  ]);
});

test("sibling ordering is deterministic and branch-local", () => {
  const tree = projectCycleHierarchy([
    { stableKey: "breakfast", label: "Breakfast", parentStableKey: null, displaySequence: 10 },
    { stableKey: "lunch", label: "Lunch", parentStableKey: null, displaySequence: 20 },
    {
      stableKey: "b-close",
      label: "Closeout",
      parentStableKey: "breakfast",
      displaySequence: 40,
    },
    {
      stableKey: "b-prep",
      label: "Main Kitchen Prep",
      parentStableKey: "breakfast",
      displaySequence: 10,
    },
    {
      stableKey: "b-servery",
      label: "Servery Service",
      parentStableKey: "breakfast",
      displaySequence: 20,
    },
    {
      stableKey: "l-prep",
      label: "Lunch Prep",
      parentStableKey: "lunch",
      displaySequence: 5,
    },
  ]);
  assert.deepEqual(
    tree.roots[0]!.children.map((c) => c.stableKey),
    ["b-prep", "b-servery", "b-close"],
  );
  assert.deepEqual(
    tree.roots[1]!.children.map((c) => c.stableKey),
    ["l-prep"],
  );
});

test("cycle cannot parent itself or a descendant", () => {
  const rows = [
    { stableKey: "a", label: "A", parentStableKey: null },
    { stableKey: "b", label: "B", parentStableKey: "a" },
    { stableKey: "c", label: "C", parentStableKey: "b" },
  ];
  assert.equal(
    wouldCreateHierarchyCycle({ stableKey: "a", parentStableKey: "a", rows }).ok,
    false,
  );
  assert.equal(
    wouldCreateHierarchyCycle({ stableKey: "a", parentStableKey: "c", rows }).ok,
    false,
  );
  assert.equal(
    wouldCreateHierarchyCycle({ stableKey: "c", parentStableKey: "a", rows }).ok,
    true,
  );
});

test("orphan parentStableKey becomes root — no label inference", () => {
  const tree = projectCycleHierarchy([
    {
      stableKey: "morning_prep",
      label: "Morning Prep",
      parentStableKey: "breakfast-that-does-not-exist",
      displaySequence: 10,
    },
  ]);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0]!.parentStableKey, null);
});

test("effectiveMealType walks ancestors without a generalized inheritance engine", () => {
  const rows = [
    {
      stableKey: "breakfast",
      label: "Breakfast",
      parentStableKey: null,
      mealType: "BREAKFAST" as const,
    },
    {
      stableKey: "servery",
      label: "Servery Service",
      parentStableKey: "breakfast",
      mealType: null,
    },
  ];
  assert.equal(
    effectiveMealType({ mealType: null, stableKey: "servery", rows }),
    "BREAKFAST",
  );
  assert.equal(
    effectiveMealType({ mealType: "LUNCH", stableKey: "servery", rows }),
    "LUNCH",
  );
});

test("parent options exclude self and descendants", () => {
  const rows = [
    { stableKey: "breakfast", label: "Breakfast", parentStableKey: null },
    { stableKey: "servery", label: "Servery Service", parentStableKey: "breakfast" },
    { stableKey: "floor", label: "Floor Service", parentStableKey: "servery" },
    { stableKey: "lunch", label: "Lunch", parentStableKey: null },
  ];
  const options = parentOptionsForCycle({ stableKey: "breakfast", rows });
  assert.ok(!options.some((o) => o.stableKey === "breakfast"));
  assert.ok(!options.some((o) => o.stableKey === "servery"));
  assert.ok(!options.some((o) => o.stableKey === "floor"));
  assert.ok(options.some((o) => o.stableKey === "lunch"));
});

test("nested scopes coexist as independent children under one parent", () => {
  const tree = projectCycleHierarchy([
    { stableKey: "breakfast", label: "Breakfast", parentStableKey: null, displaySequence: 1 },
    {
      stableKey: "kitchen",
      label: "Main Kitchen Prep",
      parentStableKey: "breakfast",
      displaySequence: 10,
    },
    {
      stableKey: "servery",
      label: "Servery Service",
      parentStableKey: "breakfast",
      displaySequence: 20,
    },
    {
      stableKey: "retail",
      label: "Retail Breakfast",
      parentStableKey: "breakfast",
      displaySequence: 30,
    },
  ]);
  assert.equal(tree.roots[0]!.children.length, 3);
  assert.deepEqual(
    tree.roots[0]!.children.map((c) => c.label),
    ["Main Kitchen Prep", "Servery Service", "Retail Breakfast"],
  );
});
