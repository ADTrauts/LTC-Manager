import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Operating Location Board keys include department and facilityOrder (no floor-id collisions)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/todays-work/operating-location-board.tsx"),
    "utf8",
  );
  assert.match(source, /operatingLocationRowKey/);
  assert.match(source, /departmentKey/);
  assert.match(source, /facilityOrder/);
  assert.match(source, /floor-group-\$\{groupIndex\}/);
  assert.doesNotMatch(
    source,
    /key=\{`\$\{group\.floor \?\? "none"\}-\$\{group\.rows\[0\]\?\.location\.id\}`\}/,
  );
  assert.doesNotMatch(source, /key=\{row\.location\.id\}/);
});
