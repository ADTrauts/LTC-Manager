import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignedDepartmentIds,
  collectDescendantResponsibilityTargets,
  formatApplyToDescendantsConfirm,
  formatStructuralBulkApplyConfirm,
  planResponsibilitySync,
  summarizeApplyScope,
} from "./department-responsibility-sync";

describe("department-responsibility-sync", () => {
  it("lists assigned department ids without duplicates", () => {
    assert.deepEqual(
      assignedDepartmentIds([
        { department: { id: "d1" } },
        { department: { id: "d2" } },
        { department: { id: "d1" } },
      ]),
      ["d1", "d2"],
    );
  });

  it("plans create/delete/keep for checkbox sync without touching kept capabilities", () => {
    const plan = planResponsibilitySync({
      desiredDepartmentIds: ["dietary", "plant"],
      existing: [
        { id: "r-evs", department: { id: "evs" } },
        { id: "r-dietary", department: { id: "dietary" } },
      ],
    });
    assert.deepEqual(plan.toCreate, ["plant"]);
    assert.deepEqual(plan.toDeleteIds, ["r-evs"]);
    assert.deepEqual(plan.toKeep, ["dietary"]);
  });

  it("plans full clear when no departments are selected", () => {
    const plan = planResponsibilitySync({
      desiredDepartmentIds: [],
      existing: [
        { id: "r1", department: { id: "dietary" } },
        { id: "r2", department: { id: "evs" } },
      ],
    });
    assert.deepEqual(plan.toCreate, []);
    assert.deepEqual(plan.toDeleteIds, ["r1", "r2"]);
    assert.deepEqual(plan.toKeep, []);
  });

  it("collects descendant neighborhoods and rooms under a floor", () => {
    const targets = collectDescendantResponsibilityTargets({
      id: "floor-1",
      hierarchyRole: "FLOOR",
      childSpaces: [{ id: "room-direct" }],
      childUnits: [
        {
          id: "neigh-a",
          hierarchyRole: "NEIGHBORHOOD",
          childSpaces: [{ id: "room-a1" }, { id: "room-a2" }],
          childUnits: [],
        },
        {
          id: "neigh-b",
          hierarchyRole: "NEIGHBORHOOD",
          childSpaces: [{ id: "room-b1" }],
          childUnits: [],
        },
      ],
    });
    assert.deepEqual(targets.neighborhoodUnitIds, ["neigh-a", "neigh-b"]);
    assert.deepEqual(targets.spaceIds, [
      "room-direct",
      "room-a1",
      "room-a2",
      "room-b1",
    ]);
  });

  it("skips nested structural floors as unit responsibility targets but still collects their rooms", () => {
    const targets = collectDescendantResponsibilityTargets({
      id: "floor-1",
      hierarchyRole: "FLOOR",
      childSpaces: [],
      childUnits: [
        {
          id: "nested-floor",
          hierarchyRole: "FLOOR",
          childSpaces: [{ id: "room-under-nested-floor" }],
          childUnits: [
            {
              id: "neigh-under-nested",
              hierarchyRole: "NEIGHBORHOOD",
              childSpaces: [{ id: "room-under-neigh" }],
              childUnits: [],
            },
          ],
        },
      ],
    });
    assert.deepEqual(targets.neighborhoodUnitIds, ["neigh-under-nested"]);
    assert.ok(!targets.neighborhoodUnitIds.includes("nested-floor"));
    assert.deepEqual(targets.spaceIds, [
      "room-under-nested-floor",
      "room-under-neigh",
    ]);
  });

  it("summarizes apply scope with facility terminology", () => {
    assert.equal(
      summarizeApplyScope({
        neighborhoodCount: 2,
        roomCount: 14,
        level2Singular: "Neighborhood",
        level2Plural: "Neighborhoods",
        level3Singular: "Room",
        level3Plural: "Rooms",
      }),
      "2 neighborhoods and 14 rooms",
    );
  });

  it("builds an explicit overwrite confirmation", () => {
    const message = formatApplyToDescendantsConfirm({
      locationName: "Ground Floor",
      scopeSummary: "2 neighborhoods and 14 rooms",
    });
    assert.match(message, /Ground Floor/);
    assert.match(message, /2 neighborhoods and 14 rooms/);
    assert.match(message, /overwrite/i);
  });

  it("structural floor bulk confirm never assigns the floor itself", () => {
    const message = formatStructuralBulkApplyConfirm({
      locationName: "Floor 3",
      scopeSummary: "4 neighborhoods and 52 rooms",
    });
    assert.match(message, /Floor 3/);
    assert.match(message, /4 neighborhoods and 52 rooms/);
    assert.match(message, /does not assign departments to Floor 3 itself/i);
    assert.doesNotMatch(message, /floor responsibility/i);
  });
});
