import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UnitDepartmentKind, SpaceType, UnitSpace } from "@prisma/client";

// ---------------------------------------------------------------------------
// Schema-level assertions — verifying the new types exist and are shaped
// correctly.  These compile-time tests break if someone renames/removes an
// enum value or model field that the location architecture depends on.
// ---------------------------------------------------------------------------

describe("Location Architecture Stage 1 — Schema types", () => {
  it("SpaceType enum contains all required values", () => {
    const required: SpaceType[] = [
      "SERVICE_AREA",
      "PATIENT_ROOM",
      "PRODUCTION_AREA",
      "STORAGE",
      "UTILITY",
      "OFFICE",
      "RESTROOM",
      "MECHANICAL",
      "PUBLIC_AREA",
      "OTHER",
    ];
    for (const v of required) {
      assert.ok(v, `SpaceType.${v} must exist`);
    }
  });

  it("UnitDepartmentKind enum includes SUPPORT", () => {
    const kinds: UnitDepartmentKind[] = ["PRIMARY", "BACKUP", "SUPPORT"];
    assert.ok(kinds.includes("SUPPORT"), "SUPPORT must be a valid kind");
  });

  it("UnitSpace supports nullable roomNumber", () => {
    const room = { roomNumber: "32A" } satisfies Pick<UnitSpace, "roomNumber">;
    const legacy = { roomNumber: null } satisfies Pick<UnitSpace, "roomNumber">;
    assert.equal(room.roomNumber, "32A");
    assert.equal(legacy.roomNumber, null);
  });
});

// ---------------------------------------------------------------------------
// Explicit room responsibilities — pure functions
// ---------------------------------------------------------------------------

type DeptCapabilities = { departmentId: string; capabilities: string[] };

/**
 * Resolve explicit capabilities for a department at a UnitSpace.
 *
 * Rules:
 *  1. If an explicit UnitSpaceResponsibility exists → use its capabilities.
 *  2. Floors / neighborhoods do not grant room capabilities.
 *  3. No room responsibility = no room access.
 */
function resolveSpaceCapabilities(
  departmentId: string,
  spaceResponsibilities: DeptCapabilities[],
  unitResponsibilities: DeptCapabilities[],
  allCapabilities: string[],
): string[] | null {
  void unitResponsibilities;
  void allCapabilities;
  const explicit = spaceResponsibilities.find(
    (r) => r.departmentId === departmentId,
  );
  if (explicit) return explicit.capabilities;

  return null;
}

const ALL_CAPS = [
  "SERVICE_OPERATIONS",
  "CLEANING",
  "BUILDING_MAINTENANCE",
  "EQUIPMENT_MAINTENANCE",
  "ASSET_MANAGEMENT",
  "INSPECTIONS",
  "COMPLIANCE",
  "SUPPORT",
];

describe("resolveSpaceCapabilities", () => {
  it("returns explicit room-level capabilities when responsibility exists", () => {
    const result = resolveSpaceCapabilities(
      "evs",
      [{ departmentId: "evs", capabilities: ["CLEANING"] }],
      [
        {
          departmentId: "evs",
          capabilities: ["CLEANING", "INSPECTIONS"],
        },
      ],
      ALL_CAPS,
    );
    assert.deepStrictEqual(result, ["CLEANING"]);
  });

  it("does not inherit unit-level capabilities when no room responsibility exists", () => {
    const result = resolveSpaceCapabilities(
      "plant",
      [],
      [
        {
          departmentId: "plant",
          capabilities: ["BUILDING_MAINTENANCE", "EQUIPMENT_MAINTENANCE"],
        },
      ],
      ALL_CAPS,
    );
    assert.equal(result, null);
  });

  it("unit-level empty capabilities do not create room access", () => {
    const result = resolveSpaceCapabilities(
      "dietary",
      [],
      [{ departmentId: "dietary", capabilities: [] }],
      ALL_CAPS,
    );
    assert.equal(result, null);
  });

  it("returns null when department has no responsibility at any level", () => {
    const result = resolveSpaceCapabilities("nursing", [], [], ALL_CAPS);
    assert.strictEqual(result, null);
  });

  it("explicit empty room responsibility has no selected capabilities", () => {
    const result = resolveSpaceCapabilities(
      "plant",
      [{ departmentId: "plant", capabilities: [] }],
      [
        {
          departmentId: "plant",
          capabilities: ["BUILDING_MAINTENANCE"],
        },
      ],
      ALL_CAPS,
    );
    assert.deepStrictEqual(result, []);
  });

  it("explicit room responsibility does not merge with unit capabilities", () => {
    const result = resolveSpaceCapabilities(
      "plant",
      [
        {
          departmentId: "plant",
          capabilities: ["BUILDING_MAINTENANCE"],
        },
      ],
      [
        {
          departmentId: "plant",
          capabilities: [
            "BUILDING_MAINTENANCE",
            "EQUIPMENT_MAINTENANCE",
            "ASSET_MANAGEMENT",
          ],
        },
      ],
      ALL_CAPS,
    );
    assert.deepStrictEqual(result, ["BUILDING_MAINTENANCE"]);
  });
});
