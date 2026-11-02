import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("Records and Audit do not share a Location Function room filter", () => {
  const records = [
    "src/lib/canonical-logs/load-run-requirements.ts",
    "src/lib/canonical-logs/load-target-run-logs.ts",
    "src/lib/audit/audit-records.ts",
    "src/lib/runtime-location-state/evidence.ts",
  ];
  for (const file of records) {
    const text = source(file);
    assert.equal(text.includes("expandOperationalTypeSpaces"), false, file);
    assert.equal(text.includes("selectHistoricalProfileForServiceDate"), false, file);
  }
  const work = source("src/lib/department-work/load-runtime-work.ts");
  assert.match(work, /loadSpaceOperationalTypeAssignments|OPERATIONAL_TYPE/);
});
