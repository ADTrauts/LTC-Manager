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

test("Department Locations lists rooms with place as secondary text", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.match(panel, /LocationsProgrammingClient/);
  assert.doesNotMatch(panel, /Rooms on this/);
  assert.match(panel, /Manage responsibility/);
  assert.match(panel, /Physical places \{view\.department\.name\} is responsible for/);
});

test("DepartmentLocationTree lists rooms without editable floor or neighborhood rows", () => {
  const tree = readFileSync(
    join(process.cwd(), "src/components/location-tree/DepartmentLocationTree.tsx"),
    "utf8",
  );
  const row = readFileSync(
    join(process.cwd(), "src/components/location-tree/LocationTreeRow.tsx"),
    "utf8",
  );
  assert.match(tree, /department-location-room/);
  assert.match(tree, /parentNeighborhoodName/);
  assert.match(tree, /floorName/);
  assert.match(tree, /No physical type/);
  assert.doesNotMatch(tree, /department-location-floor/);
  assert.doesNotMatch(tree, /department-location-neighborhood/);
  assert.doesNotMatch(tree, /role="tree"/);
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
