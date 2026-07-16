"use server";

import { revalidatePath } from "next/cache";
import { UnitDepartmentKind, UnitHierarchyRole, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { requireAtLeastRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { wouldCreateCycle } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  FLOOR_INTERNAL_UNIT_TYPE,
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
  resolveBuilderNodeDisplayKind,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
} from "@/lib/facility-builder/builder-display";
import {
  BULK_ROOM_MAX,
  mergeOrderedSubsetIntoSiblings,
  nextAppendDisplayOrder,
  nextAppendSortOrder,
  normalizeSiblingOrders,
  parseBulkRoomLines,
} from "@/lib/facility-builder/builder-setup";
import {
  resolveSpaceTypeFromPreset,
} from "@/lib/facility-builder/space-type-presets";

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
const DEPT_KINDS = Object.values(UnitDepartmentKind) as [UnitDepartmentKind, ...UnitDepartmentKind[]];

const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

const createNeighborhoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Omit / empty = create in Undesignated (STAGED). */
  parentUnitId: z.string().cuid().optional().nullable(),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

const updateUnitSchema = z.object({
  unitId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  /** Advanced-only; floors ignore this. */
  unitType: z.enum(UNIT_TYPES).optional(),
  parentUnitId: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
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
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  // Ignore any client-supplied type / displayOrder.
  void formData.get("displayOrder");
  void formData.get("unitType");

  await assertUniqueUnitName(session.facilityId, parsed.name);

  const topLevel = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: null },
    select: { displayOrder: true },
  });
  const displayOrder = nextAppendDisplayOrder(topLevel);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: FLOOR_INTERNAL_UNIT_TYPE,
      hierarchyRole: UnitHierarchyRole.FLOOR,
      parentUnitId: null,
      description: parsed.description || null,
      displayOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function createBuilderNeighborhoodAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const rawParent = toOptional(formData.get("parentUnitId"));
  const parsed = createNeighborhoodSchema.parse({
    name: formData.get("name"),
    parentUnitId: rawParent ?? null,
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("displayOrder");
  void formData.get("unitType");

  await assertUniqueUnitName(session.facilityId, parsed.name);

  // Toolbar create → Undesignated (STAGED)
  if (!parsed.parentUnitId) {
    const stagedSiblings = await prisma.unit.findMany({
      where: {
        facilityId: session.facilityId,
        hierarchyRole: UnitHierarchyRole.STAGED,
      },
      select: { displayOrder: true },
    });
    const displayOrder = nextAppendDisplayOrder(stagedSiblings);

    await prisma.unit.create({
      data: {
        facilityId: session.facilityId,
        name: parsed.name,
        unitType: NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
        hierarchyRole: UnitHierarchyRole.STAGED,
        parentUnitId: null,
        description: parsed.description || null,
        displayOrder,
        isActive: parsed.isActive,
      },
    });

    revalidateBuilderViews();
    return;
  }

  const parent = await prisma.unit.findFirst({
    where: { id: parsed.parentUnitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!parent) throw new Error("Parent floor not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(parent);
  if (parentKind !== "floor") {
    throw new Error("Neighborhoods must be created under a Floor.");
  }

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: parsed.parentUnitId },
    select: { displayOrder: true },
  });
  const displayOrder = nextAppendDisplayOrder(siblings);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
      hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
      parentUnitId: parsed.parentUnitId,
      description: parsed.description || null,
      displayOrder,
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
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  // Ordering is DnD-only — ignore client displayOrder.
  void formData.get("displayOrder");

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
  } else {
    // Cleared parent → Undesignated staging (builder-only).
    nextParentId = null;
    nextRole = UnitHierarchyRole.STAGED;
  }

  await assertUniqueUnitName(session.facilityId, parsed.name, parsed.unitId);

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: {
      name: parsed.name,
      // Floors never change unitType; neighborhoods may update via Advanced settings only.
      unitType: kind === "floor" ? existingUnit.unitType : (parsed.unitType ?? existingUnit.unitType),
      hierarchyRole: nextRole,
      parentUnitId: nextParentId,
      description: parsed.description || null,
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
  /** Omit / empty = create in Undesignated. */
  unitId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  spaceTypePreset: z.string().trim().min(1),
  customTypeLabel: z.string().trim().max(80).optional(),
  roomNumber: z.string().trim().max(32).optional(),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

const updateSpaceSchema = z.object({
  spaceId: z.string().cuid(),
  /** Current or next parent; null keeps / sets undesignated. */
  unitId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  spaceTypePreset: z.string().trim().min(1),
  customTypeLabel: z.string().trim().max(80).optional(),
  roomNumber: z.string().trim().max(32).optional(),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Space actions
// ---------------------------------------------------------------------------

export async function createBuilderSpaceAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const rawUnitId = toOptional(formData.get("unitId"));
  const parsed = createSpaceSchema.parse({
    unitId: rawUnitId ?? null,
    name: formData.get("name"),
    spaceTypePreset: formData.get("spaceTypePreset") || formData.get("spaceType"),
    customTypeLabel: toOptional(formData.get("customTypeLabel")),
    roomNumber: toOptional(formData.get("roomNumber")),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("sortOrder");

  const resolved = resolveSpaceTypeFromPreset({
    presetKey: parsed.spaceTypePreset,
    customTypeLabel: parsed.customTypeLabel,
  });

  // Toolbar create → Undesignated (unitId null)
  if (!parsed.unitId) {
    const existing = await prisma.unitSpace.findFirst({
      where: { facilityId: session.facilityId, unitId: null, name: parsed.name },
      select: { id: true },
    });
    if (existing) {
      throw new Error(`A space named "${parsed.name}" already exists in Undesignated.`);
    }

    const siblings = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null },
      select: { sortOrder: true },
    });
    const sortOrder = nextAppendSortOrder(siblings);

    await prisma.unitSpace.create({
      data: {
        unitId: null,
        facilityId: session.facilityId,
        name: parsed.name,
        spaceType: resolved.spaceType,
        customTypeLabel: resolved.customTypeLabel,
        roomNumber: parsed.roomNumber || null,
        code: parsed.code || null,
        description: parsed.description || null,
        sortOrder,
        isActive: parsed.isActive,
      },
    });

    revalidateBuilderViews();
    return;
  }

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (!canAddRoom(parentKind)) {
    throw new Error("Rooms cannot be added under this location type.");
  }

  const existing = await prisma.unitSpace.findFirst({
    where: { unitId: parsed.unitId, name: parsed.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A space named "${parsed.name}" already exists in this unit.`);

  const siblings = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId },
    select: { sortOrder: true },
  });
  const sortOrder = nextAppendSortOrder(siblings);

  await prisma.unitSpace.create({
    data: {
      unitId: parsed.unitId,
      facilityId: unit.facilityId,
      name: parsed.name,
      spaceType: resolved.spaceType,
      customTypeLabel: resolved.customTypeLabel,
      roomNumber: parsed.roomNumber || null,
      code: parsed.code || null,
      description: parsed.description || null,
      sortOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

const bulkCreateSpacesSchema = z.object({
  unitId: z.string().cuid(),
  namesText: z.string().min(1),
  spaceTypePreset: z.string().trim().min(1),
  customTypeLabel: z.string().trim().max(80).optional(),
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
    spaceTypePreset: formData.get("spaceTypePreset") || formData.get("spaceType"),
    customTypeLabel: toOptional(formData.get("customTypeLabel")),
    descriptionPrefix: toOptional(formData.get("descriptionPrefix")),
  });

  const resolved = resolveSpaceTypeFromPreset({
    presetKey: parsed.spaceTypePreset,
    customTypeLabel: parsed.customTypeLabel,
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (!canAddRoom(parentKind)) {
    throw new Error("Rooms cannot be bulk-created under this location type.");
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
          spaceType: resolved.spaceType,
          customTypeLabel: resolved.customTypeLabel,
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
    spaceTypePreset: formData.get("spaceTypePreset") || formData.get("spaceType"),
    customTypeLabel: toOptional(formData.get("customTypeLabel")),
    roomNumber: toOptional(formData.get("roomNumber")),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("sortOrder");

  const resolved = resolveSpaceTypeFromPreset({
    presetKey: parsed.spaceTypePreset,
    customTypeLabel: parsed.customTypeLabel,
  });

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, facilityId: session.facilityId },
    select: { id: true, unitId: true },
  });
  if (!space) throw new Error("Space not found.");

  const duplicate = await prisma.unitSpace.findFirst({
    where: {
      facilityId: session.facilityId,
      unitId: space.unitId,
      name: parsed.name,
      id: { not: parsed.spaceId },
    },
    select: { id: true },
  });
  if (duplicate) throw new Error(`A space named "${parsed.name}" already exists in this unit.`);

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      name: parsed.name,
      spaceType: resolved.spaceType,
      customTypeLabel: resolved.customTypeLabel,
      roomNumber: parsed.roomNumber || null,
      code: parsed.code || null,
      description: parsed.description || null,
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
    where: { id: spaceId, facilityId: session.facilityId },
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
    where: { id: parsed.spaceId, facilityId: session.facilityId },
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
    where: { id: responsibilityId, space: { facilityId: session.facilityId } },
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

/** Normalize sortOrder for rooms under a unit, or undesignated (unitId null) within a facility. */
async function normalizeSpaceSiblingOrders(args: {
  unitId: string | null;
  facilityId?: string;
  orderedIds?: string[];
}) {
  const { unitId, orderedIds } = args;
  if (unitId == null && !args.facilityId) {
    throw new Error("facilityId is required when normalizing undesignated rooms.");
  }

  const siblings = await prisma.unitSpace.findMany({
    where:
      unitId == null
        ? { facilityId: args.facilityId!, unitId: null }
        : { unitId },
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
  if (dragKind === "floor") {
    throw new Error("Floors cannot be moved under another location.");
  }

  const previousParentId = unit.parentUnitId;
  void parsed.newDisplayOrder;

  // Move into Undesignated staging
  if (!parsed.newParentUnitId) {
    const stagedSiblings = await prisma.unit.findMany({
      where: {
        facilityId: session.facilityId,
        hierarchyRole: UnitHierarchyRole.STAGED,
        id: { not: parsed.unitId },
      },
      select: { displayOrder: true },
    });
    const nextOrder = nextAppendDisplayOrder(stagedSiblings);

    await prisma.unit.update({
      where: { id: parsed.unitId },
      data: {
        parentUnitId: null,
        displayOrder: nextOrder,
        hierarchyRole: UnitHierarchyRole.STAGED,
      },
    });

    if (previousParentId != null) {
      await normalizeUnitSiblingOrders(session.facilityId, previousParentId);
    }
    revalidateBuilderViews();
    return;
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
    throw new Error("Locations can only be moved onto a Floor.");
  }

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: parsed.newParentUnitId },
    select: { displayOrder: true },
  });
  const nextOrder = nextAppendDisplayOrder(siblings);

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
  /** null = move into Undesignated. */
  newUnitId: z.string().cuid().nullable(),
  newSortOrder: z.number().int().min(1).max(9999),
});

export async function moveBuilderSpaceAction(data: z.infer<typeof moveSpaceSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = moveSpaceSchema.parse(data);

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, facilityId: session.facilityId },
    select: { id: true, unitId: true, name: true },
  });
  if (!space) throw new Error("Space not found.");

  const previousUnitId = space.unitId;
  void parsed.newSortOrder;

  if (!parsed.newUnitId) {
    const dup = await prisma.unitSpace.findFirst({
      where: {
        facilityId: session.facilityId,
        unitId: null,
        name: space.name,
        id: { not: space.id },
      },
      select: { id: true },
    });
    if (dup) {
      throw new Error(`A space named "${space.name}" already exists in Undesignated.`);
    }

    const siblings = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null },
      select: { sortOrder: true },
    });
    const nextSort = nextAppendSortOrder(siblings);

    await prisma.unitSpace.update({
      where: { id: parsed.spaceId },
      data: { unitId: null, sortOrder: nextSort },
    });

    await normalizeSpaceSiblingOrders({ unitId: null, facilityId: session.facilityId });
    if (previousUnitId != null) {
      await normalizeSpaceSiblingOrders({ unitId: previousUnitId });
    }
    revalidateBuilderViews();
    return;
  }

  const targetUnit = await prisma.unit.findFirst({
    where: { id: parsed.newUnitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!targetUnit) throw new Error("Target location not found.");

  const dropKind = resolveBuilderNodeDisplayKind(targetUnit);
  if (!canMoveRoomOnto(dropKind)) {
    throw new Error("Rooms can only be moved into a Floor, Neighborhood / Unit, or Undesignated.");
  }

  const dup = await prisma.unitSpace.findFirst({
    where: {
      unitId: parsed.newUnitId,
      name: space.name,
      id: { not: space.id },
    },
    select: { id: true },
  });
  if (dup) {
    throw new Error(`A space named "${space.name}" already exists in that location.`);
  }

  const siblings = await prisma.unitSpace.findMany({
    where: { unitId: parsed.newUnitId },
    select: { sortOrder: true },
  });
  const nextSort = nextAppendSortOrder(siblings);

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      unitId: parsed.newUnitId,
      sortOrder: nextSort,
    },
  });

  await normalizeSpaceSiblingOrders({ unitId: parsed.newUnitId });
  if (previousUnitId !== parsed.newUnitId) {
    if (previousUnitId == null) {
      await normalizeSpaceSiblingOrders({ unitId: null, facilityId: session.facilityId });
    } else {
      await normalizeSpaceSiblingOrders({ unitId: previousUnitId });
    }
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

  // Floors / legacy / staged may reorder at top level; placed neighborhoods may not.
  if (parsed.parentUnitId === null) {
    for (const id of parsed.orderedIds) {
      const row = siblings.find((s) => s.id === id)!;
      const kind = resolveBuilderNodeDisplayKind(row);
      if (kind === "neighborhood") {
        throw new Error("Neighborhoods cannot be reordered at the top level.");
      }
    }

    // Undesignated (STAGED) reorders must not rewrite Floor/legacy displayOrder.
    const orderedAreAllStaged = parsed.orderedIds.every((id) => {
      const row = siblings.find((s) => s.id === id)!;
      return resolveBuilderNodeDisplayKind(row) === "staged";
    });
    if (orderedAreAllStaged) {
      const stagedIds = siblings
        .filter((s) => resolveBuilderNodeDisplayKind(s) === "staged")
        .map((s) => s.id);
      const normalized = normalizeSiblingOrders(
        mergeOrderedSubsetIntoSiblings(stagedIds, parsed.orderedIds),
      );
      await prisma.$transaction(
        normalized.map(({ id, order }) =>
          prisma.unit.update({
            where: { id },
            data: { displayOrder: order },
          }),
        ),
      );
      revalidateBuilderViews();
      return;
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
  /** null = reorder Undesignated rooms. */
  unitId: z.string().cuid().nullable(),
  orderedIds: z.array(z.string().cuid()).min(1).max(500),
});

/**
 * Persist sibling sortOrder for rooms under a Floor / Neighborhood / Undesignated.
 */
export async function reorderBuilderSpacesAction(data: z.infer<typeof reorderSpacesSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = reorderSpacesSchema.parse(data);

  if (parsed.unitId == null) {
    const spaces = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null },
      select: { id: true },
    });
    const spaceIds = new Set(spaces.map((s) => s.id));
    for (const id of parsed.orderedIds) {
      if (!spaceIds.has(id)) {
        throw new Error("Reorder list includes a room that is not in Undesignated.");
      }
    }
    await normalizeSpaceSiblingOrders({
      unitId: null,
      facilityId: session.facilityId,
      orderedIds: parsed.orderedIds,
    });
    revalidateBuilderViews();
    return;
  }

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Location not found in this facility.");

  const kind = resolveBuilderNodeDisplayKind(unit);
  if (!canAddRoom(kind)) {
    throw new Error("Rooms cannot be ordered under this location type.");
  }

  const spaces = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId },
    select: { id: true },
  });
  const spaceIds = new Set(spaces.map((s) => s.id));
  for (const id of parsed.orderedIds) {
    if (!spaceIds.has(id)) {
      throw new Error("Reorder list includes a room that is not in this location.");
    }
  }

  await normalizeSpaceSiblingOrders({
    unitId: parsed.unitId,
    orderedIds: parsed.orderedIds,
  });
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
    where: { id: parsed.spaceId, facilityId: session.facilityId },
    select: { id: true, unitId: true },
  });
  if (!space) throw new Error("Room not found.");

  const duplicate = await prisma.unitSpace.findFirst({
    where: {
      facilityId: session.facilityId,
      unitId: space.unitId,
      name: parsed.name,
      id: { not: parsed.spaceId },
    },
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
