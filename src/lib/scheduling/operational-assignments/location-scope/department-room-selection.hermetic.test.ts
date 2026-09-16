import assert from "node:assert/strict";
import test from "node:test";

import type { HierarchyWalkUnit } from "@/lib/department-administration/department-locations";
import {
  resolveDepartmentEligibleRoomUnitSpaceIdsFromExplicitSelection,
  resolveDepartmentRoomUnitSpaceIdsFromFloorSelection,
  resolveDepartmentRoomUnitSpaceIdsFromNeighborhoodSelection,
} from "./department-room-selection";

function unit(input: Partial<HierarchyWalkUnit> & { id: string; name: string }): HierarchyWalkUnit {
  return {
    id: input.id,
    name: input.name,
    unitType: (input.unitType ?? "OTHER") as HierarchyWalkUnit["unitType"],
    hierarchyRole: (input.hierarchyRole ?? null) as HierarchyWalkUnit["hierarchyRole"],
    parentUnitId: input.parentUnitId ?? null,
    isActive: input.isActive ?? true,
    departmentResponsibilities: input.departmentResponsibilities ?? [],
    childSpaces: input.childSpaces ?? [],
    childUnits: input.childUnits ?? [],
    displayOrder: input.displayOrder,
  };
}

function roomSpace(input: {
  id: string;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
  deptIds: readonly string[];
}): HierarchyWalkUnit["childSpaces"][number] {
  return {
    id: input.id,
    name: input.name,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 100,
    responsibilities: input.deptIds.map((id) => ({ department: { id } })),
    // Facility-owned display fields are optional for these pure tests.
    unitId: undefined,
    spaceTypeLabel: null,
  } as unknown as HierarchyWalkUnit["childSpaces"][number];
}

test("floor selection resolves eligible descendant Rooms; direct floor rooms included; unrelated/inactive excluded", () => {
  const deptDietary = "dept_dietary";
  const deptEvs = "dept_evs";

  const floor1 = unit({
    id: "floor-1",
    name: "Floor 1",
    hierarchyRole: "FLOOR",
    childSpaces: [
      roomSpace({ id: "direct-room", name: "Direct Floor Room", deptIds: [deptDietary] }),
    ],
    childUnits: [
      unit({
        id: "nb-1a",
        name: "1A – Naval Park",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "floor-1",
        departmentResponsibilities: [{ department: { id: deptDietary } }],
        childSpaces: [
          roomSpace({ id: "servery-1", name: "Naval Park Servery", deptIds: [deptDietary] }),
          roomSpace({ id: "inactive-servery", name: "Inactive Servery", isActive: false, deptIds: [deptDietary] }),
        ],
      }),
      unit({
        id: "nb-1b",
        name: "1B – Lighthouse",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "floor-1",
        departmentResponsibilities: [{ department: { id: deptDietary } }],
        childSpaces: [roomSpace({ id: "evs-room", name: "EVS Room", deptIds: [deptEvs] })],
      }),
    ],
  });

  const resolved = resolveDepartmentRoomUnitSpaceIdsFromFloorSelection({
    departmentId: deptDietary,
    units: [floor1],
    floorUnitIds: ["floor-1"],
  });

  assert.deepEqual(resolved, ["direct-room", "servery-1"].sort());
  assert.equal(resolved.includes("nb-1a"), false);
  assert.equal(resolved.includes("inactive-servery"), false);
  assert.equal(resolved.includes("evs-room"), false);
});

test("neighborhood selection resolves eligible descendant Rooms", () => {
  const deptDietary = "dept_dietary";
  const floor1 = unit({
    id: "floor-1",
    name: "Floor 1",
    hierarchyRole: "FLOOR",
    childUnits: [
      unit({
        id: "nb-1a",
        name: "1A – Naval Park",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "floor-1",
        departmentResponsibilities: [{ department: { id: deptDietary } }],
        childSpaces: [roomSpace({ id: "servery-1", name: "Naval Park Servery", deptIds: [deptDietary] })],
      }),
    ],
  });

  const resolved = resolveDepartmentRoomUnitSpaceIdsFromNeighborhoodSelection({
    departmentId: deptDietary,
    units: [floor1],
    neighborhoodUnitId: "nb-1a",
  });

  assert.deepEqual(resolved.roomUnitSpaceIds, ["servery-1"]);
  assert.equal(resolved.unitWideSemantics, false);
});

test("neighborhood actionable but has no Rooms preserves UNIT-scoped semantics", () => {
  const deptDietary = "dept_dietary";

  const floor1 = unit({
    id: "floor-1",
    name: "Floor 1",
    hierarchyRole: "FLOOR",
    childUnits: [
      unit({
        id: "nb-empty",
        name: "1X – Empty Neighborhood",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "floor-1",
        departmentResponsibilities: [{ department: { id: deptDietary } }],
        childSpaces: [],
        childUnits: [],
      }),
    ],
  });

  const resolved = resolveDepartmentRoomUnitSpaceIdsFromNeighborhoodSelection({
    departmentId: deptDietary,
    units: [floor1],
    neighborhoodUnitId: "nb-empty",
  });

  assert.deepEqual(resolved.roomUnitSpaceIds, []);
  assert.equal(resolved.hasAnyActiveDescendantSpaces, false);
  assert.equal(resolved.unitWideSemantics, true);
});

test("multi-floor selection deduplicates rooms", () => {
  const deptDietary = "dept_dietary";

  const floor1 = unit({
    id: "floor-1",
    name: "Floor 1",
    hierarchyRole: "FLOOR",
    childSpaces: [roomSpace({ id: "shared", name: "Shared Room", deptIds: [deptDietary] })],
  });
  const floor2 = unit({
    id: "floor-2",
    name: "Floor 2",
    hierarchyRole: "FLOOR",
    childSpaces: [roomSpace({ id: "shared", name: "Shared Room", deptIds: [deptDietary] })],
  });

  const resolved = resolveDepartmentRoomUnitSpaceIdsFromFloorSelection({
    departmentId: deptDietary,
    units: [floor1, floor2],
    floorUnitIds: ["floor-1", "floor-2"],
  });

  assert.deepEqual(resolved, ["shared"]);
});

test("explicit Room selection returns only eligible active department rooms", () => {
  const deptDietary = "dept_dietary";
  const deptEvs = "dept_evs";

  const floor1 = unit({
    id: "floor-1",
    name: "Floor 1",
    hierarchyRole: "FLOOR",
    childUnits: [
      unit({
        id: "nb-1a",
        name: "1A – Naval Park",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: "floor-1",
        departmentResponsibilities: [{ department: { id: deptDietary } }],
        childSpaces: [
          roomSpace({ id: "servery-1", name: "Naval Park Servery", deptIds: [deptDietary] }),
          roomSpace({ id: "inactive-servery", name: "Inactive", isActive: false, deptIds: [deptDietary] }),
          roomSpace({ id: "evs-room", name: "EVS Room", deptIds: [deptEvs] }),
        ],
      }),
    ],
  });

  const resolved = resolveDepartmentEligibleRoomUnitSpaceIdsFromExplicitSelection({
    departmentId: deptDietary,
    units: [floor1],
    unitSpaceIds: ["servery-1", "inactive-servery", "evs-room"],
  });

  assert.deepEqual(resolved, ["servery-1"]);
});

