"use server";

import { revalidatePath } from "next/cache";
import { RepairStatus } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { currentRepairStatusWrite } from "@/lib/asset-operations/work-order-semantics";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";
const statusValues = [
  RepairStatus.OPEN,
  RepairStatus.IN_PROGRESS,
  RepairStatus.ON_HOLD,
  RepairStatus.COMPLETED,
] as const;

function repairIsFinished(status: RepairStatus) {
  return status === RepairStatus.COMPLETED;
}

function storedRepairStatus(status: RepairStatus) {
  const holdReason =
    status === RepairStatus.ON_HOLD ? ("WAITING_FOR_PART" as const) : undefined;
  return currentRepairStatusWrite(status, holdReason);
}

export type IssueActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Module-local helper: every export of a "use server" module must be an async Server Action. */
function revalidateIssueSurfaces(opts: {
  issueId: string;
  unitId?: string | null;
}) {
  revalidatePath("/repairs");
  revalidatePath(issueDetailPath(opts.issueId));
  revalidatePath(`/repairs/${opts.issueId}`);
  revalidatePath("/dashboard");
  revalidatePath("/today");
  revalidatePath("/today/handoffs");
  revalidatePath("/today/walk");
  revalidatePath("/units");
  revalidatePath("/unit/[unitId]", "page");
  if (opts.unitId) {
    revalidatePath(`/unit/${opts.unitId}`);
  }
}

async function loadFacilityIssue(issueId: string, facilityId: string) {
  return prisma.repair.findFirst({
    where: { id: issueId, unit: { facilityId } },
    select: {
      id: true,
      status: true,
      unitId: true,
      assignedEmployeeId: true,
      responsibleDepartmentId: true,
      title: true,
    },
  });
}

async function appendHistory(opts: {
  repairId: string;
  updateText: string;
  statusAfterUpdate?: RepairStatus | null;
  updatedById?: string;
}) {
  await prisma.repairUpdate.create({
    data: {
      repairId: opts.repairId,
      updateText: opts.updateText,
      statusAfterUpdate: opts.statusAfterUpdate ?? undefined,
      updatedById: opts.updatedById,
    },
  });
}

const assignSchema = z.object({
  issueId: z.string().cuid(),
  assignedEmployeeId: z.string().cuid().optional(),
  responsibleDepartmentId: z.string().cuid().optional(),
});

export async function assignIssueAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof assignSchema>;
  try {
    parsed = assignSchema.parse({
      issueId: formData.get("issueId"),
      assignedEmployeeId: toOptional(formData.get("assignedEmployeeId")),
      responsibleDepartmentId: toOptional(formData.get("responsibleDepartmentId")),
    });
  } catch {
    return { ok: false, message: "Check assignment details and try again." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) {
    return { ok: false, message: "Issue not found." };
  }

  let employeeName: string | null = null;
  if (parsed.assignedEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: parsed.assignedEmployeeId,
        facilityId: session.facilityId,
        status: "ACTIVE",
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) {
      return { ok: false, message: "That person is not available in this facility." };
    }
    employeeName = `${employee.firstName} ${employee.lastName}`.trim();
  }

  let departmentName: string | null = null;
  if (parsed.responsibleDepartmentId) {
    const department = await prisma.department.findFirst({
      where: {
        id: parsed.responsibleDepartmentId,
        facilityId: session.facilityId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!department) {
      return { ok: false, message: "That department is not available in this facility." };
    }
    departmentName = department.name;
  }

  const nextAssignee = parsed.assignedEmployeeId ?? null;
  const nextDept = parsed.responsibleDepartmentId ?? issue.responsibleDepartmentId;

  await prisma.repair.update({
    where: { id: issue.id },
    data: {
      assignedEmployeeId: nextAssignee,
      responsibleDepartmentId: nextDept,
      completedAt: repairIsFinished(issue.status) ? null : undefined,
      holdReason: repairIsFinished(issue.status) ? null : undefined,
      status: repairIsFinished(issue.status) ? RepairStatus.OPEN : issue.status,
    },
  });

  const parts: string[] = [];
  if (employeeName) parts.push(`Assigned to ${employeeName}`);
  else if (issue.assignedEmployeeId && !nextAssignee) parts.push("Unassigned");
  if (departmentName) parts.push(`Responsible department: ${departmentName}`);
  const updateText = parts.length > 0 ? parts.join(". ") : "Assignment updated";

  await appendHistory({
    repairId: issue.id,
    updateText,
    statusAfterUpdate: repairIsFinished(issue.status) ? RepairStatus.OPEN : issue.status,
    updatedById: session.authKind === "user" ? session.uid : undefined,
  });

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Assignment saved." };
}

const updateSchema = z.object({
  issueId: z.string().cuid(),
  updateText: z.string().trim().min(2).max(1000),
  statusAfterUpdate: z.enum(statusValues).optional(),
});

export async function addIssueUpdateAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof updateSchema>;
  try {
    const statusRaw = toOptional(formData.get("statusAfterUpdate"));
    parsed = updateSchema.parse({
      issueId: formData.get("issueId"),
      updateText: formData.get("updateText"),
      statusAfterUpdate: statusRaw,
    });
  } catch {
    return { ok: false, message: "Add a short note (at least 2 characters)." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) {
    return { ok: false, message: "Issue not found." };
  }

  const stored = storedRepairStatus(parsed.statusAfterUpdate ?? issue.status);

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.updateText,
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: stored.status,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: {
        status: stored.status,
        holdReason: stored.holdReason,
        completedAt: stored.status === RepairStatus.COMPLETED ? new Date() : null,
      },
    }),
  ]);

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Update recorded." };
}

const transitionSchema = z.object({
  issueId: z.string().cuid(),
  note: z.string().trim().max(1000).optional(),
});

export async function startIssueWorkAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof transitionSchema>;
  try {
    parsed = transitionSchema.parse({
      issueId: formData.get("issueId"),
      note: toOptional(formData.get("note")),
    });
  } catch {
    return { ok: false, message: "Could not start work on this issue." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) return { ok: false, message: "Issue not found." };
  if (repairIsFinished(issue.status)) {
    return { ok: false, message: "Reopen the issue before starting work." };
  }

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Work started",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: RepairStatus.IN_PROGRESS,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: { status: RepairStatus.IN_PROGRESS, holdReason: null, completedAt: null },
    }),
  ]);

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Work started." };
}

export async function markIssueWaitingAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof transitionSchema>;
  try {
    parsed = transitionSchema.parse({
      issueId: formData.get("issueId"),
      note: toOptional(formData.get("note")),
    });
  } catch {
    return { ok: false, message: "Could not mark this issue as waiting." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) return { ok: false, message: "Issue not found." };
  if (repairIsFinished(issue.status)) {
    return { ok: false, message: "Reopen the issue before marking it waiting." };
  }

  const waiting = storedRepairStatus(RepairStatus.ON_HOLD);
  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Waiting on parts or supplies",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: waiting.status,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: { status: waiting.status, holdReason: waiting.holdReason, completedAt: null },
    }),
  ]);

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Marked as waiting." };
}

export async function closeIssueAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof transitionSchema>;
  try {
    parsed = transitionSchema.parse({
      issueId: formData.get("issueId"),
      note: toOptional(formData.get("note")),
    });
  } catch {
    return { ok: false, message: "Could not close this issue." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) return { ok: false, message: "Issue not found." };
  if (repairIsFinished(issue.status)) {
    return { ok: false, message: "This issue is already resolved." };
  }

  const completed = storedRepairStatus(RepairStatus.COMPLETED);
  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Issue resolved and closed",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: completed.status,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: {
        status: completed.status,
        holdReason: null,
        completedAt: new Date(),
      },
    }),
  ]);

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Issue resolved." };
}

export async function reopenIssueAction(formData: FormData): Promise<IssueActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof transitionSchema>;
  try {
    parsed = transitionSchema.parse({
      issueId: formData.get("issueId"),
      note: toOptional(formData.get("note")),
    });
  } catch {
    return { ok: false, message: "Could not reopen this issue." };
  }

  const issue = await loadFacilityIssue(parsed.issueId, session.facilityId);
  if (!issue) return { ok: false, message: "Issue not found." };
  if (issue.status !== RepairStatus.COMPLETED) {
    return { ok: false, message: "Only completed repairs can be reopened." };
  }

  const nextStatus = issue.assignedEmployeeId
    ? RepairStatus.IN_PROGRESS
    : RepairStatus.OPEN;

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Issue reopened",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: nextStatus,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: { status: nextStatus, holdReason: null, completedAt: null },
    }),
  ]);

  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Issue reopened." };
}
