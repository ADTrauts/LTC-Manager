import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { locationTreePaddingLeft } from "@/components/location-tree/location-tree-tokens";
import { locationTreeKindIcon } from "@/components/location-tree/location-tree-icons";

test("locationTreePaddingLeft matches Facility Builder Structure indent", () => {
  assert.equal(locationTreePaddingLeft(0), 6);
  assert.equal(locationTreePaddingLeft(1), 22);
  assert.equal(locationTreePaddingLeft(2), 38);
});

test("location tree kind icons map Floor / Neighborhood / Room", () => {
  assert.notEqual(locationTreeKindIcon("floor"), locationTreeKindIcon("room"));
  assert.notEqual(locationTreeKindIcon("neighborhood"), locationTreeKindIcon("room"));
  assert.notEqual(locationTreeKindIcon("floor"), locationTreeKindIcon("neighborhood"));
});

test("Department Locations uses shared tree grammar, not prose list", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.match(panel, /DepartmentLocationTree/);
  assert.doesNotMatch(panel, /Rooms on this/);
  assert.match(panel, /Manage facility responsibility/);
});

test("DepartmentLocationTree is read-only Facility-style tree", () => {
  const tree = readFileSync(
    join(process.cwd(), "src/components/location-tree/DepartmentLocationTree.tsx"),
    "utf8",
  );
  const row = readFileSync(
    join(process.cwd(), "src/components/location-tree/LocationTreeRow.tsx"),
    "utf8",
  );
  assert.match(tree, /role="tree"/);
  assert.match(tree, /LocationTreeRow/);
  assert.match(tree, /department-location-floor/);
  assert.match(tree, /department-location-neighborhood/);
  assert.match(tree, /department-location-room/);
  assert.doesNotMatch(tree, /GripVertical|Bulk import|Add Floor/);
  assert.match(row, /Collapse \$\{label\}/);
  assert.match(row, /Expand \$\{label\}/);
});

test("Facility Builder still owns editing tree and shares indent token", () => {
  const client = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/facility/builder/facility-builder-client.tsx",
    ),
    "utf8",
  );
  assert.match(client, /locationTreePaddingLeft/);
  assert.match(client, /TreeUnitNode/);
  assert.match(client, /GripVertical/);
  assert.match(client, /facility-hierarchy-pane/);
});

test("LocationTreeRow uses Facility Structure visual markers", () => {
  const row = readFileSync(
    join(process.cwd(), "src/components/location-tree/LocationTreeRow.tsx"),
    "utf8",
  );
  const tokens = readFileSync(
    join(process.cwd(), "src/components/location-tree/location-tree-tokens.ts"),
    "utf8",
  );
  assert.match(row, /locationTreePaddingLeft/);
  assert.match(row, /ChevronDown|ChevronRight/);
  assert.match(row, /border-l-2/);
  assert.match(row, /LOCATION_TREE_COUNT_PILL_CLASS/);
  assert.match(tokens, /rounded-full/);
});
