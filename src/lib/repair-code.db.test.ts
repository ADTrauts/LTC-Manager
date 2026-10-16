import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { withRepairCode } from "./repair-code";
import { withIssueCode } from "./issue-code";
import { prisma } from "./prisma";
import { assertDisposableDatabaseUrl } from "./verify/database-target";

const url = process.env.ASSET_OPERATIONS_TEST_DATABASE_URL;

test("concurrent Repair and Issue creation keep codes unique, including existing transactions", {
  skip: url ? false : "set ASSET_OPERATIONS_TEST_DATABASE_URL to a disposable database",
}, async () => {
  assertDisposableDatabaseUrl(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const suffix = randomBytes(12).toString("hex");
  const facilityId = `czz_facility_${suffix}`;
  const unitId = `czz_unit_${suffix}`;
  const departmentId = `czz_department_${suffix}`;
  const organizationId = `czz_organization_${suffix}`;
  try {
    await db.organization.create({ data: { id: organizationId, name: "Repair code concurrency fixture" } });
    await db.facility.create({ data: { id: facilityId, organizationId, displayName: "Repair code concurrency fixture" } });
    await db.department.create({ data: { id: departmentId, facilityId, key: "DIETARY", name: "Issue fixture" } });
    await db.unit.create({ data: { id: unitId, facilityId, name: "Concurrency fixture", unitType: "OTHER" } });
    const created = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      withRepairCode(db, (tx, repairCode) => tx.repair.create({
        data: { unitId, title: `Concurrent ${index}`, description: "Synthetic regression", repairCode },
      })),
    ));
    const nested = await db.$transaction((tx) => withRepairCode(tx, (codeTx, repairCode) => codeTx.repair.create({
      data: { unitId, title: "Existing transaction", description: "Synthetic regression", repairCode },
    })));
    const codes = [...created.map(row => row.repairCode), nested.repairCode];
    assert.equal(new Set(codes).size, 9);
    assert.equal(await db.repair.count({ where: { unitId } }), 9);
    let attempts = 0;
    const recovered = await db.$transaction((tx) => withRepairCode(tx, async (codeTx, repairCode) => {
      attempts += 1;
      const data = { unitId, title: "Retry collision", description: "Synthetic regression", repairCode };
      if (attempts === 1) await codeTx.repair.create({ data });
      return codeTx.repair.create({ data });
    }));
    assert.equal(attempts, 2);
    assert.ok(recovered.repairCode);
    assert.equal(await db.repair.count({ where: { unitId } }), 10, "failed savepoint must leave no partial insert");
    const throughProxy = await withRepairCode(prisma, (tx, repairCode) => tx.repair.create({
      data: { unitId, title: "Lazy application client", description: "Synthetic regression", repairCode },
    }));
    assert.ok(throughProxy.id);
    assert.equal(await db.repair.count({ where: { unitId } }), 11);
    const issues = await Promise.all(Array.from({ length: 8 }, (_, index) => withIssueCode(db, (tx, issueCode) => tx.assetIssue.create({
      data: { facilityId, departmentId, unitId, summary: `Concurrent issue ${index}`, description: "Synthetic regression", issueCode, observedAt: new Date() },
    }))));
    assert.equal(new Set(issues.map(row => row.issueCode)).size, 8);
    let issueAttempts = 0;
    await db.$transaction(tx => withIssueCode(tx, async (codeTx, issueCode) => {
      issueAttempts += 1;
      const data = { facilityId, departmentId, unitId, summary: "Issue retry", description: "Synthetic regression", issueCode, observedAt: new Date() };
      if (issueAttempts === 1) await codeTx.assetIssue.create({ data });
      return codeTx.assetIssue.create({ data });
    }));
    assert.equal(issueAttempts, 2);
    await withIssueCode(prisma, (tx, issueCode) => tx.assetIssue.create({
      data: { facilityId, departmentId, unitId, summary: "Lazy application Issue client", description: "Synthetic regression", issueCode, observedAt: new Date() },
    }));
    assert.equal(await db.assetIssue.count({ where: { unitId } }), 10, "Issue retry leaves no partial insert");
  } finally {
    await db.assetIssue.deleteMany({ where: { unitId } });
    await db.repair.deleteMany({ where: { unitId } });
    await db.unit.deleteMany({ where: { id: unitId } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.facility.deleteMany({ where: { id: facilityId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.$disconnect();
    await prisma.$disconnect();
  }
});
