/**
 * Phase 9A SQL-backed Operational Cycle tests.
 * Opt in via OPERATIONAL_CYCLES_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

import { decideCycleAuthority } from "./cycle-authority";
import {
  createDraft,
  publishCycle,
  retireCycle,
} from "./cycle-service";
import { loadPublishedCyclesForDate } from "./load-published-cycles";
import { resolveOperationalCycle } from "./resolve-operational-cycle";
import { validateCycleForPublish } from "./validate-cycle";

const databaseUrl = process.env.OPERATIONAL_CYCLES_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set OPERATIONAL_CYCLES_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    role: overrides.role,
    name: "Test",
    email: "test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "phase9a sql: draft not runtime-visible; publish visible; retire prospective; meal target from UnitMealTime",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevFlag = process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED;
    process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED = "true";

    try {
      const facility = await prisma.facility.findFirst({});
      assert.ok(facility, "seed facility required");
      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary, "dietary department required");

      const manager =
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: { in: ["MANAGER", "GM"] } },
          },
          include: { role: { select: { key: true } } },
        })) ??
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: "FACILITY_ADMINISTRATOR" },
            primaryDepartmentId: dietary.id,
          },
          include: { role: { select: { key: true } } },
        }));
      assert.ok(manager, "manager user required");

      const unit = await prisma.unit.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          unitType: "SERVERY",
          departmentResponsibilities: { some: { departmentId: dietary.id } },
        },
      });
      assert.ok(unit, "servery unit required");

      await prisma.unitMealTime.upsert({
        where: { unitId_mealType: { unitId: unit.id, mealType: "BREAKFAST" } },
        create: {
          id: cuidLike(),
          unitId: unit.id,
          mealType: "BREAKFAST",
          scheduledTime: "07:45",
          isActive: true,
        },
        update: { scheduledTime: "07:45", isActive: true },
      });

      const effectiveFrom = "2099-06-15";
      const actor = { userId: manager.id, label: manager.displayName ?? "Manager" };
      const mgrSession = session({
        uid: manager.id,
        facilityId: facility.id,
        role: manager.role.key as AppJwtPayload["role"],
        primaryDepartmentId: dietary.id,
      });

      // Cleanup any prior synthetic rows for this date key namespace.
      await prisma.departmentOperationalCycleEvent.deleteMany({
        where: { facilityId: facility.id, departmentId: dietary.id },
      });
      await prisma.departmentOperationalCycle.deleteMany({
        where: {
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: { startsWith: "phase9a_test_" },
        },
      });

      const draft = await createDraft(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        actor,
        client: prisma,
        draft: {
          stableKey: "phase9a_test_breakfast",
          label: "Phase9A Breakfast",
          cycleType: "SERVICE",
          displaySequence: 20,
          startLocal: "07:00",
          endLocal: "09:00",
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom,
          mealType: "BREAKFAST",
          locationMode: "UNIT_TYPES",
          applicableUnitTypes: ["SERVERY"],
          expectedMilestones: ["READY", "SERVICE_STARTED"],
        },
      });
      assert.equal(draft.status, "DRAFT");

      const beforePublish = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        effectiveFrom,
        prisma,
      );
      assert.equal(
        beforePublish.some((c) => c.id === draft.id),
        false,
        "draft must not be runtime-visible",
      );

      const published = await publishCycle(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        cycleId: draft.id,
        actor,
        client: prisma,
      });
      assert.equal(published.status, "PUBLISHED");

      const afterPublish = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        effectiveFrom,
        prisma,
      );
      assert.ok(afterPublish.some((c) => c.id === draft.id));

      const ctx = resolveOperationalCycle({
        cycles: afterPublish,
        now: new Date("2099-06-15T12:00:00.000Z"),
        facilityTimezone: facility.timezone ?? "UTC",
        operationalDateKey: effectiveFrom,
        unit: { id: unit.id, unitType: unit.unitType },
        mealTargets: [{ mealType: "BREAKFAST", scheduledTime: "07:45" }],
      });
      assert.equal(ctx.state, "ACTIVE");
      if (ctx.state === "ACTIVE") {
        assert.equal(ctx.mealTargetTime, "07:45");
      }

      // Historical retention: retire with today after effective date keeps prior day visible.
      await retireCycle(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        cycleId: draft.id,
        actor,
        todayKey: "2099-06-20",
        client: prisma,
      });

      // After prospective retire, historical date within effectiveTo still resolves.
      const historical = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        "2099-06-15",
        prisma,
      );
      const retired = await prisma.departmentOperationalCycle.findUniqueOrThrow({
        where: { id: draft.id },
      });
      assert.equal(retired.status, "RETIRED");
      assert.ok(retired.effectiveTo);
      assert.equal(toServiceDateKey(retired.effectiveTo), "2099-06-19");
      assert.equal(toServiceDateKey(retired.effectiveFrom), effectiveFrom);
      assert.ok(
        historical.some((c) => c.id === draft.id),
        "historical date retains prior effective cycle",
      );

      const afterRetireToday = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        "2099-06-20",
        prisma,
      );
      assert.equal(
        afterRetireToday.some((c) => c.id === draft.id),
        false,
        "retired cycle must not apply on/after retirement boundary",
      );

      // Overlap reject
      const draftA = await createDraft(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        actor,
        client: prisma,
        draft: {
          stableKey: "phase9a_test_overlap_a",
          label: "Overlap A",
          cycleType: "SERVICE",
          startLocal: "07:00",
          endLocal: "09:00",
          applicableDaysOfWeek: [1, 2, 3],
          effectiveFrom,
          mealType: "BREAKFAST",
          locationMode: "ALL_DEPARTMENT_UNITS",
          expectedMilestones: ["READY"],
        },
      });
      await publishCycle(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        cycleId: draftA.id,
        actor,
        client: prisma,
      });

      const draftB = await createDraft(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        actor,
        client: prisma,
        draft: {
          stableKey: "phase9a_test_overlap_b",
          label: "Overlap B",
          cycleType: "SERVICE",
          startLocal: "08:00",
          endLocal: "10:00",
          applicableDaysOfWeek: [2, 3],
          effectiveFrom,
          mealType: "BREAKFAST",
          locationMode: "ALL_DEPARTMENT_UNITS",
          expectedMilestones: ["READY"],
        },
      });

      await assert.rejects(
        () =>
          publishCycle(mgrSession, {
            facilityId: facility.id,
            departmentId: dietary.id,
            cycleId: draftB.id,
            actor,
            client: prisma,
          }),
        /overlap/i,
      );

      // FA denied without dept relationship
      const faDenied = decideCycleAuthority({
        flagEnabled: true,
        role: "FACILITY_ADMINISTRATOR",
        authMethod: "PASSWORD",
        sessionFacilityId: facility.id,
        facilityId: facility.id,
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: "not-dietary",
      });
      assert.equal(faDenied.canManage, false);

      // Cross-facility reject
      const cross = decideCycleAuthority({
        flagEnabled: true,
        role: "MANAGER",
        authMethod: "PASSWORD",
        sessionFacilityId: facility.id,
        facilityId: "other-facility",
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: dietary.id,
      });
      assert.equal(cross.canManage, false);
      assert.match(cross.reason ?? "", /Cross-facility/i);

      // Historical date retains prior effective published cycle (create v1 retired with effectiveTo, v2 later)
      await prisma.departmentOperationalCycle.deleteMany({
        where: {
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: "phase9a_test_history",
        },
      });
      const histId = cuidLike();
      await prisma.departmentOperationalCycle.create({
        data: {
          id: histId,
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: "phase9a_test_history",
          version: 1,
          label: "History V1",
          cycleType: "SERVICE",
          displaySequence: 10,
          startLocal: "11:00",
          endLocal: "13:00",
          overnight: false,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom: facilityLocalDateToServiceDate("2099-01-01"),
          effectiveTo: facilityLocalDateToServiceDate("2099-03-31"),
          mealType: "LUNCH",
          locationMode: "ALL_DEPARTMENT_UNITS",
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      await prisma.departmentOperationalCycle.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: "phase9a_test_history",
          version: 2,
          label: "History V2",
          cycleType: "SERVICE",
          displaySequence: 10,
          startLocal: "11:30",
          endLocal: "13:30",
          overnight: false,
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom: facilityLocalDateToServiceDate("2099-04-01"),
          effectiveTo: null,
          mealType: "LUNCH",
          locationMode: "ALL_DEPARTMENT_UNITS",
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      // loadPublishedCycles filters status PUBLISHED and effective range —
      // V1 still PUBLISHED with effectiveTo covering March.
      const march = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        "2099-03-15",
        prisma,
      );
      assert.ok(march.some((c) => c.id === histId && c.label === "History V1"));
      const april = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        "2099-04-15",
        prisma,
      );
      assert.ok(april.some((c) => c.label === "History V2"));
      assert.equal(
        april.some((c) => c.id === histId),
        false,
      );

      // Cleanup
      await prisma.departmentOperationalCycleEvent.deleteMany({
        where: { facilityId: facility.id, departmentId: dietary.id },
      });
      await prisma.departmentOperationalCycle.deleteMany({
        where: {
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: { startsWith: "phase9a_test_" },
        },
      });
    } finally {
      if (prevFlag === undefined) {
        delete process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED;
      } else {
        process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED = prevFlag;
      }
      await prisma.$disconnect();
    }
  },
);

test("phase9a hermetic overlap helper used by sql suite shape", () => {
  // Keep a tiny always-on assertion so the file is not empty when SQL env is unset.
  const result = validateCycleForPublish(
    {
      label: "A",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "09:00",
      applicableDaysOfWeek: [1],
      effectiveFrom: "2099-01-01",
      mealType: "BREAKFAST",
      locationMode: "ALL_DEPARTMENT_UNITS",
    },
    [],
    "UTC",
  );
  assert.equal(result.valid, true);
});
