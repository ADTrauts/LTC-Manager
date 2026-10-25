import assert from "node:assert/strict";
import test from "node:test";

import { layoutScopeAllowed, mergeLayoutForSave, parseDashboardLayoutItems, readDashboardLayoutItems } from "./parse";

test("a layout accepts known cards and their sizes", () => {
  const result = parseDashboardLayoutItems([
    { card: "attention", size: "L" },
    { card: "timeline", size: "L" },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.items, [
      { card: "attention", size: "L", rows: 1 },
      { card: "timeline", size: "L", rows: 1 },
    ]);
  }
});

test("a layout rejects an unknown card, a bad size, a duplicate, and too many cards", () => {
  assert.equal(parseDashboardLayoutItems([{ card: "not-a-card", size: "M" }]).ok, false);
  assert.equal(parseDashboardLayoutItems([{ card: "attention", size: "S" }]).ok, false);
  assert.equal(
    parseDashboardLayoutItems([
      { card: "attention", size: "M" },
      { card: "attention", size: "L" },
    ]).ok,
    false,
  );
  assert.equal(
    parseDashboardLayoutItems(Array.from({ length: 25 }, () => ({ card: "attention", size: "M" }))).ok,
    false,
  );
});

test("a stored layout drops unknown cards and keeps the rest", () => {
  assert.deepEqual(
    readDashboardLayoutItems([
      { card: "retired", size: "M" },
      { card: "attention", size: "L" },
      { card: "attention", size: "M" },
      { card: "timeline", size: "S" },
    ]),
    [{ card: "attention", size: "L", rows: 1 }],
  );
});

test("a supervisor cannot save a facility layout, and a save keeps cards they cannot see", () => {
  assert.equal(layoutScopeAllowed([{ kind: "DEPARTMENT" }, { kind: "TEAM" }], "FACILITY"), false);
  assert.equal(layoutScopeAllowed([{ kind: "FACILITY" }, { kind: "DEPARTMENT" }], "FACILITY"), true);
  assert.deepEqual(
    mergeLayoutForSave(
      [{ card: "attention", size: "L", rows: 1 }],
      [
        { card: "pm_due", size: "M", rows: 1 },
        { card: "attention", size: "M", rows: 1 },
      ],
      new Set(["attention"]),
    ),
    [
      { card: "attention", size: "L", rows: 1 },
      { card: "pm_due", size: "M", rows: 1 },
    ],
  );
});
