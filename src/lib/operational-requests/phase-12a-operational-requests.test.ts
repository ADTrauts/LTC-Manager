/**
 * Phase 12A SQL-backed Operational Request tests.
 * Opt in via PLANT_OPERATIONS_TEST_DATABASE_URL (or DEPARTMENT_WORK_TEST_DATABASE_URL).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import {
  createRequest,
  listActiveRoutesForRequestingDepartment,
  loadRequesterVisibleStatus,
  triageRequest,
  validateRoute,
  upsertRequestRoute,
  createWorkOrderFromRequest,
  acknowledgeRequest,
} from "./index";
import { technicianUpdateWorkOrder } from "@/lib/asset-operations";

const databaseUrl =
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set PLANT_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: overrides.authKind ?? "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    role: overrides.role,
    name: overrides.name ?? "Plant 12A Test",
    email: overrides.email ?? "plant-12a@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function loadFixture(prisma: PrismaClient) {
  const plant = await prisma.department.findFirst({
    where: { key: "PLANT", isActive: true },
    include: { facility: true },
  });
  assert.ok(plant, "plant department required");
  const dietary = await prisma.department.findFirst({
    where: { facilityId: plant.facilityId, key: "DIETARY", isActive: true },
  });
  assert.ok(dietary, "dietary department required");
  const unit = await prisma.unit.findFirst({
    where: { facilityId: plant.facilityId, isActive: true },
  });
  assert.ok(unit, "unit required");
  let manager =
    (await prisma.user.findFirst({
      where: {
        facilityId: plant.facilityId,
        isActive: true,
        role: { key: { in: ["MANAGER", "GM"] } },
      },
      include: { role: { select: { key: true } } },
    })) ??
    (await prisma.user.findFirst({
      where: {
        facilityId: plant.facilityId,
        isActive: true,
        role: { key: "FACILITY_ADMINISTRATOR" },
        primaryDepartmentId: plant.id,
      },
      include: { role: { select: { key: true } } },
    }));

  if (!manager) {
    const managerRole =
      (await prisma.role.findFirst({ where: { key: "MANAGER" }, select: { id: true, key: true } })) ??
      (await prisma.role.findFirst({ where: { key: "GM" }, select: { id: true, key: true } }));
    assert.ok(managerRole, "MANAGER or GM role required to seed Plant SQL manager");
    const id = cuidLike();
    manager = await prisma.user.create({
      data: {
        id,
        email: `plant-sql-manager-${id}@example.com`,
        displayName: "Plant SQL Manager",
        passwordHash: "not-a-usable-hash",
        facilityId: plant.facilityId,
        roleId: managerRole.id,
        isActive: true,
        primaryDepartmentId: plant.id,
      },
      include: { role: { select: { key: true } } },
    });
  }

  let staff = await prisma.user.findFirst({
    where: {
      facilityId: plant.facilityId,
      isActive: true,
      role: { key: "STAFF" },
    },
    include: { role: { select: { key: true } } },
  });
  if (!staff) {
    const staffRole = await prisma.role.findFirst({
      where: { key: "STAFF" },
      select: { id: true, key: true },
    });
    assert.ok(staffRole, "STAFF role required");
    const id = cuidLike();
    staff = await prisma.user.create({
      data: {
        id,
        email: `plant-sql-staff-${id}@example.com`,
        displayName: "Plant SQL Dietary Staff",
        passwordHash: "not-a-usable-hash",
        facilityId: plant.facilityId,
        roleId: staffRole.id,
        isActive: true,
        primaryDepartmentId: dietary.id,
      },
      include: { role: { select: { key: true } } },
    });
  }

  let tech = await prisma.employee.findFirst({
    where: {
      facilityId: plant.facilityId,
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  if (!tech) {
    tech = await prisma.employee.create({
      data: {
        id: cuidLike(),
        facilityId: plant.facilityId,
        firstName: "Plant",
        lastName: `SQL Tech ${cuidLike().slice(-6)}`,
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: plant.id,
      },
    });
  }

  return { plant, dietary, unit, manager, staff, tech, facility: plant.facility };
}

test(
  "phase12a sql: route validate reject foreign; create request; triage; WO without auto-close",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    const prevDietary = process.env.DIETARY_JOB_FLOW_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    process.env.DIETARY_JOB_FLOW_ENABLED = "true";

    try {
      const fx = await loadFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: (fx.manager.role?.key as AppJwtPayload["role"]) ?? "MANAGER",
        uid: fx.manager.id,
        primaryDepartmentId: fx.plant.id,
      });
      const dietaryStaff = session({
        facilityId: fx.facility.id,
        role: (fx.staff?.role?.key as AppJwtPayload["role"]) ?? "STAFF",
        uid: fx.staff?.id ?? fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });

      await upsertRequestRoute(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
      });

      const routes = await listActiveRoutesForRequestingDepartment(
        fx.facility.id,
        fx.dietary.id,
        prisma,
      );
      assert.ok(routes.some((r) => r.responsibleDepartmentId === fx.plant.id));

      const bad = await validateRoute({
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: cuidLike(),
        client: prisma,
      });
      assert.equal(bad.ok, false);

      const good = await validateRoute({
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        client: prisma,
      });
      assert.equal(good.ok, true);

      const request = await createRequest(dietaryStaff, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unit.id,
        summary: `Leak near dish machine ${cuidLike().slice(0, 6)}`,
        description: "Water pooling under equipment",
        observedAt: new Date(),
        priority: "HIGH",
        allowObviousDuplicate: true,
      });
      assert.equal(request.status, "REPORTED");
      assert.equal(request.requestingDepartmentId, fx.dietary.id);
      assert.equal(request.responsibleDepartmentId, fx.plant.id);

      await acknowledgeRequest(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: request.id,
      });
      await triageRequest(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: request.id,
        triageNote: "Internal only — vendor TBD",
        requesterVisibleStatusSummary: "Under review by Plant",
      });

      const visible = await loadRequesterVisibleStatus(dietaryStaff, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        requestId: request.id,
      });
      assert.equal(visible.requesterVisibleStatusSummary, "Under review by Plant");
      assert.doesNotMatch(JSON.stringify(visible), /vendor TBD/i);
      assert.doesNotMatch(JSON.stringify(visible), /Internal only/i);

      const { workOrder } = await createWorkOrderFromRequest(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: request.id,
        assignedEmployeeId: fx.tech?.id ?? null,
      });
      assert.ok(workOrder.repairCode);

      await technicianUpdateWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: workOrder.id,
        action: "START",
      });
      await technicianUpdateWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: workOrder.id,
        action: "COMPLETE",
        resolution: "Repaired valve",
        requesterVisible: true,
      });

      const after = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      assert.notEqual(after.status, "CLOSED");
      assert.notEqual(after.status, "RESOLVED");
      assert.equal(after.workOrderId, workOrder.id);

      const completed = await prisma.repair.findUniqueOrThrow({ where: { id: workOrder.id } });
      assert.equal(completed.status, "COMPLETED");
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      if (prevDietary === undefined) delete process.env.DIETARY_JOB_FLOW_ENABLED;
      else process.env.DIETARY_JOB_FLOW_ENABLED = prevDietary;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase12a sql: plant flag off rejects Plant destination routes",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "false";
    try {
      const fx = await loadFixture(prisma);
      const result = await validateRoute({
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        client: prisma,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.match(result.reason, /Plant Operations is not enabled/);
      }
    } finally {
      if (prev === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
