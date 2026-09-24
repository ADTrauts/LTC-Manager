import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_PRIORITY, hasAtLeastRole } from "@/lib/access";
import { upsertInspectionDefinitionSchema } from "@/lib/work/inspections/definition-schema";
import { filterInspectionsForUnit } from "@/lib/work/inspections/list-unit-inspections";
import { inspectionResultOperatorCopy } from "@/lib/work/inspections/result-copy";
import { roleMayAccessRoute } from "@/lib/route-registry";

test("upsertInspectionDefinitionSchema requires ordered items and name", () => {
  const parsed = upsertInspectionDefinitionSchema.parse({
    name: "EVS Room Walk",
    description: "Daily walkthrough",
    frequency: "Daily",
    isActive: true,
    items: [
      {
        label: "Floors clear",
        sortOrder: 2,
        isRequired: true,
        responseType: "PASS_FAIL",
        failureCreatesFollowUp: true,
      },
      {
        label: "Notes",
        sortOrder: 1,
        isRequired: false,
        responseType: "TEXT",
        failureCreatesFollowUp: false,
      },
    ],
  });
  assert.equal(parsed.items.length, 2);
  assert.throws(() =>
    upsertInspectionDefinitionSchema.parse({
      name: "Bad",
      items: [],
    }),
  );
});

test("filterInspectionsForUnit excludes inactive and other-unit definitions", () => {
  const rows = filterInspectionsForUnit({
    facilityId: "fac_1",
    unitId: "unit_a",
    definitions: [
      {
        id: "1",
        name: "Mine",
        description: null,
        frequency: "Daily",
        facilityId: "fac_1",
        departmentId: null,
        unitId: "unit_a",
        isActive: true,
        _count: { items: 2 },
      },
      {
        id: "2",
        name: "Facility wide",
        description: null,
        frequency: null,
        facilityId: "fac_1",
        departmentId: null,
        unitId: null,
        isActive: true,
        _count: { items: 1 },
      },
      {
        id: "3",
        name: "Other unit",
        description: null,
        frequency: null,
        facilityId: "fac_1",
        departmentId: null,
        unitId: "unit_b",
        isActive: true,
        _count: { items: 1 },
      },
      {
        id: "4",
        name: "Inactive",
        description: null,
        frequency: null,
        facilityId: "fac_1",
        departmentId: null,
        unitId: null,
        isActive: false,
        _count: { items: 1 },
      },
      {
        id: "5",
        name: "Other facility",
        description: null,
        frequency: null,
        facilityId: "fac_2",
        departmentId: null,
        unitId: null,
        isActive: true,
        _count: { items: 1 },
      },
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    ["1", "2"],
  );
});

test("inspection result copy is calm and does not imply save failure", () => {
  assert.match(inspectionResultOperatorCopy("PASSED").body, /No issues were found/i);
  assert.match(inspectionResultOperatorCopy("PASSED_WITH_FINDINGS").body, /findings for supervisor/i);
  assert.match(inspectionResultOperatorCopy("FAILED").body, /need attention/i);
  assert.doesNotMatch(inspectionResultOperatorCopy("FAILED").body, /failed to save/i);
});

test("inspection builder remains behind Administration (/admin) FA gate", () => {
  const flags = { todaysWorkEnabled: true };
  assert.equal(roleMayAccessRoute("/admin/inspections", "FACILITY_ADMINISTRATOR", flags), true);
  assert.equal(roleMayAccessRoute("/admin/inspections", "GM", flags), false);
  assert.equal(roleMayAccessRoute("/admin/inspections", "MANAGER", flags), false);
  assert.equal(hasAtLeastRole("FACILITY_ADMINISTRATOR", "MANAGER"), true);
  assert.equal(hasAtLeastRole("STAFF", "MANAGER"), false);
  assert.ok(ROLE_PRIORITY.FACILITY_ADMINISTRATOR > ROLE_PRIORITY.STAFF);
});
