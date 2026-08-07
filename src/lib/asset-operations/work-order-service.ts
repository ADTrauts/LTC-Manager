/**
 * Phase 10A Work Order services — Repair remains the Work Order SoT.
 * Completing a Work Order does not change Asset status or close an Asset Issue.
 */

import type {
  Prisma,
  PrismaClient,
  RepairPriority,
  RepairStatus,
  RepairTrade,
  WorkOrderKind,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestRepairDepartmentIds } from "@/lib/repair-routing";

import {
  requireWorkOrderManage,
  resolveAssetOperationsAuthority,
} from "./authority";
import { normalizeAssetStatus, OPEN_ASSET_ISSUE_STATUSES } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function resolveWorkOrderActorAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
  opts?: { repairId?: string },
) {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });

  if (department?.key === "PLANT") {
    const { resolvePlantOperationsAuthority, requirePlantWorkOrderManage } =
      await import("@/lib/operational-requests/authority");

    let isAssignedTechnician = false;
    if (opts?.repairId && session.authKind === "employee") {
      const repair = await prisma.repair.findFirst({
        where: { id: opts.repairId, unit: { facilityId } },
        select: { assignedEmployeeId: true },
      });
      isAssignedTechnician = repair?.assignedEmployeeId === session.uid;
    }

    const plantAuth = await resolvePlantOperationsAuthority(
      session,
      facilityId,
      departmentId,
      { isAssignedTechnician },
    );
    requirePlantWorkOrderManage(plantAuth);
    return {
      kind: "plant" as const,
      canManage: plantAuth.canManageWorkOrders,
      canAssignVendor: plantAuth.canManageVendors,
      canActAssigned: plantAuth.canActOnAssignedWorkOrder,
      plantAuth,
    };
  }

  const authority = await resolveAssetOperationsAuthority(
    session,
    facilityId,
    departmentId,
  );
  requireWorkOrderManage(authority);
  return {
    kind: "asset" as const,
    canManage: authority.canManageWorkOrders,
    canAssignVendor: authority.canAssignVendor,
    canActAssigned: false,
    assetAuth: authority,
  };
}

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

const ALLOWED_WO_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "WAITING_PARTS", "WAITING_ON_VENDOR", "ON_HOLD", "CANCELLED"],
  ASSIGNED: [
    "IN_PROGRESS",
    "WAITING_PARTS",
    "WAITING_ON_VENDOR",
    "ON_HOLD",
    "OPEN",
    "CANCELLED",
  ],
  IN_PROGRESS: [
    "WAITING_PARTS",
    "WAITING_ON_VENDOR",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
  ],
  WAITING_PARTS: [
    "IN_PROGRESS",
    "WAITING_ON_VENDOR",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
  ],
  WAITING_ON_VENDOR: [
    "IN_PROGRESS",
    "WAITING_PARTS",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
  ],
  ON_HOLD: [
    "OPEN",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_PARTS",
    "WAITING_ON_VENDOR",
    "CANCELLED",
  ],
  COMPLETED: [],
  CANCELLED: [],
  CLOSED: [],
};

async function nextRepairCode(client: DbClient): Promise<string> {
  const count = await client.repair.count();
  let candidate = `R-${String(count + 1).padStart(5, "0")}`;
  for (let i = 0; i < 8; i += 1) {
    const clash = await client.repair.findFirst({
      where: { repairCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `R-${String(count + 1 + i + 1).padStart(5, "0")}`;
  }
  return `R-${cuidLike().slice(1, 9).toUpperCase()}`;
}

async function appendRepairUpdate(
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
      id: cuidLike(),
      repairId: input.repairId,
      updateText: input.updateText,
      statusAfterUpdate: input.statusAfterUpdate,
      updatedById: input.updatedById,
      requesterVisible: input.requesterVisible ?? false,
    },
  });
}

async function loadWorkOrderScoped(
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

function assertTransition(from: RepairStatus, to: RepairStatus) {
  const allowed = ALLOWED_WO_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid Work Order status transition ${from} → ${to}.`);
  }
}

export type CreateWorkOrderDirectInput = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  assetId?: string | null;
  title: string;
  description: string;
  priority?: RepairPriority;
  repairTrade?: RepairTrade;
  workOrderKind?: WorkOrderKind;
  vendorId?: string | null;
  responsibleDepartmentId?: string | null;
  assignedEmployeeId?: string | null;
  targetDate?: Date | null;
  dueAt?: Date | null;
};

export async function createWorkOrderDirect(
  session: AppJwtPayload,
  input: CreateWorkOrderDirectInput & { client?: DbClient; now?: Date },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const unit = await client.unit.findFirst({
    where: { id: input.unitId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");

  if (input.assetId) {
    const asset = await client.asset.findFirst({
      where: { id: input.assetId, unit: { facilityId: input.facilityId } },
      select: { id: true, status: true, unitId: true },
    });
    if (!asset) throw new Error("Asset not found.");
    if (normalizeAssetStatus(asset.status) === "RETIRED") {
      throw new Error("Cannot open a Work Order against a retired Asset.");
    }
  }

  if (input.vendorId) {
    const vendor = await client.vendor.findFirst({
      where: { id: input.vendorId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  if (input.assignedEmployeeId) {
    const employee = await client.employee.findFirst({
      where: { id: input.assignedEmployeeId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found.");
  }

  if (input.responsibleDepartmentId) {
    const dept = await client.department.findFirst({
      where: {
        id: input.responsibleDepartmentId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!dept) throw new Error("Responsible department not found.");
  }

  const repairTrade = input.repairTrade ?? "GENERAL";
  const suggested = await suggestRepairDepartmentIds(prisma, {
    facilityId: input.facilityId,
    unitId: input.unitId,
    assetId: input.assetId,
    repairTrade,
    issueType: "EQUIPMENT",
    sessionPrimaryDepartmentId: session.primaryDepartmentId,
    forceRequestingDepartmentId: input.departmentId,
    explicitResponsibleDepartmentId: input.responsibleDepartmentId,
  });

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const repairCode = await nextRepairCode(client);
  const initialStatus: RepairStatus = input.assignedEmployeeId ? "ASSIGNED" : "OPEN";

  const created = await client.repair.create({
    data: {
      id: cuidLike(),
      repairCode,
      assetId: input.assetId ?? null,
      unitId: input.unitId,
      title: input.title.trim(),
      description: input.description.trim(),
      priority: input.priority ?? "MEDIUM",
      status: initialStatus,
      workOrderKind: input.workOrderKind ?? "CORRECTIVE",
      repairTrade,
      issueType: "EQUIPMENT",
      requestingDepartmentId: suggested.requestingDepartmentId,
      responsibleDepartmentId:
        input.responsibleDepartmentId ?? suggested.responsibleDepartmentId,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      vendorId: input.vendorId ?? null,
      targetDate: input.targetDate ?? null,
      dueAt: input.dueAt ?? null,
      requestedAt: now,
      reportedById: actorUserId,
      updates: {
        create: {
          id: cuidLike(),
          updateText: "Work Order created",
          statusAfterUpdate: initialStatus,
          updatedById: actorUserId,
        },
      },
    },
  });

  return created;
}

export async function createWorkOrderFromIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    title?: string | null;
    description?: string | null;
    priority?: RepairPriority;
    repairTrade?: RepairTrade;
    vendorId?: string | null;
    responsibleDepartmentId?: string | null;
    assignedEmployeeId?: string | null;
    targetDate?: Date | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const issue = await client.assetIssue.findFirst({
    where: {
      id: input.issueId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!issue) throw new Error("Asset Issue not found.");
  if (issue.workOrderId) {
    const existing = await client.repair.findFirst({
      where: { id: issue.workOrderId },
    });
    if (existing) return existing;
  }
  if (!OPEN_ASSET_ISSUE_STATUSES.includes(issue.status) && issue.status !== "RESOLVED") {
    throw new Error("Cannot create a Work Order from a closed or cancelled Issue.");
  }

  const created = await createWorkOrderDirect(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: issue.unitId,
    assetId: issue.assetId,
    title: input.title?.trim() || issue.summary,
    description: input.description?.trim() || issue.description,
    priority: input.priority ?? issue.priority,
    repairTrade: input.repairTrade,
    vendorId: input.vendorId,
    responsibleDepartmentId: input.responsibleDepartmentId,
    assignedEmployeeId: input.assignedEmployeeId,
    targetDate: input.targetDate,
    client,
    now: input.now,
  });

  await client.assetIssue.update({
    where: { id: issue.id },
    data: { workOrderId: created.id },
  });

  const actorUserId = sessionUserIdForFk(session);
  await client.assetIssueUpdate.create({
    data: {
      id: cuidLike(),
      issueId: issue.id,
      updateText: `Work Order ${created.repairCode} linked`,
      statusAfterUpdate: issue.status,
      updatedByUserId: actorUserId,
    },
  });

  return created;
}

export async function updateWorkOrderStatus(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    toStatus: RepairStatus;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  assertTransition(repair.status, input.toStatus);

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const data: Prisma.RepairUpdateInput = {
    status: input.toStatus,
  };
  if (input.toStatus === "IN_PROGRESS" && !repair.startedAt) {
    data.startedAt = now;
  }
  if (input.toStatus === "COMPLETED") {
    data.completedAt = now;
  }
  if (input.toStatus === "CANCELLED") {
    data.completedAt = repair.completedAt ?? now;
  }

  const updated = await client.repair.update({
    where: { id: repair.id },
    data,
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() || `Status changed to ${input.toStatus}`,
    statusAfterUpdate: input.toStatus,
    updatedById: actorUserId,
  });

  return updated;
}

export async function assignVendor(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    vendorId: string | null;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);
  if (!authority.canAssignVendor) {
    throw new Error(authority.reason ?? "Vendor assignment denied.");
  }

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);

  if (input.vendorId) {
    const vendor = await client.vendor.findFirst({
      where: { id: input.vendorId, facilityId: input.facilityId },
      select: { id: true, name: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.repair.update({
    where: { id: repair.id },
    data: {
      vendorId: input.vendorId,
      ...(repair.status === "OPEN" && input.vendorId
        ? { status: "WAITING_ON_VENDOR" as RepairStatus }
        : {}),
    },
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() ||
      (input.vendorId ? "Vendor assigned" : "Vendor cleared"),
    statusAfterUpdate: updated.status,
    updatedById: actorUserId,
  });

  return updated;
}

export async function assignResponsibleEmployee(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    assignedEmployeeId: string | null;
    responsibleDepartmentId?: string | null;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);

  if (input.assignedEmployeeId) {
    const employee = await client.employee.findFirst({
      where: { id: input.assignedEmployeeId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found.");
  }

  if (input.responsibleDepartmentId) {
    const dept = await client.department.findFirst({
      where: {
        id: input.responsibleDepartmentId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!dept) throw new Error("Responsible department not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const nextStatus: RepairStatus | undefined =
    input.assignedEmployeeId && repair.status === "OPEN" ? "ASSIGNED" : undefined;

  const updated = await client.repair.update({
    where: { id: repair.id },
    data: {
      assignedEmployeeId: input.assignedEmployeeId,
      ...(input.responsibleDepartmentId !== undefined
        ? { responsibleDepartmentId: input.responsibleDepartmentId }
        : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    },
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() ||
      (input.assignedEmployeeId
        ? "Responsible employee assigned"
        : "Responsible employee cleared"),
    statusAfterUpdate: updated.status,
    updatedById: actorUserId,
  });

  return updated;
}

/**
 * Completes the Work Order. Does NOT change Asset status. Does NOT close the Issue.
 */
export async function completeWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    workPerformed?: string | null;
    resolution?: string | null;
    followUpRequired?: boolean;
    followUpNote?: string | null;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (repair.status === "COMPLETED" || repair.status === "CLOSED") {
    return repair;
  }
  if (repair.status === "CANCELLED") {
    throw new Error("Cancelled Work Orders cannot be completed.");
  }
  if (
    repair.status !== "IN_PROGRESS" &&
    repair.status !== "WAITING_PARTS" &&
    repair.status !== "WAITING_ON_VENDOR" &&
    repair.status !== "ON_HOLD" &&
    repair.status !== "ASSIGNED" &&
    repair.status !== "OPEN"
  ) {
    throw new Error(`Cannot complete Work Order from status ${repair.status}.`);
  }

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();

  const updated = await client.repair.update({
    where: { id: repair.id },
    data: {
      status: "COMPLETED",
      completedAt: now,
      startedAt: repair.startedAt ?? now,
      workPerformed: input.workPerformed?.trim() || repair.workPerformed,
      resolution: input.resolution?.trim() || repair.resolution,
      followUpRequired: input.followUpRequired ?? repair.followUpRequired,
      followUpNote:
        input.followUpNote !== undefined
          ? input.followUpNote?.trim() || null
          : repair.followUpNote,
    },
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() ||
      input.resolution?.trim() ||
      "Work Order completed",
    statusAfterUpdate: "COMPLETED",
    updatedById: actorUserId,
  });

  return updated;
}

/**
 * Explicit Work Order create from an Operational Request (Phase 12A).
 * Never automatic. Completing the WO does not close the Request or mutate Asset status.
 */
export async function createWorkOrderFromOperationalRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    title?: string | null;
    description?: string | null;
    priority?: RepairPriority;
    repairTrade?: RepairTrade;
    vendorId?: string | null;
    assignedEmployeeId?: string | null;
    targetDate?: Date | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const actor = await resolveWorkOrderActorAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  if (!actor.canManage) {
    throw new Error("Work Order creation denied.");
  }

  const request = await client.operationalRequest.findFirst({
    where: {
      id: input.requestId,
      facilityId: input.facilityId,
      responsibleDepartmentId: input.plantDepartmentId,
    },
  });
  if (!request) throw new Error("Operational Request not found.");
  if (request.workOrderId) {
    const existing = await client.repair.findFirst({
      where: { id: request.workOrderId },
    });
    if (existing) return existing;
  }
  if (
    request.status === "CLOSED" ||
    request.status === "CANCELLED"
  ) {
    throw new Error("Cannot create a Work Order from a closed or cancelled Request.");
  }

  if (input.vendorId) {
    const vendor = await client.vendor.findFirst({
      where: { id: input.vendorId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  if (input.assignedEmployeeId) {
    const employee = await client.employee.findFirst({
      where: { id: input.assignedEmployeeId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const repairCode = await nextRepairCode(client);
  const initialStatus: RepairStatus = input.assignedEmployeeId ? "ASSIGNED" : "OPEN";

  const created = await client.repair.create({
    data: {
      id: cuidLike(),
      repairCode,
      assetId: request.assetId ?? null,
      unitId: request.unitId,
      title: input.title?.trim() || request.summary,
      description: input.description?.trim() || request.description,
      priority: input.priority ?? request.priority,
      status: initialStatus,
      workOrderKind: "CORRECTIVE",
      repairTrade: input.repairTrade ?? "GENERAL",
      issueType: "EQUIPMENT",
      requestingDepartmentId: request.requestingDepartmentId,
      responsibleDepartmentId: request.responsibleDepartmentId,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      vendorId: input.vendorId ?? null,
      targetDate: input.targetDate ?? null,
      requestedAt: now,
      reportedById: actorUserId,
      updates: {
        create: {
          id: cuidLike(),
          updateText: `Work Order created from request ${request.requestCode}`,
          statusAfterUpdate: initialStatus,
          updatedById: actorUserId,
          requesterVisible: false,
        },
      },
    },
  });

  await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      workOrderId: created.id,
      status: input.assignedEmployeeId ? "WORK_ASSIGNED" : "UNDER_REVIEW",
      requesterVisibleStatusSummary: input.assignedEmployeeId
        ? "Work assigned"
        : "Under review",
    },
  });

  await client.operationalRequestUpdate.create({
    data: {
      id: cuidLike(),
      requestId: request.id,
      updateText: `Work Order ${created.repairCode} linked`,
      statusAfterUpdate: input.assignedEmployeeId ? "WORK_ASSIGNED" : "UNDER_REVIEW",
      updatedByUserId: actorUserId,
      requesterVisible: true,
    },
  });

  return created;
}

/**
 * Technician / supervisor Work Order action path (Plant or Asset-ops department).
 * Completing does NOT change Asset status and does NOT auto-close Request / AssetIssue.
 */
export async function technicianUpdateWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    action:
      | "START"
      | "NOTE"
      | "WAITING_PARTS"
      | "WAITING_ON_VENDOR"
      | "COMPLETE"
      | "FOLLOW_UP";
    note?: string | null;
    requesterVisible?: boolean;
    workPerformed?: string | null;
    resolution?: string | null;
    followUpRequired?: boolean;
    followUpNote?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  await resolveWorkOrderActorAuthority(
    session,
    input.facilityId,
    input.departmentId,
    { repairId: input.repairId },
  );

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const requesterVisible = input.requesterVisible === true;

  if (input.action === "NOTE") {
    if (!input.note?.trim()) throw new Error("Note text is required.");
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: input.note.trim(),
      statusAfterUpdate: repair.status,
      updatedById: actorUserId,
      requesterVisible,
    });
    return repair;
  }

  if (input.action === "FOLLOW_UP") {
    const updated = await client.repair.update({
      where: { id: repair.id },
      data: {
        followUpRequired: input.followUpRequired ?? true,
        followUpNote: input.followUpNote?.trim() || input.note?.trim() || repair.followUpNote,
      },
    });
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: input.note?.trim() || "Follow-up flagged",
      statusAfterUpdate: repair.status,
      updatedById: actorUserId,
      requesterVisible,
    });
    return updated;
  }

  let toStatus: RepairStatus;
  if (input.action === "START") toStatus = "IN_PROGRESS";
  else if (input.action === "WAITING_PARTS") toStatus = "WAITING_PARTS";
  else if (input.action === "WAITING_ON_VENDOR") toStatus = "WAITING_ON_VENDOR";
  else if (input.action === "COMPLETE") toStatus = "COMPLETED";
  else throw new Error("Unsupported Work Order action.");

  if (input.action === "COMPLETE") {
    if (repair.status === "COMPLETED" || repair.status === "CLOSED") {
      return repair;
    }
    if (repair.status === "CANCELLED") {
      throw new Error("Cancelled Work Orders cannot be completed.");
    }
    const allowedFrom = [
      "OPEN",
      "ASSIGNED",
      "IN_PROGRESS",
      "WAITING_PARTS",
      "WAITING_ON_VENDOR",
      "ON_HOLD",
    ] as RepairStatus[];
    if (!allowedFrom.includes(repair.status)) {
      throw new Error(`Cannot complete Work Order from status ${repair.status}.`);
    }

    const updated = await client.repair.update({
      where: { id: repair.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        startedAt: repair.startedAt ?? now,
        workPerformed: input.workPerformed?.trim() || repair.workPerformed,
        resolution: input.resolution?.trim() || repair.resolution,
        followUpRequired: input.followUpRequired ?? repair.followUpRequired,
        followUpNote:
          input.followUpNote !== undefined
            ? input.followUpNote?.trim() || null
            : repair.followUpNote,
      },
    });

    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText:
        input.note?.trim() ||
        input.resolution?.trim() ||
        "Work Order completed",
      statusAfterUpdate: "COMPLETED",
      updatedById: actorUserId,
      requesterVisible,
    });

    // Explicit: do NOT close OperationalRequest, do NOT mutate Asset status.
    return updated;
  }

  assertTransition(repair.status, toStatus);
  const data: Prisma.RepairUpdateInput = { status: toStatus };
  if (toStatus === "IN_PROGRESS" && !repair.startedAt) {
    data.startedAt = now;
  }

  const updated = await client.repair.update({
    where: { id: repair.id },
    data,
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: input.note?.trim() || `Status changed to ${toStatus}`,
    statusAfterUpdate: toStatus,
    updatedById: actorUserId,
    requesterVisible,
  });

  // Sync linked Operational Request status when responsible dept is Plant — never auto-close.
  const linkedRequest = await client.operationalRequest.findFirst({
    where: { workOrderId: repair.id },
    select: { id: true, status: true },
  });
  if (linkedRequest && linkedRequest.status !== "CLOSED" && linkedRequest.status !== "CANCELLED" && linkedRequest.status !== "RESOLVED") {
    const nextRequestStatus =
      toStatus === "IN_PROGRESS"
        ? "WORK_IN_PROGRESS"
        : toStatus === "WAITING_ON_VENDOR"
          ? "WAITING_ON_VENDOR"
          : toStatus === "WAITING_PARTS"
            ? "WAITING_ON_PARTS"
            : null;
    if (nextRequestStatus) {
      await client.operationalRequest.update({
        where: { id: linkedRequest.id },
        data: {
          status: nextRequestStatus,
          requesterVisibleStatusSummary:
            nextRequestStatus === "WORK_IN_PROGRESS"
              ? "Work in progress"
              : nextRequestStatus === "WAITING_ON_VENDOR"
                ? "Waiting on vendor"
                : "Waiting on parts",
        },
      });
    }
  }

  return updated;
}

/** Flag only — does not mutate Asset status. */
export async function markReturnToServiceReady(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    ready?: boolean;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireWorkOrderManage(authority);

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const ready = input.ready !== false;
  const actorUserId = sessionUserIdForFk(session);

  const updated = await client.repair.update({
    where: { id: repair.id },
    data: { returnToServiceReady: ready },
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() ||
      (ready
        ? "Marked return-to-service ready (Asset status unchanged)"
        : "Cleared return-to-service ready flag"),
    statusAfterUpdate: repair.status,
    updatedById: actorUserId,
  });

  return updated;
}
