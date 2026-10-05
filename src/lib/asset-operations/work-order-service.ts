/**
 * Phase 10A Work Order services — Repair remains the Work Order SoT.
 * Completing a Work Order does not change Asset status or close an Asset Issue.
 * Work Order execution status is not copied onto OperationalRequest.status.
 */

import type {
  Prisma,
  PrismaClient,
  RepairPriority,
  RepairStatus,
  RepairTrade,
  WorkOrderHoldReason,
  WorkOrderKind,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requesterVisibleStatusLabel } from "@/lib/operational-requests/types";
import { suggestRepairDepartmentIds } from "@/lib/repair-routing";

import {
  requireWorkOrderManage,
  resolveAssetOperationsAuthority,
} from "./authority";
import { resolvePreferredRepairProviderForAsset } from "./responsibility";
import { isKnowledgeProcedureCategory } from "@/lib/knowledge/version-semantics";

import { ensureDefaultMaintenanceCategories } from "./maintenance-categories";
import { normalizeAssetStatus, OPEN_ASSET_ISSUE_STATUSES } from "./types";
import {
  mapRepairTradeToCategoryKey,
  presentWorkOrder,
  resolveStoredHoldWrite,
} from "./work-order-semantics";

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

async function snapshotWorkOrderLocation(
  client: DbClient,
  input: {
    facilityId: string;
    assetId?: string | null;
    issueId?: string | null;
    unitId?: string | null;
    spaceId?: string | null;
    allowLocationOverride?: boolean;
  },
): Promise<{ assetId: string | null; unitId: string; spaceId: string | null }> {
  let asset: { id: string; unitId: string; spaceId: string | null; status: string } | null = null;
  if (input.assetId) {
    asset = await client.asset.findFirst({
      where: { id: input.assetId, unit: { facilityId: input.facilityId } },
      select: { id: true, unitId: true, spaceId: true, status: true },
    });
    if (!asset) throw new Error("Asset not found.");
    if (normalizeAssetStatus(asset.status) === "RETIRED") {
      throw new Error("Cannot open a Work Order against a retired Asset.");
    }
  }

  let issue: { id: string; unitId: string; spaceId: string | null; assetId: string | null } | null =
    null;
  if (input.issueId) {
    issue = await client.assetIssue.findFirst({
      where: { id: input.issueId, facilityId: input.facilityId },
      select: { id: true, unitId: true, spaceId: true, assetId: true },
    });
    if (!issue) throw new Error("Issue not found.");
  }

  const unitId = input.unitId?.trim() || issue?.unitId || asset?.unitId || null;
  if (!unitId) throw new Error("Work Order unit is required.");

  if (asset && unitId !== asset.unitId && !input.allowLocationOverride) {
    throw new Error("Work Order unit must match the Asset unit unless explicitly overridden.");
  }

  const unit = await client.unit.findFirst({
    where: { id: unitId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");

  const spaceId =
    input.spaceId !== undefined
      ? input.spaceId
      : (issue?.spaceId ?? asset?.spaceId ?? null);
  if (spaceId) {
    const space = await client.unitSpace.findFirst({
      where: {
        id: spaceId,
        facilityId: input.facilityId,
        OR: [{ unitId }, { unitId: null }],
      },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found.");
  }

  return { assetId: asset?.id ?? issue?.assetId ?? null, unitId, spaceId };
}

async function assertPublishedProcedurePin(
  client: DbClient,
  input: { facilityId: string; procedureVersionId: string },
) {
  const version = await client.knowledgeArticleVersion.findFirst({
    where: { id: input.procedureVersionId },
    include: { article: { select: { facilityId: true, category: true } } },
  });
  if (!version) throw new Error("Procedure version not found.");
  if (version.article.facilityId !== input.facilityId) {
    throw new Error("Procedure version belongs to another facility.");
  }
  if (!isKnowledgeProcedureCategory(version.article.category)) {
    throw new Error("Work Orders may pin only Procedure (SOP) Knowledge versions.");
  }
  if (version.status !== "PUBLISHED") {
    throw new Error("Active Work Orders may pin only PUBLISHED Procedure versions.");
  }
}

async function resolveMaintenanceCategoryId(
  client: DbClient,
  input: {
    facilityId: string;
    maintenanceCategoryId?: string | null;
    categoryKey?: string | null;
    repairTrade?: RepairTrade;
  },
): Promise<string | null> {
  await ensureDefaultMaintenanceCategories(input.facilityId, client);
  if (input.maintenanceCategoryId) {
    const category = await client.maintenanceCategory.findFirst({
      where: { id: input.maintenanceCategoryId, facilityId: input.facilityId },
    });
    if (!category) throw new Error("Maintenance category not found.");
    if (category.archivedAt) throw new Error("Cannot assign an archived maintenance category.");
    return category.id;
  }
  const key = input.categoryKey ?? mapRepairTradeToCategoryKey(input.repairTrade ?? "GENERAL");
  const category = await client.maintenanceCategory.findFirst({
    where: { facilityId: input.facilityId, key, archivedAt: null },
  });
  return category?.id ?? null;
}

export type CreateWorkOrderDirectInput = {
  facilityId: string;
  departmentId: string;
  unitId?: string;
  spaceId?: string | null;
  assetId?: string | null;
  issueId?: string | null;
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
  procedureVersionId?: string | null;
  maintenanceCategoryId?: string | null;
  categoryKey?: string | null;
  holdReason?: WorkOrderHoldReason | null;
  allowLocationOverride?: boolean;
};

/** Canonical create alias. Persistence remains Repair. */
export async function createWorkOrder(
  session: AppJwtPayload,
  input: CreateWorkOrderDirectInput & { client?: DbClient; now?: Date },
) {
  return createWorkOrderDirect(session, input);
}

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

  const location = await snapshotWorkOrderLocation(client, {
    facilityId: input.facilityId,
    assetId: input.assetId,
    issueId: input.issueId,
    unitId: input.unitId,
    spaceId: input.spaceId,
    allowLocationOverride: input.allowLocationOverride,
  });

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

  let linkedIssueId: string | null = null;
  if (input.issueId) {
    const issue = await client.assetIssue.findFirst({
      where: { id: input.issueId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!issue) throw new Error("Issue not found.");
    linkedIssueId = issue.id;
  }

  const repairTrade = input.repairTrade ?? "GENERAL";
  if (input.procedureVersionId) {
    await assertPublishedProcedurePin(client, {
      facilityId: input.facilityId,
      procedureVersionId: input.procedureVersionId,
    });
  }

  const maintenanceCategoryId = await resolveMaintenanceCategoryId(client, {
    facilityId: input.facilityId,
    maintenanceCategoryId: input.maintenanceCategoryId,
    categoryKey: input.categoryKey,
    repairTrade,
  });

  const suggested = await suggestRepairDepartmentIds(prisma, {
    facilityId: input.facilityId,
    unitId: location.unitId,
    assetId: location.assetId,
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
      assetId: location.assetId,
      unitId: location.unitId,
      spaceId: location.spaceId,
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
      issueId: linkedIssueId,
      procedureVersionId: input.procedureVersionId ?? null,
      maintenanceCategoryId,
      holdReason: null,
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
    procedureVersionId?: string | null;
    maintenanceCategoryId?: string | null;
    categoryKey?: string | null;
    spaceId?: string | null;
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
  if (!issue) throw new Error("Issue not found.");
  if (!OPEN_ASSET_ISSUE_STATUSES.includes(issue.status) && issue.status !== "RESOLVED") {
    throw new Error("Cannot create a Work Order from a closed or cancelled Issue.");
  }

  let vendorId = input.vendorId ?? null;
  if (!vendorId && issue.assetId) {
    const asset = await client.asset.findFirst({
      where: { id: issue.assetId, unit: { facilityId: input.facilityId } },
      select: { vendorId: true },
    });
    vendorId = resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: input.vendorId,
      assetPreferredVendorId: asset?.vendorId,
    });
  }

  const created = await createWorkOrderDirect(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: issue.unitId,
    spaceId: input.spaceId !== undefined ? input.spaceId : issue.spaceId,
    assetId: issue.assetId,
    issueId: issue.id,
    title: input.title?.trim() || issue.summary,
    description: input.description?.trim() || issue.description,
    priority: input.priority ?? issue.priority,
    repairTrade: input.repairTrade,
    procedureVersionId: input.procedureVersionId,
    maintenanceCategoryId: input.maintenanceCategoryId,
    categoryKey: input.categoryKey,
    vendorId,
    responsibleDepartmentId: input.responsibleDepartmentId,
    assignedEmployeeId: input.assignedEmployeeId,
    targetDate: input.targetDate,
    client,
    now: input.now,
  });

  // Compatibility dual-write: first Work Order only. Additional WOs use Repair.issueId.
  if (!issue.workOrderId) {
    await client.assetIssue.update({
      where: { id: issue.id },
      data: { workOrderId: created.id },
    });
  }

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

/**
 * Link an existing Work Order to an Issue. One Work Order → at most one Issue.
 * Dual-writes AssetIssue.workOrderId only when it is still empty (first WO).
 */
export async function linkWorkOrderToIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    issueId: string;
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

  const issue = await client.assetIssue.findFirst({
    where: {
      id: input.issueId,
      facilityId: input.facilityId,
    },
  });
  if (!issue) throw new Error("Issue not found.");

  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (repair.issueId && repair.issueId !== issue.id) {
    throw new Error("Work Order is already linked to a different Issue.");
  }

  const updated = await client.repair.update({
    where: { id: repair.id },
    data: { issueId: issue.id },
  });

  if (!issue.workOrderId) {
    await client.assetIssue.update({
      where: { id: issue.id },
      data: { workOrderId: repair.id },
    });
  }

  const actorUserId = sessionUserIdForFk(session);
  await client.assetIssueUpdate.create({
    data: {
      id: cuidLike(),
      issueId: issue.id,
      updateText: `Work Order ${repair.repairCode} linked`,
      statusAfterUpdate: issue.status,
      updatedByUserId: actorUserId,
    },
  });

  return updated;
}

export async function updateWorkOrderStatus(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    toStatus: RepairStatus;
    holdReason?: WorkOrderHoldReason | null;
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
  const stored = resolveStoredHoldWrite(input.toStatus, input.holdReason);

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const data: Prisma.RepairUpdateInput = {
    status: stored.status,
    holdReason: stored.holdReason,
  };
  if (stored.status === "IN_PROGRESS" && !repair.startedAt) {
    data.startedAt = now;
  }
  if (stored.status === "COMPLETED") {
    data.completedAt = now;
  }
  if (stored.status === "CANCELLED") {
    data.completedAt = repair.completedAt ?? now;
  }

  const updated = await client.repair.update({
    where: { id: repair.id },
    data,
  });

  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() || `Status changed to ${stored.status}`,
    statusAfterUpdate: stored.status,
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
        ? { status: "ON_HOLD" as RepairStatus, holdReason: "WAITING_FOR_VENDOR" as WorkOrderHoldReason }
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
      holdReason: null,
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

  const location = await snapshotWorkOrderLocation(client, {
    facilityId: input.facilityId,
    assetId: request.assetId,
    unitId: request.unitId,
    spaceId: request.spaceId,
  });
  const requestTrade = input.repairTrade ?? "GENERAL";
  const requestCategoryId = await resolveMaintenanceCategoryId(client, {
    facilityId: input.facilityId,
    repairTrade: requestTrade,
  });

  const created = await client.repair.create({
    data: {
      id: cuidLike(),
      repairCode,
      assetId: location.assetId,
      unitId: location.unitId,
      spaceId: location.spaceId,
      title: input.title?.trim() || request.summary,
      description: input.description?.trim() || request.description,
      priority: input.priority ?? request.priority,
      status: initialStatus,
      workOrderKind: "CORRECTIVE",
      repairTrade: requestTrade,
      issueType: "EQUIPMENT",
      requestingDepartmentId: request.requestingDepartmentId,
      responsibleDepartmentId: request.responsibleDepartmentId,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      vendorId: input.vendorId ?? null,
      targetDate: input.targetDate ?? null,
      requestedAt: now,
      reportedById: actorUserId,
      maintenanceCategoryId: requestCategoryId,
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

  const nextRequestStatus =
    request.status === "UNDER_REVIEW" ||
    request.status === "MONITORING" ||
    request.status === "REOPENED"
      ? request.status
      : "UNDER_REVIEW";

  await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      workOrderId: created.id,
      status: nextRequestStatus,
      requesterVisibleStatusSummary: requesterVisibleStatusLabel(nextRequestStatus),
    },
  });

  await client.operationalRequestUpdate.create({
    data: {
      id: cuidLike(),
      requestId: request.id,
      updateText: `Work Order ${created.repairCode} linked`,
      statusAfterUpdate: nextRequestStatus,
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

  let requestedStatus: RepairStatus;
  if (input.action === "START") requestedStatus = "IN_PROGRESS";
  else if (input.action === "WAITING_PARTS") requestedStatus = "WAITING_PARTS";
  else if (input.action === "WAITING_ON_VENDOR") requestedStatus = "WAITING_ON_VENDOR";
  else if (input.action === "COMPLETE") requestedStatus = "COMPLETED";
  else throw new Error("Unsupported Work Order action.");
  const storedHold = resolveStoredHoldWrite(requestedStatus);
  const toStatus = storedHold.status;

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
        holdReason: null,
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
  const data: Prisma.RepairUpdateInput = {
    status: toStatus,
    holdReason: storedHold.holdReason,
  };
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

  // Request authority stays intake/outcome. Linked Repair progress is projected, not stored.
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

export async function loadWorkOrder(
  session: AppJwtPayload,
  input: { facilityId: string; departmentId: string; repairId: string; client?: DbClient },
) {
  const client = input.client ?? prisma;
  await resolveWorkOrderActorAuthority(session, input.facilityId, input.departmentId, {
    repairId: input.repairId,
  });
  const repair = await client.repair.findFirst({
    where: { id: input.repairId, unit: { facilityId: input.facilityId } },
    include: {
      maintenanceCategory: true,
      procedureVersion: { select: { id: true, version: true, title: true, status: true } },
      vendor: true,
      assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!repair) throw new Error("Work Order not found.");
  return {
    workOrder: repair,
    presentation: presentWorkOrder(repair),
  };
}

export async function listWorkOrders(
  session: AppJwtPayload,
  input: { facilityId: string; departmentId: string; take?: number; client?: DbClient },
) {
  const client = input.client ?? prisma;
  await resolveWorkOrderActorAuthority(session, input.facilityId, input.departmentId);
  const rows = await client.repair.findMany({
    where: {
      unit: { facilityId: input.facilityId },
      OR: [
        { responsibleDepartmentId: input.departmentId },
        { requestingDepartmentId: input.departmentId },
      ],
    },
    include: { maintenanceCategory: true },
    orderBy: { requestedAt: "desc" },
    take: input.take ?? 80,
  });
  return rows.map((workOrder) => ({
    workOrder,
    presentation: presentWorkOrder(workOrder),
  }));
}

export async function holdWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    holdReason: WorkOrderHoldReason;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return updateWorkOrderStatus(session, {
    ...input,
    toStatus: "ON_HOLD",
  });
}

export async function linkEvidenceToWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    evidenceRecordId: string;
    note?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await resolveWorkOrderActorAuthority(session, input.facilityId, input.departmentId, {
    repairId: input.repairId,
  });
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const evidence = await client.operationalEvidenceRecord.findFirst({
    where: { id: input.evidenceRecordId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!evidence) throw new Error("Evidence record not found.");
  const existing = await client.repairEvidenceLink.findFirst({
    where: { repairId: repair.id, evidenceRecordId: evidence.id },
  });
  if (existing) return existing;
  return client.repairEvidenceLink.create({
    data: {
      id: cuidLike(),
      repairId: repair.id,
      evidenceRecordId: evidence.id,
      linkedByUserId: sessionUserIdForFk(session),
      note: input.note?.trim() || null,
    },
  });
}
