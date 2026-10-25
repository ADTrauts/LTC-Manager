import assert from "node:assert/strict";
import test from "node:test";

import { RepairTrade } from "@prisma/client";

import { suggestRepairDepartmentIds } from "@/lib/repair-routing";

test("repair routing uses trade, not a retired issue type", async () => {
  const prisma = {
    department: {
      findMany: async () => [
        { id: "dept_dietary", key: "DIETARY" },
        { id: "dept_plant", key: "PLANT" },
      ],
      findFirst: async () => ({ id: "dept_dietary" }),
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

  const result = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.PLUMBING,
  });

  assert.equal(result.responsibleDepartmentId, "dept_plant");
  assert.equal(result.requestingDepartmentId, "dept_dietary");
});
