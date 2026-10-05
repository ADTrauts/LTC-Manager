/**
 * Optional SQL-backed Location History tests.
 * Opt in via PLANT_OPERATIONS_TEST_DATABASE_URL or DEPARTMENT_WORK_TEST_DATABASE_URL.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { loadLocationHistory } from "./location-history";

const databaseUrl =
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set PLANT_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

test(
  "location history uses stored Request/Issue/Repair location, not live Asset location",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const unitA = await prisma.unit.findFirst({
        where: { isActive: true },
        include: { facility: true },
      });
      assert.ok(unitA, "unit required");
      const unitB = await prisma.unit.findFirst({
        where: { isActive: true, id: { not: unitA.id }, facilityId: unitA.facilityId },
      });
      assert.ok(unitB, "second unit required");
      const department = await prisma.department.findFirst({
        where: { facilityId: unitA.facilityId, isActive: true },
      });
      assert.ok(department, "department required");

      const request = await prisma.operationalRequest.create({
        data: {
          id: cuidLike(),
          requestCode: `REQ-${cuidLike().slice(-8).toUpperCase()}`,
          facilityId: unitA.facilityId,
          requestingDepartmentId: department.id,
          responsibleDepartmentId: department.id,
          unitId: unitA.id,
          spaceId: null,
          summary: "Phase 2 location history request",
          description: "Stored on unit A",
          observedAt: new Date(),
        },
      });
      const asset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `AST-${cuidLike().slice(-6).toUpperCase()}`,
          name: "Phase 2 history asset",
          equipmentType: "Equipment",
          unitId: unitA.id,
          departmentId: department.id,
          status: "OPERATIONAL",
        },
      });
      const issue = await prisma.assetIssue.create({
        data: {
          id: cuidLike(),
          issueCode: `AI-${cuidLike().slice(-8).toUpperCase()}`,
          facilityId: unitA.facilityId,
          departmentId: department.id,
          assetId: asset.id,
          unitId: unitA.id,
          summary: "Phase 2 location history issue",
          description: "Stored on unit A",
          observedAt: new Date(),
        },
      });
      const repair = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `WO-${cuidLike().slice(-8).toUpperCase()}`,
          unitId: unitA.id,
          title: "Phase 2 location history repair",
          description: "Stored on unit A",
          assetId: asset.id,
        },
      });

      await prisma.asset.update({
        where: { id: asset.id },
        data: { unitId: unitB.id },
      });

      const historyA = await loadLocationHistory({
        facilityId: unitA.facilityId,
        unitId: unitA.id,
        limit: 80,
      });
      assert.ok(historyA.some((event) => event.sourceId === request.id && event.unitId === unitA.id));
      assert.ok(historyA.some((event) => event.sourceId === issue.id && event.unitId === unitA.id));
      assert.ok(historyA.some((event) => event.sourceId === repair.id && event.unitId === unitA.id));
      assert.ok(
        historyA
          .filter((event) => event.source === "Repair" && event.sourceId === repair.id)
          .every((event) => event.spaceId === null),
      );

      const historyB = await loadLocationHistory({
        facilityId: unitA.facilityId,
        unitId: unitB.id,
        limit: 80,
      });
      assert.equal(
        historyB.some((event) => event.sourceId === request.id),
        false,
      );
      assert.equal(
        historyB.some((event) => event.sourceId === issue.id),
        false,
      );
      assert.equal(
        historyB.some((event) => event.sourceId === repair.id),
        false,
      );

      await assert.rejects(
        () =>
          loadLocationHistory({
            facilityId: unitA.facilityId,
            unitId: cuidLike(),
          }),
        /Location not found/,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
