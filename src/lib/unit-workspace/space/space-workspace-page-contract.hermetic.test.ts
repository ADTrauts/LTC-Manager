/**
 * Phase 6E routing / performance contract.
 * SPACE path loads RLS once. Neighborhood path stays on the existing page.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSrc = readFileSync(
  join(process.cwd(), "src/app/(protected)/unit/[unitId]/page.tsx"),
  "utf8",
);
const spacePageSrc = readFileSync(
  join(process.cwd(), "src/app/(protected)/unit/[unitId]/space-workspace-page.tsx"),
  "utf8",
);
const adapterSrc = readFileSync(
  join(process.cwd(), "src/lib/unit-workspace/space/from-runtime-state.ts"),
  "utf8",
);

test("existing SPACE route is retained and Neighborhood stays on the same page", () => {
  assert.match(pageSrc, /requestedSpaceId = firstSearchValue\(query\?\.space\)/);
  assert.match(pageSrc, /<SpaceWorkspacePage/);
  assert.match(pageSrc, /tryRenderNeighborhoodWorkspace/);
  assert.equal(pageSrc.includes("loadUnitWorkspace("), false);
  assert.equal(pageSrc.includes("loadUnitWorkspaceProjection("), false);
  assert.equal(pageSrc.includes("/locations/"), false);
});

test("SPACE initial operational truth comes from one RLS load", () => {
  assert.match(spacePageSrc, /loadRuntimeLocationState\(/);
  assert.equal(spacePageSrc.includes("loadUnitWorkspace("), false);
  assert.equal(spacePageSrc.includes("loadTargetRunLogs("), false);
  assert.equal(spacePageSrc.includes("loadUnitWorkspaceProjection("), false);
  assert.equal(spacePageSrc.includes("UnitContextPanel"), false);
  assert.equal(spacePageSrc.includes("ProjectedUnitWorkspaceBody"), false);
  assert.equal(spacePageSrc.includes("ScheduleEntry"), false);
  assert.equal(spacePageSrc.includes("LogAssignment"), false);
  assert.equal(spacePageSrc.includes("computeReadinessBatch"), false);
});

test("adapter does not query or recalculate domain truth", () => {
  assert.equal(adapterSrc.includes("from \"@/lib/prisma\""), false);
  assert.equal(adapterSrc.includes("ScheduleEntry"), false);
  assert.equal(adapterSrc.includes("evaluateCoverageSlots"), false);
  assert.equal(adapterSrc.includes("loadRuntimeLocationState"), false);
});

test("wrong-unit redirect and evidence query compatibility remain", () => {
  assert.match(spacePageSrc, /resolveSelectedRoomForUnit/);
  assert.match(spacePageSrc, /wrong_unit/);
  assert.match(spacePageSrc, /evidenceFocusKey/);
  assert.match(spacePageSrc, /unitTab/);
});
