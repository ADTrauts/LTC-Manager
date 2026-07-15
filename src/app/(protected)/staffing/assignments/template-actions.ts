"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { sessionUserIdForFk } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { requireFacilitySession } from "@/lib/facility-context";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import {
  loadAssignmentTemplatePreview,
  loadDailyAssignmentBoard,
  applyAssignmentTemplate,
} from "@/lib/scheduling/operational-assignments";

function requireFlag() {
  if (!isOperationalAssignmentsEnabled()) {
    throw new Error("Operational assignments are not enabled.");
  }
}

function opt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function revalidateViews() {
  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing");
  revalidatePath("/today");
  revalidatePath("/today/coverage");
  revalidatePath("/unit/[unitId]", "page");
}

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  departmentId: z.string().min(1),
  operationDefinitionId: z.string().min(1).optional(),
  workShiftId: z.string().min(1).optional(),
});

export async function createTemplateAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createTemplateSchema.parse({
    name: formData.get("name"),
    description: opt(formData.get("description")),
    departmentId: formData.get("departmentId"),
    operationDefinitionId: opt(formData.get("operationDefinitionId")),
    workShiftId: opt(formData.get("workShiftId")),
  });

  const dept = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!dept) throw new Error("Department not found.");

  await prisma.operationalAssignmentTemplate.create({
    data: {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      name: parsed.name,
      description: parsed.description ?? null,
      operationDefinitionId: parsed.operationDefinitionId ?? null,
      workShiftId: parsed.workShiftId ?? null,
      createdByUserId: sessionUserIdForFk(session),
    },
  });

  revalidateViews();
}

const editTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export async function editTemplateAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = editTemplateSchema.parse({
    templateId: formData.get("templateId"),
    name: opt(formData.get("name")),
    description: opt(formData.get("description")),
    isActive: opt(formData.get("isActive")) as "true" | "false" | undefined,
  });

  const template = await prisma.operationalAssignmentTemplate.findFirst({
    where: { id: parsed.templateId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!template) throw new Error("Template not found.");

  const data: Record<string, unknown> = {};
  if (parsed.name) data.name = parsed.name;
  if (parsed.description !== undefined) data.description = parsed.description || null;
  if (parsed.isActive !== undefined) data.isActive = parsed.isActive === "true";

  await prisma.operationalAssignmentTemplate.update({
    where: { id: template.id },
    data,
  });

  revalidateViews();
}

const addItemSchema = z.object({
  templateId: z.string().min(1),
  roleKey: z.string().min(1),
  unitId: z.string().min(1).optional(),
  startsAtLocal: z.string().optional(),
  endsAtLocal: z.string().optional(),
  requiredCount: z.coerce.number().int().min(1).max(20).default(1),
  sortOrder: z.coerce.number().int().min(0).max(999).default(100),
  notes: z.string().max(500).optional(),
});

export async function addTemplateItemAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = addItemSchema.parse({
    templateId: formData.get("templateId"),
    roleKey: formData.get("roleKey"),
    unitId: opt(formData.get("unitId")),
    startsAtLocal: opt(formData.get("startsAtLocal")),
    endsAtLocal: opt(formData.get("endsAtLocal")),
    requiredCount: formData.get("requiredCount") ?? 1,
    sortOrder: formData.get("sortOrder") ?? 100,
    notes: opt(formData.get("notes")),
  });

  const template = await prisma.operationalAssignmentTemplate.findFirst({
    where: { id: parsed.templateId, facilityId: session.facilityId },
    select: { id: true, department: { select: { key: true } } },
  });
  if (!template) throw new Error("Template not found.");

  const roleDef = getRoleDefinition(parsed.roleKey);
  if (!roleDef || !isRoleValidForDepartment(parsed.roleKey, template.department.key)) {
    throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
  }

  if (parsed.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.unitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!unit) throw new Error("Unit not found.");
  }

  await prisma.operationalAssignmentTemplateItem.create({
    data: {
      templateId: parsed.templateId,
      roleKey: parsed.roleKey,
      roleLabel: roleDef.label,
      unitId: parsed.unitId ?? null,
      startsAtLocal: parsed.startsAtLocal ?? null,
      endsAtLocal: parsed.endsAtLocal ?? null,
      requiredCount: parsed.requiredCount,
      sortOrder: parsed.sortOrder,
      notes: parsed.notes ?? null,
    },
  });

  revalidateViews();
}

export async function removeTemplateItemAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const itemId = z.string().min(1).parse(formData.get("itemId"));

  const item = await prisma.operationalAssignmentTemplateItem.findFirst({
    where: { id: itemId, template: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!item) throw new Error("Template item not found.");

  await prisma.operationalAssignmentTemplateItem.delete({
    where: { id: item.id },
  });

  revalidateViews();
}

export async function moveTemplateItemAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const itemId = z.string().min(1).parse(formData.get("itemId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));

  const item = await prisma.operationalAssignmentTemplateItem.findFirst({
    where: { id: itemId, template: { facilityId: session.facilityId } },
    select: { id: true, sortOrder: true },
  });
  if (!item) throw new Error("Template item not found.");

  const delta = direction === "up" ? -15 : 15;
  await prisma.operationalAssignmentTemplateItem.update({
    where: { id: item.id },
    data: { sortOrder: Math.max(0, item.sortOrder + delta) },
  });

  revalidateViews();
}

const applySchema = z.object({
  templateId: z.string().min(1),
  departmentId: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function applyTemplateAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = applySchema.parse({
    templateId: formData.get("templateId"),
    departmentId: formData.get("departmentId"),
    serviceDate: formData.get("serviceDate"),
  });

  const department = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId },
    select: { id: true, key: true },
  });
  if (!department) throw new Error("Department not found.");

  const board = await loadDailyAssignmentBoard({
    facilityId: session.facilityId,
    serviceDate: parsed.serviceDate,
    departmentId: parsed.departmentId,
    departmentKey: department.key as OperationalDepartmentKey,
  });

  const preview = await loadAssignmentTemplatePreview(
    {
      templateId: parsed.templateId,
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      serviceDate: parsed.serviceDate,
    },
    board.employees,
    board.assignments,
  );

  await applyAssignmentTemplate({
    facilityId: session.facilityId,
    departmentId: parsed.departmentId,
    departmentKey: department.key,
    serviceDate: parsed.serviceDate,
    operationInstanceId: preview.operationInstanceId,
    positions: preview.positions,
    createdByUserId: sessionUserIdForFk(session),
  });

  revalidateViews();
}
