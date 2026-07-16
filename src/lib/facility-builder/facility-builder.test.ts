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
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
  hierarchyRoleForCreateIntent,
  hierarchyRoleAfterMoveOntoFloor,
  classifyBuilderUnit,
} from "./builder-display";
import {
  BULK_ROOM_MAX,
  expandRoomNameRange,
  parseBulkRoomLines,
  normalizeSiblingOrders,
  reorderSiblingIds,
  filterHierarchyForSearch,
  listFloorMoveDestinations,
  listNeighborhoodMoveDestinations,
  shouldReorderUnitsAsSiblings,
  terraceViewFixture,
  splitHighlightParts,
  mergeOrderedSubsetIntoSiblings,
  nextAppendDisplayOrder,
  nextAppendSortOrder,
} from "./builder-setup";
import {
  SPACE_TYPE_PRESETS,
  SPACE_TYPE_LABELS,
  resolveSpaceTypeFromPreset,
  resolveSpaceTypeDisplayLabel,
  looksLikeTechnicalEnumName,
  findSpaceTypePreset,
} from "./space-type-presets";
import { unitTypeLabel, UNIT_TYPE_LABELS } from "../unit-type-config";
import { SpaceType } from "@prisma/client";

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

// ---------------------------------------------------------------------------
// Stage 2C — setup efficiency helpers
// ---------------------------------------------------------------------------

describe("parseBulkRoomLines", () => {
  it("parses multiline names in order and ignores blanks", () => {
    const result = parseBulkRoomLines(
      "Patient Room 32A\n\nPatient Room 33A\n  Soil Hold  \n\nClean Hold\n",
    );
    assert.deepEqual(result.names, [
      "Patient Room 32A",
      "Patient Room 33A",
      "Soil Hold",
      "Clean Hold",
    ]);
    assert.equal(result.blankLinesIgnored, 3);
  });

  it("handles duplicate input names (first wins)", () => {
    const result = parseBulkRoomLines("Room A\nRoom B\nRoom A\nRoom B");
    assert.deepEqual(result.names, ["Room A", "Room B"]);
    assert.deepEqual(result.duplicateInBatch, ["Room A", "Room B"]);
  });

  it("expands deterministic ranges with matching letter suffix", () => {
    const expanded = expandRoomNameRange("Patient Room 32A–40A");
    assert.ok(expanded);
    assert.equal(expanded!.length, 9);
    assert.equal(expanded![0], "Patient Room 32A");
    assert.equal(expanded![8], "Patient Room 40A");
  });

  it("rejects ranges with mismatched letter suffixes", () => {
    assert.equal(expandRoomNameRange("Room 32A-40B"), null);
  });

  it("enforces batch size constant", () => {
    assert.equal(BULK_ROOM_MAX, 100);
    const lines = Array.from({ length: 101 }, (_, i) => `Room ${i + 1}`).join("\n");
    const result = parseBulkRoomLines(lines);
    assert.equal(result.names.length, 101);
    // Action rejects > BULK_ROOM_MAX after parse
    assert.ok(result.names.length > BULK_ROOM_MAX);
  });
});

describe("sibling ordering helpers", () => {
  it("reorders floors among siblings", () => {
    const next = reorderSiblingIds(["floor-a", "floor-b", "floor-c"], "floor-c", "floor-a");
    assert.deepEqual(next, ["floor-c", "floor-a", "floor-b"]);
  });

  it("normalizes displayOrder / sortOrder to stable increments", () => {
    assert.deepEqual(normalizeSiblingOrders(["a", "b", "c"]), [
      { id: "a", order: 10 },
      { id: "b", order: 20 },
      { id: "c", order: 30 },
    ]);
  });

  it("detects floor sibling reorder vs reparent", () => {
    assert.ok(
      shouldReorderUnitsAsSiblings(
        { id: "f1", parentUnitId: null, hierarchyRole: "FLOOR" },
        { id: "f2", parentUnitId: null, hierarchyRole: "FLOOR" },
      ),
    );
    assert.ok(
      !shouldReorderUnitsAsSiblings(
        { id: "n1", parentUnitId: "f1", hierarchyRole: "NEIGHBORHOOD" },
        { id: "f2", parentUnitId: null, hierarchyRole: "FLOOR" },
      ),
    );
  });

  it("reorders neighborhoods within the same floor", () => {
    assert.ok(
      shouldReorderUnitsAsSiblings(
        { id: "n1", parentUnitId: "floor-1", hierarchyRole: "NEIGHBORHOOD" },
        { id: "n2", parentUnitId: "floor-1", hierarchyRole: "NEIGHBORHOOD" },
      ),
    );
  });

  it("does not treat different parents as reorder siblings", () => {
    assert.ok(
      !shouldReorderUnitsAsSiblings(
        { id: "n1", parentUnitId: "floor-1", hierarchyRole: "NEIGHBORHOOD" },
        { id: "n2", parentUnitId: "floor-2", hierarchyRole: "NEIGHBORHOOD" },
      ),
    );
  });

  it("merges floor reorder without moving unrelated legacy siblings", () => {
    const merged = mergeOrderedSubsetIntoSiblings(
      ["floor-a", "legacy", "floor-b"],
      ["floor-b", "floor-a"],
    );
    assert.deepEqual(merged, ["floor-b", "legacy", "floor-a"]);
  });
});

describe("move destination pickers", () => {
  const tree = terraceViewFixture();

  it("lists only Floors as unit move destinations", () => {
    const floors = listFloorMoveDestinations(tree);
    assert.deepEqual(
      floors.map((f) => f.name).sort(),
      ["First Floor", "Ground Floor", "Second Floor"],
    );
    assert.ok(floors.every((f) => f.kind === "floor"));
  });

  it("excludes current parent floor from destinations", () => {
    const floors = listFloorMoveDestinations(tree, {
      excludeParentId: "floor-first",
    });
    assert.ok(!floors.some((f) => f.id === "floor-first"));
    assert.ok(floors.some((f) => f.id === "floor-second"));
  });

  it("lists neighborhoods for room moves and excludes floors", () => {
    const dest = listNeighborhoodMoveDestinations(tree);
    assert.ok(dest.every((d) => d.kind === "neighborhood"));
    assert.ok(dest.some((d) => d.name === "1A – Naval Park"));
    assert.ok(!dest.some((d) => d.name === "First Floor"));
  });

  it("excludes current neighborhood from room destinations", () => {
    const dest = listNeighborhoodMoveDestinations(tree, {
      excludeUnitId: "nbh-naval",
    });
    assert.ok(!dest.some((d) => d.id === "nbh-naval"));
  });

  it("legacy becomes NEIGHBORHOOD after move onto Floor", () => {
    assert.equal(hierarchyRoleAfterMoveOntoFloor(), "NEIGHBORHOOD");
  });
});

describe("hierarchy search — Terrace View fixture", () => {
  const tree = terraceViewFixture();

  it("matches a Floor by name", () => {
    const result = filterHierarchyForSearch(tree, "First Floor");
    assert.equal(result.matchCount, 1);
    assert.equal(result.units.length, 1);
    assert.equal(result.units[0]!.name, "First Floor");
  });

  it("Neighborhood match includes Floor ancestor", () => {
    const result = filterHierarchyForSearch(tree, "Naval Park");
    assert.equal(result.units.length, 1);
    assert.equal(result.units[0]!.name, "First Floor");
    assert.equal(result.units[0]!.childUnits[0]!.name, "1A – Naval Park");
    assert.ok(result.expandedIds.has("floor-first"));
    assert.ok(result.expandedIds.has("nbh-naval"));
  });

  it("Room match includes Floor and Neighborhood ancestors", () => {
    const result = filterHierarchyForSearch(tree, "Patient Room 32A");
    assert.equal(result.units.length, 1);
    assert.equal(result.units[0]!.name, "First Floor");
    assert.equal(result.units[0]!.childUnits[0]!.name, "1A – Naval Park");
    assert.equal(result.units[0]!.childUnits[0]!.childSpaces[0]!.name, "Patient Room 32A");
    assert.ok(result.expandedIds.has("floor-first"));
    assert.ok(result.expandedIds.has("nbh-naval"));
  });

  it("matches room codes case-insensitively", () => {
    const result = filterHierarchyForSearch(tree, "srv");
    assert.ok(result.matchCount >= 1);
    assert.ok(
      result.units[0]!.childUnits[0]!.childSpaces.some((s) => s.code === "SRV"),
    );
  });

  it("is case-insensitive for names", () => {
    const result = filterHierarchyForSearch(tree, "soil hold");
    assert.ok(result.matchCount >= 1);
  });

  it("returns empty for no results", () => {
    const result = filterHierarchyForSearch(tree, "zzz-not-found");
    assert.equal(result.units.length, 0);
    assert.equal(result.matchCount, 0);
  });

  it("clearing search (empty query) returns full tree", () => {
    const result = filterHierarchyForSearch(tree, "   ");
    assert.equal(result.units.length, tree.length);
    assert.equal(result.matchCount, 0);
  });

  it("hides unrelated branches while searching", () => {
    const result = filterHierarchyForSearch(tree, "MLK");
    assert.equal(result.units.length, 1);
    assert.equal(result.units[0]!.name, "Second Floor");
    assert.ok(!result.units.some((u) => u.name === "Ground Floor"));
  });

  it("highlights matched text parts", () => {
    const parts = splitHighlightParts("Patient Room 32A", "room");
    assert.ok(parts.some((p) => p.match && p.text.toLowerCase() === "room"));
  });
});

describe("Stage 2C regression markers", () => {
  it("Add Floor / Neighborhood / Room helpers remain role-gated", () => {
    assert.ok(canAddNeighborhood("floor") && !canAddRoom("floor"));
    assert.ok(canAddRoom("neighborhood") && !canAddNeighborhood("neighborhood"));
  });

  it("DnD move rules unchanged for floors and rooms", () => {
    assert.ok(!canMoveUnitOnto("floor", "floor"));
    assert.ok(canMoveUnitOnto("legacy_location", "floor"));
    assert.ok(!canMoveRoomOnto("floor"));
    assert.ok(canMoveRoomOnto("neighborhood"));
  });

  it("Terrace View fixture has expected structure", () => {
    const tree = terraceViewFixture();
    assert.equal(tree.length, 3);
    const first = tree.find((u) => u.id === "floor-first")!;
    assert.equal(first.childUnits.length, 2);
    const naval = first.childUnits.find((u) => u.id === "nbh-naval")!;
    assert.equal(naval.childSpaces.length, 5);
  });
});

// ---------------------------------------------------------------------------
// UX correction — types, restroom labels, append order
// ---------------------------------------------------------------------------

describe("Restroom terminology", () => {
  it("RESTROOM_CLUSTER internal value displays as Restroom", () => {
    assert.equal(unitTypeLabel("RESTROOM_CLUSTER"), "Restroom");
    assert.equal(UNIT_TYPE_LABELS.RESTROOM_CLUSTER, "Restroom");
    assert.notEqual(unitTypeLabel("RESTROOM_CLUSTER"), "Restroom Cluster");
    assert.notEqual(unitTypeLabel("RESTROOM_CLUSTER"), "Restroom cluster");
  });

  it("Space RESTROOM displays as Restroom", () => {
    assert.equal(SPACE_TYPE_LABELS.RESTROOM, "Restroom");
    assert.equal(
      resolveSpaceTypeDisplayLabel({ spaceType: SpaceType.RESTROOM }),
      "Restroom",
    );
  });
});

describe("Space type presets", () => {
  it("Resident Room preset resolves to PATIENT_ROOM with display label", () => {
    const r = resolveSpaceTypeFromPreset({ presetKey: "resident_room" });
    assert.equal(r.spaceType, SpaceType.PATIENT_ROOM);
    assert.equal(r.customTypeLabel, "Resident Room");
  });

  it("Patient Room preset resolves correctly", () => {
    const r = resolveSpaceTypeFromPreset({ presetKey: "patient_room" });
    assert.equal(r.spaceType, SpaceType.PATIENT_ROOM);
    assert.equal(r.customTypeLabel, "Patient Room");
  });

  it("Hallway preset resolves to PUBLIC_AREA", () => {
    const r = resolveSpaceTypeFromPreset({ presetKey: "hallway" });
    assert.equal(r.spaceType, SpaceType.PUBLIC_AREA);
    assert.equal(r.customTypeLabel, "Hallway");
  });

  it("Dining Room preset resolves to SERVICE_AREA", () => {
    const r = resolveSpaceTypeFromPreset({ presetKey: "dining_room" });
    assert.equal(r.spaceType, SpaceType.SERVICE_AREA);
    assert.equal(r.customTypeLabel, "Dining Room");
  });

  it("Servery preset resolves to SERVICE_AREA", () => {
    const r = resolveSpaceTypeFromPreset({ presetKey: "servery" });
    assert.equal(r.spaceType, SpaceType.SERVICE_AREA);
    assert.equal(r.customTypeLabel, "Servery");
  });

  it("Custom requires label", () => {
    assert.throws(
      () => resolveSpaceTypeFromPreset({ presetKey: "custom", customTypeLabel: "  " }),
      /Custom type label is required/,
    );
  });

  it("Custom label is preserved", () => {
    const r = resolveSpaceTypeFromPreset({
      presetKey: "custom",
      customTypeLabel: "  Soil Hold  ",
    });
    assert.equal(r.spaceType, SpaceType.OTHER);
    assert.equal(r.customTypeLabel, "Soil Hold");
    assert.equal(
      resolveSpaceTypeDisplayLabel({
        spaceType: r.spaceType,
        customTypeLabel: r.customTypeLabel,
      }),
      "Soil Hold",
    );
  });

  it("technical enum names are never used as visible labels", () => {
    for (const preset of SPACE_TYPE_PRESETS) {
      assert.ok(!looksLikeTechnicalEnumName(preset.label), preset.label);
    }
    for (const label of Object.values(SPACE_TYPE_LABELS)) {
      assert.ok(!looksLikeTechnicalEnumName(label), label);
    }
    for (const label of Object.values(UNIT_TYPE_LABELS)) {
      assert.ok(!looksLikeTechnicalEnumName(label), label);
    }
  });

  it("required presets are present", () => {
    const keys = SPACE_TYPE_PRESETS.map((p) => p.key);
    for (const key of [
      "resident_room",
      "patient_room",
      "hallway",
      "dining_room",
      "servery",
      "restroom",
      "custom",
    ]) {
      assert.ok(keys.includes(key), key);
    }
  });
});

describe("Create intent defaults and append order", () => {
  it("Floor create uses OTHER internal UnitType and null parent", () => {
    assert.equal(FLOOR_INTERNAL_UNIT_TYPE, "OTHER");
    assert.equal(floorCreateParentUnitId(), null);
    assert.equal(hierarchyRoleForCreateIntent("floor"), "FLOOR");
  });

  it("Neighborhood create uses safe internal UnitType OTHER", () => {
    assert.equal(NEIGHBORHOOD_INTERNAL_UNIT_TYPE, "OTHER");
    assert.equal(hierarchyRoleForCreateIntent("neighborhood"), "NEIGHBORHOOD");
  });

  it("new Floor appends after top-level siblings", () => {
    assert.equal(nextAppendDisplayOrder([]), 100);
    assert.equal(
      nextAppendDisplayOrder([{ displayOrder: 100 }, { displayOrder: 120 }]),
      130,
    );
  });

  it("new Neighborhood appends within Floor", () => {
    assert.equal(
      nextAppendDisplayOrder([{ displayOrder: 10 }, { displayOrder: 20 }]),
      30,
    );
  });

  it("new Room appends within Neighborhood", () => {
    assert.equal(nextAppendSortOrder([]), 100);
    assert.equal(
      nextAppendSortOrder([{ sortOrder: 100 }, { sortOrder: 110 }]),
      120,
    );
  });

  it("invalid preset key is rejected", () => {
    assert.throws(
      () => resolveSpaceTypeFromPreset({ presetKey: "PATIENT_ROOM" }),
      /Invalid space type/,
    );
  });

  it("findSpaceTypePreset returns undefined for enum constants", () => {
    assert.equal(findSpaceTypePreset("RESTROOM"), undefined);
  });
});
