/**
 * Phase 6F routing / performance contract.
 * Neighborhood `/unit/[unitId]` loads one RLS batch of child spaces.
 * SPACE `?space=` remains Phase 6E.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSrc = readFileSync(
  join(process.cwd(), "src/app/(protected)/unit/[unitId]/page.tsx"),
  "utf8",
);
const neighborhoodPageSrc = readFileSync(
  join(process.cwd(), "src/app/(protected)/unit/[unitId]/neighborhood-workspace-page.tsx"),
  "utf8",
);
const adapterSrc = readFileSync(
  join(process.cwd(), "src/lib/unit-workspace/neighborhood/from-runtime-state.ts"),
  "utf8",
);
const collectSrc = readFileSync(
  join(process.cwd(), "src/lib/unit-workspace/neighborhood/collect-spaces.ts"),
  "utf8",
);

test("existing Neighborhood route is retained and SPACE stays first", () => {
  assert.match(pageSrc, /requestedSpaceId = firstSearchValue\(query\?\.space\)/);
  assert.match(pageSrc, /<SpaceWorkspacePage/);
  assert.match(pageSrc, /tryRenderNeighborhoodWorkspace/);
  assert.ok(
    pageSrc.indexOf("if (requestedSpaceId)") >= 0 &&
      pageSrc.indexOf("if (requestedSpaceId)") <
        pageSrc.indexOf("return tryRenderNeighborhoodWorkspace"),
  );
  assert.equal(pageSrc.includes("/neighborhood/"), false);
});

test("Neighborhood operational truth is one child-space RLS batch", () => {
  assert.match(neighborhoodPageSrc, /collectNeighborhoodActionableSpaces/);
  assert.match(neighborhoodPageSrc, /loadRuntimeLocationStates\(/);
  assert.equal(neighborhoodPageSrc.includes("loadRuntimeLocationState("), false);
  assert.equal(neighborhoodPageSrc.includes("loadUnitWorkspace("), false);
  assert.equal(neighborhoodPageSrc.includes("loadTargetRunLogs("), false);
  assert.equal(neighborhoodPageSrc.includes("computeReadinessBatch"), false);
  assert.equal(neighborhoodPageSrc.includes("ScheduleEntry"), false);
  assert.equal(neighborhoodPageSrc.includes("LogAssignment"), false);
  assert.equal(neighborhoodPageSrc.includes("loadEmployeeJobFlow"), false);
  assert.match(neighborhoodPageSrc, /tryRenderEmployeeRuntimeExperience/);
  assert.equal((neighborhoodPageSrc.match(/loadRuntimeLocationStates\(/g) ?? []).length, 1);
});

test("structural Floor/Building does not invent a Neighborhood workspace", () => {
  assert.match(neighborhoodPageSrc, /isStructuralNeighborhoodUnit/);
  assert.match(neighborhoodPageSrc, /hierarchyRole/);
  assert.match(neighborhoodPageSrc, /kind="structural"/);
  assert.match(neighborhoodPageSrc, /kind="projection_off"/);
  assert.match(neighborhoodPageSrc, /kind="locations_unavailable"/);
  assert.equal(neighborhoodPageSrc.includes("return null"), false);
  assert.equal(neighborhoodPageSrc.includes("loadUnitWorkspace("), false);
  assert.equal(neighborhoodPageSrc.includes("loadRuntimeLocationState("), false);
});

test("adapter and collector do not query or recalculate domain truth", () => {
  assert.equal(adapterSrc.includes("from \"@/lib/prisma\""), false);
  assert.equal(adapterSrc.includes("ScheduleEntry"), false);
  assert.equal(adapterSrc.includes("evaluateCoverageSlots"), false);
  assert.equal(adapterSrc.includes("loadRuntimeLocationState"), false);
  assert.equal(collectSrc.includes("from \"@/lib/prisma\""), false);
  assert.equal(collectSrc.includes("OperationalType"), false);
  assert.equal(collectSrc.includes("UnitType"), false);
});
