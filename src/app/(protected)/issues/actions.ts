"use server";

import { revalidatePath } from "next/cache";
import { RepairStatus } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";
import { syncRepairRecordToTask } from "@/lib/work/adapters/repair-task";

const statusValues = [
  RepairStatus.OPEN,
  RepairStatus.IN_PROGRESS,
  RepairStatus.WAITING_PARTS,
  RepairStatus.CLOSED,
] as const;

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
  revalidatePath("/issues");
  revalidatePath(issueDetailPath(opts.issueId));
  revalidatePath(`/repairs/${opts.issueId}`);
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  revalidatePath("/today");
  revalidatePath("/today/handoffs");
  revalidatePath("/today/walk");
  revalidatePath("/units");
  revalidatePath("/unit/[unitId]", "page");
  if (opts.unitId) {
    revalidatePath(`/unit/${opts.unitId}`);
  }
}

const repairTaskSelect = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  unitId: true,
  responsibleDepartmentId: true,
  assignedEmployeeId: true,
  dueAt: true,
  completedAt: true,
  unit: { select: { facilityId: true } },
} as const;

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

async function syncIssueTask(repairId: string) {
  const updated = await prisma.repair.findFirst({
    where: { id: repairId },
    select: repairTaskSelect,
  });
  if (!updated) return;
  await syncRepairRecordToTask({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    priority: updated.priority,
    status: updated.status,
    unitId: updated.unitId,
    responsibleDepartmentId: updated.responsibleDepartmentId,
    assignedEmployeeId: updated.assignedEmployeeId,
    dueAt: updated.dueAt,
    completedAt: updated.completedAt,
    facilityId: updated.unit.facilityId,
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
      completedAt: issue.status === RepairStatus.CLOSED ? null : undefined,
      status:
        issue.status === RepairStatus.CLOSED
          ? RepairStatus.OPEN
          : issue.status,
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
    statusAfterUpdate:
      issue.status === RepairStatus.CLOSED ? RepairStatus.OPEN : issue.status,
    updatedById: session.authKind === "user" ? session.uid : undefined,
  });

  await syncIssueTask(issue.id);
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

  const nextStatus = parsed.statusAfterUpdate ?? issue.status;

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.updateText,
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: nextStatus,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === RepairStatus.CLOSED ? new Date() : null,
      },
    }),
  ]);

  await syncIssueTask(issue.id);
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
  if (issue.status === RepairStatus.CLOSED) {
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
      data: { status: RepairStatus.IN_PROGRESS, completedAt: null },
    }),
  ]);

  await syncIssueTask(issue.id);
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
  if (issue.status === RepairStatus.CLOSED) {
    return { ok: false, message: "Reopen the issue before marking it waiting." };
  }

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Waiting on parts or supplies",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: RepairStatus.WAITING_PARTS,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: { status: RepairStatus.WAITING_PARTS, completedAt: null },
    }),
  ]);

  await syncIssueTask(issue.id);
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
  if (issue.status === RepairStatus.CLOSED) {
    return { ok: false, message: "This issue is already resolved." };
  }

  await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: issue.id,
        updateText: parsed.note?.trim() || "Issue resolved and closed",
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: RepairStatus.CLOSED,
      },
    }),
    prisma.repair.update({
      where: { id: issue.id },
      data: { status: RepairStatus.CLOSED, completedAt: new Date() },
    }),
  ]);

  await syncIssueTask(issue.id);
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
  if (issue.status !== RepairStatus.CLOSED) {
    return { ok: false, message: "Only resolved issues can be reopened." };
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
      data: { status: nextStatus, completedAt: null },
    }),
  ]);

  await syncIssueTask(issue.id);
  revalidateIssueSurfaces({ issueId: issue.id, unitId: issue.unitId });
  return { ok: true, message: "Issue reopened." };
}
