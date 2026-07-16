"use server";

import { revalidatePath } from "next/cache";
import { SpaceType, UnitDepartmentKind, UnitHierarchyRole, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { requireAtLeastRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { wouldCreateCycle } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  FLOOR_INTERNAL_UNIT_TYPE,
  resolveBuilderNodeDisplayKind,
  canMoveUnitOnto,
  canMoveRoomOnto,
} from "@/lib/facility-builder/builder-display";
import {
  BULK_ROOM_MAX,
  mergeOrderedSubsetIntoSiblings,
  normalizeSiblingOrders,
  parseBulkRoomLines,
} from "@/lib/facility-builder/builder-setup";

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

async function assertUniqueUnitName(
  facilityId: string,
  name: string,
  excludeId?: string,
) {
  const existing = await prisma.unit.findFirst({
    where: {
      facilityId,
      name,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new Error(`A unit named "${name}" already exists.`);
}

// ---------------------------------------------------------------------------
// Unit schemas
// ---------------------------------------------------------------------------

const UNIT_TYPES = Object.values(UnitType) as [UnitType, ...UnitType[]];
const SPACE_TYPES = Object.values(SpaceType) as [SpaceType, ...SpaceType[]];
const DEPT_KINDS = Object.values(UnitDepartmentKind) as [UnitDepartmentKind, ...UnitDepartmentKind[]];

const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
});

const createNeighborhoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentUnitId: z.string().cuid(),
  unitType: z.enum(UNIT_TYPES).default(UnitType.OTHER),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
});

const updateUnitSchema = z.object({
  unitId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  unitType: z.enum(UNIT_TYPES).optional(),
  parentUnitId: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(1).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Unit actions
// ---------------------------------------------------------------------------

/** @deprecated Prefer createBuilderFloorAction / createBuilderNeighborhoodAction */
export async function createBuilderUnitAction(formData: FormData) {
  const intent = formData.get("hierarchyIntent");
  if (intent === "floor" || !toOptional(formData.get("parentUnitId"))) {
    return createBuilderFloorAction(formData);
  }
  return createBuilderNeighborhoodAction(formData);
}

export async function createBuilderFloorAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createFloorSchema.parse({
    name: formData.get("name"),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  await assertUniqueUnitName(session.facilityId, parsed.name);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      // Schema requires UnitType; OTHER is a hidden compatibility default for Floors.
      unitType: FLOOR_INTERNAL_UNIT_TYPE,
      hierarchyRole: UnitHierarchyRole.FLOOR,
      parentUnitId: null,
      description: parsed.description || null,
      displayOrder: parsed.displayOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function createBuilderNeighborhoodAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createNeighborhoodSchema.parse({
    name: formData.get("name"),
    parentUnitId: formData.get("parentUnitId"),
    unitType: formData.get("unitType") || UnitType.OTHER,
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  const parent = await prisma.unit.findFirst({
    where: { id: parsed.parentUnitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!parent) throw new Error("Parent floor not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(parent);
  if (parentKind !== "floor") {
    throw new Error("Neighborhoods must be created under a Floor.");
  }

  await assertUniqueUnitName(session.facilityId, parsed.name);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: parsed.unitType,
      hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
      parentUnitId: parsed.parentUnitId,
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
    unitType: toOptional(formData.get("unitType")),
    parentUnitId: toOptional(formData.get("parentUnitId")),
    description: toOptional(formData.get("description")),
    displayOrder: formData.get("displayOrder"),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  const existingUnit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, hierarchyRole: true, parentUnitId: true, unitType: true },
  });
  if (!existingUnit) throw new Error("Unit not found.");

  const kind = resolveBuilderNodeDisplayKind(existingUnit);

  if (parsed.parentUnitId && parsed.parentUnitId === parsed.unitId) {
    throw new Error("A unit cannot be its own parent.");
  }

  let nextParentId = parsed.parentUnitId ?? null;
  let nextRole = existingUnit.hierarchyRole;

  if (kind === "floor") {
    // Floors remain top-level; parent selector is not used for floors.
    nextParentId = null;
    nextRole = UnitHierarchyRole.FLOOR;
  } else if (nextParentId) {
    const allUnits = await prisma.unit.findMany({
      where: { facilityId: session.facilityId },
      select: { id: true, parentUnitId: true },
    });
    if (wouldCreateCycle(parsed.unitId, nextParentId, allUnits)) {
      throw new Error("This parent assignment would create a circular hierarchy.");
    }
    const parent = await prisma.unit.findFirst({
      where: { id: nextParentId, facilityId: session.facilityId },
      select: { id: true, parentUnitId: true, hierarchyRole: true },
    });
    if (!parent) throw new Error("Parent unit not found in this facility.");
    if (resolveBuilderNodeDisplayKind(parent) !== "floor") {
      throw new Error("Neighborhoods must sit under a Floor.");
    }
    nextRole = UnitHierarchyRole.NEIGHBORHOOD;
  }

  await assertUniqueUnitName(session.facilityId, parsed.name, parsed.unitId);

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: {
      name: parsed.name,
      unitType: kind === "floor" ? existingUnit.unitType : (parsed.unitType ?? existingUnit.unitType),
      hierarchyRole: nextRole,
      parentUnitId: nextParentId,
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
      name: true,
      _count: {
        select: {
          childUnits: true,
          childSpaces: true,
          scheduleEntries: true,
          assets: true,
          repairs: true,
          logSubmissions: true,
          overrideNewUnit: true,
        },
      },
    },
  });
  if (!unit) throw new Error("Unit not found.");
  if (unit._count.childUnits > 0) {
    throw new Error(
      "Cannot delete a floor/neighborhood that has nested neighborhoods. Remove or move them first.",
    );
  }
  if (unit._count.childSpaces > 0) {
    throw new Error(
      "Cannot delete a floor/neighborhood that has rooms. Remove rooms first.",
    );
  }

  // Clear Restrict FK dependents, then delete the Unit.
  // Cascade relations (access, meal times, responsibilities, etc.) go with the Unit.
  // There is no archive table yet — related operational rows for this location are removed.
  await prisma.$transaction(async (tx) => {
    await tx.assignmentOverride.deleteMany({ where: { newUnitId: unitId } });
    await tx.scheduleEntry.deleteMany({ where: { unitId } });
    await tx.logSubmission.deleteMany({ where: { unitId } });
    await tx.repair.deleteMany({ where: { unitId } });
    await tx.asset.deleteMany({ where: { unitId } });
    await tx.unit.delete({ where: { id: unitId } });
  });

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
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (parentKind === "floor") {
    throw new Error("Rooms must be added under a Neighborhood / Unit, not directly under a Floor.");
  }

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

const bulkCreateSpacesSchema = z.object({
  unitId: z.string().cuid(),
  namesText: z.string().min(1),
  spaceType: z.enum(SPACE_TYPES),
  descriptionPrefix: z.string().trim().max(200).optional(),
});

export type BulkCreateSpacesResult = {
  created: number;
  skippedExisting: string[];
  skippedDuplicateInBatch: string[];
  errors: string[];
};

/**
 * Create many rooms under one Neighborhood / legacy location in a single transaction.
 * Preserves input order; assigns sequential sortOrder after existing rooms.
 */
export async function createBuilderSpacesBulkAction(
  formData: FormData,
): Promise<BulkCreateSpacesResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = bulkCreateSpacesSchema.parse({
    unitId: formData.get("unitId"),
    namesText: formData.get("namesText"),
    spaceType: formData.get("spaceType"),
    descriptionPrefix: toOptional(formData.get("descriptionPrefix")),
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (parentKind === "floor") {
    throw new Error("Rooms must be added under a Neighborhood / Unit, not directly under a Floor.");
  }

  const parsedLines = parseBulkRoomLines(parsed.namesText);
  if (parsedLines.names.length === 0) {
    throw new Error("Enter at least one room name (one per line).");
  }
  if (parsedLines.names.length > BULK_ROOM_MAX) {
    throw new Error(`Batch limited to ${BULK_ROOM_MAX} rooms. Split into smaller batches.`);
  }

  const existingSpaces = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId },
    select: { name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  const existingNames = new Set(existingSpaces.map((s) => s.name));
  const maxSort =
    existingSpaces.length > 0
      ? Math.max(...existingSpaces.map((s) => s.sortOrder))
      : 0;

  const toCreate: string[] = [];
  const skippedExisting: string[] = [];
  for (const name of parsedLines.names) {
    if (existingNames.has(name)) {
      skippedExisting.push(name);
      continue;
    }
    toCreate.push(name);
  }

  if (toCreate.length === 0) {
    return {
      created: 0,
      skippedExisting,
      skippedDuplicateInBatch: parsedLines.duplicateInBatch,
      errors: skippedExisting.length > 0
        ? ["All entered names already exist in this neighborhood."]
        : ["No rooms to create."],
    };
  }

  const description =
    parsed.descriptionPrefix && parsed.descriptionPrefix.length > 0
      ? parsed.descriptionPrefix
      : null;

  await prisma.$transaction(
    toCreate.map((name, index) =>
      prisma.unitSpace.create({
        data: {
          unitId: parsed.unitId,
          facilityId: unit.facilityId,
          name,
          spaceType: parsed.spaceType,
          code: null,
          description,
          sortOrder: Math.min(9999, maxSort + (index + 1) * 10),
          isActive: true,
        },
      }),
    ),
  );

  revalidateBuilderViews();

  return {
    created: toCreate.length,
    skippedExisting,
    skippedDuplicateInBatch: parsedLines.duplicateInBatch,
    errors: [],
  };
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

// ---------------------------------------------------------------------------
// Drag-and-drop move / reorder actions
// ---------------------------------------------------------------------------

const moveUnitSchema = z.object({
  unitId: z.string().cuid(),
  newParentUnitId: z.string().cuid().nullable(),
  newDisplayOrder: z.number().int().min(1).max(9999),
});

async function normalizeUnitSiblingOrders(
  facilityId: string,
  parentUnitId: string | null,
  orderedIds?: string[],
) {
  const siblings = await prisma.unit.findMany({
    where: { facilityId, parentUnitId },
    select: { id: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });

  let ids = siblings.map((s) => s.id);
  if (orderedIds && orderedIds.length > 0) {
    const idSet = new Set(ids);
    const ordered = orderedIds.filter((id) => idSet.has(id));
    const missing = ids.filter((id) => !ordered.includes(id));
    ids = [...ordered, ...missing];
  }

  const normalized = normalizeSiblingOrders(ids);
  await prisma.$transaction(
    normalized.map(({ id, order }) =>
      prisma.unit.update({
        where: { id },
        data: { displayOrder: order },
      }),
    ),
  );
}

async function normalizeSpaceSiblingOrders(unitId: string, orderedIds?: string[]) {
  const siblings = await prisma.unitSpace.findMany({
    where: { unitId },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  let ids = siblings.map((s) => s.id);
  if (orderedIds && orderedIds.length > 0) {
    const idSet = new Set(ids);
    const ordered = orderedIds.filter((id) => idSet.has(id));
    const missing = ids.filter((id) => !ordered.includes(id));
    ids = [...ordered, ...missing];
  }

  const normalized = normalizeSiblingOrders(ids);
  await prisma.$transaction(
    normalized.map(({ id, order }) =>
      prisma.unitSpace.update({
        where: { id },
        data: { sortOrder: order },
      }),
    ),
  );
}

export async function moveBuilderUnitAction(data: z.infer<typeof moveUnitSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = moveUnitSchema.parse(data);

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Unit not found.");

  const dragKind = resolveBuilderNodeDisplayKind(unit);

  if (!parsed.newParentUnitId) {
    throw new Error("Moving to top-level requires Convert to Floor.");
  }

  if (parsed.newParentUnitId === parsed.unitId) {
    throw new Error("A unit cannot be its own parent.");
  }

  const allUnits = await prisma.unit.findMany({
    where: { facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (wouldCreateCycle(parsed.unitId, parsed.newParentUnitId, allUnits)) {
    throw new Error("This move would create a circular hierarchy.");
  }

  const parent = allUnits.find((u) => u.id === parsed.newParentUnitId);
  if (!parent) throw new Error("Target parent not found.");

  const dropKind = resolveBuilderNodeDisplayKind(parent);
  if (!canMoveUnitOnto(dragKind, dropKind)) {
    throw new Error(
      dragKind === "floor"
        ? "Floors cannot be moved under another location."
        : "Locations can only be moved onto a Floor.",
    );
  }

  const previousParentId = unit.parentUnitId;

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: parsed.newParentUnitId },
    select: { displayOrder: true },
  });
  const maxOrder =
    siblings.length > 0 ? Math.max(...siblings.map((s) => s.displayOrder)) : 0;
  const nextOrder = Math.min(9999, maxOrder + 10);

  // Append then normalize — do not trust client displayOrder for placement.
  void parsed.newDisplayOrder;
  await prisma.unit.update({
    where: { id: parsed.unitId },
    data: {
      parentUnitId: parsed.newParentUnitId,
      displayOrder: nextOrder,
      hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
    },
  });

  await normalizeUnitSiblingOrders(session.facilityId, parsed.newParentUnitId);
  if (previousParentId !== parsed.newParentUnitId) {
    await normalizeUnitSiblingOrders(session.facilityId, previousParentId);
  }

  revalidateBuilderViews();
}

const moveSpaceSchema = z.object({
  spaceId: z.string().cuid(),
  newUnitId: z.string().cuid(),
  newSortOrder: z.number().int().min(1).max(9999),
});

export async function moveBuilderSpaceAction(data: z.infer<typeof moveSpaceSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = moveSpaceSchema.parse(data);

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, unit: { facilityId: session.facilityId } },
    select: { id: true, unitId: true },
  });
  if (!space) throw new Error("Space not found.");

  const targetUnit = await prisma.unit.findFirst({
    where: { id: parsed.newUnitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!targetUnit) throw new Error("Target neighborhood not found.");

  const dropKind = resolveBuilderNodeDisplayKind(targetUnit);
  if (!canMoveRoomOnto(dropKind)) {
    throw new Error("Rooms can only be moved into a Neighborhood / Unit.");
  }

  const previousUnitId = space.unitId;

  const siblings = await prisma.unitSpace.findMany({
    where: { unitId: parsed.newUnitId },
    select: { sortOrder: true },
  });
  const maxSort =
    siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) : 0;
  const nextSort = Math.min(9999, maxSort + 10);

  // Append then normalize — do not trust client sortOrder for placement.
  void parsed.newSortOrder;
  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      unitId: parsed.newUnitId,
      sortOrder: nextSort,
    },
  });

  await normalizeSpaceSiblingOrders(parsed.newUnitId);
  if (previousUnitId !== parsed.newUnitId) {
    await normalizeSpaceSiblingOrders(previousUnitId);
  }

  revalidateBuilderViews();
}

const reorderUnitsSchema = z.object({
  parentUnitId: z.string().cuid().nullable(),
  orderedIds: z.array(z.string().cuid()).min(1).max(500),
});

/**
 * Persist sibling displayOrder for units under the same parent (or top-level when null).
 * Does not change hierarchyRole or parentUnitId.
 */
export async function reorderBuilderUnitsAction(data: z.infer<typeof reorderUnitsSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = reorderUnitsSchema.parse(data);

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: parsed.parentUnitId },
    select: { id: true, hierarchyRole: true, parentUnitId: true },
    orderBy: { displayOrder: "asc" },
  });
  const siblingIds = new Set(siblings.map((s) => s.id));

  for (const id of parsed.orderedIds) {
    if (!siblingIds.has(id)) {
      throw new Error("Reorder list includes a unit that is not a sibling in this facility.");
    }
  }

  // Floors cannot be mixed into a neighborhood parent list via reorder.
  if (parsed.parentUnitId === null) {
    for (const id of parsed.orderedIds) {
      const row = siblings.find((s) => s.id === id)!;
      const kind = resolveBuilderNodeDisplayKind(row);
      if (kind === "neighborhood") {
        throw new Error("Neighborhoods cannot be reordered at the top level.");
      }
    }
  } else {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true, parentUnitId: true, hierarchyRole: true },
    });
    if (!parent) throw new Error("Parent floor not found.");
    if (resolveBuilderNodeDisplayKind(parent) !== "floor") {
      throw new Error("Unit reordering under a non-Floor parent is not supported.");
    }
  }

  await normalizeUnitSiblingOrders(
    session.facilityId,
    parsed.parentUnitId,
    mergeOrderedSubsetIntoSiblings(
      siblings.map((s) => s.id),
      parsed.orderedIds,
    ),
  );

  revalidateBuilderViews();
}

const reorderSpacesSchema = z.object({
  unitId: z.string().cuid(),
  orderedIds: z.array(z.string().cuid()).min(1).max(500),
});

/**
 * Persist sibling sortOrder for rooms under one neighborhood / legacy location.
 */
export async function reorderBuilderSpacesAction(data: z.infer<typeof reorderSpacesSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = reorderSpacesSchema.parse(data);

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Neighborhood not found in this facility.");

  const kind = resolveBuilderNodeDisplayKind(unit);
  if (kind === "floor") {
    throw new Error("Rooms cannot be ordered under a Floor.");
  }

  const spaces = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId },
    select: { id: true },
  });
  const spaceIds = new Set(spaces.map((s) => s.id));
  for (const id of parsed.orderedIds) {
    if (!spaceIds.has(id)) {
      throw new Error("Reorder list includes a room that is not in this neighborhood.");
    }
  }

  await normalizeSpaceSiblingOrders(parsed.unitId, parsed.orderedIds);
  revalidateBuilderViews();
}

export async function convertBuilderLegacyToFloorAction(unitId: string) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const id = z.string().cuid().parse(unitId);
  const unit = await prisma.unit.findFirst({
    where: { id, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Unit not found.");

  const kind = resolveBuilderNodeDisplayKind(unit);
  if (kind !== "legacy_location") {
    throw new Error("Only unassigned top-level locations can be converted to a Floor.");
  }
  if (unit.parentUnitId != null) {
    throw new Error("Only top-level locations can become Floors.");
  }

  await prisma.unit.update({
    where: { id },
    data: {
      hierarchyRole: UnitHierarchyRole.FLOOR,
      parentUnitId: null,
    },
  });

  revalidateBuilderViews();
}

const renameUnitSchema = z.object({
  unitId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
});

export async function renameBuilderUnitAction(data: z.infer<typeof renameUnitSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = renameUnitSchema.parse(data);

  const duplicate = await prisma.unit.findFirst({
    where: { facilityId: session.facilityId, name: parsed.name, id: { not: parsed.unitId } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`"${parsed.name}" already exists.`);

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: { name: parsed.name },
  });

  revalidateBuilderViews();
}

const renameSpaceSchema = z.object({
  spaceId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
});

export async function renameBuilderSpaceAction(data: z.infer<typeof renameSpaceSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = renameSpaceSchema.parse(data);

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, unit: { facilityId: session.facilityId } },
    select: { id: true, unitId: true },
  });
  if (!space) throw new Error("Room not found.");

  const duplicate = await prisma.unitSpace.findFirst({
    where: { unitId: space.unitId, name: parsed.name, id: { not: parsed.spaceId } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`"${parsed.name}" already exists in this neighborhood.`);

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: { name: parsed.name },
  });

  revalidateBuilderViews();
}

export async function toggleBuilderUnitActiveAction(unitId: string) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const id = z.string().cuid().parse(unitId);
  const unit = await prisma.unit.findFirst({
    where: { id, facilityId: session.facilityId },
    select: { id: true, isActive: true },
  });
  if (!unit) throw new Error("Unit not found.");

  await prisma.unit.update({
    where: { id },
    data: { isActive: !unit.isActive },
  });

  revalidateBuilderViews();
}
