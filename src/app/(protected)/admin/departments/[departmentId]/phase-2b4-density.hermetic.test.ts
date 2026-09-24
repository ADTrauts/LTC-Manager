import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Department Locations removes duplicate location count from section header", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.match(panel, /department-locations-header/);
  assert.match(panel, /department-locations-manage-link/);
  assert.doesNotMatch(panel, /locationCoverage\.total/);
  assert.doesNotMatch(panel, /location\s*\{/);
});

test("Department Locations header stacks title, helper, and manage action compactly", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.match(panel, /flex flex-col gap-2 sm:flex-row/);
  assert.match(
    panel,
    /Physical places \{view\.department\.name\} is responsible for, and the Operational Type/,
  );
  assert.match(panel, /Manage responsibility/);
  assert.match(panel, /space-y-3/);
});

test("Facility Builder page stacks header copy in context bar", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/facility/builder/page.tsx"),
    "utf8",
  );
  assert.match(page, /FacilityBuildContextBar/);
  assert.doesNotMatch(page, /BuildPageHeader/);
  assert.doesNotMatch(page, /actionsPlacement="below"/);
});

test("BuildPageHeader supports below-actions placement for compact builder headers", () => {
  const header = readFileSync(
    join(process.cwd(), "src/components/build/build-breadcrumb.tsx"),
    "utf8",
  );
  assert.match(header, /actionsPlacement/);
  assert.match(header, /build-page-header-actions/);
  assert.match(header, /max-w-none/);
});

test("Facility Builder essential tree actions use touch-visible utility", () => {
  const client = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/facility/builder/facility-builder-client.tsx",
    ),
    "utf8",
  );
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(client, /builder-essential-touch-visible/);
  assert.match(client, /add-room-/);
  assert.match(client, /add-rooms-bulk-/);
  assert.match(client, /add-neighborhood-/);
  assert.doesNotMatch(client, /group-hover\/unit:opacity-100/);
  assert.match(css, /builder-essential-touch-visible/);
  assert.match(css, /hover: hover/);
});

test("Department Location tree projection remains unchanged in this pass", () => {
  const tree = readFileSync(
    join(process.cwd(), "src/components/location-tree/DepartmentLocationTree.tsx"),
    "utf8",
  );
  const programming = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
    ),
    "utf8",
  );
  assert.match(programming, /import \{ DepartmentLocationTree \} from "@\/components\/location-tree"/);
  assert.match(programming, /<DepartmentLocationTree/);
  assert.match(programming, /floors=\{view\.locationHierarchy\}/);
  assert.match(tree, /role="tree"/);
  assert.match(tree, /LocationTreeRow/);
  assert.doesNotMatch(tree, /builder-essential-touch-visible/);
});

test("Builder density and touch rules documented in design tokens", () => {
  const tokens = readFileSync(
    join(process.cwd(), "src/lib/design-system/design-tokens.ts"),
    "utf8",
  );
  assert.match(tokens, /first third of the viewport/);
  assert.match(tokens, /Do not repeat context/);
  assert.match(tokens, /must not depend on hover/);
});
