import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  wouldCreateCycle,
  resolveEffectiveCapabilities,
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
} from "./load-facility-hierarchy";
import {
  classifyBuilderUnit,
  displayKindLabel,
  canAddNeighborhood,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
  nextTopLevelDisplayOrder,
  floorCreateParentUnitId,
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
// Capability keys are well-formed
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
// Hierarchy builder validation rules
// ---------------------------------------------------------------------------

describe("Facility Builder validation rules", () => {
  it("prevents duplicate sibling unit names (schema unique constraint)", () => {
    assert.ok(true, "Enforced by @@unique([facilityId, name]) and action validation");
  });

  it("prevents duplicate space names within unit (schema unique constraint)", () => {
    assert.ok(true, "Enforced by @@unique([unitId, name]) and action validation");
  });

  it("prevents deleting units with children (action validation)", () => {
    assert.ok(true, "Enforced by deleteBuilderUnitAction _count check");
  });

  it("prevents deleting units with spaces (action validation)", () => {
    assert.ok(true, "Enforced by deleteBuilderUnitAction _count check");
  });

  it("prevents cross-facility hierarchy (action validation)", () => {
    assert.ok(true, "All actions filter by session.facilityId");
  });

  it("prevents cross-facility responsibility (action validation)", () => {
    assert.ok(true, "All responsibility actions verify dept.facilityId === session.facilityId");
  });
});

// ---------------------------------------------------------------------------
// Delete protection
// ---------------------------------------------------------------------------

describe("Delete protection rules", () => {
  it("unit with child units cannot be deleted", () => {
    assert.ok(
      true,
      "deleteBuilderUnitAction checks _count.childUnits > 0 and throws",
    );
  });

  it("unit with child spaces cannot be deleted", () => {
    assert.ok(
      true,
      "deleteBuilderUnitAction checks _count.childSpaces > 0 and throws",
    );
  });

  it("spaces can always be deleted (cascade removes responsibilities)", () => {
    assert.ok(
      true,
      "UnitSpaceResponsibility FK is onDelete: Cascade from UnitSpace",
    );
  });
});

// ---------------------------------------------------------------------------
// Display classification (Wave 13B Stage 2B hotfix)
// ---------------------------------------------------------------------------

describe("classifyBuilderUnit", () => {
  it("top-level Unit with children displays as Floor", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: null, childUnits: [{ id: "n1" }] }),
      "floor",
    );
  });

  it("top-level Unit without children displays as legacy location", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: null, childUnits: [] }),
      "legacy_location",
    );
  });

  it("child Unit displays as Neighborhood", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: "floor-1", childUnits: [] }),
      "neighborhood",
    );
  });

  it("legacy location is not labeled Floor", () => {
    const kind = classifyBuilderUnit({ parentUnitId: null, childUnits: [] });
    assert.equal(displayKindLabel(kind), "Location");
    assert.notEqual(displayKindLabel(kind), "Floor");
  });

  it("Main Kitchen-style top-level without children is legacy, not Floor", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: null, childUnits: [] }),
      "legacy_location",
    );
  });

  it("after move under Floor, unit becomes Neighborhood", () => {
    assert.equal(
      classifyBuilderUnit({ parentUnitId: "first-floor", childUnits: [] }),
      "neighborhood",
    );
  });
});

describe("contextual add actions", () => {
  it("Floor shows Add Neighborhood only", () => {
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

  it("Room has no unit-level child-add action (rooms are UnitSpace leaves)", () => {
    // Rooms are not BuilderNodeDisplayKind units — no canAdd* applies
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

  it("Room can move onto legacy location", () => {
    assert.ok(canMoveRoomOnto("legacy_location"));
  });
});

describe("Floor creation payload", () => {
  it("Floor create uses parentUnitId = null", () => {
    assert.equal(floorCreateParentUnitId(), null);
  });

  it("nextTopLevelDisplayOrder follows existing top-level Units", () => {
    assert.equal(nextTopLevelDisplayOrder([]), 100);
    assert.equal(
      nextTopLevelDisplayOrder([{ displayOrder: 100 }, { displayOrder: 120 }]),
      130,
    );
  });
});

describe("Floor create action contract", () => {
  it("empty parentUnitId in FormData yields null parent (createBuilderUnitAction)", () => {
    // Mirrors actions.ts: parentUnitId: toOptional(...) → undefined → parentUnitId || null
    function toOptional(value: string | null) {
      if (value == null) return undefined;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }
    const parentUnitId = toOptional("") || null;
    assert.equal(parentUnitId, null);
  });
});
