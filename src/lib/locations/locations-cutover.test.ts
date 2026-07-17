/**
 * Wave 15F — Locations Experience cutover integration tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
  adaptProjectionSnapshotToShadowView,
  compareProjectionSnapshotsForShadow,
} from "@/lib/projection";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";

import {
  adaptProjectionToLocationsView,
  collectProjectedUnitIds,
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

function roomNodes(view: LocationsViewModel): LocationsTreeNode[] {
  return allNodes(view).filter((n) => n.kind === "ROOM");
}

function assertNoEmptyAreas(view: LocationsViewModel) {
  for (const node of allNodes(view)) {
    for (const area of node.areas) {
      assert.ok(
        area.experiences.length > 0,
        `empty area ${area.areaKey} on ${node.id}`,
      );
    }
  }
}

test("isProjectionLocationsEnabled defaults to true (production cutover)", () => {
  withEnv("PROJECTION_LOCATIONS_ENABLED", undefined, () => {
    assert.equal(isProjectionLocationsEnabled(), true);
  });
  withEnv("PROJECTION_LOCATIONS_ENABLED", "false", () => {
    assert.equal(isProjectionLocationsEnabled(), false);
  });
});

test("Dietary manager — projected tree, rooms, areas, experiences", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "DEPARTMENT");
  assert.equal(view.departmentKey, "DIETARY");
  assert.equal(view.departmentSnapshots.length, 1);
  assert.equal(view.departmentSnapshots[0]?.departmentKey, "DIETARY");

  const rooms = roomNodes(view);
  assert.ok(rooms.some((r) => r.physicalId === "space_kensington_servery"));
  assert.ok(
    rooms.every((r) => r.presentation === "ACTIONABLE" || r.areas.length === 0),
  );

  const servery = rooms.find((r) => r.physicalId === "space_kensington_servery");
  assert.ok(servery);
  assert.ok(servery.areas.length > 0);
  assert.ok(
    servery.areas.some((a) =>
      a.experiences.some((e) => e.experienceKey === "MEAL_SERVICE"),
    ),
  );
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  assert.ok(view.projectedUnitIds.includes("unit_ground_floor"));
  assertNoEmptyAreas(view);
});

test("EVS manager — cleaning experiences only on projected rooms", () => {
  const view = adaptProjectionToLocationsView(EVS_GOLDEN_PROJECTION);
  assert.equal(view.departmentKey, "EVS");
  const experienceKeys = roomNodes(view).flatMap((r) =>
    r.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)),
  );
  assert.ok(experienceKeys.length > 0);
  assert.ok(!experienceKeys.includes("MEAL_SERVICE"));
  assertNoEmptyAreas(view);
});

test("Plant manager — policy coverage without fake room ownership", () => {
  const view = adaptProjectionToLocationsView(PLANT_GOLDEN_PROJECTION);
  assert.equal(view.departmentKey, "PLANT");
  const plant = view.departmentSnapshots[0];
  assert.ok(plant?.plantPolicy);
  assert.equal(plant.plantPolicy?.createsRoomAssignments, false);
  assert.equal(plant.plantPolicy?.applied, true);
  // No manufactured locations outside the projected tree.
  for (const id of plant.plantPolicy?.coveredLocationIds ?? []) {
    assert.ok(
      plant.actionableLocationIds.includes(id) ||
        allNodes(view).some((n) => n.id === id),
      `plant covered ${id} must exist in projection`,
    );
  }
});

test("Supervisor / permission narrowing — PIN fixture never broadens locations", () => {
  const full = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const narrowed = adaptProjectionToLocationsView(PERMISSION_NARROWED_PROJECTION);

  const fullRooms = roomNodes(full).map((r) => r.physicalId).sort();
  const narrowedRooms = roomNodes(narrowed).map((r) => r.physicalId).sort();

  // Narrowed deep-link fixture exposes only the servery room.
  assert.deepEqual(narrowedRooms, ["space_kensington_servery"]);
  for (const id of narrowedRooms) {
    assert.ok(fullRooms.includes(id), `narrowed room ${id} not in full dietary set`);
  }
  assert.ok(narrowedRooms.length <= fullRooms.length);

  // Access class remains PIN-locked; adapter does not invent extra units.
  assert.equal(
    PERMISSION_NARROWED_PROJECTION.context.request.accessClass.lockedUnitId,
    "unit_kensington",
  );
  assert.ok(narrowed.projectedUnitIds.every((id) => full.projectedUnitIds.includes(id)));
});

test("PIN user fixture — locked unit neighborhood only", () => {
  // Permission-narrowed fixture uses PIN access class on servery neighborhood.
  const access = PERMISSION_NARROWED_PROJECTION.context.request.accessClass;
  assert.equal(access.principalKind, "EMPLOYEE");
  assert.equal(access.lockedUnitId, "unit_kensington");
  const view = adaptProjectionToLocationsView(PERMISSION_NARROWED_PROJECTION);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  // Adapter does not broaden; Projection already applied lock.
  assert.ok(
    roomNodes(view).every(
      (r) => r.unitId === "unit_kensington" || r.unitId == null,
    ),
  );
});

test("Facility Overview — labeled department snapshots, never flattened", () => {
  const view = adaptProjectionToLocationsView(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.equal(view.departmentKey, null);
  assert.equal(view.departmentSnapshots.length, 3);

  const keys = view.departmentSnapshots.map((d) => d.departmentKey).sort();
  assert.deepEqual(keys, ["DIETARY", "EVS", "PLANT"]);

  // Labels remain department-specific; trees are not merged into one ops body.
  for (const dept of view.departmentSnapshots) {
    assert.ok(dept.label.length > 0);
    assert.ok(dept.roots.length > 0 || dept.unitIds.length >= 0);
  }

  // Physical unit ids may overlap; Experiences stay department-scoped.
  const dietaryExp = view.departmentSnapshots
    .find((d) => d.departmentKey === "DIETARY")
    ?.roots.flatMap((r) => walk([r]))
    .flatMap((n) => n.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)));
  const plantExp = view.departmentSnapshots
    .find((d) => d.departmentKey === "PLANT")
    ?.roots.flatMap((r) => walk([r]))
    .flatMap((n) => n.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)));

  assert.ok(dietaryExp?.includes("MEAL_SERVICE"));
  assert.ok(!plantExp?.includes("MEAL_SERVICE"));
});

test("Undesignated / empty branches — golden fixtures omit staged nodes", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
  ]) {
    const view = adaptProjectionToLocationsView(snapshot);
    const labels = allNodes(view).map((n) => n.label.toLowerCase());
    assert.ok(!labels.some((l) => l.includes("undesignated")));
    assert.ok(!labels.some((l) => l.includes("staged")));
    assertNoEmptyAreas(view);
  }
});

test("Empty Areas suppressed at each location", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assertNoEmptyAreas(view);
  // Structural ancestors may have zero areas (grouping only).
  const floor = allNodes(view).find((n) => n.kind === "FLOOR");
  assert.ok(floor);
  assert.equal(floor.areas.length, 0);
  assert.equal(floor.presentation, "STRUCTURAL");
});

test("Projected Experiences attach only to actionable rooms in Dietary golden", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  for (const room of roomNodes(view)) {
    if (room.presentation === "ACTIONABLE") {
      assert.ok(room.experienceKeys.length > 0 || room.areas.length > 0);
    }
  }
});

test("collectProjectedUnitIds matches view.projectedUnitIds", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.deepEqual(collectProjectedUnitIds(view), view.projectedUnitIds);
  assert.deepEqual(collectProjectedUnitIds(null), []);
});

test("Golden parity with Wave 15E shadow adapters (rooms + plant)", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
    PERMISSION_NARROWED_PROJECTION,
  ]) {
    const locationsView = adaptProjectionToLocationsView(snapshot);
    const shadowView = adaptProjectionSnapshotToShadowView(snapshot);

    const locationRoomIds = roomNodes(locationsView)
      .map((r) => r.physicalId)
      .sort();
    assert.deepEqual(locationRoomIds, [...shadowView.roomIds].sort());

    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: snapshot,
      projectionSnapshot: snapshot,
    });
    // Self-parity of Projection vs itself through shadow path.
    assert.equal(report.metrics.parityPercent, 100);
  }

  const facilityLocations = adaptProjectionToLocationsView(
    FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  );
  const facilityShadow = adaptProjectionSnapshotToShadowView(
    FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  );
  assert.deepEqual(
    [...facilityLocations.departmentSnapshots.map((d) => d.departmentKey)].sort(),
    [...facilityShadow.departmentKeys].sort(),
  );
});

test("Workspace hrefs preserve /unit/[unitId] destinations", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  for (const node of allNodes(view)) {
    if (node.kind === "FACILITY") {
      assert.equal(node.href, null);
      continue;
    }
    if (node.presentation === "STRUCTURAL") {
      assert.equal(node.href, null);
      continue;
    }
    if (node.kind === "FLOOR" || node.kind === "NEIGHBORHOOD" || node.kind === "LEGACY") {
      assert.equal(node.href, `/unit/${node.physicalId}`);
    }
    if (node.kind === "ROOM" && node.unitId) {
      assert.equal(
        node.href,
        `/unit/${node.unitId}?space=${encodeURIComponent(node.physicalId)}`,
      );
    }
  }
});

test("Legacy regression: Locations adapter never invents departments", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.ok(
    view.departmentSnapshots.every((d) => d.departmentKey === "DIETARY"),
  );
  assert.ok(
    !allNodes(view).some((n) =>
      n.areas.some((a) =>
        a.experiences.some((e) => e.experienceKey.includes("PLANT")),
      ),
    ),
  );
});
