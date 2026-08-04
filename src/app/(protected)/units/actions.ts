"use server";

import { revalidatePath } from "next/cache";
import { UnitDepartmentKind, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { requireAtLeastRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { unitTypeUsesServingTimes } from "@/lib/unit-type-config";

const UNIT_TYPES = [
  UnitType.SERVERY,
  UnitType.KITCHEN,
  UnitType.RETAIL,
  UnitType.OFFICE,
  UnitType.STORAGE,
  UnitType.RESIDENT_AREA,
  UnitType.COMMON_AREA,
  UnitType.MECHANICAL,
  UnitType.RESTROOM_CLUSTER,
  UnitType.EVS_ZONE,
  UnitType.GROUND,
  UnitType.OTHER,
] as const;

const createUnitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  unitType: z.enum(UNIT_TYPES),
  parentUnitId: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(1).max(9999),
  isActive: z.coerce.boolean().default(true),
  breakfastTime: z.string().trim().optional(),
  lunchTime: z.string().trim().optional(),
  dinnerTime: z.string().trim().optional(),
});

const updateUnitSchema = createUnitSchema.extend({
  unitId: z.string().cuid(),
});

const toggleUnitSchema = z.object({
  unitId: z.string().cuid(),
  isActive: z.coerce.boolean(),
});

const reorderUnitSchema = z.object({
  unitId: z.string().cuid(),
  direction: z.enum(["up", "down"]),
});

const reorderUnitListSchema = z.object({
  orderedUnitIds: z.array(z.string().cuid()).min(1),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getMealTimesInput(formData: FormData) {
  return {
    breakfastTime: toOptional(formData.get("breakfastTime")),
    lunchTime: toOptional(formData.get("lunchTime")),
    dinnerTime: toOptional(formData.get("dinnerTime")),
  };
}

function validateMealTime(value?: string) {
  if (!value) return;
  const mealTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!mealTimePattern.test(value)) {
    throw new Error("Meal times must be in HH:MM 24-hour format.");
  }
}

async function upsertMealTimes(unitId: string, input: ReturnType<typeof getMealTimesInput>) {
  validateMealTime(input.breakfastTime);
  validateMealTime(input.lunchTime);
  validateMealTime(input.dinnerTime);

  await prisma.unitMealTime.deleteMany({ where: { unitId } });

  const records = [
    input.breakfastTime
      ? {
          unitId,
          mealType: "BREAKFAST" as const,
          scheduledTime: input.breakfastTime,
        }
      : null,
    input.lunchTime
      ? {
          unitId,
          mealType: "LUNCH" as const,
          scheduledTime: input.lunchTime,
        }
      : null,
    input.dinnerTime
      ? {
          unitId,
          mealType: "DINNER" as const,
          scheduledTime: input.dinnerTime,
        }
      : null,
  ].filter((record): record is { unitId: string; mealType: "BREAKFAST" | "LUNCH" | "DINNER"; scheduledTime: string } => record !== null);

  if (records.length > 0) {
    await prisma.unitMealTime.createMany({
      data: records,
    });
  }
}

function revalidateShellViews() {
  revalidatePath("/units");
  revalidatePath("/dashboard");
  revalidatePath("/evs");
  revalidatePath("/unit/[unitId]", "page");
}

export async function createUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createUnitSchema.parse({
    name: formData.get("name"),
    unitType: formData.get("unitType"),
    parentUnitId: toOptional(formData.get("parentUnitId")),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on",
    ...getMealTimesInput(formData),
  });

  if (parsed.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!parent) {
      throw new Error("Parent unit not found.");
    }
  }

  const unit = await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: parsed.unitType,
      parentUnitId: parsed.parentUnitId,
      description: parsed.description,
      displayOrder: parsed.displayOrder,
      isActive: parsed.isActive,
    },
  });

  const mealInput = unitTypeUsesServingTimes(parsed.unitType)
    ? getMealTimesInput(formData)
    : { breakfastTime: undefined, lunchTime: undefined, dinnerTime: undefined };
  await upsertMealTimes(unit.id, mealInput);
  revalidateShellViews();
}

export async function updateUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = updateUnitSchema.parse({
    unitId: formData.get("unitId"),
    name: formData.get("name"),
    unitType: formData.get("unitType"),
    parentUnitId: toOptional(formData.get("parentUnitId")),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on",
    ...getMealTimesInput(formData),
  });

  if (parsed.parentUnitId && parsed.parentUnitId === parsed.unitId) {
    throw new Error("Unit cannot be its own parent.");
  }

  if (parsed.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!parent) {
      throw new Error("Parent unit not found.");
    }
  }

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: {
      name: parsed.name,
      unitType: parsed.unitType,
      parentUnitId: parsed.parentUnitId,
      description: parsed.description,
      displayOrder: parsed.displayOrder,
      isActive: parsed.isActive,
    },
  });

  const mealInput = unitTypeUsesServingTimes(parsed.unitType)
    ? getMealTimesInput(formData)
    : { breakfastTime: undefined, lunchTime: undefined, dinnerTime: undefined };
  await upsertMealTimes(parsed.unitId, mealInput);
  revalidateShellViews();
}

export async function toggleUnitActiveAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = toggleUnitSchema.parse({
    unitId: formData.get("unitId"),
    isActive: formData.get("isActive") === "true",
  });

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: { isActive: parsed.isActive },
  });

  revalidateShellViews();
}

export async function reorderUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = reorderUnitSchema.parse({
    unitId: formData.get("unitId"),
    direction: formData.get("direction"),
  });

  const units = await prisma.unit.findMany({
    where: { facilityId: session.facilityId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, displayOrder: true },
  });

  const currentIndex = units.findIndex((unit) => unit.id === parsed.unitId);
  if (currentIndex === -1) return;

  const targetIndex = parsed.direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= units.length) return;

  const current = units[currentIndex];
  const target = units[targetIndex];

  await prisma.$transaction([
    prisma.unit.update({
      where: { id: current.id },
      data: { displayOrder: target.displayOrder },
    }),
    prisma.unit.update({
      where: { id: target.id },
      data: { displayOrder: current.displayOrder },
    }),
  ]);

  revalidateShellViews();
}

export async function reorderUnitListAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const rawOrderedIds = formData.get("orderedUnitIds");
  const orderedUnitIds = typeof rawOrderedIds === "string" ? JSON.parse(rawOrderedIds) : [];
  const parsed = reorderUnitListSchema.parse({ orderedUnitIds });

  const units = await prisma.unit.findMany({
    where: { facilityId: session.facilityId },
    select: { id: true },
  });

  if (units.length !== parsed.orderedUnitIds.length) {
    throw new Error("Reorder payload does not match facility unit count.");
  }

  const existingIds = new Set(units.map((unit) => unit.id));
  const payloadIds = new Set(parsed.orderedUnitIds);
  if (existingIds.size !== payloadIds.size || parsed.orderedUnitIds.some((id) => !existingIds.has(id))) {
    throw new Error("Reorder payload contains invalid unit ids.");
  }

  await prisma.$transaction(
    parsed.orderedUnitIds.map((unitId, index) =>
      prisma.unit.updateMany({
        where: { id: unitId, facilityId: session.facilityId },
        data: { displayOrder: index + 1 },
      }),
    ),
  );

  revalidateShellViews();
}

const upsertResponsibilitySchema = z.object({
  unitId: z.string().cuid(),
  departmentId: z.string().cuid(),
  riskLevel: z.string().trim().max(120).optional(),
  cleaningFrequency: z.string().trim().max(120).optional(),
  inspectionFrequency: z.string().trim().max(120).optional(),
});

const deleteResponsibilitySchema = z.object({
  responsibilityId: z.string().cuid(),
});

export async function upsertUnitDepartmentResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = upsertResponsibilitySchema.parse({
    unitId: formData.get("unitId"),
    departmentId: formData.get("departmentId"),
    riskLevel: toOptional(formData.get("riskLevel")),
    cleaningFrequency: toOptional(formData.get("cleaningFrequency")),
    inspectionFrequency: toOptional(formData.get("inspectionFrequency")),
  });

  const kind =
    formData.get("kind") === UnitDepartmentKind.BACKUP
      ? UnitDepartmentKind.BACKUP
      : UnitDepartmentKind.PRIMARY;

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!unit) {
    throw new Error("Unit not found.");
  }

  const dept = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!dept) {
    throw new Error("Department not found.");
  }

  await prisma.unitDepartmentResponsibility.upsert({
    where: {
      unitId_departmentId: { unitId: parsed.unitId, departmentId: parsed.departmentId },
    },
    update: {
      kind,
      riskLevel: parsed.riskLevel ?? null,
      cleaningFrequency: parsed.cleaningFrequency ?? null,
      inspectionFrequency: parsed.inspectionFrequency ?? null,
    },
    create: {
      unitId: parsed.unitId,
      departmentId: parsed.departmentId,
      kind,
      riskLevel: parsed.riskLevel ?? null,
      cleaningFrequency: parsed.cleaningFrequency ?? null,
      inspectionFrequency: parsed.inspectionFrequency ?? null,
    },
  });

  revalidateShellViews();
}

export async function deleteUnitDepartmentResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = deleteResponsibilitySchema.parse({
    responsibilityId: formData.get("responsibilityId"),
  });

  const row = await prisma.unitDepartmentResponsibility.findFirst({
    where: { id: parsed.responsibilityId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!row) {
    throw new Error("Responsibility not found.");
  }

  await prisma.unitDepartmentResponsibility.delete({ where: { id: row.id } });
  revalidateShellViews();
}
