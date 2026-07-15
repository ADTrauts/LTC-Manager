import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { UnitDepartmentKind, SpaceType } from "@prisma/client";

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
});

// ---------------------------------------------------------------------------
// Responsibility inheritance — pure functions
// ---------------------------------------------------------------------------

type DeptCapabilities = { departmentId: string; capabilities: string[] };

/**
 * Resolve effective capabilities for a department at a UnitSpace.
 *
 * Rules (from 05_RESPONSIBILITY_INHERITANCE_RULES.md):
 *  1. If an explicit UnitSpaceResponsibility exists → use its capabilities (override).
 *  2. Otherwise inherit from the parent Unit's UnitDepartmentResponsibility.
 *  3. Empty capabilities on a unit responsibility = legacy full access.
 *  4. No responsibility at any level = no access.
 */
function resolveSpaceCapabilities(
  departmentId: string,
  spaceResponsibilities: DeptCapabilities[],
  unitResponsibilities: DeptCapabilities[],
  allCapabilities: string[],
): string[] | null {
  const explicit = spaceResponsibilities.find(
    (r) => r.departmentId === departmentId,
  );
  if (explicit) return explicit.capabilities;

  const inherited = unitResponsibilities.find(
    (r) => r.departmentId === departmentId,
  );
  if (inherited) {
    return inherited.capabilities.length > 0
      ? inherited.capabilities
      : allCapabilities;
  }

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
  it("returns explicit space-level capabilities when override exists", () => {
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

  it("inherits unit-level capabilities when no space override exists", () => {
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
    assert.deepStrictEqual(result, [
      "BUILDING_MAINTENANCE",
      "EQUIPMENT_MAINTENANCE",
    ]);
  });

  it("legacy empty capabilities = full access", () => {
    const result = resolveSpaceCapabilities(
      "dietary",
      [],
      [{ departmentId: "dietary", capabilities: [] }],
      ALL_CAPS,
    );
    assert.deepStrictEqual(result, ALL_CAPS);
  });

  it("returns null when department has no responsibility at any level", () => {
    const result = resolveSpaceCapabilities("nursing", [], [], ALL_CAPS);
    assert.strictEqual(result, null);
  });

  it("explicit empty override removes all capabilities", () => {
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

  it("override replaces rather than merges inherited capabilities", () => {
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
