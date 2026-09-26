/**
 * Department Builder location projection tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  isActionableDepartmentUnit,
  locationCoverageSummary,
  resolveLocationStatus,
  roomOperationalPattern,
  type HierarchyWalkUnit,
} from "@/lib/department-administration/department-locations";

function unit(
  partial: Partial<HierarchyWalkUnit> & Pick<HierarchyWalkUnit, "id" | "name">,
): HierarchyWalkUnit {
  return {
    unitType: "OTHER",
    hierarchyRole: "NEIGHBORHOOD",
    parentUnitId: "floor-1",
    isActive: true,
    departmentResponsibilities: [],
    childSpaces: [],
    childUnits: [],
    ...partial,
  };
}

describe("Department Builder actionable location projection", () => {
  it("treats floors as structural and neighborhoods/legacy as actionable", () => {
    assert.equal(
      isActionableDepartmentUnit({ hierarchyRole: "BUILDING", parentUnitId: null }),
      false,
    );
    assert.equal(
      isActionableDepartmentUnit({ hierarchyRole: "FLOOR", parentUnitId: null }),
      false,
    );
    assert.equal(
      isActionableDepartmentUnit({
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "f1",
      }),
      true,
    );
    assert.equal(
      isActionableDepartmentUnit({
        hierarchyRole: "LEGACY_LOCATION",
        parentUnitId: null,
      }),
      true,
    );
    assert.equal(
      isActionableDepartmentUnit({ hierarchyRole: "STAGED", parentUnitId: null }),
      false,
    );
  });

  it("does not expose Floor units as operational locations even with responsibility", () => {
    const floor = unit({
      id: "floor-1",
      name: "Floor 1",
      hierarchyRole: "FLOOR",
      parentUnitId: null,
      departmentResponsibilities: [{ department: { id: "dietary" } }],
      childUnits: [
        unit({
          id: "1a",
          name: "1A – Naval Park",
          unitType: "OTHER",
          hierarchyRole: "NEIGHBORHOOD",
          parentUnitId: "floor-1",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
        }),
      ],
    });

    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [floor],
    });

    assert.equal(locations.some((l) => l.id === "floor-1"), false);
    assert.equal(locations.length, 1);
    assert.equal(locations[0]!.id, "1a");
    assert.equal(locations[0]!.kind, "neighborhood");
    assert.equal(locations[0]!.status, "assigned");
    assert.equal(locations[0]!.hasPattern, false);
    assert.equal(locations[0]!.patternKey, null);
    assert.equal(locations[0]!.floorName, "Floor 1");
  });

  it("keeps neighborhoods visible when unitType is OTHER without requiring a pattern", () => {
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "1b",
          name: "1B – Lighthouse",
          unitType: "OTHER",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
        }),
        unit({
          id: "1c",
          name: "1C – Erie Basin Marina",
          unitType: "SERVERY",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
        }),
      ],
    });

    assert.equal(locations.length, 2);
    for (const location of locations) {
      assert.equal(location.kind, "neighborhood");
      assert.equal(location.status, "assigned");
      assert.equal(location.hasPattern, false);
      assert.equal(location.patternLabel, null);
    }
    // unitType may still be present as facility metadata, but is not a pattern.
    assert.equal(locations.find((l) => l.id === "1c")!.unitType, "SERVERY");
    assert.equal(locations.find((l) => l.id === "1c")!.patternKey, null);
  });

  it("does not group neighborhoods by Unit.unitType", () => {
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "floor-1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          childUnits: [
            unit({
              id: "a",
              name: "GC – Kensington",
              unitType: "SERVERY",
              parentUnitId: "floor-1",
              departmentResponsibilities: [{ department: { id: "dietary" } }],
            }),
            unit({
              id: "b",
              name: "Retail Nest",
              unitType: "RETAIL",
              parentUnitId: "floor-1",
              departmentResponsibilities: [{ department: { id: "dietary" } }],
            }),
          ],
        }),
      ],
    });

    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.equal(hierarchy.length, 1);
    assert.equal(hierarchy[0]!.floorName, "Floor 1");
    assert.equal(hierarchy[0]!.neighborhoods.length, 2);
    // No pattern buckets — both neighborhoods sit under the same floor.
    assert.ok(
      hierarchy[0]!.neighborhoods.every((n) => n.location.hasPattern === false),
    );
  });

  it("includes room assignments and optional archetype labels without forcing setup", () => {
    const floor = unit({
      id: "floor-1",
      name: "Floor 1",
      hierarchyRole: "FLOOR",
      parentUnitId: null,
      childUnits: [
        unit({
          id: "kitchen-nbhd",
          name: "Kitchen Wing",
          unitType: "OTHER",
          hierarchyRole: "NEIGHBORHOOD",
          parentUnitId: "floor-1",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
          childSpaces: [
            {
              id: "central",
              name: "Central Kitchen",
              isActive: true,
              responsibilities: [{ department: { id: "dietary" } }],
            },
            {
              id: "unbound",
              name: "Storage Closet",
              isActive: true,
              responsibilities: [{ department: { id: "dietary" } }],
            },
            {
              id: "office",
              name: "Dietitian Office",
              isActive: true,
              responsibilities: [{ department: { id: "evs" } }],
            },
          ],
        }),
      ],
    });

    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [floor],
      roomPatternBySpaceId: new Map([
        [
          "central",
          {
            archetypeKey: "production_kitchen",
            archetypeName: "Production Kitchen",
            exceptionCount: 1,
            recommendedPatternKey: null,
            spaceTypeLabel: "Production",
            displayName: "Central Kitchen",
          },
        ],
      ]),
    });

    assert.equal(locations.some((l) => l.id === "kitchen-nbhd"), true);
    assert.equal(locations.some((l) => l.id === "central"), true);
    assert.equal(locations.some((l) => l.id === "unbound"), true);
    assert.equal(locations.some((l) => l.id === "office"), false);

    const central = locations.find((l) => l.id === "central")!;
    assert.equal(central.kind, "room");
    assert.equal(central.hasPattern, true);
    assert.equal(central.patternLabel, "Production Kitchen");
    assert.equal(central.status, "custom");
    assert.equal(central.parentNeighborhoodId, "kitchen-nbhd");

    const unbound = locations.find((l) => l.id === "unbound")!;
    assert.equal(unbound.hasPattern, false);
    assert.equal(unbound.status, "assigned");

    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.equal(hierarchy[0]!.neighborhoods[0]!.rooms.length, 2);
  });

  it("scopes locations to the selected department only", () => {
    const neighborhood = unit({
      id: "1b",
      name: "1B – Lighthouse",
      unitType: "SERVERY",
      departmentResponsibilities: [{ department: { id: "evs" } }],
    });
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [neighborhood],
    });
    assert.equal(locations.length, 0);
  });

  it("treats room patterns as optional department-scoped metadata", () => {
    assert.equal(
      roomOperationalPattern({ archetypeKey: null, archetypeName: null }).hasPattern,
      false,
    );
    assert.equal(
      resolveLocationStatus({ kind: "neighborhood", hasPattern: false, hasOverrides: false }),
      "assigned",
    );
    assert.equal(
      resolveLocationStatus({ kind: "room", hasPattern: false, hasOverrides: false }),
      "assigned",
    );
    assert.equal(
      resolveLocationStatus({ kind: "room", hasPattern: true, hasOverrides: false }),
      "pattern",
    );
  });

  it("summarizes assigned locations without an unconfigured bucket", () => {
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "a",
          name: "A",
          unitType: "OTHER",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
        }),
      ],
    });
    const summary = locationCoverageSummary(locations);
    assert.equal(summary.total, 1);
    assert.equal(summary.assigned, 1);
    assert.equal(summary.withPattern, 0);
    assert.equal("unconfigured" in summary, false);
  });

  it("preserves Facility Builder Floor displayOrder, not name or insertion order", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "f3",
          name: "Floor 3",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 40,
          childUnits: [
            unit({
              id: "albright",
              name: "Albright",
              parentUnitId: "f3",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
        unit({
          id: "f1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 20,
          childUnits: [
            unit({
              id: "naval",
              name: "1A – Naval Park",
              parentUnitId: "f1",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
        unit({
          id: "ground",
          name: "Ground",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 10,
          childUnits: [
            unit({
              id: "kensington",
              name: "GC – Kensington",
              parentUnitId: "ground",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
        unit({
          id: "f4",
          name: "Floor 4",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 50,
          childUnits: [
            unit({
              id: "four",
              name: "4A",
              parentUnitId: "f4",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
        unit({
          id: "f2",
          name: "Floor 2",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 30,
          childUnits: [
            unit({
              id: "two",
              name: "2A",
              parentUnitId: "f2",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
      ],
    });

    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.deepEqual(
      hierarchy.map((floor) => floor.floorName),
      ["Ground", "Floor 1", "Floor 2", "Floor 3", "Floor 4"],
    );
    assert.equal(hierarchy.every((floor) => floor.neighborhoods.length >= 1), true);
  });

  it("preserves Facility Builder Neighborhood displayOrder within a Floor", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "floor-1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 10,
          childUnits: [
            unit({
              id: "lighthouse",
              name: "1B – Lighthouse",
              parentUnitId: "floor-1",
              displayOrder: 20,
              departmentResponsibilities: dietary,
            }),
            unit({
              id: "naval",
              name: "1A – Naval Park",
              parentUnitId: "floor-1",
              displayOrder: 10,
              departmentResponsibilities: dietary,
            }),
          ],
        }),
      ],
    });
    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.deepEqual(
      hierarchy[0]!.neighborhoods.map((n) => n.location.displayName),
      ["1A – Naval Park", "1B – Lighthouse"],
    );
  });

  it("preserves Facility Builder Room sortOrder within a Neighborhood", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "floor-1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 10,
          childUnits: [
            unit({
              id: "naval",
              name: "1A – Naval Park",
              parentUnitId: "floor-1",
              displayOrder: 10,
              departmentResponsibilities: dietary,
              childSpaces: [
                {
                  id: "storage",
                  name: "Storage",
                  isActive: true,
                  sortOrder: 20,
                  responsibilities: dietary,
                },
                {
                  id: "servery",
                  name: "Naval Park Servery",
                  isActive: true,
                  sortOrder: 10,
                  responsibilities: dietary,
                },
              ],
            }),
          ],
        }),
      ],
    });
    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.deepEqual(
      hierarchy[0]!.neighborhoods[0]!.rooms.map((r) => r.displayName),
      ["Naval Park Servery", "Storage"],
    );
  });

  it("does not alphabetically regroup floors when encounter order already matches Facility Builder", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "f3",
          name: "Floor 3",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          childUnits: [
            unit({
              id: "a",
              name: "Albright",
              parentUnitId: "f3",
              departmentResponsibilities: dietary,
            }),
          ],
        }),
        unit({
          id: "f1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          childUnits: [
            unit({
              id: "n",
              name: "Naval Park",
              parentUnitId: "f1",
              departmentResponsibilities: dietary,
            }),
          ],
        }),
      ],
    });
    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.deepEqual(
      hierarchy.map((floor) => floor.floorName),
      ["Floor 3", "Floor 1"],
    );
  });

  it("projects the same Facility Room Type for every department without a second catalog", () => {
    const sharedSpace = {
      id: "albright-servery",
      name: "Albright Servery",
      isActive: true,
      spaceType: "SERVICE_AREA" as const,
      customTypeLabel: "Servery",
      responsibilities: [
        { department: { id: "dietary" } },
        { department: { id: "evs" } },
      ],
    };
    const floor = unit({
      id: "floor-3",
      name: "Floor 3",
      hierarchyRole: "FLOOR",
      parentUnitId: null,
      childUnits: [
        unit({
          id: "albright",
          name: "Albright",
          parentUnitId: "floor-3",
          childSpaces: [sharedSpace],
        }),
      ],
    });

    const dietary = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [floor],
      roomPatternBySpaceId: new Map([
        [
          "albright-servery",
          {
            archetypeKey: "servery",
            archetypeName: "Servery",
            exceptionCount: 0,
            recommendedPatternKey: null,
            spaceTypeLabel: "Servery",
            displayName: "Albright Servery",
          },
        ],
      ]),
    });
    const evs = collectDepartmentActionableLocations({
      departmentId: "evs",
      units: [floor],
    });

    const dietaryRoom = dietary.find((l) => l.id === "albright-servery")!;
    const evsRoom = evs.find((l) => l.id === "albright-servery")!;
    assert.equal(dietaryRoom.roomTypeLabel, "Servery");
    assert.equal(evsRoom.roomTypeLabel, "Servery");
    assert.equal(dietaryRoom.roomTypeKey, "servery");
    assert.equal(evsRoom.roomTypeKey, "servery");
  });

  it("updates Room Type when Facility Builder stored type changes", () => {
    const dietary = [{ department: { id: "dietary" } }];
    function asRoom(spaceType: "PATIENT_ROOM" | "SERVICE_AREA", label: string) {
      return collectDepartmentActionableLocations({
        departmentId: "dietary",
        units: [
          unit({
            id: "floor-1",
            name: "Floor 1",
            hierarchyRole: "FLOOR",
            parentUnitId: null,
            childUnits: [
              unit({
                id: "naval",
                name: "1A – Naval Park",
                parentUnitId: "floor-1",
                departmentResponsibilities: dietary,
                childSpaces: [
                  {
                    id: "servery",
                    name: "Naval Park Servery",
                    isActive: true,
                    spaceType,
                    customTypeLabel: label,
                    responsibilities: dietary,
                  },
                ],
              }),
            ],
          }),
        ],
      }).find((l) => l.id === "servery")!;
    }

    const before = asRoom("PATIENT_ROOM", "Resident Room");
    const after = asRoom("SERVICE_AREA", "Servery");
    assert.equal(before.roomTypeKey, "resident_room");
    assert.equal(before.roomTypeLabel, "Resident Room");
    assert.equal(after.roomTypeKey, "servery");
    assert.equal(after.roomTypeLabel, "Servery");
  });

  it("does not assign Room Type to neighborhoods", () => {
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "1a",
          name: "1A – Naval Park",
          departmentResponsibilities: [{ department: { id: "dietary" } }],
        }),
      ],
    });
    assert.equal(locations[0]!.kind, "neighborhood");
    assert.equal(locations[0]!.roomTypeKey, null);
    assert.equal(locations[0]!.roomTypeLabel, null);
  });
});

describe("Department Builder Locations source contracts", () => {
  it("does not write SpaceType or Unit.unitType from Locations UI", () => {
    const root = process.cwd();
    const actions = readFileSync(
      join(root, "src/app/(protected)/admin/departments/[departmentId]/actions.ts"),
      "utf8",
    );
    const panel = readFileSync(
      join(root, "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx"),
      "utf8",
    );
    const tree = readFileSync(
      join(root, "src/components/location-tree/DepartmentLocationTree.tsx"),
      "utf8",
    );
    const typesPanel = readFileSync(
      join(root, "src/app/(protected)/admin/departments/[departmentId]/room-types-panel.tsx"),
      "utf8",
    );
    assert.equal(/spaceType\s*:/.test(actions), false);
    assert.equal(/unitType\s*:/.test(actions), false);
    assert.equal(/prisma\.unitSpace\.update/.test(panel), false);
    assert.equal(/prisma\.unit\.update/.test(actions), false);
    assert.match(panel, /LocationsProgrammingClient/);
    assert.match(panel, /Physical places \{view\.department\.name\} is responsible for/);
    assert.match(tree, /parentNeighborhoodName/);
    assert.match(tree, /No physical type/);
    assert.match(typesPanel, /Room Types/);
    assert.equal(/archetypeId/.test(panel), false);
    assert.equal(/archetypeId/.test(typesPanel), false);
  });

  it("does not expose archetype terminology in Department Locations or Room Types UI", () => {
    const root = process.cwd();
    const panel = readFileSync(
      join(root, "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx"),
      "utf8",
    );
    const typesPanel = readFileSync(
      join(root, "src/app/(protected)/admin/departments/[departmentId]/room-types-panel.tsx"),
      "utf8",
    );
    assert.equal(/\bArchetype\b/.test(panel), false);
    assert.equal(/\bArchetype\b/.test(typesPanel), false);
    assert.equal(/Operational type/.test(typesPanel), false);
  });

  it("nests room-only responsibility under structural Neighborhood context without inflating coverage", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "ground",
          name: "Ground",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 0,
          childSpaces: [
            {
              id: "main-kitchen",
              name: "Main Kitchen",
              isActive: true,
              sortOrder: 10,
              spaceTypeLabel: "Kitchen",
              responsibilities: dietary,
            },
            {
              id: "retail",
              name: "Retail",
              isActive: true,
              sortOrder: 20,
              spaceTypeLabel: "Kitchen",
              responsibilities: dietary,
            },
          ],
          childUnits: [
            unit({
              id: "kensington",
              name: "GC – Kensington",
              parentUnitId: "ground",
              displayOrder: 10,
              // Neighborhood itself is NOT responsible — only the Room is.
              departmentResponsibilities: [],
              childSpaces: [
                {
                  id: "kensington-servery",
                  name: "Kensington Servery",
                  isActive: true,
                  sortOrder: 10,
                  spaceTypeLabel: "Servery",
                  responsibilities: dietary,
                },
              ],
            }),
          ],
        }),
        unit({
          id: "floor-1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          displayOrder: 10,
          childUnits: [
            unit({
              id: "naval",
              name: "1A – Naval Park",
              parentUnitId: "floor-1",
              displayOrder: 10,
              departmentResponsibilities: [],
              childSpaces: [
                {
                  id: "naval-servery",
                  name: "Naval Park Servery",
                  isActive: true,
                  sortOrder: 10,
                  spaceTypeLabel: "Servery",
                  responsibilities: dietary,
                },
              ],
            }),
            unit({
              id: "lighthouse",
              name: "1B – Lighthouse",
              parentUnitId: "floor-1",
              displayOrder: 20,
              departmentResponsibilities: [],
              childSpaces: [
                {
                  id: "lighthouse-servery",
                  name: "Lighthouse Servery",
                  isActive: true,
                  sortOrder: 10,
                  spaceTypeLabel: "Servery",
                  responsibilities: dietary,
                },
              ],
            }),
          ],
        }),
      ],
    });

    // Flat actionable list: rooms only (no synthetic neighborhood rows).
    assert.equal(locations.some((l) => l.kind === "neighborhood"), false);
    assert.equal(locations.filter((l) => l.kind === "room").length, 5);
    const coverage = locationCoverageSummary(locations);
    assert.equal(coverage.total, 5);
    assert.equal(coverage.neighborhoodCount, 0);
    assert.equal(coverage.roomCount, 5);

    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.deepEqual(
      hierarchy.map((floor) => floor.floorName),
      ["Ground", "Floor 1"],
    );

    const ground = hierarchy[0]!;
    assert.deepEqual(
      ground.orphanRooms.map((r) => r.displayName),
      ["Main Kitchen", "Retail"],
    );
    assert.equal(ground.neighborhoods.length, 1);
    assert.equal(ground.neighborhoods[0]!.location.displayName, "GC – Kensington");
    assert.deepEqual(
      ground.neighborhoods[0]!.rooms.map((r) => r.displayName),
      ["Kensington Servery"],
    );

    const floor1 = hierarchy[1]!;
    assert.equal(floor1.orphanRooms.length, 0);
    assert.deepEqual(
      floor1.neighborhoods.map((n) => n.location.displayName),
      ["1A – Naval Park", "1B – Lighthouse"],
    );
    assert.equal(floor1.neighborhoods[0]!.rooms[0]!.displayName, "Naval Park Servery");
    assert.equal(floor1.neighborhoods[1]!.rooms[0]!.displayName, "Lighthouse Servery");
  });

  it("keeps responsible Neighborhood with no child Rooms visible", () => {
    const dietary = [{ department: { id: "dietary" } }];
    const locations = collectDepartmentActionableLocations({
      departmentId: "dietary",
      units: [
        unit({
          id: "floor-1",
          name: "Floor 1",
          hierarchyRole: "FLOOR",
          parentUnitId: null,
          childUnits: [
            unit({
              id: "naval",
              name: "1A – Naval Park",
              parentUnitId: "floor-1",
              departmentResponsibilities: dietary,
              childSpaces: [],
            }),
          ],
        }),
      ],
    });
    const hierarchy = groupLocationsByPhysicalHierarchy(locations);
    assert.equal(hierarchy[0]!.neighborhoods.length, 1);
    assert.equal(hierarchy[0]!.neighborhoods[0]!.location.displayName, "1A – Naval Park");
    assert.equal(hierarchy[0]!.neighborhoods[0]!.rooms.length, 0);
  });
});
