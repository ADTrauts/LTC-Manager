import assert from "node:assert/strict";
import test from "node:test";

import { adaptLocationsViewToSidebar } from "@/lib/locations/adapt-sidebar";
import type {
  LocationsTreeNode,
  LocationsViewModel,
} from "@/lib/locations/types";
import type { ProjectedSidebarNode } from "@/lib/locations/sidebar-types";
import type { ProjectionRevision } from "@/lib/projection";

/**
 * Phase 14 — explicit Floor → Neighborhood → Room sidebar assertions.
 *
 * The rail is a presentation projection of the shared Locations tree. These tests pin the
 * hierarchy contract the shell renders: structural Floor/Neighborhood orient (no href), an
 * actionable Room links into its owning Unit workspace with `?space=`, facility vocabulary labels
 * are carried, and nesting depth (Floor → Neighborhood → Room) is preserved end to end.
 */

const REVISION: ProjectionRevision = {
  hierarchyRevision: "h1",
  assignmentRevision: "a1",
  profileRevision: "p1",
  bindingRevision: "b1",
  policyRevision: "pol1",
  experienceRegistryVersion: 1,
  accessClassRevision: "ac1",
};

function node(partial: Partial<LocationsTreeNode> & Pick<LocationsTreeNode, "id" | "kind">): LocationsTreeNode {
  return {
    id: partial.id,
    label: partial.label ?? partial.id,
    secondaryLabel: partial.secondaryLabel ?? null,
    presentation: partial.presentation ?? "STRUCTURAL",
    physicalId: partial.physicalId ?? partial.id,
    kind: partial.kind,
    hierarchyLevel: partial.hierarchyLevel ?? "FACILITY",
    parentId: partial.parentId ?? null,
    unitId: partial.unitId ?? null,
    href: partial.href ?? null,
    experienceKeys: partial.experienceKeys ?? [],
    areas: partial.areas ?? [],
    children: partial.children ?? [],
  };
}

/** Facility → Floor → Neighborhood(Unit) → Room, mirroring the LTC hierarchy. */
function ltcTree(): LocationsTreeNode {
  const room = node({
    id: "space-room-32a",
    label: "Room 32A",
    secondaryLabel: "32A",
    kind: "ROOM",
    hierarchyLevel: "LEVEL_3",
    presentation: "ACTIONABLE",
    physicalId: "space-room-32a",
    parentId: "unit-neighborhood-1a",
    unitId: "unit-neighborhood-1a",
    href: "/unit/unit-neighborhood-1a?space=space-room-32a",
  });
  const neighborhood = node({
    id: "unit-neighborhood-1a",
    label: "1A Naval Park",
    kind: "NEIGHBORHOOD",
    hierarchyLevel: "LEVEL_2",
    physicalId: "unit-neighborhood-1a",
    unitId: "unit-neighborhood-1a",
    parentId: "unit-floor-1",
    children: [room],
  });
  const floor = node({
    id: "unit-floor-1",
    label: "First Floor",
    kind: "FLOOR",
    hierarchyLevel: "LEVEL_1",
    physicalId: "unit-floor-1",
    unitId: "unit-floor-1",
    parentId: "facility-root",
    children: [neighborhood],
  });
  return node({
    id: "facility-root",
    label: "Terrace View",
    kind: "FACILITY",
    hierarchyLevel: "FACILITY",
    children: [floor],
  });
}

function viewModel(): LocationsViewModel {
  return {
    facilityId: "fac-1",
    purpose: "SIDEBAR",
    lensMode: "DEPARTMENT",
    lensKey: "DIETARY",
    departmentKey: "DIETARY",
    revision: REVISION,
    departmentSnapshots: [
      {
        departmentId: "dept-dietary",
        departmentKey: "DIETARY",
        label: "Dietary",
        roots: [ltcTree()],
        actionableLocationIds: ["space-room-32a"],
        unitIds: ["unit-floor-1", "unit-neighborhood-1a"],
        plantPolicy: null,
      },
    ],
    projectedUnitIds: ["unit-floor-1", "unit-neighborhood-1a"],
    diagnostics: [],
  };
}

test("sidebar hierarchy — Floor → Neighborhood → Room nests end to end", () => {
  const view = adaptLocationsViewToSidebar(viewModel());
  const section = view.sections[0];
  assert.ok(section, "expected one department section");

  const floor = section.nodes[0];
  assert.equal(floor?.kind, "FLOOR");
  assert.equal(floor?.label, "First Floor");

  const neighborhood = floor?.children[0];
  assert.equal(neighborhood?.kind, "NEIGHBORHOOD");

  const room = neighborhood?.children[0];
  assert.equal(room?.kind, "ROOM");
  assert.equal(room?.label, "Room 32A");
});

test("sidebar hierarchy — the Facility root is chrome and never renders as a node", () => {
  const view = adaptLocationsViewToSidebar(viewModel());
  const kinds = view.sections.flatMap((s) => s.nodes.map((n) => n.kind));
  assert.equal(kinds.includes("FACILITY" as ProjectedSidebarNode["kind"]), false);
  // The Floor is promoted to the section top in the Facility root's place.
  assert.equal(view.sections[0]?.nodes[0]?.kind, "FLOOR");
});

test("sidebar hierarchy — structural Floor/Neighborhood orient (no href); the Room is actionable", () => {
  const view = adaptLocationsViewToSidebar(viewModel());
  const floor = view.sections[0]?.nodes[0];
  const neighborhood = floor?.children[0];
  const room = neighborhood?.children[0];

  assert.equal(floor?.presentation, "STRUCTURAL");
  assert.equal(floor?.href, null);
  assert.equal(neighborhood?.presentation, "STRUCTURAL");
  assert.equal(neighborhood?.href, null);

  assert.equal(room?.presentation, "ACTIONABLE");
  // Rooms have no dedicated route — they open their owning Unit workspace with ?space=.
  assert.equal(room?.href, "/unit/unit-neighborhood-1a?space=space-room-32a");
  assert.equal(room?.unitId, "unit-neighborhood-1a");
});

test("sidebar hierarchy — facility vocabulary supplies the level labels (Floor / Neighborhood / Room)", () => {
  const view = adaptLocationsViewToSidebar(viewModel());
  const floor = view.sections[0]?.nodes[0];
  const neighborhood = floor?.children[0];
  const room = neighborhood?.children[0];

  assert.equal(floor?.levelLabel, "Floor");
  assert.equal(neighborhood?.levelLabel, "Neighborhood");
  assert.equal(room?.levelLabel, "Room");
});
