import assert from "node:assert/strict";
import test from "node:test";

import { RepairTrade } from "@prisma/client";

import { suggestRepairDepartmentIds } from "@/lib/repair-routing";

function prisma() {
  return {
    department: {
      findMany: async () => [
        { id: "dept_dietary", key: "DIETARY" },
        { id: "dept_evs", key: "EVS" },
        { id: "dept_plant", key: "PLANT" },
      ],
      findFirst: async ({ where }: { where?: { id?: string } }) =>
        where?.id ? { id: where.id } : null,
    },
    unit: {
      findFirst: async () => ({
        departmentResponsibilities: [
          { kind: "PRIMARY", department: { id: "dept_dietary", key: "DIETARY" } },
        ],
      }),
    },
    asset: { findFirst: async () => null },
  };
}

test("plumbing and electrical repairs go to Plant", async () => {
  const plumbing = await suggestRepairDepartmentIds(prisma() as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.PLUMBING,
  });
  assert.equal(plumbing.responsibleDepartmentId, "dept_plant");
  assert.equal(plumbing.requestingDepartmentId, "dept_dietary");

  const electrical = await suggestRepairDepartmentIds(prisma() as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.ELECTRICAL,
  });
  assert.equal(electrical.responsibleDepartmentId, "dept_plant");
});

test("equipment repairs stay with the unit's department when it is Dietary", async () => {
  const result = await suggestRepairDepartmentIds(prisma() as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.EQUIPMENT,
  });
  assert.equal(result.responsibleDepartmentId, "dept_dietary");
});

test("a general repair uses Plant when the unit primary is Dietary", async () => {
  const result = await suggestRepairDepartmentIds(prisma() as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    sessionPrimaryDepartmentId: "dept_evs",
  });
  assert.equal(result.requestingDepartmentId, "dept_evs");
  assert.equal(result.responsibleDepartmentId, "dept_plant");
});

test("missing departments fall back safely without throwing", async () => {
  const empty = {
    department: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    unit: {
      findFirst: async () => ({ departmentResponsibilities: [] }),
    },
    asset: { findFirst: async () => null },
  };

  const result = await suggestRepairDepartmentIds(empty as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
  });

  assert.equal(result.requestingDepartmentId, null);
  assert.equal(result.responsibleDepartmentId, null);
});
