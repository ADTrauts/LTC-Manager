"use server";

import { revalidatePath } from "next/cache";
import {
  OperationalAssignmentSource,
  OperationalAssignmentStatus,
} from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { sessionUserIdForFk } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import { recordAssignmentEvent } from "@/lib/scheduling/operational-assignments/assignment-events";

const statusValues = [
  OperationalAssignmentStatus.PLANNED,
  OperationalAssignmentStatus.ACTIVE,
  OperationalAssignmentStatus.COMPLETED,
  OperationalAssignmentStatus.CANCELLED,
] as const;

const sourceValues = [
  OperationalAssignmentSource.MANUAL,
  OperationalAssignmentSource.TEMPLATE,
  OperationalAssignmentSource.COVERAGE,
  OperationalAssignmentSource.REASSIGNMENT,
] as const;

const createSchema = z.object({
  employeeId: z.string().min(1),
  departmentId: z.string().min(1),
  roleKey: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitId: z.string().min(1).optional(),
  operationInstanceId: z.string().min(1).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  source: z.enum(sourceValues).optional(),
  notes: z.string().max(500).optional(),
});

const editSchema = z.object({
  assignmentId: z.string().min(1),
  roleKey: z.string().min(1).optional(),
  unitId: z.string().optional(),
  operationInstanceId: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const lifecycleSchema = z.object({
  assignmentId: z.string().min(1),
  action: z.enum(["activate", "complete", "cancel"]),
});

function opt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function requireFlag() {
  if (!isOperationalAssignmentsEnabled()) {
    throw new Error("Operational assignments are not enabled.");
  }
}

function revalidateAssignmentViews() {
  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing");
  revalidatePath("/today");
  revalidatePath("/today/coverage");
  revalidatePath("/unit/[unitId]", "page");
}

export async function createAssignmentAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createSchema.parse({
    employeeId: formData.get("employeeId"),
    departmentId: formData.get("departmentId"),
    roleKey: formData.get("roleKey"),
    serviceDate: formData.get("serviceDate"),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    source: opt(formData.get("source")) as OperationalAssignmentSource | undefined,
    notes: opt(formData.get("notes")),
  });

  const [employee, department] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.department.findFirst({
      where: { id: parsed.departmentId, facilityId: session.facilityId },
      select: { id: true, key: true },
    }),
  ]);

  if (!employee) throw new Error("Employee not found or inactive.");
  if (!department) throw new Error("Department not found.");

  const roleDef = getRoleDefinition(parsed.roleKey);
  if (!roleDef || !isRoleValidForDepartment(parsed.roleKey, department.key)) {
    throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
  }

  if (parsed.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.unitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!unit) throw new Error("Unit not found.");
  }

  if (parsed.operationInstanceId) {
    const op = await prisma.operationInstance.findFirst({
      where: { id: parsed.operationInstanceId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!op) throw new Error("Operation not found.");
  }

  const serviceDate = new Date(`${parsed.serviceDate}T00:00:00`);
  const actorUserId = sessionUserIdForFk(session);

  const created = await prisma.operationalAssignment.create({
    data: {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      employeeId: parsed.employeeId,
      serviceDate,
      roleKey: parsed.roleKey,
      roleLabel: roleDef.label,
      unitId: parsed.unitId ?? null,
      operationInstanceId: parsed.operationInstanceId ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      source: parsed.source ?? "MANUAL",
      notes: parsed.notes ?? null,
      createdByUserId: actorUserId,
    },
  });

  await recordAssignmentEvent({
    assignmentId: created.id,
    facilityId: session.facilityId,
    eventType: "CREATED",
    actorUserId,
    toStatus: "PLANNED",
    summary: `Assignment created: ${roleDef.label}`,
  });

  revalidateAssignmentViews();
}

export async function editAssignmentAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = editSchema.parse({
    assignmentId: formData.get("assignmentId"),
    roleKey: opt(formData.get("roleKey")),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    notes: opt(formData.get("notes")),
  });

  const assignment = await prisma.operationalAssignment.findFirst({
    where: { id: parsed.assignmentId, facilityId: session.facilityId },
    select: { id: true, status: true, departmentId: true, department: { select: { key: true } } },
  });
  if (!assignment) throw new Error("Assignment not found.");
  if (assignment.status === "COMPLETED" || assignment.status === "CANCELLED") {
    throw new Error("Cannot edit a completed or cancelled assignment.");
  }

  const data: Record<string, unknown> = {};

  if (parsed.roleKey) {
    if (!isRoleValidForDepartment(parsed.roleKey, assignment.department.key)) {
      throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
    }
    const roleDef = getRoleDefinition(parsed.roleKey);
    data.roleKey = parsed.roleKey;
    data.roleLabel = roleDef?.label ?? parsed.roleKey;
  }

  if (parsed.unitId !== undefined) {
    if (parsed.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: parsed.unitId, facilityId: session.facilityId },
        select: { id: true },
      });
      if (!unit) throw new Error("Unit not found.");
      data.unitId = parsed.unitId;
    } else {
      data.unitId = null;
    }
  }

  if (parsed.operationInstanceId !== undefined) {
    data.operationInstanceId = parsed.operationInstanceId || null;
  }

  if (parsed.startsAt !== undefined) data.startsAt = parsed.startsAt ? new Date(parsed.startsAt) : null;
  if (parsed.endsAt !== undefined) data.endsAt = parsed.endsAt ? new Date(parsed.endsAt) : null;
  if (parsed.notes !== undefined) data.notes = parsed.notes || null;

  await prisma.operationalAssignment.update({
    where: { id: assignment.id },
    data,
  });

  const changes = Object.keys(data).filter((k) => k !== "roleLabel").join(", ");
  await recordAssignmentEvent({
    assignmentId: assignment.id,
    facilityId: session.facilityId,
    eventType: "UPDATED",
    actorUserId: sessionUserIdForFk(session),
    summary: `Assignment updated: ${changes}`,
  });

  revalidateAssignmentViews();
}

export async function assignmentLifecycleAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = lifecycleSchema.parse({
    assignmentId: formData.get("assignmentId"),
    action: formData.get("action"),
  });

  const assignment = await prisma.operationalAssignment.findFirst({
    where: { id: parsed.assignmentId, facilityId: session.facilityId },
    select: { id: true, status: true },
  });
  if (!assignment) throw new Error("Assignment not found.");

  const transitions: Record<string, { from: OperationalAssignmentStatus[]; to: OperationalAssignmentStatus }> = {
    activate: { from: ["PLANNED"], to: "ACTIVE" },
    complete: { from: ["ACTIVE"], to: "COMPLETED" },
    cancel: { from: ["PLANNED", "ACTIVE"], to: "CANCELLED" },
  };

  const rule = transitions[parsed.action];
  if (!rule) throw new Error("Invalid lifecycle action.");
  if (!rule.from.includes(assignment.status)) {
    throw new Error(`Cannot ${parsed.action} an assignment with status "${assignment.status}".`);
  }

  await prisma.operationalAssignment.update({
    where: { id: assignment.id },
    data: { status: rule.to },
  });

  const eventTypeMap: Record<string, "ACTIVATED" | "COMPLETED" | "CANCELLED"> = {
    activate: "ACTIVATED",
    complete: "COMPLETED",
    cancel: "CANCELLED",
  };

  await recordAssignmentEvent({
    assignmentId: assignment.id,
    facilityId: session.facilityId,
    eventType: eventTypeMap[parsed.action] ?? "UPDATED",
    actorUserId: sessionUserIdForFk(session),
    fromStatus: assignment.status,
    toStatus: rule.to,
    summary: `Assignment ${parsed.action}d`,
  });

  revalidateAssignmentViews();
}

export async function reassignAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const existingId = opt(formData.get("existingAssignmentId"));
  const mode = opt(formData.get("mode")) ?? "coverage";

  const parsed = createSchema.parse({
    employeeId: formData.get("employeeId"),
    departmentId: formData.get("departmentId"),
    roleKey: formData.get("roleKey"),
    serviceDate: formData.get("serviceDate"),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    notes: opt(formData.get("notes")),
  });

  const [employee, department] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.department.findFirst({
      where: { id: parsed.departmentId, facilityId: session.facilityId },
      select: { id: true, key: true },
    }),
  ]);

  if (!employee) throw new Error("Employee not found or inactive.");
  if (!department) throw new Error("Department not found.");

  const roleDef = getRoleDefinition(parsed.roleKey);
  if (!roleDef || !isRoleValidForDepartment(parsed.roleKey, department.key)) {
    throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
  }

  const actorUserId = sessionUserIdForFk(session);

  if (existingId && mode === "replace") {
    const existing = await prisma.operationalAssignment.findFirst({
      where: { id: existingId, facilityId: session.facilityId },
      select: { id: true, status: true },
    });
    if (existing && (existing.status === "PLANNED" || existing.status === "ACTIVE")) {
      await prisma.operationalAssignment.update({
        where: { id: existing.id },
        data: { status: "CANCELLED" },
      });
      await recordAssignmentEvent({
        assignmentId: existing.id,
        facilityId: session.facilityId,
        eventType: "CANCELLED",
        actorUserId,
        fromStatus: existing.status,
        toStatus: "CANCELLED",
        summary: "Replaced by reassignment",
      });
    }
  }

  const source: OperationalAssignmentSource =
    mode === "reassignment" ? "REASSIGNMENT" : "COVERAGE";
  const eventType = mode === "reassignment" ? "REASSIGNED" : "COVERAGE_ADDED";

  const serviceDate = new Date(`${parsed.serviceDate}T00:00:00`);

  const created = await prisma.operationalAssignment.create({
    data: {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      employeeId: parsed.employeeId,
      serviceDate,
      roleKey: parsed.roleKey,
      roleLabel: roleDef.label,
      unitId: parsed.unitId ?? null,
      operationInstanceId: parsed.operationInstanceId ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      source,
      notes: parsed.notes ?? null,
      createdByUserId: actorUserId,
    },
  });

  await recordAssignmentEvent({
    assignmentId: created.id,
    facilityId: session.facilityId,
    eventType,
    actorUserId,
    toStatus: "PLANNED",
    summary: `${mode === "reassignment" ? "Reassignment" : "Coverage"} created: ${roleDef.label}`,
  });

  revalidateAssignmentViews();
}
