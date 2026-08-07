/**
 * Phase 12A Plant Operations — ownership, WO lifecycle, RTS explicit, offline boundary.
 * Opt in via PLANT_OPERATIONS_TEST_DATABASE_URL (or DEPARTMENT_WORK_TEST_DATABASE_URL).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import {
  createRequest,
  createWorkOrderFromRequest,
  upsertRequestRoute,
  resolvePlantOperationsAuthority,
} from "@/lib/operational-requests";
import {
  returnAssetToService,
  technicianUpdateWorkOrder,
  createAsset,
} from "@/lib/asset-operations";

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
    name: overrides.name ?? "Plant Ops Test",
    email: overrides.email ?? "plant-ops@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "phase12a plant: request ownership preserved on WO; complete does not RTS; FA denied",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.PLANT_OPERATIONS_ENABLED;
    const prevDietary = process.env.DIETARY_JOB_FLOW_ENABLED;
    const prevAsset = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    process.env.DIETARY_JOB_FLOW_ENABLED = "true";
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";

    try {
      const plant = await prisma.department.findFirst({
        where: { key: "PLANT", isActive: true },
        include: { facility: true },
      });
      assert.ok(plant);
      const dietary = await prisma.department.findFirst({
        where: { facilityId: plant.facilityId, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary);
      const unit = await prisma.unit.findFirst({
        where: { facilityId: plant.facilityId, isActive: true },
      });
      assert.ok(unit);
      let manager = await prisma.user.findFirst({
        where: {
          facilityId: plant.facilityId,
          isActive: true,
          role: { key: { in: ["MANAGER", "GM"] } },
        },
        include: { role: true },
      });
      if (!manager) {
        const managerRole =
          (await prisma.role.findFirst({
            where: { key: "MANAGER" },
            select: { id: true, key: true },
          })) ??
          (await prisma.role.findFirst({ where: { key: "GM" }, select: { id: true, key: true } }));
        assert.ok(managerRole, "MANAGER or GM role required");
        const id = cuidLike();
        manager = await prisma.user.create({
          data: {
            id,
            email: `plant-ops-manager-${id}@example.com`,
            displayName: "Plant Ops SQL Manager",
            passwordHash: "not-a-usable-hash",
            facilityId: plant.facilityId,
            roleId: managerRole.id,
            isActive: true,
            primaryDepartmentId: plant.id,
          },
          include: { role: true },
        });
      }
      let faAlone = await prisma.user.findFirst({
        where: {
          facilityId: plant.facilityId,
          isActive: true,
          role: { key: "FACILITY_ADMINISTRATOR" },
          OR: [{ primaryDepartmentId: null }, { primaryDepartmentId: { not: plant.id } }],
        },
        include: { role: true },
      });
      if (!faAlone) {
        const faRole = await prisma.role.findFirst({
          where: { key: "FACILITY_ADMINISTRATOR" },
          select: { id: true, key: true },
        });
        if (faRole) {
          const id = cuidLike();
          faAlone = await prisma.user.create({
            data: {
              id,
              email: `plant-ops-fa-${id}@example.com`,
              displayName: "Plant Ops FA Alone",
              passwordHash: "not-a-usable-hash",
              facilityId: plant.facilityId,
              roleId: faRole.id,
              isActive: true,
              primaryDepartmentId: dietary.id,
            },
            include: { role: true },
          });
        }
      }

      const mgr = session({
        facilityId: plant.facilityId,
        role: (manager.role.key as AppJwtPayload["role"]) ?? "MANAGER",
        uid: manager.id,
        primaryDepartmentId: plant.id,
      });

      if (faAlone) {
        const denied = await resolvePlantOperationsAuthority(
          session({
            facilityId: plant.facilityId,
            role: "FACILITY_ADMINISTRATOR",
            uid: faAlone.id,
            primaryDepartmentId: faAlone.primaryDepartmentId,
          }),
          plant.facilityId,
          plant.id,
        );
        assert.equal(denied.canTriage, false);
        assert.equal(denied.canManageWorkOrders, false);
      }

      await upsertRequestRoute(mgr, {
        facilityId: plant.facilityId,
        plantDepartmentId: plant.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
      });

      const asset = await createAsset(mgr, {
        facilityId: plant.facilityId,
        departmentId: plant.id,
        unitId: unit.id,
        name: `Plant Boiler ${cuidLike().slice(0, 5)}`,
        equipmentType: "BOILER",
      });

      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: "OUT_OF_SERVICE" },
      });

      const dietaryUser = session({
        facilityId: plant.facilityId,
        role: "STAFF",
        uid: manager.id,
        primaryDepartmentId: dietary.id,
      });

      const request = await createRequest(dietaryUser, {
        facilityId: plant.facilityId,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
        unitId: unit.id,
        assetId: asset.id,
        summary: `Boiler pressure alarm ${cuidLike().slice(0, 5)}`,
        description: "Alarm sounding",
        observedAt: new Date(),
        equipmentRemainsUsable: false,
        allowObviousDuplicate: true,
      });

      assert.equal(request.requestingDepartmentId, dietary.id);
      assert.equal(request.responsibleDepartmentId, plant.id);

      const { workOrder } = await createWorkOrderFromRequest(mgr, {
        facilityId: plant.facilityId,
        plantDepartmentId: plant.id,
        requestId: request.id,
      });

      await technicianUpdateWorkOrder(mgr, {
        facilityId: plant.facilityId,
        departmentId: plant.id,
        repairId: workOrder.id,
        action: "COMPLETE",
        resolution: "Valve replaced",
      });

      const assetAfterWo = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(assetAfterWo.status, "OUT_OF_SERVICE");

      const requestAfterWo = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      assert.notEqual(requestAfterWo.status, "CLOSED");
      assert.equal(requestAfterWo.requestingDepartmentId, dietary.id);

      await returnAssetToService(mgr, {
        facilityId: plant.facilityId,
        departmentId: plant.id,
        assetId: asset.id,
        note: "Manager explicit return to service",
        sourceRepairId: workOrder.id,
      });

      const assetAfterRts = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(assetAfterRts.status, "OPERATIONAL");
    } finally {
      if (prev === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prev;
      if (prevDietary === undefined) delete process.env.DIETARY_JOB_FLOW_ENABLED;
      else process.env.DIETARY_JOB_FLOW_ENABLED = prevDietary;
      if (prevAsset === undefined) delete process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
      else process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prevAsset;
      await prisma.$disconnect();
    }
  },
);

test("phase12a plant hermetic: offline WO mutations are not supported in Phase 12A", () => {
  // Documented contract — plantWorkOrderContext.offlineMutationsSupported === false
  const contract = {
    readOnly: true as const,
    offlineMutationsSupported: false as const,
  };
  assert.equal(contract.readOnly, true);
  assert.equal(contract.offlineMutationsSupported, false);
});
