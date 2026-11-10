/**
 * Locations view is the physical tree Projection marks from Facility
 * responsibility.
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

import {
  adaptProjectionToLocationsView,
  collectProjectedUnitIds,
} from "@/lib/locations";
import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations";

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

test("Dietary manager — responsible servery and structural ancestors", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "DEPARTMENT");
  assert.equal(view.departmentKey, "DIETARY");
  assert.equal(view.departmentSnapshots.length, 1);
  const rooms = roomNodes(view);
  assert.deepEqual(rooms.map((room) => room.physicalId), ["space_kensington_servery"]);
  assert.equal(rooms[0]?.presentation, "ACTIONABLE");
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  assert.ok(view.projectedUnitIds.includes("unit_ground_floor"));
  const floor = allNodes(view).find((node) => node.kind === "FLOOR");
  assert.equal(floor?.presentation, "STRUCTURAL");
  assert.equal(floor?.href, null);
});

test("EVS manager — responsible rooms only", () => {
  const view = adaptProjectionToLocationsView(EVS_GOLDEN_PROJECTION);
  assert.equal(view.departmentKey, "EVS");
  assert.deepEqual(
    roomNodes(view).map((room) => room.physicalId).sort(),
    ["space_kensington_servery", "space_resident_101"],
  );
});

test("Plant manager — policy coverage without fake room ownership", () => {
  const view = adaptProjectionToLocationsView(PLANT_GOLDEN_PROJECTION);
  assert.equal(view.departmentKey, "PLANT");
  const plant = view.departmentSnapshots[0];
  assert.ok(plant?.plantPolicy);
  assert.equal(plant.plantPolicy?.createsRoomAssignments, false);
  assert.equal(plant.plantPolicy?.applied, true);
  for (const id of plant.plantPolicy?.coveredLocationIds ?? []) {
    assert.ok(
      plant.actionableLocationIds.includes(id) || allNodes(view).some((node) => node.id === id),
      `plant covered ${id} must exist in projection`,
    );
  }
});

test("Supervisor / permission narrowing — PIN fixture never broadens locations", () => {
  const full = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const narrowed = adaptProjectionToLocationsView(PERMISSION_NARROWED_PROJECTION);
  const fullRooms = roomNodes(full).map((room) => room.physicalId).sort();
  const narrowedRooms = roomNodes(narrowed).map((room) => room.physicalId).sort();
  assert.deepEqual(narrowedRooms, ["space_kensington_servery"]);
  for (const id of narrowedRooms) {
    assert.ok(fullRooms.includes(id));
  }
  assert.equal(
    PERMISSION_NARROWED_PROJECTION.context.request.accessClass.lockedUnitId,
    "unit_kensington",
  );
  assert.ok(narrowed.projectedUnitIds.every((id) => full.projectedUnitIds.includes(id)));
});

test("PIN user fixture — locked unit neighborhood only", () => {
  const access = PERMISSION_NARROWED_PROJECTION.context.request.accessClass;
  assert.equal(access.principalKind, "EMPLOYEE");
  assert.equal(access.lockedUnitId, "unit_kensington");
  const view = adaptProjectionToLocationsView(PERMISSION_NARROWED_PROJECTION);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  assert.ok(
    roomNodes(view).every((room) => room.unitId === "unit_kensington" || room.unitId == null),
  );
});

test("Facility Overview — labeled department snapshots, never flattened", () => {
  const view = adaptProjectionToLocationsView(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.equal(view.departmentKey, null);
  assert.deepEqual(
    view.departmentSnapshots.map((dept) => dept.departmentKey),
    ["DIETARY", "PLANT"],
  );
  for (const dept of view.departmentSnapshots) {
    assert.ok(dept.label.length > 0);
    assert.ok(dept.roots.length > 0);
  }
});

test("Facility Overview internal audience preserves DEVELOPMENT snapshots", () => {
  const view = adaptProjectionToLocationsView(FACILITY_OVERVIEW_GOLDEN_PROJECTION, {
    audience: "internal",
  });
  assert.deepEqual(
    view.departmentSnapshots.map((dept) => dept.departmentKey).sort(),
    ["DIETARY", "EVS", "PLANT"],
  );
});

test("Golden fixtures omit staged nodes", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
  ]) {
    const labels = allNodes(adaptProjectionToLocationsView(snapshot)).map((node) =>
      node.label.toLowerCase(),
    );
    assert.ok(!labels.some((label) => label.includes("undesignated")));
    assert.ok(!labels.some((label) => label.includes("staged")));
  }
});

test("collectProjectedUnitIds matches view.projectedUnitIds", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.deepEqual(collectProjectedUnitIds(view), view.projectedUnitIds);
  assert.deepEqual(collectProjectedUnitIds(null), []);
});

test("Golden parity with shadow adapters (rooms + plant)", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
    PERMISSION_NARROWED_PROJECTION,
  ]) {
    const locationsView = adaptProjectionToLocationsView(snapshot);
    const shadowView = adaptProjectionSnapshotToShadowView(snapshot);
    assert.deepEqual(
      roomNodes(locationsView).map((room) => room.physicalId).sort(),
      [...shadowView.roomIds].sort(),
    );
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: snapshot,
      projectionSnapshot: snapshot,
    });
    assert.equal(report.metrics.parityPercent, 100);
  }

  const facilityLocations = adaptProjectionToLocationsView(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  const facilityShadow = adaptProjectionSnapshotToShadowView(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.deepEqual(
    [...facilityLocations.departmentSnapshots.map((dept) => dept.departmentKey)].sort(),
    ["DIETARY", "PLANT"],
  );
  assert.deepEqual(
    [...facilityShadow.departmentKeys].sort(),
    ["DIETARY", "EVS", "PLANT"],
  );
});

test("Workspace hrefs preserve /unit/[unitId] destinations", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  for (const node of allNodes(view)) {
    if (node.kind === "FACILITY" || node.presentation === "STRUCTURAL") {
      assert.equal(node.href, null);
      continue;
    }
    if (node.kind === "ROOM" && node.unitId) {
      assert.equal(
        node.href,
        `/unit/${node.unitId}?space=${encodeURIComponent(node.physicalId)}`,
      );
    }
  }
});

test("Locations adapter never invents departments", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  assert.ok(view.departmentSnapshots.every((dept) => dept.departmentKey === "DIETARY"));
});
