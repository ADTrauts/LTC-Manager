import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("BuildContextBar component supports title, facts, state, and footer", () => {
  const bar = readFileSync(
    join(process.cwd(), "src/components/build/BuildContextBar.tsx"),
    "utf8",
  );
  assert.match(bar, /export function BuildContextBar/);
  assert.match(bar, /build-context-bar-title/);
  assert.match(bar, /build-context-bar-facts/);
  assert.match(bar, /build-context-bar-state/);
  assert.match(bar, /build-context-bar-footer/);
  assert.match(bar, /build-context-bar-fact-link/);
});

test("formatBuildCountFact handles singular and plural", () => {
  const helper = readFileSync(
    join(process.cwd(), "src/lib/build/format-build-count-fact.ts"),
    "utf8",
  );
  assert.match(helper, /count === 1/);
});

test("Department Builder uses BuildContextBar instead of BuildPageHeader", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
    "utf8",
  );
  assert.match(page, /DepartmentBuildContextBar/);
  assert.doesNotMatch(page, /BuildPageHeader/);
  assert.match(page, /loadDepartmentBuilderContextSummary/);
});

test("Facility Builder uses BuildContextBar instead of BuildPageHeader", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/facility/builder/page.tsx"),
    "utf8",
  );
  assert.match(page, /FacilityBuildContextBar/);
  assert.doesNotMatch(page, /BuildPageHeader/);
  assert.match(page, /summarizeFacilityStructureCounts/);
});

test("Department context facts link to primary tabs", () => {
  const bar = readFileSync(
    join(process.cwd(), "src/components/build/DepartmentBuildContextBar.tsx"),
    "utf8",
  );
  assert.match(bar, /departmentAdminHref\(departmentId, "locations"/);
  assert.match(bar, /departmentAdminHref\(departmentId, "teams"/);
  assert.match(bar, /departmentAdminHref\(departmentId, "teams"/);
  assert.match(bar, /Draft changes/);
});

test("Facility context bar includes terminology footer slot", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/facility/builder/page.tsx"),
    "utf8",
  );
  assert.match(page, /terminologyFooter/);
  assert.match(page, /variant="compact"/);
});

test("Locations panel no longer repeats location count", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.doesNotMatch(panel, /locationCoverage/);
  assert.match(panel, /Manage responsibility/);
});

test("Facility essential touch actions remain after context bar", () => {
  const client = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/facility/builder/facility-builder-client.tsx",
    ),
    "utf8",
  );
  assert.match(client, /builder-essential-touch-visible/);
});

test("Department Locations list stays outside Facility Builder chrome", () => {
  const tree = readFileSync(
    join(process.cwd(), "src/components/location-tree/DepartmentLocationTree.tsx"),
    "utf8",
  );
  assert.match(tree, /department-location-room/);
  assert.doesNotMatch(tree, /BuildContextBar/);
});
