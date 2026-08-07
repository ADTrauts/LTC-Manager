/**
 * Phase 12A Operational Request service.
 * Completing a Work Order does not auto-close the Request or mutate Asset status.
 */

import type {
  AssetOperationalImpact,
  OperationalRequestStatus,
  Prisma,
  PrismaClient,
  RepairPriority,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { createWorkOrderFromOperationalRequest } from "@/lib/asset-operations/work-order-service";
import { prisma } from "@/lib/prisma";

import {
  requirePlantManageWorkOrders,
  requireReport,
  requireTriage,
  resolvePlantOperationsAuthority,
  resolveRequesterReportAuthority,
} from "./authority";
import { validateRoute } from "./routing-service";
import {
  OPEN_OPERATIONAL_REQUEST_STATUSES,
  requesterVisibleStatusLabel,
  type CreateOperationalRequestInput,
  type RequesterVisibleRequestStatus,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function nextRequestCode(client: DbClient): Promise<string> {
  // Prefer opaque unique codes — count-based OR-0000N races under parallel SQL suites.
  for (let i = 0; i < 12; i += 1) {
    const candidate = `OR-${cuidLike().slice(1, 9).toUpperCase()}`;
    const clash = await client.operationalRequest.findFirst({
      where: { requestCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `OR-${cuidLike().slice(1, 11).toUpperCase()}`;
}

async function appendUpdate(
  client: DbClient,
  input: {
    requestId: string;
    updateText: string;
    statusAfterUpdate: OperationalRequestStatus | null;
    updatedByUserId: string | null;
    updatedByEmployeeId?: string | null;
    requesterVisible?: boolean;
  },
) {
  await client.operationalRequestUpdate.create({
    data: {
      id: cuidLike(),
      requestId: input.requestId,
      updateText: input.updateText,
      statusAfterUpdate: input.statusAfterUpdate,
      updatedByUserId: input.updatedByUserId,
      updatedByEmployeeId: input.updatedByEmployeeId ?? null,
      requesterVisible: input.requesterVisible ?? false,
    },
  });
}

const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function detectObviousDuplicates(input: {
  facilityId: string;
  unitId: string;
  assetId?: string | null;
  summary: string;
  now?: Date;
  client?: DbClient;
}) {
  const client = input.client ?? prisma;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
  const summaryNorm = input.summary.trim().toLowerCase();

  const open = await client.operationalRequest.findMany({
    where: {
      facilityId: input.facilityId,
      unitId: input.unitId,
      status: { in: OPEN_OPERATIONAL_REQUEST_STATUSES },
      reportedAt: { gte: since },
      ...(input.assetId ? { assetId: input.assetId } : { assetId: null }),
    },
    select: {
      id: true,
      requestCode: true,
      summary: true,
      status: true,
      reportedAt: true,
    },
    take: 20,
  });

  return open.filter((r) => r.summary.trim().toLowerCase() === summaryNorm);
}

export async function createRequest(
  session: AppJwtPayload,
  input: CreateOperationalRequestInput & { client?: DbClient; now?: Date },
) {
  const client = input.client ?? prisma;
  const authority = await resolveRequesterReportAuthority(
    session,
    input.facilityId,
    input.requestingDepartmentId,
  );
  requireReport(authority);

  const routeCheck = await validateRoute({
    facilityId: input.facilityId,
    requestingDepartmentId: input.requestingDepartmentId,
    responsibleDepartmentId: input.responsibleDepartmentId,
    client,
  });
  if (!routeCheck.ok) throw new Error(routeCheck.reason);

  const unit = await client.unit.findFirst({
    where: { id: input.unitId, facilityId: input.facilityId, isActive: true },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");

  if (input.spaceId) {
    const space = await client.unitSpace.findFirst({
      where: {
        id: input.spaceId,
        facilityId: input.facilityId,
        OR: [{ unitId: input.unitId }, { unitId: null }],
      },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found.");
  }

  if (input.assetId) {
    const asset = await client.asset.findFirst({
      where: { id: input.assetId, unit: { facilityId: input.facilityId } },
      select: { id: true, unitId: true },
    });
    if (!asset) throw new Error("Asset not found.");
  }

  if (input.affectedDepartmentId) {
    const affected = await client.department.findFirst({
      where: {
        id: input.affectedDepartmentId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!affected) throw new Error("Affected department not found.");
  }

  if (input.clientCommandId) {
    const existing = await client.operationalRequest.findFirst({
      where: {
        facilityId: input.facilityId,
        requestingDepartmentId: input.requestingDepartmentId,
        clientCommandId: input.clientCommandId,
      },
    });
    if (existing) return existing;
  }

  const duplicates = await detectObviousDuplicates({
    facilityId: input.facilityId,
    unitId: input.unitId,
    assetId: input.assetId,
    summary: input.summary,
    now: input.now,
    client,
  });
  if (duplicates.length > 0 && !input.allowObviousDuplicate) {
    throw new Error(
      `Possible duplicate of open request ${duplicates[0]!.requestCode}. Confirm to continue.`,
    );
  }

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const requestCode = await nextRequestCode(client);
  const statusLabel = requesterVisibleStatusLabel("REPORTED");

  const created = await client.operationalRequest.create({
    data: {
      id: cuidLike(),
      requestCode,
      facilityId: input.facilityId,
      requestingDepartmentId: input.requestingDepartmentId,
      responsibleDepartmentId: input.responsibleDepartmentId,
      affectedDepartmentId: input.affectedDepartmentId ?? null,
      unitId: input.unitId,
      spaceId: input.spaceId ?? null,
      assetId: input.assetId ?? null,
      summary: input.summary.trim(),
      description: input.description.trim(),
      status: "REPORTED",
      priority: input.priority ?? "MEDIUM",
      operationalImpact: input.operationalImpact ?? "NO_IMMEDIATE_IMPACT",
      equipmentRemainsUsable:
        input.assetId == null
          ? null
          : input.equipmentRemainsUsable ?? true,
      observedAt: input.observedAt,
      reportedAt: now,
      requesterVisibleStatusSummary: statusLabel,
      workaroundInstruction: input.workaroundInstruction?.trim() || null,
      reportedByUserId: actorUserId,
      reportedByEmployeeId:
        session.authKind === "employee" ? session.uid : null,
      reportedByLabel: session.name ?? null,
      clientCommandId: input.clientCommandId ?? null,
      recordedOnline: input.recordedOnline ?? true,
      synchronizedAt: input.recordedOnline === false ? null : now,
      deviceBoundUnitId: input.deviceBoundUnitId ?? null,
      updates: {
        create: {
          id: cuidLike(),
          updateText: "Request reported",
          statusAfterUpdate: "REPORTED",
          updatedByUserId: actorUserId,
          requesterVisible: true,
        },
      },
    },
  });

  return created;
}

async function loadRequestScoped(
  client: DbClient,
  requestId: string,
  facilityId: string,
) {
  const request = await client.operationalRequest.findFirst({
    where: { id: requestId, facilityId },
  });
  if (!request) throw new Error("Operational Request not found.");
  return request;
}

export async function acknowledgeRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }
  if (request.status !== "REPORTED" && request.status !== "REOPENED") {
    return request;
  }

  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: "ACKNOWLEDGED",
      requesterVisibleStatusSummary: requesterVisibleStatusLabel("ACKNOWLEDGED"),
    },
  });
  await appendUpdate(client, {
    requestId: request.id,
    updateText: input.comment?.trim() || "Request acknowledged",
    statusAfterUpdate: "ACKNOWLEDGED",
    updatedByUserId: actorUserId,
    requesterVisible: true,
  });
  return updated;
}

export async function triageRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    priority?: RepairPriority;
    operationalImpact?: AssetOperationalImpact;
    triageNote?: string | null;
    requesterVisibleStatusSummary?: string | null;
    status?: Extract<
      OperationalRequestStatus,
      "UNDER_REVIEW" | "MONITORING" | "ACKNOWLEDGED"
    >;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }

  const nextStatus = input.status ?? "UNDER_REVIEW";
  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: nextStatus,
      priority: input.priority ?? request.priority,
      operationalImpact: input.operationalImpact ?? request.operationalImpact,
      triageNote:
        input.triageNote !== undefined
          ? input.triageNote?.trim() || null
          : request.triageNote,
      requesterVisibleStatusSummary:
        input.requesterVisibleStatusSummary?.trim() ||
        requesterVisibleStatusLabel(nextStatus),
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText: "Request triaged",
    statusAfterUpdate: nextStatus,
    updatedByUserId: actorUserId,
    requesterVisible: Boolean(input.requesterVisibleStatusSummary),
  });

  return updated;
}

export async function rerouteRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    responsibleDepartmentId: string;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }

  const routeCheck = await validateRoute({
    facilityId: input.facilityId,
    requestingDepartmentId: request.requestingDepartmentId,
    responsibleDepartmentId: input.responsibleDepartmentId,
    client,
  });
  if (!routeCheck.ok) throw new Error(routeCheck.reason);

  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      responsibleDepartmentId: input.responsibleDepartmentId,
      // Never rewrite requesting department, reporter, location, or original asset.
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText:
      input.comment?.trim() ||
      `Rerouted to department ${input.responsibleDepartmentId}`,
    statusAfterUpdate: request.status,
    updatedByUserId: actorUserId,
    requesterVisible: false,
  });

  return updated;
}

export async function linkAsset(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    assetId: string;
    relatedAssetIssueId?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  const asset = await client.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: { id: true },
  });
  if (!asset) throw new Error("Asset not found.");

  if (input.relatedAssetIssueId) {
    const issue = await client.assetIssue.findFirst({
      where: {
        id: input.relatedAssetIssueId,
        facilityId: input.facilityId,
        assetId: input.assetId,
      },
      select: { id: true },
    });
    if (!issue) throw new Error("Asset Issue not found for this Asset.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      assetId: input.assetId,
      relatedAssetIssueId: input.relatedAssetIssueId ?? request.relatedAssetIssueId,
      equipmentRemainsUsable: request.equipmentRemainsUsable ?? true,
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText: "Asset linked to request",
    statusAfterUpdate: request.status,
    updatedByUserId: actorUserId,
    requesterVisible: false,
  });

  return updated;
}

export async function createWorkOrderFromRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    title?: string | null;
    description?: string | null;
    priority?: RepairPriority;
    assignedEmployeeId?: string | null;
    vendorId?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requirePlantManageWorkOrders(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }
  if (request.workOrderId) {
    const existing = await client.repair.findFirst({ where: { id: request.workOrderId } });
    if (existing) return { request, workOrder: existing };
  }

  const workOrder = await createWorkOrderFromOperationalRequest(session, {
    facilityId: input.facilityId,
    plantDepartmentId: input.plantDepartmentId,
    requestId: request.id,
    title: input.title,
    description: input.description,
    priority: input.priority,
    assignedEmployeeId: input.assignedEmployeeId,
    vendorId: input.vendorId,
    client,
    now: input.now,
  });

  return { request: await loadRequestScoped(client, request.id, input.facilityId), workOrder };
}

export async function resolveWithoutWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    resolutionReason: string;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  const now = input.now ?? new Date();
  const actorUserId = sessionUserIdForFk(session);

  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: "RESOLVED",
      resolutionReason: input.resolutionReason.trim(),
      resolvedAt: now,
      requesterVisibleStatusSummary: requesterVisibleStatusLabel("RESOLVED"),
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText: input.resolutionReason.trim(),
    statusAfterUpdate: "RESOLVED",
    updatedByUserId: actorUserId,
    requesterVisible: true,
  });

  return updated;
}

export async function reopenRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    comment?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  if (request.status !== "RESOLVED" && request.status !== "CLOSED" && request.status !== "CANCELLED") {
    throw new Error("Only resolved, closed, or cancelled requests can be reopened.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: "REOPENED",
      resolvedAt: null,
      closedAt: null,
      requesterVisibleStatusSummary: requesterVisibleStatusLabel("REOPENED"),
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText: input.comment?.trim() || "Request reopened",
    statusAfterUpdate: "REOPENED",
    updatedByUserId: actorUserId,
    requesterVisible: true,
  });

  return updated;
}

export async function closeRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePlantOperationsAuthority(
    session,
    input.facilityId,
    input.plantDepartmentId,
  );
  requireTriage(authority);

  const request = await loadRequestScoped(client, input.requestId, input.facilityId);
  const now = input.now ?? new Date();
  const actorUserId = sessionUserIdForFk(session);

  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: "CLOSED",
      closedAt: now,
      resolvedAt: request.resolvedAt ?? now,
      requesterVisibleStatusSummary: requesterVisibleStatusLabel("CLOSED"),
    },
  });

  await appendUpdate(client, {
    requestId: request.id,
    updateText: input.comment?.trim() || "Request closed",
    statusAfterUpdate: "CLOSED",
    updatedByUserId: actorUserId,
    requesterVisible: true,
  });

  return updated;
}

export async function linkEvidence(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    requestId: string;
    evidenceRecordId: string;
    note?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const request = await loadRequestScoped(client, input.requestId, input.facilityId);

  const evidence = await client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.evidenceRecordId,
      facilityId: input.facilityId,
    },
    select: { id: true },
  });
  if (!evidence) throw new Error("Evidence record not found.");

  const actorUserId = sessionUserIdForFk(session);
  return client.operationalRequestEvidenceLink.upsert({
    where: {
      requestId_evidenceRecordId: {
        requestId: request.id,
        evidenceRecordId: input.evidenceRecordId,
      },
    },
    create: {
      id: cuidLike(),
      requestId: request.id,
      evidenceRecordId: input.evidenceRecordId,
      linkedByUserId: actorUserId,
      note: input.note?.trim() || null,
    },
    update: {
      note: input.note !== undefined ? input.note?.trim() || null : undefined,
    },
  });
}

/**
 * Requester-visible status — strips triage notes, vendor details, and private history.
 */
export async function loadRequesterVisibleStatus(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    requestingDepartmentId: string;
    requestId: string;
  },
): Promise<RequesterVisibleRequestStatus> {
  const authority = await resolveRequesterReportAuthority(
    session,
    input.facilityId,
    input.requestingDepartmentId,
  );
  if (!authority.canViewRequesterStatus) {
    throw new Error(authority.reason ?? "Requester status view denied.");
  }

  const request = await prisma.operationalRequest.findFirst({
    where: {
      id: input.requestId,
      facilityId: input.facilityId,
      requestingDepartmentId: input.requestingDepartmentId,
    },
    include: {
      unit: { select: { name: true } },
      asset: { select: { name: true } },
      workOrder: { select: { repairCode: true, status: true } },
      updates: {
        where: { requesterVisible: true },
        orderBy: { updatedAt: "asc" },
        select: {
          updateText: true,
          statusAfterUpdate: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!request) throw new Error("Operational Request not found.");

  return {
    requestId: request.id,
    requestCode: request.requestCode,
    status: request.status,
    statusLabel: requesterVisibleStatusLabel(request.status),
    summary: request.summary,
    requesterVisibleStatusSummary: request.requesterVisibleStatusSummary,
    workaroundInstruction: request.workaroundInstruction,
    priority: request.priority,
    operationalImpact: request.operationalImpact,
    observedAt: request.observedAt.toISOString(),
    reportedAt: request.reportedAt.toISOString(),
    unitName: request.unit.name,
    assetName: request.asset?.name ?? null,
    updates: request.updates.map((u) => ({
      updateText: u.updateText,
      statusAfterUpdate: u.statusAfterUpdate,
      updatedAt: u.updatedAt.toISOString(),
    })),
    workOrderCode: request.workOrder?.repairCode ?? null,
    workOrderStatus: request.workOrder?.status ?? null,
  };
}

export async function listPlantTriageQueue(input: {
  facilityId: string;
  plantDepartmentId: string;
  status?: OperationalRequestStatus[];
  requestingDepartmentId?: string | null;
  priority?: RepairPriority | null;
  take?: number;
}) {
  return prisma.operationalRequest.findMany({
    where: {
      facilityId: input.facilityId,
      responsibleDepartmentId: input.plantDepartmentId,
      ...(input.status ? { status: { in: input.status } } : {}),
      ...(input.requestingDepartmentId
        ? { requestingDepartmentId: input.requestingDepartmentId }
        : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    include: {
      requestingDepartment: { select: { id: true, name: true, key: true } },
      unit: { select: { id: true, name: true } },
      asset: { select: { id: true, name: true, status: true } },
      workOrder: {
        select: {
          id: true,
          repairCode: true,
          status: true,
          assignedEmployeeId: true,
          assignedEmployee: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { reportedAt: "asc" }],
    take: input.take ?? 100,
  });
}
