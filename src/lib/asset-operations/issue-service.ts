/**
 * Issue services.
 *
 * AssetIssue is the Issue store: a known undesirable condition.
 * It is not a Request and not a Work Order.
 * Never auto-creates a Repair / Work Order or an OperationalRequest.
 * Asset is optional. Location (unitId) is required and snapshotted at create.
 */

import type {
  AssetIssueStatus,
  AssetOperationalImpact,
  Prisma,
  PrismaClient,
  RepairPriority,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  requireTriage,
  resolvePlantOperationsAuthority,
} from "@/lib/operational-requests/authority";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import {
  requireAssetReport,
  requireAssetTriage,
  resolveAssetOperationsAuthority,
} from "./authority";
import { issueStatusesForListView, type IssueListView } from "./issue-semantics";
import {
  normalizeAssetStatus,
  OPEN_ASSET_ISSUE_STATUSES,
  type ReportAssetIssueInput,
  type ReportIssueInput,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function normalizeSummary(summary: string): string {
  return summary.trim().toLowerCase().replace(/\s+/g, " ");
}

async function nextIssueCode(client: DbClient): Promise<string> {
  const count = await client.assetIssue.count();
  let candidate = `AI-${String(count + 1).padStart(5, "0")}`;
  for (let i = 0; i < 8; i += 1) {
    const clash = await client.assetIssue.findFirst({
      where: { issueCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `AI-${String(count + 1 + i + 1).padStart(5, "0")}`;
  }
  return `AI-${cuidLike().slice(1, 9).toUpperCase()}`;
}

async function appendIssueUpdate(
  client: DbClient,
  input: {
    issueId: string;
    updateText: string;
    statusAfterUpdate: AssetIssueStatus | null;
    updatedByUserId: string | null;
    updatedByEmployeeId: string | null;
  },
) {
  await client.assetIssueUpdate.create({
    data: {
      id: cuidLike(),
      issueId: input.issueId,
      updateText: input.updateText,
      statusAfterUpdate: input.statusAfterUpdate,
      updatedByUserId: input.updatedByUserId,
      updatedByEmployeeId: input.updatedByEmployeeId,
    },
  });
}

async function loadIssueScoped(
  client: DbClient,
  issueId: string,
  facilityId: string,
  departmentId?: string,
) {
  const issue = await client.assetIssue.findFirst({
    where: {
      id: issueId,
      facilityId,
      ...(departmentId ? { departmentId } : {}),
    },
  });
  if (!issue) throw new Error("Issue not found.");
  return issue;
}

function actorIds(session: AppJwtPayload, employeeId: string | null) {
  return {
    userId: sessionUserIdForFk(session),
    employeeId: session.authKind === "employee" ? session.uid : employeeId,
    label: session.name?.trim() || null,
  };
}

async function assertSpaceInFacility(
  client: DbClient,
  input: { facilityId: string; unitId: string; spaceId: string },
) {
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

async function snapshotIssueLocation(
  client: DbClient,
  input: {
    facilityId: string;
    assetId?: string | null;
    unitId?: string | null;
    spaceId?: string | null;
    allowUnitScopeOverride?: boolean;
  },
): Promise<{ assetId: string | null; unitId: string; spaceId: string | null }> {
  let asset: {
    id: string;
    unitId: string;
    spaceId: string | null;
    status: string;
  } | null = null;

  if (input.assetId) {
    asset = await client.asset.findFirst({
      where: { id: input.assetId, unit: { facilityId: input.facilityId } },
      select: { id: true, unitId: true, spaceId: true, status: true },
    });
    if (!asset) throw new Error("Asset not found.");
    if (normalizeAssetStatus(asset.status) === "RETIRED") {
      throw new Error("Cannot report Issues against a retired Asset.");
    }
  }

  const unitId = input.unitId?.trim() || asset?.unitId || null;
  if (!unitId) throw new Error("Issue unit is required.");

  if (asset && unitId !== asset.unitId) {
    if (!input.allowUnitScopeOverride) {
      throw new Error("Issue unit scope must match the Asset unit unless explicitly overridden.");
    }
  }

  const unit = await client.unit.findFirst({
    where: { id: unitId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");

  const spaceId =
    input.spaceId !== undefined ? input.spaceId : (asset?.spaceId ?? null);
  if (spaceId) {
    await assertSpaceInFacility(client, {
      facilityId: input.facilityId,
      unitId,
      spaceId,
    });
  }

  return { assetId: asset?.id ?? null, unitId, spaceId };
}

/**
 * Report a canonical Issue. Asset optional. Location snapshotted at create.
 * Idempotent on facilityId+departmentId+clientCommandId.
 * Does not create a Request or Work Order.
 */
export async function reportIssue(
  session: AppJwtPayload,
  input: ReportIssueInput & {
    allowUnitScopeOverride?: boolean;
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
  requireAssetReport(authority);

  const clientCommandId = input.clientCommandId?.trim() || null;
  if (clientCommandId) {
    const existing = await client.assetIssue.findFirst({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        clientCommandId,
      },
      include: { updates: { orderBy: { updatedAt: "asc" }, take: 20 } },
    });
    if (existing) return { issue: existing, duplicateOf: null as string | null, idempotent: true };
  }

  const department = await client.department.findFirst({
    where: {
      id: input.departmentId,
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!department) throw new Error("Department not found.");

  const location = await snapshotIssueLocation(client, {
    facilityId: input.facilityId,
    assetId: input.assetId,
    unitId: input.unitId,
    spaceId: input.spaceId,
    allowUnitScopeOverride: input.allowUnitScopeOverride,
  });

  const summary = input.summary.trim();
  if (summary.length < 3) throw new Error("Issue summary is required.");
  const description = input.description.trim();
  if (description.length < 3) throw new Error("Issue description is required.");

  const normalized = normalizeSummary(summary);
  const operationalImpact: AssetOperationalImpact =
    input.operationalImpact ?? "NO_IMMEDIATE_IMPACT";

  if (!input.allowDuplicateOpen && location.assetId) {
    const openDupes = await client.assetIssue.findMany({
      where: {
        facilityId: input.facilityId,
        assetId: location.assetId,
        status: { in: OPEN_ASSET_ISSUE_STATUSES },
      },
      select: {
        id: true,
        summary: true,
        operationalImpact: true,
        status: true,
        issueCode: true,
      },
      take: 40,
    });
    const duplicate = openDupes.find(
      (row) =>
        normalizeSummary(row.summary) === normalized ||
        (operationalImpact === "EQUIPMENT_UNAVAILABLE" &&
          row.operationalImpact === "EQUIPMENT_UNAVAILABLE"),
    );
    if (duplicate) {
      const existing = await client.assetIssue.findFirstOrThrow({
        where: { id: duplicate.id },
        include: { updates: { orderBy: { updatedAt: "asc" }, take: 20 } },
      });
      return { issue: existing, duplicateOf: duplicate.id, idempotent: false };
    }
  }

  const originEvidenceRecordId =
    input.originEvidenceRecordId?.trim() || input.evidenceRecordId?.trim() || null;
  if (originEvidenceRecordId) {
    const evidence = await client.operationalEvidenceRecord.findFirst({
      where: {
        id: originEvidenceRecordId,
        facilityId: input.facilityId,
      },
      select: { id: true },
    });
    if (!evidence) throw new Error("Evidence record not found.");
  }
  if (input.evidenceRecordId && input.evidenceRecordId !== originEvidenceRecordId) {
    const linked = await client.operationalEvidenceRecord.findFirst({
      where: {
        id: input.evidenceRecordId,
        facilityId: input.facilityId,
      },
      select: { id: true },
    });
    if (!linked) throw new Error("Evidence record not found.");
  }

  const employeeId = await getOperationalEmployeeIdForSession(session);
  const actors = actorIds(session, employeeId);
  const now = input.now ?? new Date();
  const issueCode = await nextIssueCode(client);
  const priority: RepairPriority = input.priority ?? "MEDIUM";

  const created = await client.assetIssue.create({
    data: {
      id: cuidLike(),
      issueCode,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      assetId: location.assetId,
      unitId: location.unitId,
      spaceId: location.spaceId,
      summary,
      description,
      status: "REPORTED",
      priority,
      operationalImpact,
      equipmentRemainsUsable: input.equipmentRemainsUsable ?? true,
      workaroundInstruction: input.workaroundInstruction?.trim() || null,
      observedAt: input.observedAt,
      reportedAt: now,
      synchronizedAt: input.recordedOnline === false ? null : now,
      recordedOnline: input.recordedOnline !== false,
      clientCommandId,
      deviceBoundUnitId: input.deviceBoundUnitId ?? null,
      reportedByUserId: actors.userId,
      reportedByEmployeeId: actors.employeeId,
      reportedByLabel: actors.label,
      originEvidenceRecordId,
      updates: {
        create: {
          id: cuidLike(),
          updateText: input.comment?.trim() || "Issue reported",
          statusAfterUpdate: "REPORTED",
          updatedByUserId: actors.userId,
          updatedByEmployeeId: actors.employeeId,
        },
      },
      ...(input.evidenceRecordId
        ? {
            evidenceLinks: {
              create: {
                id: cuidLike(),
                evidenceRecordId: input.evidenceRecordId,
                linkedByUserId: actors.userId,
                note: "Linked at report time",
              },
            },
          }
        : {}),
    },
    include: { updates: { orderBy: { updatedAt: "asc" }, take: 20 } },
  });

  return { issue: created, duplicateOf: null as string | null, idempotent: false };
}

/**
 * Dietary / Asset-ops report path. Asset remains required at this layer.
 */
export async function reportAssetIssue(
  session: AppJwtPayload,
  input: ReportAssetIssueInput & {
    allowUnitScopeOverride?: boolean;
    client?: DbClient;
    now?: Date;
  },
) {
  if (!input.assetId) throw new Error("Asset is required.");
  return reportIssue(session, input);
}

/**
 * Create an Issue from an accepted Request. Does not create a Work Order.
 * Does not rewrite Request execution status.
 */
export async function createIssueFromRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    summary?: string | null;
    description?: string | null;
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

  const request = await client.operationalRequest.findFirst({
    where: { id: input.requestId, facilityId: input.facilityId },
  });
  if (!request) throw new Error("Request not found.");
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }
  if (request.relatedAssetIssueId) {
    const existing = await client.assetIssue.findFirst({
      where: { id: request.relatedAssetIssueId, facilityId: input.facilityId },
      include: { updates: { orderBy: { updatedAt: "asc" }, take: 20 } },
    });
    if (existing) return { issue: existing, request, created: false };
  }

  const location = await snapshotIssueLocation(client, {
    facilityId: input.facilityId,
    assetId: request.assetId,
    unitId: request.unitId,
    spaceId: request.spaceId,
    allowUnitScopeOverride: true,
  });

  const employeeId = await getOperationalEmployeeIdForSession(session);
  const actors = actorIds(session, employeeId);
  const now = input.now ?? new Date();
  const issueCode = await nextIssueCode(client);
  const summary = (input.summary?.trim() || request.summary).trim();
  const description = (input.description?.trim() || request.description).trim();

  const issue = await client.assetIssue.create({
    data: {
      id: cuidLike(),
      issueCode,
      facilityId: input.facilityId,
      departmentId: input.plantDepartmentId,
      assetId: location.assetId,
      unitId: location.unitId,
      spaceId: location.spaceId,
      summary,
      description,
      status: "REPORTED",
      priority: request.priority,
      operationalImpact: request.operationalImpact,
      equipmentRemainsUsable: request.equipmentRemainsUsable ?? true,
      observedAt: request.observedAt,
      reportedAt: now,
      reportedByUserId: actors.userId,
      reportedByEmployeeId: actors.employeeId,
      reportedByLabel: actors.label,
      updates: {
        create: {
          id: cuidLike(),
          updateText: `Created from Request ${request.requestCode}`,
          statusAfterUpdate: "REPORTED",
          updatedByUserId: actors.userId,
          updatedByEmployeeId: actors.employeeId,
        },
      },
    },
    include: { updates: { orderBy: { updatedAt: "asc" }, take: 20 } },
  });

  const updatedRequest = await client.operationalRequest.update({
    where: { id: request.id },
    data: { relatedAssetIssueId: issue.id },
  });
  await client.operationalRequestUpdate.create({
    data: {
      id: cuidLike(),
      requestId: request.id,
      updateText: `Linked to Issue ${issue.issueCode}`,
      statusAfterUpdate: request.status,
      updatedByUserId: actors.userId,
      requesterVisible: false,
    },
  });

  return { issue, request: updatedRequest, created: true };
}

/**
 * Explicitly link a Request to an existing Issue (duplicate reports).
 * Does not mutate Issue location.
 */
export async function linkRequestToIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    issueId: string;
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

  const request = await client.operationalRequest.findFirst({
    where: { id: input.requestId, facilityId: input.facilityId },
  });
  if (!request) throw new Error("Request not found.");
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }

  const issue = await client.assetIssue.findFirst({
    where: { id: input.issueId, facilityId: input.facilityId },
  });
  if (!issue) throw new Error("Issue not found.");

  if (request.relatedAssetIssueId === issue.id) {
    return { request, issue };
  }

  const updatedRequest = await client.operationalRequest.update({
    where: { id: request.id },
    data: { relatedAssetIssueId: issue.id },
  });
  await client.operationalRequestUpdate.create({
    data: {
      id: cuidLike(),
      requestId: request.id,
      updateText: `Linked to Issue ${issue.issueCode}`,
      statusAfterUpdate: request.status,
      updatedByUserId: sessionUserIdForFk(session),
      requesterVisible: false,
    },
  });

  return { request: updatedRequest, issue };
}

export async function getIssueWorkOrders(
  session: AppJwtPayload,
  input: { facilityId: string; departmentId: string; issueId: string },
) {
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime && !authority.canTriageIssue) {
    throw new Error(authority.reason ?? "Issue Work Orders denied.");
  }

  const issue = await loadIssueScoped(
    prisma,
    input.issueId,
    input.facilityId,
    input.departmentId,
  );

  return prisma.repair.findMany({
    where: {
      OR: [{ issueId: issue.id }, { id: issue.workOrderId ?? "__none__" }],
      unit: { facilityId: input.facilityId },
    },
    orderBy: { requestedAt: "asc" },
    select: {
      id: true,
      repairCode: true,
      title: true,
      status: true,
      priority: true,
      issueId: true,
      requestedAt: true,
      completedAt: true,
    },
  });
}

async function transitionIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    toStatus: AssetIssueStatus;
    updateText: string;
    triageNote?: string | null;
    resolutionReason?: string | null;
    requireTriage?: boolean;
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
  if (input.requireTriage !== false) {
    requireAssetTriage(authority);
  } else {
    requireAssetReport(authority);
  }

  const issue = await loadIssueScoped(
    client,
    input.issueId,
    input.facilityId,
    input.departmentId,
  );

  const employeeId = await getOperationalEmployeeIdForSession(session);
  const actors = actorIds(session, employeeId);
  const now = input.now ?? new Date();

  const data: Prisma.AssetIssueUpdateInput = {
    status: input.toStatus,
  };
  if (input.triageNote !== undefined) {
    data.triageNote = input.triageNote?.trim() || null;
  }
  if (input.resolutionReason !== undefined) {
    data.resolutionReason = input.resolutionReason?.trim() || null;
  }
  if (input.toStatus === "RESOLVED") {
    data.resolvedAt = now;
  }
  if (input.toStatus === "CLOSED" || input.toStatus === "CANCELLED") {
    data.closedAt = now;
  }
  if (input.toStatus === "REPORTED" || input.toStatus === "ACKNOWLEDGED") {
    // reopen path clears terminal stamps
    if (issue.status === "RESOLVED" || issue.status === "CLOSED" || issue.status === "CANCELLED") {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }

  const updated = await client.assetIssue.update({
    where: { id: issue.id },
    data,
  });

  await appendIssueUpdate(client, {
    issueId: issue.id,
    updateText: input.updateText,
    statusAfterUpdate: input.toStatus,
    updatedByUserId: actors.userId,
    updatedByEmployeeId: actors.employeeId,
  });

  return updated;
}

export async function acknowledgeIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "ACKNOWLEDGED",
    updateText: input.comment?.trim() || "Issue acknowledged",
  });
}

export async function triageIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    triageNote?: string | null;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "TRIAGED",
    triageNote: input.triageNote,
    updateText: input.comment?.trim() || input.triageNote?.trim() || "Issue triaged",
  });
}

export async function markMonitoring(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "MONITORING",
    updateText: input.comment?.trim() || "Marked for monitoring",
  });
}

export async function resolveIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    resolutionReason?: string | null;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "RESOLVED",
    resolutionReason: input.resolutionReason,
    updateText:
      input.comment?.trim() ||
      input.resolutionReason?.trim() ||
      "Issue resolved",
  });
}

export async function closeIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    resolutionReason?: string | null;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "CLOSED",
    resolutionReason: input.resolutionReason,
    updateText: input.comment?.trim() || "Issue closed",
  });
}

export async function cancelIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    resolutionReason?: string | null;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return transitionIssue(session, {
    ...input,
    toStatus: "CANCELLED",
    resolutionReason: input.resolutionReason,
    updateText: input.comment?.trim() || "Issue canceled",
  });
}

export async function reopenIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    comment?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const issue = await loadIssueScoped(
    client,
    input.issueId,
    input.facilityId,
    input.departmentId,
  );
  if (
    issue.status !== "RESOLVED" &&
    issue.status !== "CLOSED" &&
    issue.status !== "CANCELLED"
  ) {
    throw new Error("Only resolved, closed, or cancelled Issues can be reopened.");
  }
  return transitionIssue(session, {
    ...input,
    toStatus: "REPORTED",
    updateText: input.comment?.trim() || "Issue reopened",
  });
}

export async function linkEvidenceToIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    evidenceRecordId: string;
    note?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireAssetReport(authority);

  const issue = await loadIssueScoped(
    client,
    input.issueId,
    input.facilityId,
    input.departmentId,
  );

  const evidence = await client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.evidenceRecordId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    select: { id: true },
  });
  if (!evidence) throw new Error("Evidence record not found.");

  const existing = await client.assetIssueEvidenceLink.findFirst({
    where: { issueId: issue.id, evidenceRecordId: evidence.id },
  });
  if (existing) return existing;

  return client.assetIssueEvidenceLink.create({
    data: {
      id: cuidLike(),
      issueId: issue.id,
      evidenceRecordId: evidence.id,
      linkedByUserId: sessionUserIdForFk(session),
      note: input.note?.trim() || null,
    },
  });
}

export async function listIssuesForDepartment(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    status?: AssetIssueStatus[] | "OPEN" | "ALL";
    view?: IssueListView | string | null;
    assetId?: string | null;
    unitId?: string | null;
    q?: string | null;
    take?: number;
  },
) {
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime && !authority.canTriageIssue) {
    throw new Error(authority.reason ?? "Issue list denied.");
  }

  const q = input.q?.trim() || "";
  const statusFilter =
    input.view
      ? { in: issueStatusesForListView(input.view) }
      : input.status === "ALL"
        ? undefined
        : input.status === "OPEN" || input.status === undefined
          ? { in: OPEN_ASSET_ISSUE_STATUSES }
          : { in: input.status };

  return prisma.assetIssue.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(input.assetId ? { assetId: input.assetId } : {}),
      ...(input.unitId ? { unitId: input.unitId } : {}),
      ...(q
        ? {
            OR: [
              { issueCode: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ priority: "desc" }, { reportedAt: "desc" }],
    take: input.take ?? 100,
    select: {
      id: true,
      issueCode: true,
      summary: true,
      status: true,
      priority: true,
      operationalImpact: true,
      equipmentRemainsUsable: true,
      reportedAt: true,
      observedAt: true,
      assetId: true,
      unitId: true,
      spaceId: true,
      workOrderId: true,
      asset: { select: { id: true, assetCode: true, name: true, status: true } },
      unit: { select: { id: true, name: true } },
      space: { select: { id: true, name: true } },
      _count: {
        select: {
          workOrders: true,
          relatedFromOperationalRequests: true,
        },
      },
      workOrders: {
        select: { id: true, status: true },
        take: 20,
      },
    },
  });
}

export async function getIssueDetail(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
  },
) {
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime && !authority.canTriageIssue) {
    throw new Error(authority.reason ?? "Issue detail denied.");
  }

  const issue = await prisma.assetIssue.findFirst({
    where: {
      id: input.issueId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      asset: {
        select: {
          id: true,
          assetCode: true,
          name: true,
          status: true,
          equipmentType: true,
          unitId: true,
          vendorId: true,
          vendor: { select: { id: true, name: true, phone: true } },
          responsibleOrganization: { select: { id: true, name: true, isActive: true } },
          department: { select: { id: true, name: true } },
        },
      },
      unit: { select: { id: true, name: true } },
      space: { select: { id: true, name: true } },
      workOrder: {
        select: {
          id: true,
          repairCode: true,
          title: true,
          status: true,
          priority: true,
          holdReason: true,
          returnToServiceReady: true,
          assignedEmployee: { select: { firstName: true, lastName: true } },
          maintenanceCategory: { select: { key: true, label: true } },
        },
      },
      workOrders: {
        orderBy: { requestedAt: "asc" },
        select: {
          id: true,
          repairCode: true,
          title: true,
          status: true,
          priority: true,
          holdReason: true,
          returnToServiceReady: true,
          requestedAt: true,
          assignedEmployeeId: true,
          assignedEmployee: { select: { firstName: true, lastName: true } },
          maintenanceCategory: { select: { key: true, label: true } },
        },
      },
      relatedFromOperationalRequests: {
        orderBy: { reportedAt: "asc" },
        select: {
          id: true,
          requestCode: true,
          summary: true,
          status: true,
          reportedAt: true,
          requestingDepartment: { select: { name: true } },
        },
      },
      originEvidenceRecord: {
        select: {
          id: true,
          templateName: true,
          status: true,
          occurredAt: true,
          outOfStandard: true,
        },
      },
      updates: { orderBy: { updatedAt: "asc" } },
      evidenceLinks: {
        include: {
          evidenceRecord: {
            select: {
              id: true,
              templateName: true,
              status: true,
              occurredAt: true,
              outOfStandard: true,
            },
          },
        },
      },
    },
  });
  if (!issue) throw new Error("Issue not found.");

  return {
    ...issue,
    triageNote: authority.canViewManagementNotes ? issue.triageNote : null,
  };
}
