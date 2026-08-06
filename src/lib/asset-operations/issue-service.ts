/**
 * Phase 10A Asset Issue services (reported condition — not a Work Order).
 * Never auto-creates a Repair / Work Order.
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
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import {
  requireAssetReport,
  requireAssetTriage,
  resolveAssetOperationsAuthority,
} from "./authority";
import {
  normalizeAssetStatus,
  OPEN_ASSET_ISSUE_STATUSES,
  type ReportAssetIssueInput,
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
  if (!issue) throw new Error("Asset Issue not found.");
  return issue;
}

function actorIds(session: AppJwtPayload, employeeId: string | null) {
  return {
    userId: sessionUserIdForFk(session),
    employeeId: session.authKind === "employee" ? session.uid : employeeId,
    label: session.name?.trim() || null,
  };
}

/**
 * Report an Asset Issue. Idempotent on facilityId+departmentId+clientCommandId.
 * Detects clearly open duplicates unless allowDuplicateOpen.
 */
export async function reportAssetIssue(
  session: AppJwtPayload,
  input: ReportAssetIssueInput & {
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

  const asset = await client.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: {
      id: true,
      unitId: true,
      spaceId: true,
      status: true,
      departmentId: true,
      unit: { select: { facilityId: true } },
    },
  });
  if (!asset) throw new Error("Asset not found.");
  if (normalizeAssetStatus(asset.status) === "RETIRED") {
    throw new Error("Cannot report Issues against a retired Asset.");
  }

  const unitId = input.unitId;
  if (unitId !== asset.unitId) {
    if (!input.allowUnitScopeOverride) {
      throw new Error("Issue unit scope must match the Asset unit unless explicitly overridden.");
    }
    const overrideUnit = await client.unit.findFirst({
      where: { id: unitId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!overrideUnit) {
      throw new Error("Override unit not found in this facility.");
    }
  } else {
    const unit = await client.unit.findFirst({
      where: { id: unitId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!unit) throw new Error("Unit not found.");
  }

  if (input.spaceId) {
    const space = await client.unitSpace.findFirst({
      where: {
        id: input.spaceId,
        facilityId: input.facilityId,
        OR: [{ unitId }, { unitId: null }],
      },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found.");
  }

  const summary = input.summary.trim();
  if (summary.length < 3) throw new Error("Issue summary is required.");
  const description = input.description.trim();
  if (description.length < 3) throw new Error("Issue description is required.");

  const normalized = normalizeSummary(summary);
  const operationalImpact: AssetOperationalImpact =
    input.operationalImpact ?? "NO_IMMEDIATE_IMPACT";

  if (!input.allowDuplicateOpen) {
    const openDupes = await client.assetIssue.findMany({
      where: {
        facilityId: input.facilityId,
        assetId: input.assetId,
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

  if (input.evidenceRecordId) {
    const evidence = await client.operationalEvidenceRecord.findFirst({
      where: {
        id: input.evidenceRecordId,
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      },
      select: { id: true },
    });
    if (!evidence) throw new Error("Evidence record not found.");
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
      assetId: input.assetId,
      unitId,
      spaceId: input.spaceId ?? asset.spaceId ?? null,
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
    assetId?: string | null;
    unitId?: string | null;
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

  const statusFilter =
    input.status === "ALL"
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
      workOrderId: true,
      asset: { select: { id: true, assetCode: true, name: true, status: true } },
      unit: { select: { id: true, name: true } },
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
          returnToServiceReady: true,
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
  if (!issue) throw new Error("Asset Issue not found.");

  return {
    ...issue,
    triageNote: authority.canViewManagementNotes ? issue.triageNote : null,
  };
}
