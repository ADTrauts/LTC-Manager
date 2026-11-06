import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_UNASSIGN_NOTICE,
  computeCatalogAssignDiff,
  includeUnitInCatalogAssign,
  parseTargetAssignKey,
  targetAssignKey,
} from "./catalog-assign";

test("target keys round-trip and reject floors-as-kinds", () => {
  assert.equal(targetAssignKey("SPACE", "room-1"), "SPACE:room-1");
  assert.deepEqual(parseTargetAssignKey("SPACE:room-1"), { kind: "SPACE", id: "room-1" });
  assert.deepEqual(parseTargetAssignKey("OPERATIONAL_TYPE:dept-1:servery"), {
    kind: "OPERATIONAL_TYPE",
    id: "dept-1:servery",
  });
  assert.equal(parseTargetAssignKey("FACILITY:x"), null);
  assert.equal(parseTargetAssignKey("FLOOR:x"), null);
  assert.equal(parseTargetAssignKey("UNIT:"), null);
});

test("assign diff adds new checks and retires unchecked live attachments", () => {
  const diff = computeCatalogAssignDiff({
    selectedKeys: ["SPACE:a", "SPACE:c"],
    liveAssignments: [
      { key: "SPACE:a", attachmentId: "att-a" },
      { key: "SPACE:b", attachmentId: "att-b" },
    ],
  });
  assert.deepEqual(diff.addKeys, ["SPACE:c"]);
  assert.deepEqual(diff.remove, [{ key: "SPACE:b", attachmentId: "att-b" }]);
});

test("unassign copy tells the user records stay in the Log Book", () => {
  assert.match(CATALOG_UNASSIGN_NOTICE, /no longer be required/i);
  assert.match(CATALOG_UNASSIGN_NOTICE, /Log Book/);
});

test("floors and buildings are grouping only unless already assigned", () => {
  assert.equal(
    includeUnitInCatalogAssign({
      hierarchyRole: "FLOOR",
      parentUnitId: null,
      alreadyAssigned: false,
    }),
    false,
  );
  assert.equal(
    includeUnitInCatalogAssign({
      hierarchyRole: "BUILDING",
      parentUnitId: null,
      alreadyAssigned: false,
    }),
    false,
  );
  assert.equal(
    includeUnitInCatalogAssign({
      hierarchyRole: "STAGED",
      parentUnitId: "floor-1",
      alreadyAssigned: false,
    }),
    false,
  );
  assert.equal(
    includeUnitInCatalogAssign({
      hierarchyRole: "NEIGHBORHOOD",
      parentUnitId: "floor-1",
      alreadyAssigned: false,
    }),
    true,
  );
  assert.equal(
    includeUnitInCatalogAssign({
      hierarchyRole: "FLOOR",
      parentUnitId: null,
      alreadyAssigned: true,
    }),
    true,
  );
});
