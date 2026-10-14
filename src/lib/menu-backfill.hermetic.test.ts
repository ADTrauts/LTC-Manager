import assert from "node:assert/strict";
import test from "node:test";

import { planLegacyMenuBackfill } from "@/lib/menu-backfill";

test("legacy menu data plus a DIETARY department becomes one ACTIVE Menu", () => {
  const plan = planLegacyMenuBackfill({
    facilityId: "fac_1",
    departments: [
      { id: "dept_dietary", key: "DIETARY", name: "Food & Nutrition" },
      { id: "dept_plant", key: "PLANT", name: "Plant Operations" },
    ],
    hasSettings: true,
    itemCount: 4,
  });
  assert.deepEqual(plan, {
    action: "create",
    facilityId: "fac_1",
    departmentId: "dept_dietary",
    name: "Food & Nutrition Menu",
    status: "ACTIVE",
    createDefaultCycleSettings: false,
  });
});

test("items without settings still create a Menu and default cycle settings", () => {
  const plan = planLegacyMenuBackfill({
    facilityId: "fac_1",
    departments: [{ id: "dept_dietary", key: "DIETARY", name: "Dietary" }],
    hasSettings: false,
    itemCount: 2,
  });
  assert.equal(plan.action, "create");
  if (plan.action === "create") {
    assert.equal(plan.name, "Dietary Menu");
    assert.equal(plan.createDefaultCycleSettings, true);
  }
});

test("legacy menu data without a DIETARY department is not guessed", () => {
  const plan = planLegacyMenuBackfill({
    facilityId: "fac_2",
    departments: [
      { id: "dept_evs", key: "EVS", name: "Environmental Services" },
      { id: "dept_plant", key: "PLANT", name: "Plant Operations" },
    ],
    hasSettings: true,
    itemCount: 3,
  });
  assert.deepEqual(plan, {
    action: "skip",
    facilityId: "fac_2",
    reason: "no_dietary_department",
  });
});

test("DIETARY_2 is not treated as the migration owner", () => {
  const plan = planLegacyMenuBackfill({
    facilityId: "fac_3",
    departments: [{ id: "dept_other", key: "DIETARY_2", name: "Second Dietary" }],
    hasSettings: true,
    itemCount: 1,
  });
  assert.equal(plan.action, "skip");
});
