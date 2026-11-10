import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";

import {
  matchLogAttachmentToLocation,
  type LocationLogAttachmentRow,
} from "./log-operational-type-applicability";

const cooler: LocationLogAttachmentRow = {
  id: "cooler",
  departmentId: "dietary",
  catalogStableKey: "cooler",
  catalogVersion: 1,
  label: "Cooler",
  targetKind: "OPERATIONAL_TYPE",
  spaceId: null,
  unitId: null,
  targetDepartmentId: null,
  operationalTypeKey: "servery",
  assetId: null,
  status: "ACTIVE",
};

test("an Operational Type attachment does not apply to a room", () => {
  assert.equal(
    matchLogAttachmentToLocation(cooler, {
      facilityId: "facility-1",
      departmentId: "dietary",
      spaceId: "3a",
      unitId: null,
      operationalTypeKey: "servery",
      operationalTypeName: "Servery",
    }),
    null,
  );
});

test("Records loaders do not expand Location Function", () => {
  const run = readFileSync(join(process.cwd(), "src/lib/canonical-logs/load-target-run-logs.ts"), "utf8");
  const book = readFileSync(join(process.cwd(), "src/lib/canonical-logs/load-run-requirements.ts"), "utf8");
  const audit = readFileSync(join(process.cwd(), "src/lib/audit/audit-records.ts"), "utf8");
  const assign = readFileSync(join(process.cwd(), "src/lib/canonical-logs/catalog-assign.ts"), "utf8");
  for (const text of [run, book, audit]) {
    assert.equal(text.includes("expandOperationalTypeSpaces"), false);
    assert.equal(text.includes("selectHistoricalProfileForServiceDate"), false);
    assert.equal(text.includes("loadSpaceOperationalTypeAssignments"), false);
  }
  assert.doesNotMatch(assign, /OPERATIONAL_TYPE/);
  assert.doesNotMatch(assign, /Leftover Operational Types/);
});

test("existing requirement keys for space targets stay unchanged", () => {
  const key = buildLogRequirementKey({
    attachmentStableKey: "att_space",
    catalogStableKey: "cooler_temperature",
    scheduleKind: "FIXED_DAILY_WINDOW",
    windowStartLocal: "05:00",
    windowEndLocal: "11:00",
    target: { kind: "SPACE", spaceId: "3a" },
    operationalDateKey: "2026-09-21",
  });
  assert.doesNotMatch(key, /\|ot:/);
});
