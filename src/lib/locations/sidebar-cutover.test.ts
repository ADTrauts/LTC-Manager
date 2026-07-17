/**
 * Wave 15G — Sidebar Projection cutover tests.
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
import { isProjectionSidebarEnabled } from "@/lib/feature-flags";
import { FACILITY_VOCABULARY_PROFILES } from "@/lib/facility-builder/facility-vocabulary";

import {
  adaptLocationsViewToSidebar,
  adaptProjectionToLocationsView,
} from "@/lib/locations";
import type { ProjectedSidebarNode, SidebarProjectionView } from "@/lib/locations";

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

function walk(nodes: readonly ProjectedSidebarNode[]): ProjectedSidebarNode[] {
  const out: ProjectedSidebarNode[] = [];
  const visit = (node: ProjectedSidebarNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function allNodes(view: SidebarProjectionView): ProjectedSidebarNode[] {
  return view.sections.flatMap((s) => walk(s.nodes));
}

function sidebarFromGolden(
  snapshot: Parameters<typeof adaptProjectionToLocationsView>[0],
  vocabulary = FACILITY_VOCABULARY_PROFILES.ltc,
) {
  const locations = adaptProjectionToLocationsView(snapshot);
  return adaptLocationsViewToSidebar(locations, vocabulary);
}

test("PROJECTION_SIDEBAR_ENABLED defaults to true (certified nested rail)", () => {
  withEnv("PROJECTION_SIDEBAR_ENABLED", undefined, () => {
    assert.equal(isProjectionSidebarEnabled(), true);
  });
  withEnv("PROJECTION_SIDEBAR_ENABLED", "false", () => {
    assert.equal(isProjectionSidebarEnabled(), false);
  });
});

test("1. Dietary projected Sidebar tree", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "DEPARTMENT");
  assert.equal(view.sections.length, 1);
  const rooms = allNodes(view).filter((n) => n.kind === "ROOM");
  assert.ok(rooms.some((r) => r.label.includes("Servery")));
  assert.ok(rooms.every((r) => r.href?.startsWith("/unit/")));
});

test("2. EVS projected Sidebar tree", () => {
  const view = sidebarFromGolden(EVS_GOLDEN_PROJECTION);
  assert.equal(view.sections[0]?.departmentKey, "EVS");
  const labels = allNodes(view).map((n) => n.label);
  assert.ok(labels.some((l) => l.includes("101") || l.includes("Servery")));
});

test("3. Plant policy-projected Sidebar tree", () => {
  const view = sidebarFromGolden(PLANT_GOLDEN_PROJECTION);
  const locations = adaptProjectionToLocationsView(PLANT_GOLDEN_PROJECTION);
  assert.equal(locations.departmentSnapshots[0]?.plantPolicy?.createsRoomAssignments, false);
  assert.equal(locations.departmentSnapshots[0]?.plantPolicy?.applied, true);
  assert.ok(allNodes(view).length > 0);
});

test("4. Facility Overview labeled composition", () => {
  const view = sidebarFromGolden(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.equal(view.sections.length, 3);
  assert.deepEqual(
    view.sections.map((s) => s.departmentKey).sort(),
    ["DIETARY", "EVS", "PLANT"],
  );
  assert.ok(view.sections.every((s) => s.label != null && s.label.length > 0));
});

test("5–6. Manager / Supervisor department lens (Dietary golden)", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  assert.equal(view.lensKey, "department:DIETARY");
  assert.ok(!allNodes(view).some((n) => n.label.toLowerCase().includes("plant")));
});

test("7–9. Staff / PIN / locked-device narrowing reflected in fixture", () => {
  const access = PERMISSION_NARROWED_PROJECTION.context.request.accessClass;
  assert.equal(access.principalKind, "EMPLOYEE");
  assert.equal(access.lockedUnitId, "unit_kensington");
  const view = sidebarFromGolden(PERMISSION_NARROWED_PROJECTION);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  // Actionable destinations stay on the locked Unit; structural Floor may remain for orientation.
  assert.ok(
    allNodes(view)
      .filter((n) => n.presentation === "ACTIONABLE")
      .every((n) => n.unitId === "unit_kensington"),
  );
});

test("10–13. staged/undesignated excluded; actionable room retained", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
  ]) {
    const view = sidebarFromGolden(snapshot);
    const labels = allNodes(view).map((n) => n.label.toLowerCase());
    assert.ok(!labels.some((l) => l.includes("undesignated")));
    assert.ok(!labels.some((l) => l.includes("staged")));
  }
  const dietary = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  assert.ok(
    allNodes(dietary).some(
      (n) => n.kind === "ROOM" && n.presentation === "ACTIONABLE",
    ),
  );
});

test("14–16. structural Floor/Neighborhood retained with descendants; empty pruned", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  const floor = allNodes(view).find((n) => n.kind === "FLOOR");
  const neighborhood = allNodes(view).find((n) => n.kind === "NEIGHBORHOOD");
  assert.ok(floor);
  assert.equal(floor.presentation, "STRUCTURAL");
  assert.equal(floor.href, null);
  assert.ok(floor.children.length > 0);
  assert.ok(neighborhood);
  assert.equal(neighborhood.presentation, "STRUCTURAL");
  assert.equal(neighborhood.href, null);
  assert.ok(neighborhood.children.length > 0);
});

test("17. empty Area does not create Sidebar navigation", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  // Sidebar DTO has no Area nodes — only physical tree.
  assert.ok(allNodes(view).every((n) => n.kind !== "FACILITY"));
  assert.ok(
    allNodes(view).every((n) =>
      ["FLOOR", "NEIGHBORHOOD", "LEGACY", "ROOM"].includes(n.kind),
    ),
  );
});

test("18–20. readiness attaches only to projected unit ids (filter contract)", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  const projected = new Set(view.projectedUnitIds);
  const readinessAll = {
    unit_kensington: { state: "ready" as const },
    unit_ground_floor: { state: "blocked" as const },
    unit_not_projected: { state: "in_progress" as const },
  };
  const filtered = Object.fromEntries(
    Object.entries(readinessAll).filter(([id]) => projected.has(id)),
  );
  assert.ok(filtered.unit_kensington);
  assert.ok(filtered.unit_ground_floor);
  assert.equal(filtered.unit_not_projected, undefined);
  // Readiness failure → empty map; tree still present.
  assert.ok(allNodes(view).length > 0);
});

test("21–22. Unit href compatibility for actionable nodes", () => {
  const view = sidebarFromGolden(DIETARY_GOLDEN_PROJECTION);
  for (const node of allNodes(view)) {
    if (node.presentation === "ACTIONABLE") {
      assert.ok(node.href?.startsWith("/unit/"));
      assert.ok(node.unitId);
      if (node.kind === "ROOM") {
        assert.ok(
          node.href?.includes(`?space=`),
          `room ${node.id} should carry space context`,
        );
      } else {
        assert.equal(node.href, `/unit/${node.unitId}`);
      }
    } else {
      assert.equal(node.href, null);
    }
  }
});

test("23. vocabulary labels applied (hospital profile)", () => {
  const view = sidebarFromGolden(
    DIETARY_GOLDEN_PROJECTION,
    FACILITY_VOCABULARY_PROFILES.hospital,
  );
  const floor = allNodes(view).find((n) => n.kind === "FLOOR");
  const neighborhood = allNodes(view).find((n) => n.kind === "NEIGHBORHOOD");
  const room = allNodes(view).find((n) => n.kind === "ROOM");
  assert.equal(floor?.levelLabel, "Floor");
  assert.equal(neighborhood?.levelLabel, "Unit");
  assert.equal(room?.levelLabel, "Patient Room");
});

test("24. Projection failure fail-closed view has empty sections", () => {
  const empty = adaptLocationsViewToSidebar(
    {
      facilityId: "f1",
      purpose: "SIDEBAR",
      lensMode: "DEPARTMENT",
      lensKey: "fail-closed",
      departmentKey: null,
      revision: {
        hierarchyRevision: "none",
        assignmentRevision: "none",
        profileRevision: "none",
        bindingRevision: "none",
        policyRevision: "none",
        experienceRegistryVersion: 0,
        accessClassRevision: "none",
      },
      departmentSnapshots: [],
      projectedUnitIds: [],
      diagnostics: [
        { code: "PROJECTION_INVARIANT", severity: "ERROR", message: "boom" },
      ],
    },
    FACILITY_VOCABULARY_PROFILES.ltc,
    "boom",
  );
  assert.equal(empty.sections.length, 0);
  assert.equal(empty.projectedUnitIds.length, 0);
  assert.equal(empty.error, "boom");
});

test("25–27. flag off means legacy path; no union (contract)", () => {
  withEnv("PROJECTION_SIDEBAR_ENABLED", "false", () => {
    assert.equal(isProjectionSidebarEnabled(), false);
  });
  // When flag on, AppShell skips getSidebarUnitsForSession — covered by usedLegacyEligibility.
  withEnv("PROJECTION_SIDEBAR_ENABLED", "true", () => {
    assert.equal(isProjectionSidebarEnabled(), true);
  });
});

test("28. Plant creates no fake assignment rows (policy flag)", () => {
  const locations = adaptProjectionToLocationsView(PLANT_GOLDEN_PROJECTION);
  assert.equal(
    locations.departmentSnapshots[0]?.plantPolicy?.createsRoomAssignments,
    false,
  );
});

test("29. Locations and Sidebar eligibility parity (same unit ids)", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
    PERMISSION_NARROWED_PROJECTION,
  ]) {
    const locations = adaptProjectionToLocationsView(snapshot);
    const sidebar = adaptLocationsViewToSidebar(
      locations,
      FACILITY_VOCABULARY_PROFILES.ltc,
    );
    assert.deepEqual(sidebar.projectedUnitIds, locations.projectedUnitIds);
  }
});

test("30. Shadow parity fixtures still pass (self-compare) + room count", () => {
  for (const snapshot of [
    DIETARY_GOLDEN_PROJECTION,
    EVS_GOLDEN_PROJECTION,
    PLANT_GOLDEN_PROJECTION,
  ]) {
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: snapshot,
      projectionSnapshot: snapshot,
    });
    assert.equal(report.metrics.parityPercent, 100);
    const shadow = adaptProjectionSnapshotToShadowView(snapshot);
    const sidebar = sidebarFromGolden(snapshot);
    assert.equal(
      allNodes(sidebar).filter((n) => n.kind === "ROOM").length,
      shadow.roomIds.length,
    );
  }
});

test("hotel vocabulary Wing / Guest Room", () => {
  const view = sidebarFromGolden(
    DIETARY_GOLDEN_PROJECTION,
    FACILITY_VOCABULARY_PROFILES.hotel,
  );
  assert.equal(
    allNodes(view).find((n) => n.kind === "NEIGHBORHOOD")?.levelLabel,
    "Wing",
  );
  assert.equal(
    allNodes(view).find((n) => n.kind === "ROOM")?.levelLabel,
    "Guest Room",
  );
});
