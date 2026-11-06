import assert from "node:assert/strict";
import test from "node:test";

import { computeCycleTreeMove } from "./cycle-tree-move";
import { mealTimeNeighborhoodCandidates, scopeGroupLabel } from "./cycle-scope";

const rows = [
  {
    id: "b",
    stableKey: "breakfast",
    label: "Breakfast",
    parentStableKey: null,
    displaySequence: 10,
  },
  {
    id: "l",
    stableKey: "lunch",
    label: "Lunch",
    parentStableKey: null,
    displaySequence: 20,
  },
  {
    id: "prep",
    stableKey: "breakfast_prep",
    label: "Main Kitchen Prep",
    parentStableKey: "breakfast",
    displaySequence: 10,
  },
  {
    id: "servery",
    stableKey: "breakfast_servery",
    label: "Servery Service",
    parentStableKey: "breakfast",
    displaySequence: 20,
  },
  {
    id: "retail",
    stableKey: "breakfast_retail",
    label: "Retail Breakfast",
    parentStableKey: "breakfast",
    displaySequence: 30,
  },
];

test("reorder root cycles", () => {
  const result = computeCycleTreeMove({
    rows,
    activeId: "l",
    overId: "b",
    placement: "before",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const lunch = result.updates.find((u) => u.id === "l");
  const breakfast = result.updates.find((u) => u.id === "b");
  assert.equal(lunch?.parentStableKey, null);
  assert.ok((lunch?.displaySequence ?? 99) < (breakfast?.displaySequence ?? 0));
});

test("reorder siblings within a parent", () => {
  const result = computeCycleTreeMove({
    rows,
    activeId: "retail",
    overId: "servery",
    placement: "before",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const ordered = result.updates
    .filter((u) => u.parentStableKey === "breakfast")
    .sort((a, b) => a.displaySequence - b.displaySequence)
    .map((u) => u.id);
  assert.deepEqual(ordered, ["prep", "retail", "servery"]);
  assert.match(result.summary, /Reordered phases in “Breakfast”/);
});

test("move phase between parents", () => {
  const result = computeCycleTreeMove({
    rows,
    activeId: "retail",
    overId: "l",
    placement: "inside",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.updates.find((u) => u.id === "retail")?.parentStableKey, "lunch");
  assert.match(result.summary, /Moved “Retail Breakfast” from “Breakfast” to “Lunch”/);
});

test("promote child to root", () => {
  const result = computeCycleTreeMove({
    rows,
    activeId: "servery",
    overId: "l",
    placement: "before",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.updates.find((u) => u.id === "servery")?.parentStableKey, null);
});

test("move root under another root", () => {
  const result = computeCycleTreeMove({
    rows,
    activeId: "l",
    overId: "b",
    placement: "inside",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.updates.find((u) => u.id === "l")?.parentStableKey, "breakfast");
});

test("reject self-drop and descendant loop", () => {
  assert.equal(
    computeCycleTreeMove({
      rows,
      activeId: "b",
      overId: "b",
      placement: "inside",
    }).ok,
    false,
  );
  assert.equal(
    computeCycleTreeMove({
      rows,
      activeId: "b",
      overId: "servery",
      placement: "inside",
    }).ok,
    false,
  );
});

test("service-time candidates appear from Room Type Servery without Neighborhood catalog rows", () => {
  const candidates = mealTimeNeighborhoodCandidates({
    locationMode: "ROOM_TYPE",
    roomTypeKey: "servery",
    locations: [
      {
        id: "s1",
        kind: "room",
        name: "Naval Park Servery",
        roomTypeKey: "servery",
        neighborhoodId: "np",
        neighborhoodName: "1A – Naval Park",
      },
      {
        id: "s2",
        kind: "room",
        name: "Lighthouse Servery",
        roomTypeKey: "servery",
        neighborhoodId: "lh",
        neighborhoodName: "1B – Lighthouse",
      },
      {
        id: "kitchen",
        kind: "room",
        name: "Main Kitchen",
        roomTypeKey: "production_area",
        neighborhoodId: "ground",
        neighborhoodName: "Ground",
      },
    ],
  });
  assert.deepEqual(
    candidates.map((c) => c.unitId),
    ["np", "lh"],
  );
  assert.equal(candidates[0]?.name, "1A – Naval Park");
});

test("Main Kitchen specific scope does not resolve Servery neighborhoods", () => {
  const candidates = mealTimeNeighborhoodCandidates({
    locationMode: "EXPLICIT_UNITS",
    unitIds: [],
    spaceIds: ["kitchen"],
    locations: [
      {
        id: "kitchen",
        kind: "room",
        name: "Main Kitchen",
        roomTypeKey: "production_area",
        neighborhoodId: "ground",
        neighborhoodName: "Ground Kitchen Nbhd",
      },
      {
        id: "s1",
        kind: "room",
        name: "Naval Park Servery",
        roomTypeKey: "servery",
        neighborhoodId: "np",
        neighborhoodName: "1A – Naval Park",
      },
    ],
  });
  assert.deepEqual(
    candidates.map((c) => c.unitId),
    ["ground"],
  );
});

test("reject drop under KEY_TIME parent", () => {
  const keyTimeRows = [
    ...rows,
    {
      id: "due",
      stableKey: "breakfast_due",
      label: "Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME" as const,
      displaySequence: 15,
    },
  ];
  const result = computeCycleTreeMove({
    rows: keyTimeRows,
    activeId: "prep",
    overId: "due",
    placement: "inside",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Key Time nodes cannot contain child cycles/);
});

test("allow moving KEY_TIME between PERIOD parents", () => {
  const keyTimeRows = [
    ...rows,
    {
      id: "due",
      stableKey: "breakfast_due",
      label: "Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME" as const,
      displaySequence: 15,
    },
  ];
  const result = computeCycleTreeMove({
    rows: keyTimeRows,
    activeId: "due",
    overId: "l",
    placement: "inside",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.updates.find((u) => u.id === "due")?.parentStableKey, "lunch");
});

test("legacy UNIT_TYPES label is not user-facing database jargon", () => {
  assert.equal(
    scopeGroupLabel({ locationMode: "UNIT_TYPES" }),
    "Legacy scope — edit to update",
  );
  assert.doesNotMatch(scopeGroupLabel({ locationMode: "UNIT_TYPES" }), /Legacy unit types/);
});
