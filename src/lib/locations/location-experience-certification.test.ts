/**
 * Location Experience Certification — shared hierarchy + flag matrix.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import {
  isProjectionLocationsEnabled,
  isProjectionSidebarEnabled,
} from "@/lib/feature-flags";
import { FACILITY_VOCABULARY_PROFILES } from "@/lib/facility-builder/facility-vocabulary";

import {
  adaptLocationsViewToSidebar,
  adaptProjectionToLocationsView,
  compareLocationSidebarAncestry,
} from "@/lib/locations";
import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

function walk(nodes: readonly LocationsTreeNode[]): LocationsTreeNode[] {
  const out: LocationsTreeNode[] = [];
  const visit = (node: LocationsTreeNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function allNodes(view: LocationsViewModel): LocationsTreeNode[] {
  return view.departmentSnapshots.flatMap((dept) => walk(dept.roots));
}

test("1–4. Floor → Neighborhood → Room hierarchy preserved with rooms", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const floor = allNodes(view).find((n) => n.kind === "FLOOR");
  assert.ok(floor);
  assert.equal(floor.hierarchyLevel, "LEVEL_1");
  const neighborhood = floor.children.find((n) => n.kind === "NEIGHBORHOOD");
  assert.ok(neighborhood);
  assert.equal(neighborhood.hierarchyLevel, "LEVEL_2");
  assert.equal(neighborhood.parentId, floor.id);
  const room = neighborhood.children.find((n) => n.kind === "ROOM");
  assert.ok(room);
  assert.equal(room.hierarchyLevel, "LEVEL_3");
  assert.equal(room.parentId, neighborhood.id);
  assert.ok(room.href?.includes("?space="));
});

test("5–8. structural ancestors retained; empty/staged not invented", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const labels = allNodes(view).map((n) => n.label.toLowerCase());
  assert.ok(allNodes(view).some((n) => n.kind === "FLOOR"));
  assert.ok(allNodes(view).some((n) => n.kind === "NEIGHBORHOOD"));
  assert.ok(!labels.some((l) => l.includes("staged")));
  assert.ok(!labels.some((l) => l.includes("undesignated")));
});

test("9–10. vocabulary + room space href formatting contract", () => {
  const locations = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const sidebar = adaptLocationsViewToSidebar(
    locations,
    FACILITY_VOCABULARY_PROFILES.ltc,
  );
  const room = sidebar.sections[0]?.nodes
    .flatMap(function collect(n): typeof n[] {
      return [n, ...n.children.flatMap(collect)];
    })
    .find((n) => n.kind === "ROOM");
  assert.ok(room);
  assert.equal(room.levelLabel, "Room");
  assert.ok(room.href?.startsWith("/unit/"));
  assert.ok(room.href?.includes("?space="));
});

test("39–41. Sidebar and Locations share ancestry + actionability", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
  ]) {
    const locations = adaptProjectionToLocationsView(snapshot);
    const sidebar = adaptLocationsViewToSidebar(
      locations,
      FACILITY_VOCABULARY_PROFILES.ltc,
    );
    const report = compareLocationSidebarAncestry(locations, sidebar);
    assert.equal(report.identicalIds, true);
    assert.equal(report.identicalAncestry, true);
    assert.equal(report.identicalActionability, true);
  }

  // Facility Overview: labeled sections — compare each department in isolation.
  const foLocations = adaptProjectionToLocationsView(
    FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  );
  const foSidebar = adaptLocationsViewToSidebar(
    foLocations,
    FACILITY_VOCABULARY_PROFILES.ltc,
  );
  assert.equal(foLocations.departmentSnapshots.length, foSidebar.sections.length);
  for (let i = 0; i < foLocations.departmentSnapshots.length; i++) {
    const deptView: LocationsViewModel = {
      ...foLocations,
      lensMode: "DEPARTMENT",
      departmentSnapshots: [foLocations.departmentSnapshots[i]!],
      projectedUnitIds: foLocations.departmentSnapshots[i]!.unitIds,
    };
    const deptSidebar = {
      ...foSidebar,
      sections: [foSidebar.sections[i]!],
      projectedUnitIds: foLocations.departmentSnapshots[i]!.unitIds,
    };
    const report = compareLocationSidebarAncestry(deptView, deptSidebar);
    assert.equal(report.identicalIds, true);
    assert.equal(report.identicalAncestry, true);
    assert.equal(report.identicalActionability, true);
  }
});

test("42. all four feature-flag combinations", () => {
  const combos: [string | undefined, string | undefined, boolean, boolean][] = [
    [undefined, undefined, true, true],
    ["true", "false", true, false],
    ["false", "true", false, true],
    ["false", "false", false, false],
  ];
  for (const [loc, side, expectLoc, expectSide] of combos) {
    withEnv("PROJECTION_LOCATIONS_ENABLED", loc, () => {
      withEnv("PROJECTION_SIDEBAR_ENABLED", side, () => {
        assert.equal(isProjectionLocationsEnabled(), expectLoc);
        assert.equal(isProjectionSidebarEnabled(), expectSide);
      });
    });
  }
});

test("STRUCTURAL nodes have no href; ACTIONABLE units link without inventing rooms", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  for (const node of allNodes(view)) {
    if (node.kind === "FACILITY") continue;
    if (node.presentation === "STRUCTURAL") {
      assert.equal(node.href, null);
    }
    if (node.presentation === "ACTIONABLE" && node.kind !== "ROOM") {
      assert.equal(node.href, `/unit/${node.unitId}`);
    }
  }
});

test("Facility Overview remains labeled by department", () => {
  const view = adaptProjectionToLocationsView(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.ok(view.departmentSnapshots.every((d) => d.label.length > 0));
  assert.deepEqual(
    view.departmentSnapshots.map((d) => d.departmentKey).sort(),
    ["DIETARY", "EVS", "PLANT"],
  );
});
