/**
 * Shared Work Order actor + persistence helpers.
 * Used by Work Order services and Phase 3D closeout without import cycles.
 */
import type { Prisma, PrismaClient, RepairStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import {
  requireWorkOrderManage,
  resolveAssetOperationsAuthority,
} from "./authority";
import { isAssignedWorkOrderTechnician } from "./work-order-actor";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type WorkOrderActor = {
  kind: "plant" | "asset";
  canManage: boolean;
  canAssignVendor: boolean;
  canActAssigned: boolean;
};

export function newWorkOrderCuid() {
  return `c${randomBytes(12).toString("hex")}`;
}

export async function resolveWorkOrderActorAuthority(
  session: FacilitySession,
  facilityId: string,
  departmentId: string,
  opts?: { repairId?: string },
): Promise<WorkOrderActor> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });

  if (department?.key === "PLANT") {
    const { resolvePlantOperationsAuthority, requirePlantWorkOrderManage } =
      await import("@/lib/operational-requests/authority");

    let isAssignedTechnician = false;
    if (opts?.repairId) {
      const repair = await prisma.repair.findFirst({
        where: { id: opts.repairId, unit: { facilityId } },
        select: { assignedEmployeeId: true },
      });
      const operationalEmployeeId = await getOperationalEmployeeIdForSession(session);
      isAssignedTechnician = isAssignedWorkOrderTechnician({
        assignedEmployeeId: repair?.assignedEmployeeId,
        operationalEmployeeId,
        sessionUid: session.uid,
        authKind: session.authKind,
      });
    }

    const plantAuth = await resolvePlantOperationsAuthority(
      session,
      facilityId,
      departmentId,
      { isAssignedTechnician },
    );
    requirePlantWorkOrderManage(plantAuth);
    return {
      kind: "plant",
      canManage: plantAuth.canManageWorkOrders,
      canAssignVendor: plantAuth.canManageVendors,
      canActAssigned: plantAuth.canActOnAssignedWorkOrder,
    };
  }

  const authority = await resolveAssetOperationsAuthority(
    session,
    facilityId,
    departmentId,
  );
  requireWorkOrderManage(authority);
  return {
    kind: "asset",
    canManage: authority.canManageWorkOrders,
    canAssignVendor: authority.canAssignVendor,
    canActAssigned: false,
  };
}

export async function loadWorkOrderScoped(
  client: DbClient,
  repairId: string,
  facilityId: string,
) {
  const repair = await client.repair.findFirst({
    where: { id: repairId, unit: { facilityId } },
  });
  if (!repair) throw new Error("Work Order not found.");
  return repair;
}

export async function appendRepairUpdate(
  client: DbClient,
  input: {
    repairId: string;
    updateText: string;
    statusAfterUpdate: RepairStatus | null;
    updatedById: string | null;
    requesterVisible?: boolean;
  },
) {
  await client.repairUpdate.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: input.repairId,
      updateText: input.updateText,
      statusAfterUpdate: input.statusAfterUpdate,
      updatedById: input.updatedById,
      requesterVisible: input.requesterVisible ?? false,
    },
  });
}
