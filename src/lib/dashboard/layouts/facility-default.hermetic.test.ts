import assert from "node:assert/strict";
import test from "node:test";

import { chooseDashboardLayout, facilityDefaultBands } from "./facility-default";

const personal = [{ card: "attention" as const, size: "M" as const, rows: 1 as const }];
const facility = [{ card: "coverage" as const, size: "S" as const, rows: 1 as const }];

test("a personal layout wins over a facility default", () => {
  assert.equal(chooseDashboardLayout(personal, facility), personal);
  assert.deepEqual(chooseDashboardLayout([], facility), []);
});

test("a facility default is used when there is no personal layout", () => {
  assert.equal(chooseDashboardLayout(null, facility), facility);
  assert.equal(chooseDashboardLayout(null, null), null);
});

test("facility defaults are offered only for bands that open the view", () => {
  assert.deepEqual(facilityDefaultBands("FACILITY"), ["FACILITY_ADMINISTRATOR"]);
  assert.deepEqual(facilityDefaultBands("TEAM"), ["SUPERVISOR"]);
  assert.deepEqual(facilityDefaultBands("DEPARTMENT"), [
    "FACILITY_ADMINISTRATOR",
    "DEPARTMENT_LEADER",
    "MANAGER",
    "SUPERVISOR",
  ]);
});
