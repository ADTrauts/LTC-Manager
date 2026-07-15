"use server";

import { revalidatePath } from "next/cache";
import { SpaceType, UnitDepartmentKind, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { requireAtLeastRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { wouldCreateCycle } from "@/lib/facility-builder/load-facility-hierarchy";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function revalidateBuilderViews() {
  revalidatePath("/admin/facility/builder");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

// ---------------------------------------------------------------------------
// Unit schemas
// ---------------------------------------------------------------------------

const UNIT_TYPES = Object.values(UnitType) as [UnitType, ...UnitType[]];
const SPACE_TYPES = Object.values(SpaceType) as [SpaceType, ...SpaceType[]];
const DEPT_KINDS = Object.values(UnitDepartmentKind) as [UnitDepartmentKind, ...UnitDepartmentKind[]];

const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unitType: z.enum(UNIT_TYPES),
  parentUnitId: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
});

const updateUnitSchema = createUnitSchema.extend({
  unitId: z.string().cuid(),
});

// ---------------------------------------------------------------------------
// Unit actions
// ---------------------------------------------------------------------------

export async function createBuilderUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createUnitSchema.parse({
    name: formData.get("name"),
    unitType: formData.get("unitType"),
    parentUnitId: toOptional(formData.get("parentUnitId")),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  if (parsed.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent unit not found in this facility.");
  }

  const existing = await prisma.unit.findFirst({
    where: { facilityId: session.facilityId, name: parsed.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A unit named "${parsed.name}" already exists.`);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: parsed.unitType,
      parentUnitId: parsed.parentUnitId || null,
      description: parsed.description || null,
      displayOrder: parsed.displayOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function updateBuilderUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = updateUnitSchema.parse({
    unitId: formData.get("unitId"),
    name: formData.get("name"),
    unitType: formData.get("unitType"),
    parentUnitId: toOptional(formData.get("parentUnitId")),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  if (parsed.parentUnitId && parsed.parentUnitId === parsed.unitId) {
    throw new Error("A unit cannot be its own parent.");
  }

  if (parsed.parentUnitId) {
    const allUnits = await prisma.unit.findMany({
      where: { facilityId: session.facilityId },
      select: { id: true, parentUnitId: true },
    });
    if (wouldCreateCycle(parsed.unitId, parsed.parentUnitId, allUnits)) {
      throw new Error("This parent assignment would create a circular hierarchy.");
    }
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent unit not found in this facility.");
  }

  const duplicate = await prisma.unit.findFirst({
    where: { facilityId: session.facilityId, name: parsed.name, id: { not: parsed.unitId } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`A unit named "${parsed.name}" already exists.`);

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: {
      name: parsed.name,
      unitType: parsed.unitType,
      parentUnitId: parsed.parentUnitId || null,
      description: parsed.description || null,
      displayOrder: parsed.displayOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function deleteBuilderUnitAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const unitId = z.string().cuid().parse(formData.get("unitId"));

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId: session.facilityId },
    select: {
      id: true,
      _count: {
        select: { childUnits: true, childSpaces: true },
      },
    },
  });
  if (!unit) throw new Error("Unit not found.");
  if (unit._count.childUnits > 0) {
    throw new Error("Cannot delete a unit that has child units. Remove or reassign children first.");
  }
  if (unit._count.childSpaces > 0) {
    throw new Error("Cannot delete a unit that has spaces. Remove spaces first.");
  }

  await prisma.unit.delete({ where: { id: unitId } });
  revalidateBuilderViews();
}

// ---------------------------------------------------------------------------
// Space schemas
// ---------------------------------------------------------------------------

const createSpaceSchema = z.object({
  unitId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  spaceType: z.enum(SPACE_TYPES),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
});

const updateSpaceSchema = createSpaceSchema.extend({
  spaceId: z.string().cuid(),
});

// ---------------------------------------------------------------------------
// Space actions
// ---------------------------------------------------------------------------

export async function createBuilderSpaceAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createSpaceSchema.parse({
    unitId: formData.get("unitId"),
    name: formData.get("name"),
    spaceType: formData.get("spaceType"),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const existing = await prisma.unitSpace.findFirst({
    where: { unitId: parsed.unitId, name: parsed.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A space named "${parsed.name}" already exists in this unit.`);

  await prisma.unitSpace.create({
    data: {
      unitId: parsed.unitId,
      facilityId: unit.facilityId,
      name: parsed.name,
      spaceType: parsed.spaceType,
      code: parsed.code || null,
      description: parsed.description || null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function updateBuilderSpaceAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = updateSpaceSchema.parse({
    spaceId: formData.get("spaceId"),
    unitId: formData.get("unitId"),
    name: formData.get("name"),
    spaceType: formData.get("spaceType"),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!space) throw new Error("Space not found.");

  const duplicate = await prisma.unitSpace.findFirst({
    where: { unitId: parsed.unitId, name: parsed.name, id: { not: parsed.spaceId } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`A space named "${parsed.name}" already exists in this unit.`);

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      name: parsed.name,
      spaceType: parsed.spaceType,
      code: parsed.code || null,
      description: parsed.description || null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function deleteBuilderSpaceAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const spaceId = z.string().cuid().parse(formData.get("spaceId"));

  const space = await prisma.unitSpace.findFirst({
    where: { id: spaceId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!space) throw new Error("Space not found.");

  await prisma.unitSpace.delete({ where: { id: spaceId } });
  revalidateBuilderViews();
}

// ---------------------------------------------------------------------------
// Responsibility actions
// ---------------------------------------------------------------------------

const upsertUnitResponsibilitySchema = z.object({
  unitId: z.string().cuid(),
  departmentId: z.string().cuid(),
  kind: z.enum(DEPT_KINDS),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  riskLevel: z.string().trim().max(120).optional(),
  cleaningFrequency: z.string().trim().max(120).optional(),
  inspectionFrequency: z.string().trim().max(120).optional(),
});

export async function upsertBuilderUnitResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const capabilitiesRaw = formData.getAll("capabilities").filter((v) => typeof v === "string" && v.trim());

  const parsed = upsertUnitResponsibilitySchema.parse({
    unitId: formData.get("unitId"),
    departmentId: formData.get("departmentId"),
    kind: formData.get("kind"),
    capabilities: capabilitiesRaw,
    riskLevel: toOptional(formData.get("riskLevel")),
    cleaningFrequency: toOptional(formData.get("cleaningFrequency")),
    inspectionFrequency: toOptional(formData.get("inspectionFrequency")),
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found in this facility.");

  const dept = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!dept) throw new Error("Department not found.");

  await prisma.unitDepartmentResponsibility.upsert({
    where: {
      unitId_departmentId: { unitId: parsed.unitId, departmentId: parsed.departmentId },
    },
    update: {
      kind: parsed.kind,
      capabilities: parsed.capabilities,
      riskLevel: parsed.riskLevel ?? null,
      cleaningFrequency: parsed.cleaningFrequency ?? null,
      inspectionFrequency: parsed.inspectionFrequency ?? null,
    },
    create: {
      unitId: parsed.unitId,
      departmentId: parsed.departmentId,
      kind: parsed.kind,
      capabilities: parsed.capabilities,
      riskLevel: parsed.riskLevel ?? null,
      cleaningFrequency: parsed.cleaningFrequency ?? null,
      inspectionFrequency: parsed.inspectionFrequency ?? null,
    },
  });

  revalidateBuilderViews();
}

export async function deleteBuilderUnitResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const responsibilityId = z.string().cuid().parse(formData.get("responsibilityId"));

  const row = await prisma.unitDepartmentResponsibility.findFirst({
    where: { id: responsibilityId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!row) throw new Error("Responsibility not found.");

  await prisma.unitDepartmentResponsibility.delete({ where: { id: row.id } });
  revalidateBuilderViews();
}

const upsertSpaceResponsibilitySchema = z.object({
  spaceId: z.string().cuid(),
  departmentId: z.string().cuid(),
  capabilities: z.array(z.string().trim().min(1)).default([]),
});

export async function upsertBuilderSpaceResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const capabilitiesRaw = formData.getAll("capabilities").filter((v) => typeof v === "string" && v.trim());

  const parsed = upsertSpaceResponsibilitySchema.parse({
    spaceId: formData.get("spaceId"),
    departmentId: formData.get("departmentId"),
    capabilities: capabilitiesRaw,
  });

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!space) throw new Error("Space not found in this facility.");

  const dept = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!dept) throw new Error("Department not found.");

  await prisma.unitSpaceResponsibility.upsert({
    where: {
      spaceId_departmentId: { spaceId: parsed.spaceId, departmentId: parsed.departmentId },
    },
    update: { capabilities: parsed.capabilities },
    create: {
      spaceId: parsed.spaceId,
      departmentId: parsed.departmentId,
      capabilities: parsed.capabilities,
    },
  });

  revalidateBuilderViews();
}

export async function deleteBuilderSpaceResponsibilityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const responsibilityId = z.string().cuid().parse(formData.get("responsibilityId"));

  const row = await prisma.unitSpaceResponsibility.findFirst({
    where: { id: responsibilityId, space: { unit: { facilityId: session.facilityId } } },
    select: { id: true },
  });
  if (!row) throw new Error("Space responsibility not found.");

  await prisma.unitSpaceResponsibility.delete({ where: { id: row.id } });
  revalidateBuilderViews();
}
