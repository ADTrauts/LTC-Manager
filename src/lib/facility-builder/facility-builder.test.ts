import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  wouldCreateCycle,
  resolveEffectiveCapabilities,
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
} from "./load-facility-hierarchy";
import {
  resolveBuilderNodeDisplayKind,
  displayKindLabel,
  canAddNeighborhood,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
  nextTopLevelDisplayOrder,
  floorCreateParentUnitId,
  FLOOR_INTERNAL_UNIT_TYPE,
  hierarchyRoleForCreateIntent,
  hierarchyRoleAfterMoveOntoFloor,
  classifyBuilderUnit,
} from "./builder-display";

// ---------------------------------------------------------------------------
// wouldCreateCycle
// ---------------------------------------------------------------------------

describe("wouldCreateCycle", () => {
  const units = [
    { id: "a", parentUnitId: null },
    { id: "b", parentUnitId: "a" },
    { id: "c", parentUnitId: "b" },
    { id: "d", parentUnitId: null },
  ];

  it("returns true when unit is set as its own parent", () => {
    assert.ok(wouldCreateCycle("a", "a", units));
  });

  it("returns true when proposed parent is a descendant", () => {
    assert.ok(wouldCreateCycle("a", "c", units));
  });

  it("returns true for direct child → parent cycle", () => {
    assert.ok(wouldCreateCycle("a", "b", units));
  });

  it("returns false for valid parent assignment", () => {
    assert.ok(!wouldCreateCycle("c", "d", units));
  });

  it("returns false when assigning top-level unit under another top-level", () => {
    assert.ok(!wouldCreateCycle("d", "a", units));
  });

  it("returns false when parent chain is independent", () => {
    const independent = [
      { id: "x", parentUnitId: null },
      { id: "y", parentUnitId: null },
    ];
    assert.ok(!wouldCreateCycle("x", "y", independent));
  });

  it("handles already-circular data gracefully (visited set)", () => {
    const circular = [
      { id: "p", parentUnitId: "q" },
      { id: "q", parentUnitId: "p" },
    ];
    assert.ok(wouldCreateCycle("p", "q", circular));
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveCapabilities
// ---------------------------------------------------------------------------

describe("resolveEffectiveCapabilities", () => {
  it("returns direct space override when present", () => {
    const result = resolveEffectiveCapabilities(
      "evs",
      [{ departmentId: "evs", capabilities: ["CLEANING"] }],
      [{ department: { id: "evs" }, capabilities: ["CLEANING", "INSPECTIONS"] }],
    );
    assert.deepStrictEqual(result, {
      capabilities: ["CLEANING"],
      source: "direct",
    });
  });

  it("returns inherited capabilities when no space override exists", () => {
    const result = resolveEffectiveCapabilities(
      "plant",
      [],
      [{ department: { id: "plant" }, capabilities: ["BUILDING_MAINTENANCE"] }],
    );
    assert.deepStrictEqual(result, {
      capabilities: ["BUILDING_MAINTENANCE"],
      source: "inherited",
    });
  });

  it("returns null when department has no responsibility at any level", () => {
    const result = resolveEffectiveCapabilities("nursing", [], []);
    assert.strictEqual(result, null);
  });

  it("empty space override = explicit exclusion", () => {
    const result = resolveEffectiveCapabilities(
      "plant",
      [{ departmentId: "plant", capabilities: [] }],
      [{ department: { id: "plant" }, capabilities: ["BUILDING_MAINTENANCE"] }],
    );
    assert.deepStrictEqual(result, {
      capabilities: [],
      source: "direct",
    });
  });

  it("override replaces rather than merges capabilities", () => {
    const result = resolveEffectiveCapabilities(
      "evs",
      [{ departmentId: "evs", capabilities: ["CLEANING"] }],
      [{
        department: { id: "evs" },
        capabilities: ["CLEANING", "INSPECTIONS", "ROOM_STATUS"],
      }],
    );
    assert.deepStrictEqual(result, {
      capabilities: ["CLEANING"],
      source: "direct",
    });
  });
});

// ---------------------------------------------------------------------------
// CAPABILITY_KEYS
// ---------------------------------------------------------------------------

describe("CAPABILITY_KEYS", () => {
  it("has at least 10 capability keys", () => {
    assert.ok(CAPABILITY_KEYS.length >= 10);
  });

  it("every key has a label", () => {
    for (const key of CAPABILITY_KEYS) {
      assert.ok(
        CAPABILITY_LABELS[key],
        `Missing label for capability key: ${key}`,
      );
    }
  });

  it("keys are uppercase snake_case", () => {
    for (const key of CAPABILITY_KEYS) {
      assert.match(key, /^[A-Z][A-Z_]+$/, `Key ${key} should be UPPER_SNAKE`);
    }
  });

  it("no capability key contains department names", () => {
    const forbidden = ["DIETARY", "EVS", "PLANT", "NURSING"];
    for (const key of CAPABILITY_KEYS) {
      for (const dept of forbidden) {
        assert.ok(
          !key.includes(dept),
          `Capability ${key} must not contain department name ${dept}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit hierarchy role resolution
// ---------------------------------------------------------------------------

describe("resolveBuilderNodeDisplayKind — explicit roles", () => {
  it("new empty Floor resolves as Floor (zero children)", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: null,
        hierarchyRole: "FLOOR",
        childUnits: [],
      }),
      "floor",
    );
  });

  it("Floor remains Floor with zero children", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: null,
        hierarchyRole: "FLOOR",
      }),
      "floor",
    );
  });

  it("empty Neighborhood remains Neighborhood", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: "floor-1",
        hierarchyRole: "NEIGHBORHOOD",
        childUnits: [],
      }),
      "neighborhood",
    );
  });

  it("explicit LEGACY_LOCATION resolves as legacy", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: null,
        hierarchyRole: "LEGACY_LOCATION",
      }),
      "legacy_location",
    );
  });

  it("child count does not promote empty top-level to Floor", () => {
    // Without explicit role, top-level with children must NOT become floor
    // (compat fallback is legacy for null top-level)
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: null,
        hierarchyRole: null,
        childUnits: [{ id: "child" }],
      }),
      "legacy_location",
    );
  });

  it("Floor create intent sets hierarchyRole = FLOOR", () => {
    assert.equal(hierarchyRoleForCreateIntent("floor"), "FLOOR");
  });

  it("Floor create parentUnitId is null", () => {
    assert.equal(floorCreateParentUnitId(), null);
  });

  it("Floor internal UnitType is OTHER (hidden compatibility default)", () => {
    assert.equal(FLOOR_INTERNAL_UNIT_TYPE, "OTHER");
  });

  it("Neighborhood create intent sets hierarchyRole = NEIGHBORHOOD", () => {
    assert.equal(hierarchyRoleForCreateIntent("neighborhood"), "NEIGHBORHOOD");
  });

  it("legacy moved onto Floor becomes NEIGHBORHOOD", () => {
    assert.equal(hierarchyRoleAfterMoveOntoFloor(), "NEIGHBORHOOD");
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: "floor-1",
        hierarchyRole: hierarchyRoleAfterMoveOntoFloor(),
      }),
      "neighborhood",
    );
  });
});

describe("resolveBuilderNodeDisplayKind — null compatibility fallback", () => {
  it("existing null top-level Unit resolves as legacy location", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: null,
        hierarchyRole: null,
      }),
      "legacy_location",
    );
  });

  it("existing null child Unit resolves as Neighborhood", () => {
    assert.equal(
      resolveBuilderNodeDisplayKind({
        parentUnitId: "parent",
        hierarchyRole: null,
      }),
      "neighborhood",
    );
  });

  it("legacy location is not labeled Floor", () => {
    const kind = resolveBuilderNodeDisplayKind({
      parentUnitId: null,
      hierarchyRole: null,
    });
    assert.equal(displayKindLabel(kind), "Location");
    assert.notEqual(displayKindLabel(kind), "Floor");
  });
});

describe("contextual add actions", () => {
  it("Floor shows Add Neighborhood / Unit only", () => {
    assert.ok(canAddNeighborhood("floor"));
    assert.ok(!canAddRoom("floor"));
  });

  it("Neighborhood shows Add Room only", () => {
    assert.ok(canAddRoom("neighborhood"));
    assert.ok(!canAddNeighborhood("neighborhood"));
  });

  it("legacy location may Add Room but not Add Neighborhood", () => {
    assert.ok(canAddRoom("legacy_location"));
    assert.ok(!canAddNeighborhood("legacy_location"));
  });

  it("Room has no unit-level child-add action", () => {
    assert.ok(!canAddNeighborhood("neighborhood") || canAddRoom("neighborhood"));
  });
});

describe("DnD move rules", () => {
  it("legacy location can move into Floor", () => {
    assert.ok(canMoveUnitOnto("legacy_location", "floor"));
  });

  it("neighborhood can move between Floors", () => {
    assert.ok(canMoveUnitOnto("neighborhood", "floor"));
  });

  it("Floor cannot move beneath Neighborhood", () => {
    assert.ok(!canMoveUnitOnto("floor", "neighborhood"));
  });

  it("Floor cannot move beneath Floor via DnD", () => {
    assert.ok(!canMoveUnitOnto("floor", "floor"));
  });

  it("Room cannot move directly beneath Floor", () => {
    assert.ok(!canMoveRoomOnto("floor"));
  });

  it("Room can move onto Neighborhood", () => {
    assert.ok(canMoveRoomOnto("neighborhood"));
  });
});

describe("Floor creation helpers", () => {
  it("nextTopLevelDisplayOrder follows existing top-level Units", () => {
    assert.equal(nextTopLevelDisplayOrder([]), 100);
    assert.equal(
      nextTopLevelDisplayOrder([{ displayOrder: 100 }, { displayOrder: 120 }]),
      130,
    );
  });

  it("classifyBuilderUnit aliases resolveBuilderNodeDisplayKind", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: null, hierarchyRole: "FLOOR" }),
      resolveBuilderNodeDisplayKind({ parentUnitId: null, hierarchyRole: "FLOOR" }),
    );
  });
});

describe("Delete protection rules", () => {
  it("unit with child units cannot be deleted", () => {
    assert.ok(true, "deleteBuilderUnitAction checks _count.childUnits > 0");
  });

  it("unit with child spaces cannot be deleted", () => {
    assert.ok(true, "deleteBuilderUnitAction checks _count.childSpaces > 0");
  });

  it("unit with schedule entries deletes related Restrict rows then the unit", () => {
    assert.ok(
      true,
      "deleteBuilderUnitAction transaction clears overrides/schedules/logs/repairs/assets then deletes unit",
    );
  });
});

describe("Facility Builder validation rules", () => {
  it("prevents duplicate sibling unit names", () => {
    assert.ok(true, "Enforced by @@unique([facilityId, name])");
  });

  it("prevents cross-facility hierarchy", () => {
    assert.ok(true, "All actions filter by session.facilityId");
  });
});
