/**
 * Current-day Key Point preparation is idempotent and leaves an earlier
 * published day on its own rooms.
 * Opt in via OPERATIONAL_CYCLES_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import { prepareCurrentKeyTimeDayExpectations } from "./materialize-key-time-day-expectations";

const databaseUrl = process.env.OPERATIONAL_CYCLES_TEST_DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : "set OPERATIONAL_CYCLES_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(4).toString("hex");
}

const day1 = "2026-11-05";
const day2 = "2026-11-06";
const now1 = new Date("2026-11-05T16:00:00.000Z");
const now2 = new Date("2026-11-06T16:00:00.000Z");

test(
  "sql: current-day Key Point preparation is idempotent and a later version leaves the earlier day",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const created: { orgId?: string; facilityId?: string } = {};
    try {
      const org = await db.organization.create({
        data: { name: `KP prep ${tag}`, organizationType: "LONG_TERM_CARE" },
      });
      created.orgId = org.id;
      const facility = await db.facility.create({
        data: {
          organizationId: org.id,
          displayName: `KP prep ${tag}`,
          timezone: "America/New_York",
        },
      });
      created.facilityId = facility.id;
      const department = await db.department.create({
        data: { facilityId: facility.id, key: "DIETARY", name: "Dietary" },
      });
      const unit = await db.unit.create({
        data: {
          facilityId: facility.id,
          name: `Neighborhood ${tag}`,
          unitType: "OTHER",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });
      const rooms = await Promise.all(
        ["1A", "1B", "1C", "1D"].map((name) =>
          db.unitSpace.create({
            data: {
              facilityId: facility.id,
              unitId: unit.id,
              name: `${name} ${tag}`,
              spaceType: "SERVICE_AREA",
            },
          }),
        ),
      );
      const [roomA, roomB, roomC, roomD] = rooms;
      const service1 = facilityLocalDateToServiceDate(day1);
      const service2 = facilityLocalDateToServiceDate(day2);

      const first = await db.departmentOperationalCycle.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          stableKey: `ready-${tag}`,
          version: 1,
          label: "Breakfast Ready",
          cycleType: "CUSTOM",
          nodeKind: "KEY_TIME",
          status: "PUBLISHED",
          effectiveFrom: service1,
          publishedAt: now1,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      const group1 = await db.departmentOperationalCycleKeyTimeGroup.create({
        data: { cycleId: first.id, dueLocal: "07:05" },
      });
      await db.departmentOperationalCycleKeyTimeGroupRoom.createMany({
        data: [roomA.id, roomB.id].map((spaceId) => ({
          keyTimeGroupId: group1.id,
          cycleId: first.id,
          spaceId,
        })),
      });

      const firstPrepare = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          now: now1,
        },
        db,
      );
      assert.equal(firstPrepare.created, 2);
      assert.deepEqual(
        firstPrepare.timings.map((row) => row.spaceId).sort(),
        [roomA.id, roomB.id].sort(),
      );

      const day1Row = firstPrepare.timings.find((row) => row.spaceId === roomA.id);
      assert.ok(day1Row);
      await db.operationalCycleKeyTimeDayExpectation.update({
        where: { id: day1Row.expectationId },
        data: { adjustedDueLocal: "07:10" },
      });
      const secondPrepare = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          now: now1,
        },
        db,
      );
      assert.equal(secondPrepare.created, 0);
      assert.equal(secondPrepare.timings.length, 2);
      const adjusted = secondPrepare.timings.find((row) => row.spaceId === roomA.id);
      assert.equal(adjusted?.adjustedDueLocal, "07:10");
      assert.equal(adjusted?.configuredDueLocal, "07:05");

      await db.departmentOperationalCycle.update({
        where: { id: first.id },
        data: { status: "RETIRED", effectiveTo: service1, retiredAt: now2 },
      });
      const second = await db.departmentOperationalCycle.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          stableKey: `ready-${tag}`,
          version: 2,
          label: "Breakfast Ready",
          cycleType: "CUSTOM",
          nodeKind: "KEY_TIME",
          status: "PUBLISHED",
          effectiveFrom: service2,
          publishedAt: now2,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      const group2 = await db.departmentOperationalCycleKeyTimeGroup.create({
        data: { cycleId: second.id, dueLocal: "07:05" },
      });
      await db.departmentOperationalCycleKeyTimeGroupRoom.createMany({
        data: [roomA.id, roomC.id].map((spaceId) => ({
          keyTimeGroupId: group2.id,
          cycleId: second.id,
          spaceId,
        })),
      });

      const later = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          now: now2,
        },
        db,
      );
      assert.equal(later.created, 2);
      assert.deepEqual(
        later.timings.map((row) => row.spaceId).sort(),
        [roomA.id, roomC.id].sort(),
      );
      assert.ok(later.timings.every((row) => row.cycleId === second.id));

      const again = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          now: now2,
        },
        db,
      );
      assert.equal(again.created, 0);
      assert.equal(again.timings.length, 2);

      const draft = await db.departmentOperationalCycle.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          stableKey: `ready-${tag}`,
          version: 3,
          label: "Breakfast Ready",
          cycleType: "CUSTOM",
          nodeKind: "KEY_TIME",
          status: "DRAFT",
          effectiveFrom: service2,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      const draftGroup = await db.departmentOperationalCycleKeyTimeGroup.create({
        data: { cycleId: draft.id, dueLocal: "07:05" },
      });
      await db.departmentOperationalCycleKeyTimeGroupRoom.create({
        data: { keyTimeGroupId: draftGroup.id, cycleId: draft.id, spaceId: roomD.id },
      });
      const afterDraft = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          now: now2,
        },
        db,
      );
      assert.equal(afterDraft.created, 0);
      assert.deepEqual(
        afterDraft.timings.map((row) => row.spaceId).sort(),
        [roomA.id, roomC.id].sort(),
      );

      const historical = await prepareCurrentKeyTimeDayExpectations(
        {
          facilityId: facility.id,
          departmentId: department.id,
          operationalDateKey: day1,
          now: now2,
        },
        db,
      );
      assert.equal(historical.created, 0);
      assert.deepEqual(
        historical.timings.map((row) => row.spaceId).sort(),
        [roomA.id, roomB.id].sort(),
      );
      const historicalAdjusted = historical.timings.find((row) => row.spaceId === roomA.id);
      assert.equal(historicalAdjusted?.adjustedDueLocal, "07:10");
      assert.equal(historicalAdjusted?.cycleId, first.id);
      assert.equal(
        await db.operationalCycleKeyTimeDayExpectation.count({
          where: { facilityId: facility.id, serviceDate: service1, spaceId: roomC.id },
        }),
        0,
      );
      assert.equal(
        await db.operationalCycleKeyTimeDayExpectation.count({
          where: { facilityId: facility.id, serviceDate: service2, spaceId: roomD.id },
        }),
        0,
      );
    } finally {
      if (created.facilityId) {
        await db.operationalCycleKeyTimeDayExpectation.deleteMany({
          where: { facilityId: created.facilityId },
        });
        await db.departmentOperationalCycle.deleteMany({
          where: { facilityId: created.facilityId },
        });
        await db.unitSpace.deleteMany({ where: { facilityId: created.facilityId } });
        await db.unit.deleteMany({ where: { facilityId: created.facilityId } });
        await db.department.deleteMany({ where: { facilityId: created.facilityId } });
        await db.facility.delete({ where: { id: created.facilityId } });
      }
      if (created.orgId) {
        await db.organization.delete({ where: { id: created.orgId } });
      }
      await db.$disconnect();
    }
  },
);
