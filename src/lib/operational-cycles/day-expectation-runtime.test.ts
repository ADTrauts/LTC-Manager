/**
 * SQL-backed Configured → Adjusted → Actual materialization tests.
 * Opt in via OPERATIONAL_CYCLES_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import { adjustMealServiceDayExpectation } from "./adjust-day-expectation";
import { expectedTodayTime } from "./day-expectation";
import { materializeMealServiceDayExpectations } from "./materialize-day-expectations";
import type { AppJwtPayload } from "@/lib/auth";

const databaseUrl = process.env.OPERATIONAL_CYCLES_TEST_DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : "set OPERATIONAL_CYCLES_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

test(
  "sql: materialize is idempotent; adjustment is not overwritten; actual event is untouched",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const facility = await prisma.facility.findFirst({});
      assert.ok(facility, "seed facility required");
      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary, "dietary department required");
      const neighborhood = await prisma.unit.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          OR: [
            { hierarchyRole: "NEIGHBORHOOD" },
            { hierarchyRole: "LEGACY_LOCATION" },
            { unitType: "SERVERY" },
          ],
        },
      });
      assert.ok(neighborhood, "neighborhood or servery unit required");

      const dayKey = "2026-08-20";
      const serviceDate = facilityLocalDateToServiceDate(dayKey);
      const cycleId = `cyc_${cuidLike()}`;

      await prisma.departmentOperationalCycle.create({
        data: {
          id: cycleId,
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: `breakfast-service-${cuidLike().slice(0, 8)}`,
          version: 3,
          label: "Breakfast Service",
          cycleType: "SERVICE",
          status: "PUBLISHED",
          displaySequence: 1,
          startLocal: "07:00",
          endLocal: "09:30",
          overnight: false,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom: serviceDate,
          mealType: "BREAKFAST",
          locationMode: "EXPLICIT_UNITS",
          roomTypeKey: null,
          expectedMilestones: ["READY", "SERVICE_STARTED"],
          applicableUnitTypes: [],
          publishedAt: new Date(),
          locations: {
            create: { unitId: neighborhood.id },
          },
          milestoneTimes: {
            create: {
              unitId: neighborhood.id,
              milestone: "SERVICE_STARTED",
              configuredTime: "07:15",
            },
          },
        },
      });

      const first = await materializeMealServiceDayExpectations(
        {
          facilityId: facility.id,
          departmentId: dietary.id,
          operationalDateKey: dayKey,
          createIfMissing: true,
        },
        prisma,
      );
      assert.ok(first.timings.length >= 1);
      const naval = first.timings.find((row) => row.unitId === neighborhood.id);
      assert.ok(naval);
      assert.equal(naval!.configuredTime, "07:15");
      assert.equal(naval!.cycleVersion, 3);

      const manager = await prisma.user.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          role: { key: { in: ["MANAGER", "GM", "SUPERVISOR"] } },
        },
        include: { role: { select: { key: true } } },
      });
      assert.ok(manager);

      const session: AppJwtPayload = {
        uid: manager.id,
        authKind: "user",
        authMethod: "PASSWORD",
        role: manager.role.key as AppJwtPayload["role"],
        name: "Test",
        email: "test@example.com",
        facilityId: facility.id,
        sessionVersion: 1,
      };

      const adjusted = await adjustMealServiceDayExpectation(
        {
          session,
          expectationId: naval!.expectationId,
          addMinutes: 5,
        },
        prisma,
      );
      assert.equal(adjusted.ok, true);
      if (adjusted.ok) {
        assert.equal(adjusted.configuredTime, "07:15");
        assert.equal(adjusted.adjustedTime, "07:20");
        assert.equal(adjusted.expectedToday, "07:20");
      }

      await prisma.departmentOperationalCycleMilestoneTime.updateMany({
        where: { cycleId, unitId: neighborhood.id },
        data: { configuredTime: "07:45" },
      });

      const second = await materializeMealServiceDayExpectations(
        {
          facilityId: facility.id,
          departmentId: dietary.id,
          operationalDateKey: dayKey,
          createIfMissing: true,
        },
        prisma,
      );
      const again = second.timings.find((row) => row.unitId === neighborhood.id);
      assert.ok(again);
      assert.equal(again!.configuredTime, "07:15");
      assert.equal(again!.adjustedTime, "07:20");
      assert.equal(expectedTodayTime(again!), "07:20");
      assert.equal(second.created, 0);

      const buildRow = await prisma.departmentOperationalCycleMilestoneTime.findFirst({
        where: { cycleId, unitId: neighborhood.id },
      });
      assert.equal(buildRow?.configuredTime, "07:45");

      await prisma.operationalCycleDayExpectation.deleteMany({
        where: { cycleId },
      });
      await prisma.departmentOperationalCycleMilestoneTime.deleteMany({
        where: { cycleId },
      });
      await prisma.departmentOperationalCycleEvent.deleteMany({
        where: { cycleId },
      });
      await prisma.departmentOperationalCycle.delete({ where: { id: cycleId } });
    } finally {
      await prisma.$disconnect();
    }
  },
);
