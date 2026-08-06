/**
 * Phase 9B SQL-backed Job Flow tests.
 * Opt in via JOB_FLOW_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import { decideJobFlowAuthority } from "./job-flow-authority";

const databaseUrl = process.env.JOB_FLOW_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set JOB_FLOW_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
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

test("phase9b sql: FA denied board; cross-facility denied", { skip: skipReason }, async () => {
  const fa = decideJobFlowAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "other",
  });
  assert.equal(fa.canViewSupervisorBoard, false);
  assert.match(fa.reason ?? "", /Facility Administrator/);

  const cross = decideJobFlowAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f2",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  assert.equal(cross.canViewOwnJobFlow, false);
  assert.equal(cross.canViewSupervisorBoard, false);
  assert.match(cross.reason ?? "", /Cross-facility/);
});

test(
  "phase9b sql: draft hidden; publish cycle + confirmed assignment → ACTIVE",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;
    process.env.DIETARY_JOB_FLOW_ENABLED = "true";
    process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED = "true";
    process.env.OPERATION_ENGINE_ENABLED = "false";

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

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

      const employee = await prisma.employee.findFirst({
        where: { facilityId: facility.id, status: { not: "TERMINATED" } },
      });
      assert.ok(employee, "employee required");

      const unit = await prisma.unit.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          unitType: "SERVERY",
          departmentResponsibilities: { some: { departmentId: dietary.id } },
        },
      });
      assert.ok(unit, "servery unit required");

      const effectiveFrom = "2099-08-06";
      const serviceDate = facilityLocalDateToServiceDate(effectiveFrom);
      // Facility-local 11:00–14:00 America/New_York ≈ 15:00–18:00 UTC in August.
      const now = new Date("2099-08-06T16:00:00.000Z");

      await prisma.unitMealTime.upsert({
        where: { unitId_mealType: { unitId: unit.id, mealType: "LUNCH" } },
        create: {
          id: cuidLike(),
          unitId: unit.id,
          mealType: "LUNCH",
          scheduledTime: "12:15",
          isActive: true,
        },
        update: { scheduledTime: "12:15", isActive: true },
      });

      // Clean prior synthetic rows
      await prisma.operationalAssignmentEvent.deleteMany({
        where: { facilityId: facility.id, serviceDate },
      });
      await prisma.operationalAssignment.deleteMany({
        where: { facilityId: facility.id, departmentId: dietary.id, serviceDate },
      });
      await prisma.operationalAssignmentPlan.deleteMany({
        where: { facilityId: facility.id, departmentId: dietary.id, serviceDate },
      });
      await prisma.departmentOperationalCycleEvent.deleteMany({
        where: { facilityId: facility.id, departmentId: dietary.id },
      });
      await prisma.departmentOperationalCycle.deleteMany({
        where: {
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: { startsWith: "phase9b_test_" },
        },
      });

      const { createDraft, publishCycle } = await import(
        "@/lib/operational-cycles/cycle-service"
      );
      const { ensureAssignmentPlan } = await import(
        "@/lib/scheduling/operational-assignments/assignment-plan"
      );
      const { resolveJobFlow } = await import("./resolve-job-flow");
      const { isPlanFrontlineVisible } = await import(
        "@/lib/scheduling/operational-assignments/assignment-plan"
      );
      const { resolveOperationalCycle } = await import(
        "@/lib/operational-cycles/resolve-operational-cycle"
      );
      const { loadPublishedCyclesForDate } = await import(
        "@/lib/operational-cycles/load-published-cycles"
      );

      const mgrSession = session({
        uid: manager.id,
        facilityId: facility.id,
        role: manager.role.key as AppJwtPayload["role"],
        primaryDepartmentId: dietary.id,
      });
      const actor = { userId: manager.id, label: manager.displayName ?? "Manager" };

      const draftCycle = await createDraft(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        actor,
        client: prisma,
        draft: {
          stableKey: "phase9b_test_lunch",
          label: "Phase9B Lunch Service",
          cycleType: "SERVICE",
          displaySequence: 30,
          startLocal: "11:00",
          endLocal: "14:00",
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom,
          mealType: "LUNCH",
          locationMode: "UNIT_TYPES",
          applicableUnitTypes: ["SERVERY"],
          expectedMilestones: ["READY", "SERVICE_STARTED"],
        },
      });

      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        serviceDateKey: effectiveFrom,
        actorUserId: manager.id,
      });
      assert.equal(plan.status, "DRAFT");
      assert.equal(isPlanFrontlineVisible(plan.status), false);

      const draftAssignmentId = cuidLike();
      await prisma.operationalAssignment.create({
        data: {
          id: draftAssignmentId,
          facilityId: facility.id,
          departmentId: dietary.id,
          planId: plan.id,
          employeeId: employee.id,
          unitId: unit.id,
          serviceDate,
          roleKey: "server",
          roleLabel: "Server",
          startsAt: new Date("2099-08-06T14:00:00.000Z"),
          endsAt: new Date("2099-08-06T20:00:00.000Z"),
          status: "PLANNED",
          source: "MANUAL",
        },
      });

      // Draft plan assignments must not appear in frontline Job Flow resolution inputs.
      const draftRows = await prisma.operationalAssignment.findMany({
        where: {
          employeeId: employee.id,
          facilityId: facility.id,
          departmentId: dietary.id,
          serviceDate,
        },
        include: { plan: { select: { status: true } } },
      });
      const visibleDraft = draftRows.filter((r) =>
        isPlanFrontlineVisible(r.plan?.status ?? null),
      );
      assert.equal(visibleDraft.length, 0, "draft assignments must be hidden from Job Flow");

      await publishCycle(mgrSession, {
        facilityId: facility.id,
        departmentId: dietary.id,
        cycleId: draftCycle.id,
        actor,
        client: prisma,
      });

      await prisma.operationalAssignmentPlan.update({
        where: { id: plan.id },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedByUserId: manager.id },
      });

      const cycles = await loadPublishedCyclesForDate(
        facility.id,
        dietary.id,
        effectiveFrom,
        prisma,
      );
      assert.ok(cycles.some((c) => c.id === draftCycle.id));

      const cycleContext = resolveOperationalCycle({
        cycles,
        now,
        facilityTimezone: facility.timezone ?? "UTC",
        operationalDateKey: effectiveFrom,
        unit: { id: unit.id, unitType: unit.unitType },
        mealTargets: [{ mealType: "LUNCH", scheduledTime: "12:15" }],
      });
      assert.equal(cycleContext.state, "ACTIVE");

      const confirmedRows = await prisma.operationalAssignment.findMany({
        where: {
          employeeId: employee.id,
          facilityId: facility.id,
          departmentId: dietary.id,
          serviceDate,
          status: { in: ["PLANNED", "ACTIVE"] },
        },
        include: { plan: { select: { status: true } }, unit: { select: { name: true } } },
      });
      const visible = confirmedRows.filter((r) =>
        isPlanFrontlineVisible(r.plan?.status ?? null),
      );
      assert.equal(visible.length, 1);

      const a = visible[0]!;
      const flow = resolveJobFlow({
        now,
        facilityTimezone: facility.timezone ?? "UTC",
        operationalDateKey: effectiveFrom,
        currentAssignment: {
          id: a.id,
          roleKey: a.roleKey,
          roleLabel: a.roleLabel,
          unitId: a.unitId,
          unitName: a.unit?.name ?? null,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          status: a.status,
        },
        upcomingAssignment: null,
        cycleContext,
        cycleDescriptions: { [draftCycle.id]: draftCycle.description },
        mealTargetTime: "12:15",
        milestoneEvent: null,
        planStatus: "CONFIRMED",
        unit: { id: unit.id, name: unit.name ?? "Unit" },
      });

      assert.equal(flow.state, "ACTIVE");
      if (flow.state === "ACTIVE") {
        assert.equal(flow.assignment.id, a.id);
        assert.equal(flow.cycle.id, draftCycle.id);
        assert.match(flow.current.expectation, /12:15/);
      }

      // Authority denial matrix (board) — pure decide mirrors loader gates.
      const faBoard = decideJobFlowAuthority({
        flagEnabled: true,
        role: "FACILITY_ADMINISTRATOR",
        authMethod: "PASSWORD",
        sessionFacilityId: facility.id,
        facilityId: facility.id,
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: "not-dietary",
      });
      assert.equal(faBoard.canViewSupervisorBoard, false);

      const crossBoard = decideJobFlowAuthority({
        flagEnabled: true,
        role: "MANAGER",
        authMethod: "PASSWORD",
        sessionFacilityId: facility.id,
        facilityId: "other-facility",
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: dietary.id,
      });
      assert.equal(crossBoard.canViewSupervisorBoard, false);
    } finally {
      await prisma.$disconnect();
    }
  },
);
