import assert from "node:assert/strict";
import test from "node:test";

import { IssueType, RepairTrade } from "@prisma/client";

import {
  defaultRepairTradeForIssueType,
  issueTypeLabel,
  suggestRepairDepartmentIds,
} from "@/lib/repair-routing";

test("issue types have operator-friendly labels and equipment defaults to EQUIPMENT trade", () => {
  assert.equal(issueTypeLabel(IssueType.SUPPLY_SHORT), "Supply short");
  assert.equal(defaultRepairTradeForIssueType(IssueType.EQUIPMENT), RepairTrade.EQUIPMENT);
  assert.equal(defaultRepairTradeForIssueType(IssueType.SUPPLY_SHORT), RepairTrade.GENERAL);
  assert.equal(defaultRepairTradeForIssueType(IssueType.SAFETY), RepairTrade.GENERAL);
});

test("EQUIPMENT routing preserves plumbing → Plant behavior", async () => {
  const prisma = {
    department: {
      findMany: async () => [
        { id: "dept_dietary", key: "DIETARY" },
        { id: "dept_evs", key: "EVS" },
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
    issueType: IssueType.EQUIPMENT,
  });

  assert.equal(result.responsibleDepartmentId, "dept_plant");
  assert.equal(result.requestingDepartmentId, "dept_dietary");
});

test("SUPPLY_SHORT routes to unit primary operational department", async () => {
  const prisma = {
    department: {
      findMany: async () => [
        { id: "dept_dietary", key: "DIETARY" },
        { id: "dept_evs", key: "EVS" },
        { id: "dept_plant", key: "PLANT" },
      ],
      findFirst: async () => ({ id: "dept_evs" }),
    },
    unit: {
      findFirst: async () => ({
        departmentResponsibilities: [
          { kind: "PRIMARY", department: { id: "dept_evs", key: "EVS" } },
        ],
      }),
    },
    asset: { findFirst: async () => null },
  };

  const result = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    issueType: IssueType.SUPPLY_SHORT,
    sessionPrimaryDepartmentId: "dept_evs",
  });

  assert.equal(result.responsibleDepartmentId, "dept_evs");
});

test("ENVIRONMENT prefers EVS; SAFETY prefers Plant; SERVICE_DISRUPTION uses unit primary", async () => {
  const prisma = {
    department: {
      findMany: async () => [
        { id: "dept_dietary", key: "DIETARY" },
        { id: "dept_evs", key: "EVS" },
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

  const environment = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    issueType: IssueType.ENVIRONMENT,
  });
  assert.equal(environment.responsibleDepartmentId, "dept_evs");

  const safety = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    issueType: IssueType.SAFETY,
  });
  assert.equal(safety.responsibleDepartmentId, "dept_plant");

  const disruption = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    issueType: IssueType.SERVICE_DISRUPTION,
  });
  assert.equal(disruption.responsibleDepartmentId, "dept_dietary");
});

test("missing departments fall back safely without throwing", async () => {
  const prisma = {
    department: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    unit: {
      findFirst: async () => ({ departmentResponsibilities: [] }),
    },
    asset: { findFirst: async () => null },
  };

  const result = await suggestRepairDepartmentIds(prisma as never, {
    facilityId: "fac_1",
    unitId: "unit_1",
    repairTrade: RepairTrade.GENERAL,
    issueType: IssueType.SUPPLY_SHORT,
  });

  assert.equal(result.requestingDepartmentId, null);
  assert.equal(result.responsibleDepartmentId, null);
});
