/**
 * Phase 3C corrective-maintenance orchestration.
 *
 * Request, Issue, and Work Order remain separate records and facts.
 * Completing a Work Order never resolves an Issue, closes a Request,
 * or restores an Asset. Those remain explicit supervisor actions.
 */

import type {
  Prisma,
  PrismaClient,
  RepairPriority,
  WorkOrderHoldReason,
} from "@prisma/client";

import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import {
  closeRequest,
  resolveWithoutWorkOrder,
  triageRequest,
} from "@/lib/operational-requests/request-service";
import {
  requireTriage,
  resolvePlantOperationsAuthority,
} from "@/lib/operational-requests/authority";
import { OPEN_OPERATIONAL_REQUEST_STATUSES } from "@/lib/operational-requests/types";
import { prisma } from "@/lib/prisma";

import { resolveAssetOperationsAuthority } from "./authority";
import {
  createIssueFromRequest,
  linkRequestToIssue,
  reportIssue,
  resolveIssue,
} from "./issue-service";
import {
  assignResponsibleEmployee,
  completeWorkOrder,
  createWorkOrderFromIssue,
  holdWorkOrder,
  technicianUpdateWorkOrder,
  updateWorkOrderStatus,
} from "./work-order-service";

type DbClient = PrismaClient | Prisma.TransactionClient;

function randomId() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function acceptRequestAuthority(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    triageNote?: string | null;
    client: DbClient;
  },
) {
  return triageRequest(session, {
    facilityId: input.facilityId,
    plantDepartmentId: input.plantDepartmentId,
    requestId: input.requestId,
    status: "UNDER_REVIEW",
    triageNote: input.triageNote,
    requesterVisibleStatusSummary: "Accepted",
    client: input.client,
  });
}

async function dualWriteRequestWorkOrder(
  client: DbClient,
  input: { requestId: string; workOrderId: string; workOrderCode: string; actorUserId: string | null },
) {
  const request = await client.operationalRequest.findFirst({
    where: { id: input.requestId },
    select: { id: true, workOrderId: true, status: true },
  });
  if (!request || request.workOrderId) return request;
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: { workOrderId: input.workOrderId },
  });
  await client.operationalRequestUpdate.create({
    data: {
      id: randomId(),
      requestId: request.id,
      updateText: `Work Order ${input.workOrderCode} linked`,
      statusAfterUpdate: request.status,
      updatedByUserId: input.actorUserId,
      requesterVisible: true,
    },
  });
  return updated;
}

/** Accept Request and create Issue. No Work Order. */
export async function triageRequestCreateIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    summary?: string | null;
    description?: string | null;
    triageNote?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const run = async (client: DbClient) => {
    await acceptRequestAuthority(session, { ...input, client });
    return createIssueFromRequest(session, {
      facilityId: input.facilityId,
      plantDepartmentId: input.plantDepartmentId,
      requestId: input.requestId,
      summary: input.summary,
      description: input.description,
      client,
      now: input.now,
    });
  };
  if (input.client) return run(input.client);
  return prisma.$transaction((tx) => run(tx));
}

/** Accept Request and link an existing Issue (duplicate reports). */
export async function triageRequestLinkIssue(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    issueId: string;
    triageNote?: string | null;
    client?: DbClient;
  },
) {
  const run = async (client: DbClient) => {
    await acceptRequestAuthority(session, { ...input, client });
    return linkRequestToIssue(session, {
      facilityId: input.facilityId,
      plantDepartmentId: input.plantDepartmentId,
      requestId: input.requestId,
      issueId: input.issueId,
      client,
    });
  };
  if (input.client) return run(input.client);
  return prisma.$transaction((tx) => run(tx));
}

/** Accept Request, create Issue, and create the first corrective Work Order. */
export async function triageRequestCreateIssueAndWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    summary?: string | null;
    description?: string | null;
    triageNote?: string | null;
    title?: string | null;
    priority?: RepairPriority;
    assignedEmployeeId?: string | null;
    vendorId?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const run = async (client: DbClient) => {
    const created = await triageRequestCreateIssue(session, {
      ...input,
      client,
    });
    const workOrder = await createWorkOrderFromIssue(session, {
      facilityId: input.facilityId,
      departmentId: input.plantDepartmentId,
      issueId: created.issue.id,
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignedEmployeeId: input.assignedEmployeeId,
      vendorId: input.vendorId,
      client,
      now: input.now,
    });
    await dualWriteRequestWorkOrder(client, {
      requestId: created.request.id,
      workOrderId: workOrder.id,
      workOrderCode: workOrder.repairCode,
      actorUserId: sessionUserIdForFk(session),
    });
    return { ...created, workOrder };
  };
  if (input.client) return run(input.client);
  return prisma.$transaction((tx) => run(tx));
}

export async function declineRequest(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    plantDepartmentId: string;
    requestId: string;
    reason: string;
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
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("A decline reason is required.");

  const request = await client.operationalRequest.findFirst({
    where: { id: input.requestId, facilityId: input.facilityId },
  });
  if (!request) throw new Error("Request not found.");
  if (request.responsibleDepartmentId !== input.plantDepartmentId) {
    throw new Error("Request is not assigned to this department.");
  }
  if (request.relatedAssetIssueId) {
    throw new Error("Decline a Request before an Issue is created.");
  }
  if (request.workOrderId) {
    throw new Error("Decline a Request before a Work Order is created.");
  }

  const now = input.now ?? new Date();
  const updated = await client.operationalRequest.update({
    where: { id: request.id },
    data: {
      status: "CANCELLED",
      resolutionReason: reason,
      resolvedAt: now,
      closedAt: now,
      requesterVisibleStatusSummary: "Declined",
    },
  });
  await client.operationalRequestUpdate.create({
    data: {
      id: randomId(),
      requestId: request.id,
      updateText: reason,
      statusAfterUpdate: "CANCELLED",
      updatedByUserId: sessionUserIdForFk(session),
      requesterVisible: true,
    },
  });
  return updated;
}

export async function resolveRequestWithoutWork(
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
  return resolveWithoutWorkOrder(session, input);
}

export async function assignWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    assignedEmployeeId: string | null;
    comment?: string | null;
    client?: DbClient;
  },
) {
  return assignResponsibleEmployee(session, input);
}

export async function startWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    note?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return technicianUpdateWorkOrder(session, {
    ...input,
    action: "START",
    requesterVisible: false,
  });
}

export async function resumeWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    note?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return technicianUpdateWorkOrder(session, {
    ...input,
    action: "RESUME",
    requesterVisible: false,
  });
}

export async function holdAssignedWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    holdReason: WorkOrderHoldReason;
    note?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const actor = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (actor.canManageWorkOrders) {
    return holdWorkOrder(session, {
      ...input,
      comment: input.note,
    });
  }
  return technicianUpdateWorkOrder(session, {
    ...input,
    action: "HOLD",
    note: input.note,
    requesterVisible: false,
  });
}

export async function completeAssignedWorkOrder(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    workPerformed?: string | null;
    resolution?: string | null;
    note?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const actor = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (actor.canManageWorkOrders) {
    return completeWorkOrder(session, {
      ...input,
      comment: input.note,
    });
  }
  return technicianUpdateWorkOrder(session, {
    ...input,
    action: "COMPLETE",
    requesterVisible: false,
  });
}

/**
 * Resolve the Issue. Optionally resolve linked open Requests in the same
 * supervisor action as separate auditable writes. Never implied by WO complete.
 *
 * Default: do not alter Request authority.
 */
export async function resolveIssueOptionallyRequests(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    issueId: string;
    resolutionReason: string;
    resolveLinkedRequests?: boolean;
    client?: DbClient;
    now?: Date;
  },
) {
  const reason = input.resolutionReason.trim();
  if (reason.length < 3) throw new Error("Confirm the underlying condition is resolved.");

  const run = async (client: DbClient) => {
    const issue = await resolveIssue(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      issueId: input.issueId,
      resolutionReason: reason,
      comment: reason,
      client,
      now: input.now,
    });

    if (!input.resolveLinkedRequests) {
      return { issue, resolvedRequests: [] as string[] };
    }

    const linked = await client.operationalRequest.findMany({
      where: {
        relatedAssetIssueId: issue.id,
        facilityId: input.facilityId,
        status: { in: OPEN_OPERATIONAL_REQUEST_STATUSES },
      },
      select: { id: true, workOrderId: true, responsibleDepartmentId: true },
    });

    const resolvedRequests: string[] = [];
    for (const request of linked) {
      if (request.workOrderId) {
        await closeRequest(session, {
          facilityId: input.facilityId,
          plantDepartmentId: request.responsibleDepartmentId,
          requestId: request.id,
          comment: reason,
          client,
          now: input.now,
        });
      } else {
        await resolveWithoutWorkOrder(session, {
          facilityId: input.facilityId,
          plantDepartmentId: request.responsibleDepartmentId,
          requestId: request.id,
          resolutionReason: reason,
          client,
          now: input.now,
        });
      }
      resolvedRequests.push(request.id);
    }
    return { issue, resolvedRequests };
  };

  if (input.client) return run(input.client);
  return prisma.$transaction((tx) => run(tx));
}

/** Explicit Issue from a canonical Record. No automatic Work Order. */
export async function createIssueFromRecord(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    evidenceRecordId: string;
    summary?: string | null;
    description?: string | null;
    createWorkOrder?: boolean;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const record = await client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.evidenceRecordId,
      facilityId: input.facilityId,
    },
  });
  if (!record) throw new Error("Record not found.");
  if (!record.unitId) throw new Error("Record has no Location to snapshot onto an Issue.");

  const created = await reportIssue(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    assetId: record.assetId,
    unitId: record.unitId,
    spaceId: record.spaceId,
    summary: input.summary?.trim() || record.templateName || "Condition from Record",
    description:
      input.description?.trim() ||
      `${record.templateName}${record.outOfStandard ? " · Out of standard" : ""}`,
    observedAt: record.occurredAt,
    evidenceRecordId: record.id,
    originEvidenceRecordId: record.id,
    allowDuplicateOpen: true,
    allowUnitScopeOverride: true,
    comment: `Created from Record ${record.id}`,
    client,
    now: input.now,
  });

  if (!input.createWorkOrder) {
    return { issue: created.issue, workOrder: null as null };
  }

  const workOrder = await createWorkOrderFromIssue(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    issueId: created.issue.id,
    client,
    now: input.now,
  });
  return { issue: created.issue, workOrder };
}

export async function addWorkOrderNote(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    note: string;
    requesterVisible?: boolean;
    client?: DbClient;
  },
) {
  return technicianUpdateWorkOrder(session, {
    ...input,
    action: "NOTE",
  });
}

export { updateWorkOrderStatus };
