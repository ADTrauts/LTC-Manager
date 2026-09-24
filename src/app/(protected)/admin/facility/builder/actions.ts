"use server";

import { revalidatePath } from "next/cache";
import { UnitDepartmentKind, UnitHierarchyRole, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { requireAtLeastRole } from "@/lib/access";
import { pruneTeamRoomsAfterResponsibilityRemoved } from "@/lib/department-teams";
import { prisma } from "@/lib/prisma";
import { wouldCreateCycle, spaceNestError, collectDescendantSpaceIds } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  BUILDING_INTERNAL_UNIT_TYPE,
  FLOOR_INTERNAL_UNIT_TYPE,
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
  resolveBuilderNodeDisplayKind,
  canAddRoom,
  canMoveUnitOnto,
  canMoveRoomOnto,
  isStructuralBuilderKind,
} from "@/lib/facility-builder/builder-display";
import {
  BULK_ROOM_MAX,
  mergeOrderedSubsetIntoSiblings,
  nextAppendDisplayOrder,
  nextAppendSortOrder,
  normalizeSiblingOrders,
  parseBulkRoomLines,
} from "@/lib/facility-builder/builder-setup";

import { legacyFieldsForFacilityRoomType } from "@/lib/facility-builder/facility-base-types";
import {
  archiveOrDeleteFacilityRoomType,
  createFacilityRoomType,
  updateFacilityRoomType,
} from "@/lib/facility-builder/facility-room-types";
import {
  buildBuilderCopy,
  resolveFacilityVocabulary,
  draftFacilityVocabulary,
  validateCustomVocabularyLabels,
  encodeCustomVocabularyTerm,
  type BuilderCopy,
  type FacilityVocabularyProfileKey,
} from "@/lib/facility-builder/facility-vocabulary";
import {
  planResponsibilitySync,
} from "@/lib/facility-builder/department-responsibility-sync";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Empty / "__none__" → null (directly in the neighborhood). Missing → undefined. */
function toNullableCuid(value: FormDataEntryValue | null): string | null | undefined {
  if (value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "__none__") return null;
  return trimmed;
}

/**
 * Facility-aware validation copy (hierarchy vocabulary).
 * Fetched lazily — only on validation-failure paths.
 */
async function validationCopy(facilityId: string): Promise<BuilderCopy["validation"]> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      vocabularyProfile: true,
      vocabularyLevel0Label: true,
      vocabularyLevel1Label: true,
      vocabularyLevel2Label: true,
      vocabularyLevel3Label: true,
    },
  });
  return buildBuilderCopy(resolveFacilityVocabulary(facility)).validation;
}

function revalidateBuilderViews() {
  revalidatePath("/admin/facility/builder");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

async function resolveSpaceFieldsFromFacilityRoomType(
  facilityId: string,
  facilityRoomTypeId: string,
) {
  const roomType = await prisma.facilityRoomType.findFirst({
    where: {
      id: facilityRoomTypeId,
      facilityId,
      isActive: true,
      archivedAt: null,
    },
    select: { id: true, baseTypeKey: true, displayName: true },
  });
  if (!roomType) {
    throw new Error("Room Type not found.");
  }
  const legacy = legacyFieldsForFacilityRoomType({
    baseTypeKey: roomType.baseTypeKey,
    displayName: roomType.displayName,
  });
  return {
    facilityRoomTypeId: roomType.id,
    spaceType: legacy.spaceType,
    customTypeLabel: legacy.customTypeLabel,
  };
}

async function assertUniqueUnitName(
  facilityId: string,
  name: string,
  parentUnitId: string | null,
  excludeId?: string,
) {
  const existing = await prisma.unit.findFirst({
    where: {
      facilityId,
      name,
      parentUnitId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      (await validationCopy(facilityId)).siblingNameTaken(name),
    );
  }
}

// ---------------------------------------------------------------------------
// Unit schemas
// ---------------------------------------------------------------------------

const UNIT_TYPES = Object.values(UnitType) as [UnitType, ...UnitType[]];
const DEPT_KINDS = Object.values(UnitDepartmentKind) as [UnitDepartmentKind, ...UnitDepartmentKind[]];

const createBuildingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Omit / empty = facility root. Otherwise must be a Building. */
  parentUnitId: z.string().cuid().optional().nullable(),
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
  if (intent === "building") {
    return createBuilderBuildingAction(formData);
  }
  if (intent === "floor" || !toOptional(formData.get("parentUnitId"))) {
    return createBuilderFloorAction(formData);
  }
  return createBuilderNeighborhoodAction(formData);
}

export async function createBuilderBuildingAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createBuildingSchema.parse({
    name: formData.get("name"),
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("displayOrder");
  void formData.get("unitType");
  void formData.get("parentUnitId");

  await assertUniqueUnitName(session.facilityId, parsed.name, null);

  const topLevel = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: null },
    select: { displayOrder: true },
  });
  const displayOrder = nextAppendDisplayOrder(topLevel);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: BUILDING_INTERNAL_UNIT_TYPE,
      hierarchyRole: UnitHierarchyRole.BUILDING,
      parentUnitId: null,
      description: parsed.description || null,
      displayOrder,
      isActive: parsed.isActive,
    },
  });

  revalidateBuilderViews();
}

export async function createBuilderFloorAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const rawParent = toOptional(formData.get("parentUnitId"));
  const parsed = createFloorSchema.parse({
    name: formData.get("name"),
    parentUnitId: rawParent ?? null,
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  // Ignore any client-supplied type / displayOrder.
  void formData.get("displayOrder");
  void formData.get("unitType");

  let parentUnitId: string | null = null;
  if (parsed.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.parentUnitId, facilityId: session.facilityId },
      select: { id: true, parentUnitId: true, hierarchyRole: true },
    });
    if (!parent) {
      throw new Error((await validationCopy(session.facilityId)).parentLevel0NotFound);
    }
    if (resolveBuilderNodeDisplayKind(parent) !== "building") {
      throw new Error((await validationCopy(session.facilityId)).level1RequiresLevel0OrRoot);
    }
    parentUnitId = parent.id;
  }

  await assertUniqueUnitName(session.facilityId, parsed.name, parentUnitId);

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId },
    select: { displayOrder: true },
  });
  const displayOrder = nextAppendDisplayOrder(siblings);

  await prisma.unit.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      unitType: FLOOR_INTERNAL_UNIT_TYPE,
      hierarchyRole: UnitHierarchyRole.FLOOR,
      parentUnitId,
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

  await assertUniqueUnitName(session.facilityId, parsed.name, parsed.parentUnitId ?? null);

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
  if (!parent) {
    throw new Error((await validationCopy(session.facilityId)).parentLevel1NotFound);
  }

  const parentKind = resolveBuilderNodeDisplayKind(parent);
  if (parentKind !== "floor") {
    throw new Error((await validationCopy(session.facilityId)).level2RequiresLevel1);
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

  if (kind === "building") {
    nextParentId = null;
    nextRole = UnitHierarchyRole.BUILDING;
  } else if (kind === "floor") {
    nextParentId = existingUnit.parentUnitId;
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
      throw new Error((await validationCopy(session.facilityId)).level2MustSitUnderLevel1);
    }
    nextRole = UnitHierarchyRole.NEIGHBORHOOD;
  } else {
    // Cleared parent → Undesignated staging (builder-only).
    nextParentId = null;
    nextRole = UnitHierarchyRole.STAGED;
  }

  await assertUniqueUnitName(session.facilityId, parsed.name, nextParentId, parsed.unitId);

  await prisma.unit.update({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    data: {
      name: parsed.name,
      // Buildings and Floors never change unitType; neighborhoods may update via Advanced settings only.
      unitType: isStructuralBuilderKind(kind)
        ? existingUnit.unitType
        : (parsed.unitType ?? existingUnit.unitType),
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
    throw new Error((await validationCopy(session.facilityId)).deleteHasChildUnits);
  }
  if (unit._count.childSpaces > 0) {
    throw new Error((await validationCopy(session.facilityId)).deleteHasChildSpaces);
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
  /** Containing room (bathroom inside a resident room). */
  parentSpaceId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  facilityRoomTypeId: z.string().cuid(),
  roomNumber: z.string().trim().max(32).optional(),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

const updateSpaceSchema = z.object({
  spaceId: z.string().cuid(),
  /** Current or next parent; null keeps / sets undesignated. */
  unitId: z.string().cuid().optional().nullable(),
  parentSpaceId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  facilityRoomTypeId: z.string().cuid(),
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
    parentSpaceId: toNullableCuid(formData.get("parentSpaceId")) ?? null,
    name: formData.get("name"),
    facilityRoomTypeId: formData.get("facilityRoomTypeId"),
    roomNumber: toOptional(formData.get("roomNumber")),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("sortOrder");

  const resolved = await resolveSpaceFieldsFromFacilityRoomType(
    session.facilityId,
    parsed.facilityRoomTypeId,
  );

  let unitId = parsed.unitId ?? null;
  let parentSpaceId: string | null = parsed.parentSpaceId ?? null;

  if (parentSpaceId) {
    const parent = await prisma.unitSpace.findFirst({
      where: { id: parentSpaceId, facilityId: session.facilityId },
      select: { id: true, unitId: true, parentSpaceId: true },
    });
    if (!parent) throw new Error("Containing room not found.");
    if (parent.parentSpaceId) {
      throw new Error(
        "Rooms can only be nested one level (for example a bathroom inside a resident room).",
      );
    }
    if (unitId && parent.unitId && unitId !== parent.unitId) {
      throw new Error("Nested rooms must stay in the same location as the room they belong to.");
    }
    unitId = parent.unitId;
    parentSpaceId = parent.id;
  }

  // Toolbar create → Undesignated (unitId null)
  if (!unitId) {
    const existing = await prisma.unitSpace.findFirst({
      where: {
        facilityId: session.facilityId,
        unitId: null,
        parentSpaceId,
        name: parsed.name,
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        parentSpaceId
          ? `A space named "${parsed.name}" already exists inside that room.`
          : `A space named "${parsed.name}" already exists in Undesignated.`,
      );
    }

    const siblings = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null, parentSpaceId },
      select: { sortOrder: true },
    });
    const sortOrder = nextAppendSortOrder(siblings);

    await prisma.unitSpace.create({
      data: {
        unitId: null,
        parentSpaceId,
        facilityId: session.facilityId,
        name: parsed.name,
        spaceType: resolved.spaceType,
        customTypeLabel: resolved.customTypeLabel,
        facilityRoomTypeId: resolved.facilityRoomTypeId,
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
    where: { id: unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (!canAddRoom(parentKind)) {
    throw new Error((await validationCopy(session.facilityId)).level3NotAllowedHere);
  }

  const existing = await prisma.unitSpace.findFirst({
    where: { unitId, parentSpaceId, name: parsed.name },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      parentSpaceId
        ? `A space named "${parsed.name}" already exists inside that room.`
        : `A space named "${parsed.name}" already exists in this unit.`,
    );
  }

  const siblings = await prisma.unitSpace.findMany({
    where: { unitId, parentSpaceId },
    select: { sortOrder: true },
  });
  const sortOrder = nextAppendSortOrder(siblings);

  await prisma.unitSpace.create({
    data: {
      unitId,
      parentSpaceId,
      facilityId: unit.facilityId,
      name: parsed.name,
      spaceType: resolved.spaceType,
      customTypeLabel: resolved.customTypeLabel,
      facilityRoomTypeId: resolved.facilityRoomTypeId,
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
  facilityRoomTypeId: z.string().cuid(),
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
    facilityRoomTypeId: formData.get("facilityRoomTypeId"),
    descriptionPrefix: toOptional(formData.get("descriptionPrefix")),
  });

  const resolved = await resolveSpaceFieldsFromFacilityRoomType(
    session.facilityId,
    parsed.facilityRoomTypeId,
  );

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, facilityId: true, parentUnitId: true, hierarchyRole: true },
  });
  if (!unit) throw new Error("Parent unit not found in this facility.");

  const parentKind = resolveBuilderNodeDisplayKind(unit);
  if (!canAddRoom(parentKind)) {
    throw new Error((await validationCopy(session.facilityId)).level3BulkNotAllowedHere);
  }

  const parsedLines = parseBulkRoomLines(parsed.namesText);
  if (parsedLines.names.length === 0) {
    throw new Error((await validationCopy(session.facilityId)).bulkNeedName);
  }
  if (parsedLines.names.length > BULK_ROOM_MAX) {
    throw new Error((await validationCopy(session.facilityId)).bulkTooMany(BULK_ROOM_MAX));
  }

  const existingSpaces = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId, parentSpaceId: null },
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
    const vCopy = await validationCopy(session.facilityId);
    return {
      created: 0,
      skippedExisting,
      skippedDuplicateInBatch: parsedLines.duplicateInBatch,
      errors: skippedExisting.length > 0
        ? [vCopy.bulkAllExist]
        : [vCopy.bulkNothing],
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
          facilityRoomTypeId: resolved.facilityRoomTypeId,
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
    parentSpaceId: toNullableCuid(formData.get("parentSpaceId")),
    name: formData.get("name"),
    facilityRoomTypeId: formData.get("facilityRoomTypeId"),
    roomNumber: toOptional(formData.get("roomNumber")),
    code: toOptional(formData.get("code")),
    description: toOptional(formData.get("description")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });

  void formData.get("sortOrder");

  const resolved = await resolveSpaceFieldsFromFacilityRoomType(
    session.facilityId,
    parsed.facilityRoomTypeId,
  );

  const space = await prisma.unitSpace.findFirst({
    where: { id: parsed.spaceId, facilityId: session.facilityId },
    select: { id: true, unitId: true, parentSpaceId: true },
  });
  if (!space) throw new Error("Space not found.");

  const nextParentSpaceId =
    parsed.parentSpaceId === undefined ? space.parentSpaceId : parsed.parentSpaceId;

  if (nextParentSpaceId !== space.parentSpaceId) {
    const scopeSpaces = await prisma.unitSpace.findMany({
      where:
        space.unitId == null
          ? { facilityId: session.facilityId, unitId: null }
          : { unitId: space.unitId },
      select: { id: true, unitId: true, parentSpaceId: true },
    });
    const parent = nextParentSpaceId
      ? scopeSpaces.find((row) => row.id === nextParentSpaceId) ?? null
      : null;
    if (nextParentSpaceId && !parent) {
      throw new Error("Containing room not found in this location.");
    }
    const nestError = spaceNestError(space, parent, scopeSpaces);
    if (nestError) throw new Error(nestError);
  }

  const duplicate = await prisma.unitSpace.findFirst({
    where: {
      facilityId: session.facilityId,
      unitId: space.unitId,
      parentSpaceId: nextParentSpaceId,
      name: parsed.name,
      id: { not: parsed.spaceId },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(
      nextParentSpaceId
        ? `A space named "${parsed.name}" already exists inside that room.`
        : `A space named "${parsed.name}" already exists in this unit.`,
    );
  }

  const parentChanged = nextParentSpaceId !== space.parentSpaceId;
  let nextSortOrder: number | undefined;
  if (parentChanged) {
    const siblings = await prisma.unitSpace.findMany({
      where:
        space.unitId == null
          ? { facilityId: session.facilityId, unitId: null, parentSpaceId: nextParentSpaceId }
          : { unitId: space.unitId, parentSpaceId: nextParentSpaceId },
      select: { sortOrder: true },
    });
    nextSortOrder = nextAppendSortOrder(siblings);
  }

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      name: parsed.name,
      spaceType: resolved.spaceType,
      customTypeLabel: resolved.customTypeLabel,
      facilityRoomTypeId: resolved.facilityRoomTypeId,
      parentSpaceId: nextParentSpaceId,
      roomNumber: parsed.roomNumber || null,
      code: parsed.code || null,
      description: parsed.description || null,
      isActive: parsed.isActive,
      ...(nextSortOrder != null ? { sortOrder: nextSortOrder } : {}),
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
    select: { id: true, spaceId: true, departmentId: true },
  });
  if (!row) throw new Error("Space responsibility not found.");

  await prisma.$transaction(async (tx) => {
    await tx.unitSpaceResponsibility.delete({ where: { id: row.id } });
    await pruneTeamRoomsAfterResponsibilityRemoved(tx, {
      spaceId: row.spaceId,
      departmentId: row.departmentId,
    });
  });
  revalidateBuilderViews();
}

/**
 * Replace the set of departments responsible for a Floor / Neighborhood (Unit).
 * Writes UnitDepartmentResponsibility — the canonical unit-scoped store.
 * Existing rows for still-selected departments keep capabilities / kind.
 * New rows are created as PRIMARY with empty capabilities.
 */
export async function setBuilderUnitDepartmentsAction(input: {
  unitId: string;
  departmentIds: string[];
}) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const unitId = z.string().cuid().parse(input.unitId);
  const departmentIds = z.array(z.string().cuid()).parse(input.departmentIds);

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId: session.facilityId },
    select: {
      id: true,
      hierarchyRole: true,
      parentUnitId: true,
      departmentResponsibilities: {
        select: { id: true, departmentId: true },
      },
    },
  });
  if (!unit) throw new Error("Unit not found in this facility.");

  const displayKind = resolveBuilderNodeDisplayKind({
    hierarchyRole: unit.hierarchyRole,
    parentUnitId: unit.parentUnitId,
  });
  if (displayKind === "floor" || displayKind === "building") {
    throw new Error(
      displayKind === "building"
        ? "Buildings are structural organizers. Assign departments to neighborhoods and rooms, or use Apply departments to locations below."
        : "Floors are structural organizers. Assign departments to neighborhoods and rooms, or use Apply departments to locations below.",
    );
  }

  await assertFacilityDepartments(session.facilityId, departmentIds);

  const plan = planResponsibilitySync({
    desiredDepartmentIds: departmentIds,
    existing: unit.departmentResponsibilities.map((r) => ({
      id: r.id,
      department: { id: r.departmentId },
    })),
  });

  await prisma.$transaction(async (tx) => {
    if (plan.toDeleteIds.length > 0) {
      await tx.unitDepartmentResponsibility.deleteMany({
        where: { id: { in: plan.toDeleteIds } },
      });
    }
    for (const departmentId of plan.toCreate) {
      await tx.unitDepartmentResponsibility.create({
        data: {
          unitId,
          departmentId,
          kind: UnitDepartmentKind.PRIMARY,
          capabilities: [],
        },
      });
    }
  });

  revalidateBuilderViews();
}

/**
 * Replace the set of departments responsible for a Room (UnitSpace).
 * Writes UnitSpaceResponsibility — the canonical room-scoped store.
 */
export async function setBuilderSpaceDepartmentsAction(input: {
  spaceId: string;
  departmentIds: string[];
}) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const spaceId = z.string().cuid().parse(input.spaceId);
  const departmentIds = z.array(z.string().cuid()).parse(input.departmentIds);

  const space = await prisma.unitSpace.findFirst({
    where: { id: spaceId, facilityId: session.facilityId },
    select: {
      id: true,
      responsibilities: { select: { id: true, departmentId: true } },
    },
  });
  if (!space) throw new Error("Space not found in this facility.");

  await assertFacilityDepartments(session.facilityId, departmentIds);

  const plan = planResponsibilitySync({
    desiredDepartmentIds: departmentIds,
    existing: space.responsibilities.map((r) => ({
      id: r.id,
      department: { id: r.departmentId },
    })),
  });

  await prisma.$transaction(async (tx) => {
    if (plan.toDeleteIds.length > 0) {
      const removedDepartments = space.responsibilities
        .filter((row) => plan.toDeleteIds.includes(row.id))
        .map((row) => row.departmentId);
      await tx.unitSpaceResponsibility.deleteMany({
        where: { id: { in: plan.toDeleteIds } },
      });
      for (const departmentId of removedDepartments) {
        await pruneTeamRoomsAfterResponsibilityRemoved(tx, { spaceId, departmentId });
      }
    }
    for (const departmentId of plan.toCreate) {
      await tx.unitSpaceResponsibility.create({
        data: {
          spaceId,
          departmentId,
          capabilities: [],
        },
      });
    }
  });

  revalidateBuilderViews();
}

/**
 * Copy the selected unit's department set onto descendant neighborhoods and rooms.
 * Explicit mutation — not inheritance. Overwrites descendant department membership;
 * preserves capabilities on departments that remain selected.
 * Does not modify the source unit's own responsibility rows.
 */
export async function applyBuilderUnitResponsibilitiesToDescendantsAction(input: {
  unitId: string;
}) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const unitId = z.string().cuid().parse(input.unitId);
  const facilityId = session.facilityId;

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId },
    select: {
      id: true,
      hierarchyRole: true,
      parentUnitId: true,
      departmentResponsibilities: { select: { departmentId: true } },
    },
  });
  if (!unit) throw new Error("Unit not found in this facility.");

  const displayKind = resolveBuilderNodeDisplayKind({
    hierarchyRole: unit.hierarchyRole,
    parentUnitId: unit.parentUnitId,
  });
  if (displayKind === "floor" || displayKind === "building") {
    throw new Error(
      displayKind === "building"
        ? "Buildings are structural organizers. Use Apply departments to locations below with an explicit department set."
        : "Floors are structural organizers. Use Apply departments to locations below with an explicit department set.",
    );
  }

  const departmentIds = [
    ...new Set(unit.departmentResponsibilities.map((r) => r.departmentId)),
  ];

  return applyDepartmentsToActionableDescendants({
    facilityId,
    scopeUnitId: unitId,
    departmentIds,
  });
}

/**
 * Bulk-assign departments to actionable descendants of a structural or actionable scope unit.
 * Never writes UnitDepartmentResponsibility onto the scope unit itself (floors stay structural).
 */
export async function applyDepartmentsToActionableDescendantsAction(input: {
  scopeUnitId: string;
  departmentIds: string[];
}) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const scopeUnitId = z.string().cuid().parse(input.scopeUnitId);
  const departmentIds = z.array(z.string().cuid()).parse(input.departmentIds);
  const facilityId = session.facilityId;

  const scope = await prisma.unit.findFirst({
    where: { id: scopeUnitId, facilityId },
    select: { id: true },
  });
  if (!scope) throw new Error("Unit not found in this facility.");

  await assertFacilityDepartments(facilityId, departmentIds);

  return applyDepartmentsToActionableDescendants({
    facilityId,
    scopeUnitId,
    departmentIds,
  });
}

async function applyDepartmentsToActionableDescendants(input: {
  facilityId: string;
  scopeUnitId: string;
  departmentIds: string[];
}) {
  const { facilityId, scopeUnitId, departmentIds } = input;

  // BFS descendants. Never includes the scope unit. Skip nested BUILDING / FLOOR
  // units as UnitDepartmentResponsibility targets (structural); still walk under them for rooms.
  const neighborhoodUnitIds: string[] = [];
  const unitIdsForRoomLookup: string[] = [scopeUnitId];
  let frontier = [scopeUnitId];
  while (frontier.length > 0) {
    const children = await prisma.unit.findMany({
      where: { facilityId, parentUnitId: { in: frontier } },
      select: { id: true, hierarchyRole: true, parentUnitId: true },
    });
    frontier = [];
    for (const child of children) {
      frontier.push(child.id);
      unitIdsForRoomLookup.push(child.id);
      const childKind = resolveBuilderNodeDisplayKind(child);
      if (!isStructuralBuilderKind(childKind)) {
        neighborhoodUnitIds.push(child.id);
      }
    }
  }

  const spaces = await prisma.unitSpace.findMany({
    where: {
      facilityId,
      unitId: { in: unitIdsForRoomLookup },
    },
    select: { id: true },
  });
  const spaceIds = spaces.map((s) => s.id);

  if (neighborhoodUnitIds.length === 0 && spaceIds.length === 0) {
    return { appliedNeighborhoods: 0, appliedRooms: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const childUnitId of neighborhoodUnitIds) {
      const existing = await tx.unitDepartmentResponsibility.findMany({
        where: { unitId: childUnitId },
        select: { id: true, departmentId: true },
      });
      const plan = planResponsibilitySync({
        desiredDepartmentIds: departmentIds,
        existing: existing.map((r) => ({
          id: r.id,
          department: { id: r.departmentId },
        })),
      });
      if (plan.toDeleteIds.length > 0) {
        await tx.unitDepartmentResponsibility.deleteMany({
          where: { id: { in: plan.toDeleteIds } },
        });
      }
      for (const departmentId of plan.toCreate) {
        await tx.unitDepartmentResponsibility.create({
          data: {
            unitId: childUnitId,
            departmentId,
            kind: UnitDepartmentKind.PRIMARY,
            capabilities: [],
          },
        });
      }
    }

    for (const spaceId of spaceIds) {
      const existing = await tx.unitSpaceResponsibility.findMany({
        where: { spaceId },
        select: { id: true, departmentId: true },
      });
      const plan = planResponsibilitySync({
        desiredDepartmentIds: departmentIds,
        existing: existing.map((r) => ({
          id: r.id,
          department: { id: r.departmentId },
        })),
      });
      if (plan.toDeleteIds.length > 0) {
        const removedDepartments = existing
          .filter((row) => plan.toDeleteIds.includes(row.id))
          .map((row) => row.departmentId);
        await tx.unitSpaceResponsibility.deleteMany({
          where: { id: { in: plan.toDeleteIds } },
        });
        for (const departmentId of removedDepartments) {
          await pruneTeamRoomsAfterResponsibilityRemoved(tx, { spaceId, departmentId });
        }
      }
      for (const departmentId of plan.toCreate) {
        await tx.unitSpaceResponsibility.create({
          data: { spaceId, departmentId, capabilities: [] },
        });
      }
    }
  });

  revalidateBuilderViews();
  return {
    appliedNeighborhoods: neighborhoodUnitIds.length,
    appliedRooms: spaceIds.length,
  };
}

async function assertFacilityDepartments(facilityId: string, departmentIds: string[]) {
  if (departmentIds.length === 0) return;
  const count = await prisma.department.count({
    where: {
      facilityId,
      isActive: true,
      id: { in: departmentIds },
    },
  });
  if (count !== new Set(departmentIds).size) {
    throw new Error("One or more departments are not available in this facility.");
  }
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

/** Normalize sortOrder for rooms under a unit (or undesignated) in one sibling group. */
async function normalizeSpaceSiblingOrders(args: {
  unitId: string | null;
  facilityId?: string;
  parentSpaceId?: string | null;
  orderedIds?: string[];
}) {
  const { unitId, orderedIds } = args;
  const parentSpaceId = args.parentSpaceId ?? null;
  if (unitId == null && !args.facilityId) {
    throw new Error("facilityId is required when normalizing undesignated rooms.");
  }

  const siblings = await prisma.unitSpace.findMany({
    where:
      unitId == null
        ? { facilityId: args.facilityId!, unitId: null, parentSpaceId }
        : { unitId, parentSpaceId },
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
    select: { id: true, parentUnitId: true, hierarchyRole: true, name: true },
  });
  if (!unit) throw new Error("Unit not found.");

  const dragKind = resolveBuilderNodeDisplayKind(unit);
  if (dragKind === "building") {
    throw new Error((await validationCopy(session.facilityId)).level0CannotMove);
  }

  const previousParentId = unit.parentUnitId;
  void parsed.newDisplayOrder;

  // Move into Undesignated staging (neighborhoods) or facility root (floors).
  if (!parsed.newParentUnitId) {
    if (dragKind === "floor") {
      await assertUniqueUnitName(session.facilityId, unit.name, null, parsed.unitId);
      const rootSiblings = await prisma.unit.findMany({
        where: {
          facilityId: session.facilityId,
          parentUnitId: null,
          id: { not: parsed.unitId },
        },
        select: { displayOrder: true },
      });
      const nextOrder = nextAppendDisplayOrder(rootSiblings);

      await prisma.unit.update({
        where: { id: parsed.unitId },
        data: {
          parentUnitId: null,
          displayOrder: nextOrder,
          hierarchyRole: UnitHierarchyRole.FLOOR,
        },
      });

      if (previousParentId != null) {
        await normalizeUnitSiblingOrders(session.facilityId, previousParentId);
      }
      revalidateBuilderViews();
      return;
    }

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
    throw new Error(
      dragKind === "floor"
        ? (await validationCopy(session.facilityId)).level1CannotMove
        : (await validationCopy(session.facilityId)).unitsMoveOntoLevel1Only,
    );
  }

  await assertUniqueUnitName(
    session.facilityId,
    unit.name,
    parsed.newParentUnitId,
    parsed.unitId,
  );

  const siblings = await prisma.unit.findMany({
    where: { facilityId: session.facilityId, parentUnitId: parsed.newParentUnitId },
    select: { displayOrder: true },
  });
  const nextOrder = nextAppendDisplayOrder(siblings);

  const nextRole =
    dragKind === "floor"
      ? UnitHierarchyRole.FLOOR
      : UnitHierarchyRole.NEIGHBORHOOD;

  await prisma.unit.update({
    where: { id: parsed.unitId },
    data: {
      parentUnitId: parsed.newParentUnitId,
      displayOrder: nextOrder,
      hierarchyRole: nextRole,
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
    select: { id: true, unitId: true, name: true, parentSpaceId: true },
  });
  if (!space) throw new Error("Space not found.");

  const previousUnitId = space.unitId;
  const previousParentSpaceId = space.parentSpaceId;
  void parsed.newSortOrder;

  const originSpaces = await prisma.unitSpace.findMany({
    where:
      space.unitId == null
        ? { facilityId: session.facilityId, unitId: null }
        : { unitId: space.unitId },
    select: { id: true, unitId: true, parentSpaceId: true },
  });
  const descendantIds = collectDescendantSpaceIds(originSpaces, space.id);

  const movingToDifferentUnit = previousUnitId !== parsed.newUnitId;
  const nextParentSpaceId = movingToDifferentUnit ? null : previousParentSpaceId;

  if (!parsed.newUnitId) {
    const dup = await prisma.unitSpace.findFirst({
      where: {
        facilityId: session.facilityId,
        unitId: null,
        parentSpaceId: nextParentSpaceId,
        name: space.name,
        id: { not: space.id },
      },
      select: { id: true },
    });
    if (dup) {
      throw new Error(`A space named "${space.name}" already exists in Undesignated.`);
    }

    const siblings = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null, parentSpaceId: nextParentSpaceId },
      select: { sortOrder: true },
    });
    const nextSort = nextAppendSortOrder(siblings);

    await prisma.unitSpace.update({
      where: { id: parsed.spaceId },
      data: { unitId: null, parentSpaceId: nextParentSpaceId, sortOrder: nextSort },
    });
    if (descendantIds.length > 0) {
      await prisma.unitSpace.updateMany({
        where: { id: { in: descendantIds } },
        data: { unitId: null },
      });
    }

    await normalizeSpaceSiblingOrders({
      unitId: null,
      facilityId: session.facilityId,
      parentSpaceId: nextParentSpaceId,
    });
    if (previousUnitId != null) {
      await normalizeSpaceSiblingOrders({
        unitId: previousUnitId,
        parentSpaceId: previousParentSpaceId,
      });
    } else if (previousParentSpaceId !== nextParentSpaceId) {
      await normalizeSpaceSiblingOrders({
        unitId: null,
        facilityId: session.facilityId,
        parentSpaceId: previousParentSpaceId,
      });
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
    throw new Error((await validationCopy(session.facilityId)).level3MoveTargets);
  }

  const dup = await prisma.unitSpace.findFirst({
    where: {
      unitId: parsed.newUnitId,
      parentSpaceId: nextParentSpaceId,
      name: space.name,
      id: { not: space.id },
    },
    select: { id: true },
  });
  if (dup) {
    throw new Error(`A space named "${space.name}" already exists in that location.`);
  }

  const siblings = await prisma.unitSpace.findMany({
    where: { unitId: parsed.newUnitId, parentSpaceId: nextParentSpaceId },
    select: { sortOrder: true },
  });
  const nextSort = nextAppendSortOrder(siblings);

  await prisma.unitSpace.update({
    where: { id: parsed.spaceId },
    data: {
      unitId: parsed.newUnitId,
      parentSpaceId: nextParentSpaceId,
      sortOrder: nextSort,
    },
  });
  if (descendantIds.length > 0) {
    await prisma.unitSpace.updateMany({
      where: { id: { in: descendantIds } },
      data: { unitId: parsed.newUnitId },
    });
  }

  await normalizeSpaceSiblingOrders({
    unitId: parsed.newUnitId,
    parentSpaceId: nextParentSpaceId,
  });
  if (previousUnitId !== parsed.newUnitId) {
    if (previousUnitId == null) {
      await normalizeSpaceSiblingOrders({
        unitId: null,
        facilityId: session.facilityId,
        parentSpaceId: previousParentSpaceId,
      });
    } else {
      await normalizeSpaceSiblingOrders({
        unitId: previousUnitId,
        parentSpaceId: previousParentSpaceId,
      });
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
        throw new Error((await validationCopy(session.facilityId)).level2NoTopLevelReorder);
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
    if (!parent) {
      throw new Error((await validationCopy(session.facilityId)).parentLevel1NotFoundShort);
    }
    const parentKind = resolveBuilderNodeDisplayKind(parent);
    if (parentKind !== "floor" && parentKind !== "building") {
      throw new Error((await validationCopy(session.facilityId)).reorderNonLevel1Parent);
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
  /** Sibling group: null = top-level rooms in the location. */
  parentSpaceId: z.string().cuid().nullable().optional(),
  orderedIds: z.array(z.string().cuid()).min(1).max(500),
});

/**
 * Persist sibling sortOrder for rooms under a Floor / Neighborhood / Undesignated.
 */
export async function reorderBuilderSpacesAction(data: z.infer<typeof reorderSpacesSchema>) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = reorderSpacesSchema.parse(data);
  const parentSpaceId = parsed.parentSpaceId ?? null;

  if (parsed.unitId == null) {
    const spaces = await prisma.unitSpace.findMany({
      where: { facilityId: session.facilityId, unitId: null, parentSpaceId },
      select: { id: true },
    });
    const spaceIds = new Set(spaces.map((s) => s.id));
    for (const id of parsed.orderedIds) {
      if (!spaceIds.has(id)) {
        throw new Error(
          (await validationCopy(session.facilityId)).reorderLevel3NotInUndesignated,
        );
      }
    }
    await normalizeSpaceSiblingOrders({
      unitId: null,
      facilityId: session.facilityId,
      parentSpaceId,
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
    throw new Error((await validationCopy(session.facilityId)).level3ReorderNotAllowed);
  }

  const spaces = await prisma.unitSpace.findMany({
    where: { unitId: parsed.unitId, parentSpaceId },
    select: { id: true },
  });
  const spaceIds = new Set(spaces.map((s) => s.id));
  for (const id of parsed.orderedIds) {
    if (!spaceIds.has(id)) {
      throw new Error(
        (await validationCopy(session.facilityId)).reorderLevel3NotInLocation,
      );
    }
  }

  await normalizeSpaceSiblingOrders({
    unitId: parsed.unitId,
    parentSpaceId,
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
    throw new Error((await validationCopy(session.facilityId)).convertOnlyUnassigned);
  }
  if (unit.parentUnitId != null) {
    throw new Error((await validationCopy(session.facilityId)).convertOnlyTopLevel);
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

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true, parentUnitId: true },
  });
  if (!unit) throw new Error("Unit not found.");

  await assertUniqueUnitName(
    session.facilityId,
    parsed.name,
    unit.parentUnitId,
    parsed.unitId,
  );

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
  if (!space) {
    throw new Error((await validationCopy(session.facilityId)).level3NotFound);
  }

  const duplicate = await prisma.unitSpace.findFirst({
    where: {
      facilityId: session.facilityId,
      unitId: space.unitId,
      name: parsed.name,
      id: { not: parsed.spaceId },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(
      (await validationCopy(session.facilityId)).level3DuplicateInLevel2(parsed.name),
    );
  }

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

// ---------------------------------------------------------------------------
// Facility vocabulary (terminology) settings
// ---------------------------------------------------------------------------

const vocabularyProfileSchema = z.enum([
  "ltc",
  "hospital",
  "hotel",
  "campus",
  "corporate",
  "custom",
]);

export async function updateFacilityVocabularyAction(input: {
  profileKey: FacilityVocabularyProfileKey;
  level0Singular?: string;
  level0Plural?: string;
  level1Singular?: string;
  level1Plural?: string;
  level2Singular?: string;
  level2Plural?: string;
  level3Singular?: string;
  level3Plural?: string;
}) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const profileKey = vocabularyProfileSchema.parse(input.profileKey);

  if (profileKey === "custom") {
    const errors = validateCustomVocabularyLabels({
      level0Singular: input.level0Singular ?? "",
      level0Plural: input.level0Plural ?? "",
      level1Singular: input.level1Singular ?? "",
      level1Plural: input.level1Plural ?? "",
      level2Singular: input.level2Singular ?? "",
      level2Plural: input.level2Plural ?? "",
      level3Singular: input.level3Singular ?? "",
      level3Plural: input.level3Plural ?? "",
    });
    if (errors.length > 0) {
      throw new Error(errors[0]!.message);
    }
  }

  const draft = draftFacilityVocabulary({
    profileKey,
    level0Singular: input.level0Singular,
    level0Plural: input.level0Plural,
    level1Singular: input.level1Singular,
    level1Plural: input.level1Plural,
    level2Singular: input.level2Singular,
    level2Plural: input.level2Plural,
    level3Singular: input.level3Singular,
    level3Plural: input.level3Plural,
  });

  if (profileKey === "custom") {
    await prisma.facility.update({
      where: { id: session.facilityId },
      data: {
        vocabularyProfile: "custom",
        vocabularyLevel0Label: encodeCustomVocabularyTerm(draft.level0),
        vocabularyLevel1Label: encodeCustomVocabularyTerm(draft.level1),
        vocabularyLevel2Label: encodeCustomVocabularyTerm(draft.level2),
        vocabularyLevel3Label: encodeCustomVocabularyTerm(draft.level3),
      },
    });
  } else {
    await prisma.facility.update({
      where: { id: session.facilityId },
      data: {
        vocabularyProfile: profileKey === "ltc" ? null : profileKey,
        vocabularyLevel0Label: null,
        vocabularyLevel1Label: null,
        vocabularyLevel2Label: null,
        vocabularyLevel3Label: null,
      },
    });
  }

  revalidateBuilderViews();
  return { vocabulary: draft };
}

// ---------------------------------------------------------------------------
// Facility Room Type catalog actions
// ---------------------------------------------------------------------------

const createFacilityRoomTypeSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  baseTypeKey: z.string().trim().min(1),
  description: z.string().trim().max(500).optional(),
});

const updateFacilityRoomTypeSchema = z.object({
  id: z.string().cuid(),
  displayName: z.string().trim().min(1).max(80),
  baseTypeKey: z.string().trim().min(1),
  description: z.string().trim().max(500).optional(),
});

export async function createFacilityRoomTypeAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createFacilityRoomTypeSchema.parse({
    displayName: formData.get("displayName"),
    baseTypeKey: formData.get("baseTypeKey"),
    description: toOptional(formData.get("description")),
  });

  const created = await createFacilityRoomType(
    {
      facilityId: session.facilityId,
      displayName: parsed.displayName,
      baseTypeKey: parsed.baseTypeKey,
      description: parsed.description ?? null,
    },
    prisma,
  );

  revalidateBuilderViews();
  return {
    id: created.id,
    displayName: created.displayName,
    baseTypeKey: created.baseTypeKey,
    baseTypeLabel: created.baseTypeLabel,
    description: created.description,
    isActive: created.isActive,
    roomCount: created.roomCount,
  };
}

export async function updateFacilityRoomTypeAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = updateFacilityRoomTypeSchema.parse({
    id: formData.get("id"),
    displayName: formData.get("displayName"),
    baseTypeKey: formData.get("baseTypeKey"),
    description: toOptional(formData.get("description")),
  });

  await updateFacilityRoomType(
    {
      facilityId: session.facilityId,
      id: parsed.id,
      displayName: parsed.displayName,
      baseTypeKey: parsed.baseTypeKey,
      description: parsed.description ?? null,
    },
    prisma,
  );

  revalidateBuilderViews();
}

export type ArchiveFacilityRoomTypeResult = {
  action: "deleted" | "archived" | "blocked";
  roomCount: number;
};

export async function archiveFacilityRoomTypeAction(
  formData: FormData,
): Promise<ArchiveFacilityRoomTypeResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const id = z.string().cuid().parse(formData.get("id"));

  const result = await archiveOrDeleteFacilityRoomType(
    { facilityId: session.facilityId, id },
    prisma,
  );

  revalidateBuilderViews();
  return result;
}
