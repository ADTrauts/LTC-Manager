import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Run surface reference freeze", () => {
  it("keeps Locations / Dashboard / Review on the frozen routes and loaders", () => {
    const units = read("src/app/(protected)/units/page.tsx");
    const workspace = read("src/app/(protected)/workspace/page.tsx");
    const reports = read("src/app/(protected)/reports/page.tsx");
    const freeze = read("docs/department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md");

    assert.match(units, /ExceptionFirstLocationsBoard/);
    assert.match(units, /presentExceptionFirstLocationBoard/);
    assert.match(units, /loadRuntimeLocationStates/);
    assert.match(units, /14_RUN_SURFACE_REFERENCE_FREEZE/);
    assert.doesNotMatch(units, /LocationsHierarchyBrowser/);
    assert.doesNotMatch(units, /buildLocationsLandingPresentation/);

    assert.match(workspace, /loadDashboardRuntime/);
    assert.match(workspace, /BusinessWorkspaceScreen/);
    assert.match(workspace, /14_RUN_SURFACE_REFERENCE_FREEZE/);

    assert.match(reports, /loadOperationalReviewDay/);
    assert.match(reports, /presentOperationalReviewDay/);
    assert.match(reports, /loadRuntimeLocationStates/);
    assert.match(reports, /presentReviewLocationsFromRuntime/);
    assert.match(reports, /14_RUN_SURFACE_REFERENCE_FREEZE/);

    assert.match(freeze, /Do not copy/);
    assert.match(freeze, /Operational Type not assigned/);
    assert.match(freeze, /Location Program/);
  });

  it("feeds Runtime Location State from Location Program after step 18", () => {
    const types = read("src/lib/runtime-location-state/types.ts");
    const compose = read("src/lib/runtime-location-state/compose.ts");
    const prefetch = read("src/lib/runtime-location-state/prefetch.ts");
    const landing = read("src/lib/locations/landing/from-runtime-state.ts");

    assert.match(types, /locationProgram/);
    assert.match(types, /operationalType/);
    assert.match(compose, /from \"@\/lib\/department-administration\/location-program\"/);
    assert.match(prefetch, /loadLocationProgramsForRuntimeSpaces/);
    assert.match(landing, /locationProgramIsAttached/);
  });

  it("keeps Dashboard and Review off the exception-first Location card", () => {
    const workspace = read("src/app/(protected)/workspace/page.tsx");
    const reports = read("src/app/(protected)/reports/page.tsx");
    assert.doesNotMatch(workspace, /ExceptionFirstLocationCard|ExceptionFirstLocationsBoard/);
    assert.doesNotMatch(reports, /ExceptionFirstLocationCard|ExceptionFirstLocationsBoard/);
  });
});
