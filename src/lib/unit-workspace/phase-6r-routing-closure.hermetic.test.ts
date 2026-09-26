/**
 * Phase 6R — leftover leaf Unit Workspace routing is closed.
 * Canonical `/unit/[unitId]` is SPACE-first, then Neighborhood / structural / fail-closed.
 * loadUnitWorkspace is absent/unreachable.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isStructuralNeighborhoodUnit } from "@/lib/unit-workspace/neighborhood";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function absent(rel: string) {
  return !existsSync(join(process.cwd(), rel));
}

const page = source("src/app/(protected)/unit/[unitId]/page.tsx");
const neighborhood = source("src/app/(protected)/unit/[unitId]/neighborhood-workspace-page.tsx");
const space = source("src/app/(protected)/unit/[unitId]/space-workspace-page.tsx");
const employee = source("src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx");
const unavailable = source("src/app/(protected)/unit/[unitId]/unit-route-unavailable.tsx");
const view = source("src/components/unit-workspace/neighborhood-workspace-view.tsx");
const flags = source("src/lib/feature-flags.ts");
const runPresentation = source("src/lib/operational-cycles/load-run-operation-presentation.ts");
const unitBarrel = source("src/lib/unit-workspace/index.ts");

test("SPACE query remains first; parent never auto-opens a single SPACE", () => {
  assert.match(page, /requestedSpaceId = firstSearchValue\(query\?\.space\)/);
  assert.match(page, /<SpaceWorkspacePage/);
  assert.match(page, /tryRenderNeighborhoodWorkspace/);
  assert.ok(
    page.indexOf("if (requestedSpaceId)") <
      page.indexOf("return tryRenderNeighborhoodWorkspace"),
  );
  assert.equal(page.includes("redirect(`/unit/${"), false);
  assert.equal(neighborhood.includes("redirect("), false);
});

test("wrong-unit SPACE redirect and query compatibility remain on SPACE page", () => {
  assert.match(space, /resolveSelectedRoomForUnit/);
  assert.match(space, /wrong_unit/);
  assert.match(space, /params.set\("space"/);
  assert.match(space, /params.set\("unitTab"/);
  assert.match(space, /params.set\("evidence"/);
  assert.match(space, /params.set\("work"/);
  assert.match(space, /params.set\("reportAsset"/);
});

test("canonical no-space route never invokes leftover Unit Workspace", () => {
  for (const [name, src] of [
    ["page", page],
    ["neighborhood", neighborhood],
    ["space", space],
    ["employee", employee],
    ["unavailable", unavailable],
  ] as const) {
    assert.equal(src.includes("loadUnitWorkspace("), false, name);
    assert.equal(src.includes("loadUnitWorkspaceProjection("), false, name);
    assert.equal(src.includes("ProjectedUnitWorkspacePage"), false, name);
    assert.equal(src.includes("ProjectedUnitWorkspaceBody"), false, name);
    assert.equal(src.includes("resolveUnitWorkspaceRunContext"), false, name);
    assert.equal(src.includes("computeUnitWorkspaceReadiness"), false, name);
    assert.equal(src.includes("computeReadinessBatch"), false, name);
    assert.equal(src.includes("loadUnitQueries("), false, name);
    assert.equal(src.includes("UnitContextPanel"), false, name);
    assert.equal(src.includes("Logs &"), false, name);
  }
});

test("leftover Unit Workspace loader and Wave 15H projection are absent", () => {
  assert.equal(absent("src/lib/unit-workspace/load-unit-workspace.ts"), true);
  assert.equal(absent("src/lib/unit-workspace/load-unit-queries.ts"), true);
  assert.equal(absent("src/lib/unit-workspace/compute-unit-workspace-readiness.ts"), true);
  assert.equal(absent("src/lib/unit-workspace/projection/load.ts"), true);
  assert.equal(absent("src/components/unit-workspace/unit-context-panel.tsx"), true);
  assert.equal(absent("src/components/unit-workspace/projected-experience-panels.tsx"), true);
  assert.equal(unitBarrel.includes("loadUnitWorkspace"), false);
  assert.equal(unitBarrel.includes("loadUnitWorkspaceProjection"), false);
  assert.equal(runPresentation.includes("resolveUnitWorkspaceRunContext"), false);
  assert.equal(runPresentation.includes("UnitWorkspaceRunContext"), false);
  assert.match(runPresentation, /resolveSelectedRoomForUnit/);
  assert.match(runPresentation, /loadLocationRunPresentation/);
});

test("parent Neighborhood is exclusive for non-structural units", () => {
  assert.match(neighborhood, /isStructuralNeighborhoodUnit/);
  assert.match(neighborhood, /collectNeighborhoodActionableSpaces/);
  assert.match(neighborhood, /presentNeighborhoodWorkspace/);
  assert.match(neighborhood, /loadRuntimeLocationStates\(/);
  assert.equal(neighborhood.includes("loadRuntimeLocationState("), false);
  assert.equal((neighborhood.match(/loadRuntimeLocationStates\(/g) ?? []).length, 1);
  assert.equal(isStructuralNeighborhoodUnit(null), false);
  assert.equal(isStructuralNeighborhoodUnit("LEGACY_LOCATION"), false);
  assert.equal(isStructuralNeighborhoodUnit("NEIGHBORHOOD"), false);
  assert.equal(isStructuralNeighborhoodUnit("FLOOR"), true);
  assert.equal(isStructuralNeighborhoodUnit("BUILDING"), true);
});

test("Floor/Building, projection-off, and Locations failure fail closed", () => {
  assert.match(neighborhood, /kind="structural"/);
  assert.match(neighborhood, /kind="projection_off"/);
  assert.match(neighborhood, /kind="locations_unavailable"/);
  assert.equal(neighborhood.includes("return null"), false);
  assert.match(unavailable, /This location is structural/);
  assert.match(unavailable, /Canonical location projection is not available/);
  assert.match(unavailable, /Locations could not be loaded for this facility/);
});

test("zero-space copy and authorized Build destinations stay distinct", () => {
  assert.match(view, /No operational spaces are configured for this location/);
  assert.match(neighborhood, /\/admin\/facility\/builder/);
  assert.match(neighborhood, /departmentAdminHref/);
  assert.match(neighborhood, /departmentAdminHref\(departmentId, "locations"\)/);
  assert.equal(neighborhood.includes("unitSpace.create"), false);
  assert.equal(neighborhood.includes("prisma.unitSpace.create"), false);
});

test("employee intercept stays before Neighborhood body and never remounts leftover Job Flow", () => {
  assert.ok(
    neighborhood.indexOf("await tryRenderEmployeeRuntimeExperience") <
      neighborhood.indexOf("await loadLocationsView"),
  );
  assert.match(space, /tryRenderEmployeeRuntimeExperience/);
  assert.equal(page.includes("EmployeeJobFlowPanel"), false);
  assert.equal(neighborhood.includes("EmployeeJobFlowPanel"), false);
  assert.equal(space.includes("EmployeeJobFlowPanel"), false);
  assert.equal(employee.includes("EmployeeJobFlowPanel"), false);
  assert.equal(employee.includes("loadUnitWorkspace("), false);
  assert.equal(employee.includes("loadEmployeeJobFlow("), false);
});

test("query-param compatibility remains canonical", () => {
  assert.match(space, /evidenceFocusKey/);
  assert.match(space, /unitTab/);
  assert.match(space, /reportAsset/);
  assert.match(neighborhood, /unitTab: firstSearchValue\(input.query\?\.unitTab\)/);
  assert.match(employee, /query\?\.evidence/);
  assert.match(employee, /query\?\.work/);
  assert.match(employee, /query\?\.reportAsset/);
  assert.equal(page.includes("activeInspectId"), false);
  assert.equal(neighborhood.includes("inspect="), false);
});

test("SPACE Servery/offline chrome remains; Neighborhood does not reimplement it", () => {
  assert.match(space, /renderServeryActionChrome/);
  assert.match(employee, /renderServeryActionChrome/);
  assert.equal(neighborhood.includes("renderServeryActionChrome"), false);
  assert.equal(neighborhood.includes("OfflineServeryControls"), false);
});

test("Experience shell does not host or decide the location workspace", () => {
  for (const [name, src] of [
    ["page", page],
    ["neighborhood", neighborhood],
    ["space", space],
    ["employee", employee],
    ["view", view],
  ] as const) {
    assert.equal(src.includes("ExperienceShell"), false, name);
    assert.equal(src.includes("resolveExperienceShellModel"), false, name);
    assert.equal(src.includes("isExperienceShellEnabled"), false, name);
  }
  const spaceAdapter = source("src/lib/unit-workspace/space/from-runtime-state.ts");
  const neighborhoodAdapter = source("src/lib/unit-workspace/neighborhood/from-runtime-state.ts");
  const spaceView = source("src/components/unit-workspace/space-workspace-view.tsx");
  assert.equal(spaceAdapter.includes("experience-shell"), false);
  assert.equal(neighborhoodAdapter.includes("experience-shell"), false);
  assert.equal(spaceView.includes("operationalTypeName"), false);
  assert.match(spaceAdapter, /presentExceptionFirstLocationCard/);
  assert.match(neighborhoodAdapter, /presentExceptionFirstLocationCard/);
});

test("leftover Unit Workspace flags are gone; live location flags stay unchanged", () => {
  assert.equal(flags.includes("isProjectionUnitWorkspaceEnabled"), false);
  assert.equal(flags.includes("PROJECTION_UNIT_WORKSPACE_ENABLED"), false);
  assert.equal(flags.includes("isExperienceShellEnabled"), false);
  assert.equal(flags.includes("EXPERIENCE_SHELL_ENABLED"), false);
  assert.match(flags, /parseEnvFlag\(process.env.PROJECTION_LOCATIONS_ENABLED, true\)/);
  assert.equal(flags.includes("PROJECTION_OPERATIONS_CENTER_ENABLED"), false);
  assert.equal(flags.includes("isProjectionOperationsCenterEnabled"), false);
});

test("live location pages do not use leftover current-operation or log math", () => {
  for (const [name, src] of [
    ["page", page],
    ["neighborhood", neighborhood],
    ["space", space],
    ["employee", employee],
  ] as const) {
    assert.equal(src.includes("LogAssignment"), false, name);
    assert.equal(src.includes("ScheduleEntry"), false, name);
    assert.equal(src.includes("resolveUnitWorkspaceActiveOperation"), false, name);
    assert.equal(src.includes("fmtMealLabel"), false, name);
  }
});
