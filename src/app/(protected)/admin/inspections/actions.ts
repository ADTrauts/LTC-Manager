"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import {
  parseDaysOfWeekJson,
  parseInspectionItemsJson,
  upsertInspectionDefinitionSchema,
} from "@/lib/work/inspections/definition-schema";

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toBool(value: FormDataEntryValue | null, fallback = false) {
  if (typeof value !== "string") return fallback;
  return value === "true" || value === "on" || value === "1";
}

function revalidateInspectionViews(unitId?: string | null) {
  revalidatePath("/admin/inspections");
  revalidatePath("/admin");
  revalidatePath("/unit/[unitId]", "page");
  if (unitId) {
    revalidatePath(`/unit/${unitId}`);
  }
}

async function assertScopedDepartment(facilityId: string, departmentId: string | null | undefined) {
  if (!departmentId) return null;
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, facilityId },
    select: { id: true },
  });
  if (!dept) throw new Error("Department not found.");
  return dept.id;
}

async function assertScopedUnit(facilityId: string, unitId: string | null | undefined) {
  if (!unitId) return null;
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");
  return unit.id;
}

export async function upsertInspectionDefinitionAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const items = parseInspectionItemsJson(formData.get("itemsJson"));
  const parsed = upsertInspectionDefinitionSchema.parse({
    definitionId: toOptional(formData.get("definitionId")),
    name: formData.get("name"),
    description: toOptional(formData.get("description")) ?? null,
    frequency: toOptional(formData.get("frequency")) ?? null,
    cadenceType: toOptional(formData.get("cadenceType")) ?? "ON_DEMAND",
    dueTimeLocal: toOptional(formData.get("dueTimeLocal")) ?? null,
    daysOfWeek: parseDaysOfWeekJson(formData.get("daysOfWeekJson")),
    dayOfMonth: toOptional(formData.get("dayOfMonth"))
      ? Number(formData.get("dayOfMonth"))
      : null,
    departmentId: toOptional(formData.get("departmentId")) ?? null,
    unitId: toOptional(formData.get("unitId")) ?? null,
    isActive: toBool(formData.get("isActive"), true),
    items,
  });

  const departmentId = await assertScopedDepartment(session.facilityId, parsed.departmentId);
  const unitId = await assertScopedUnit(session.facilityId, parsed.unitId);

  // Normalize sort orders to 1..n in the order provided.
  const orderedItems = [...parsed.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  if (parsed.definitionId) {
    const existing = await prisma.inspectionDefinition.findFirst({
      where: { id: parsed.definitionId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Inspection definition not found.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspectionDefinition.update({
        where: { id: existing.id },
        data: {
          name: parsed.name,
          description: parsed.description,
          frequency: parsed.frequency,
          cadenceType: parsed.cadenceType,
          dueTimeLocal: parsed.cadenceType === "ON_DEMAND" ? null : parsed.dueTimeLocal,
          daysOfWeek: parsed.cadenceType === "WEEKLY" ? parsed.daysOfWeek : [],
          dayOfMonth: parsed.cadenceType === "MONTHLY" ? parsed.dayOfMonth : null,
          departmentId,
          unitId,
          isActive: parsed.isActive,
        },
      });

      const existingItems = await tx.inspectionDefinitionItem.findMany({
        where: { definitionId: existing.id },
        select: { id: true },
      });
      const keepIds = new Set(
        orderedItems.map((item) => item.id).filter((id): id is string => Boolean(id)),
      );

      for (const row of existingItems) {
        if (keepIds.has(row.id)) continue;
        const used = await tx.inspectionSubmissionItem.count({
          where: { definitionItemId: row.id },
        });
        if (used === 0) {
          await tx.inspectionDefinitionItem.delete({ where: { id: row.id } });
        }
      }

      for (const item of orderedItems) {
        if (item.id && keepIds.has(item.id)) {
          const owned = existingItems.some((row) => row.id === item.id);
          if (!owned) {
            throw new Error("Inspection item does not belong to this definition.");
          }
          await tx.inspectionDefinitionItem.update({
            where: { id: item.id },
            data: {
              label: item.label,
              description: item.description ?? null,
              sortOrder: item.sortOrder,
              isRequired: item.isRequired,
              responseType: item.responseType,
              failureCreatesFollowUp: item.failureCreatesFollowUp,
            },
          });
        } else {
          await tx.inspectionDefinitionItem.create({
            data: {
              definitionId: existing.id,
              label: item.label,
              description: item.description ?? null,
              sortOrder: item.sortOrder,
              isRequired: item.isRequired,
              responseType: item.responseType,
              failureCreatesFollowUp: item.failureCreatesFollowUp,
            },
          });
        }
      }
    });

    revalidateInspectionViews(unitId);
    redirect(`/admin/inspections?saved=${existing.id}`);
  }

  const created = await prisma.inspectionDefinition.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      description: parsed.description,
      frequency: parsed.frequency,
      cadenceType: parsed.cadenceType,
      dueTimeLocal: parsed.cadenceType === "ON_DEMAND" ? null : parsed.dueTimeLocal,
      daysOfWeek: parsed.cadenceType === "WEEKLY" ? parsed.daysOfWeek : [],
      dayOfMonth: parsed.cadenceType === "MONTHLY" ? parsed.dayOfMonth : null,
      departmentId,
      unitId,
      isActive: parsed.isActive,
      items: {
        create: orderedItems.map((item) => ({
          label: item.label,
          description: item.description ?? null,
          sortOrder: item.sortOrder,
          isRequired: item.isRequired,
          responseType: item.responseType,
          failureCreatesFollowUp: item.failureCreatesFollowUp,
        })),
      },
    },
    select: { id: true },
  });

  revalidateInspectionViews(unitId);
  redirect(`/admin/inspections?saved=${created.id}`);
}

export async function setInspectionDefinitionActiveAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = z
    .object({
      definitionId: z.string().cuid(),
      isActive: z.enum(["true", "false"]),
    })
    .parse({
      definitionId: formData.get("definitionId"),
      isActive: formData.get("isActive"),
    });

  const existing = await prisma.inspectionDefinition.findFirst({
    where: { id: parsed.definitionId, facilityId: session.facilityId },
    select: { id: true, unitId: true },
  });
  if (!existing) {
    throw new Error("Inspection definition not found.");
  }

  await prisma.inspectionDefinition.update({
    where: { id: existing.id },
    data: { isActive: parsed.isActive === "true" },
  });

  revalidateInspectionViews(existing.unitId);
  redirect("/admin/inspections");
}
