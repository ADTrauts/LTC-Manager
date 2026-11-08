/**
 * Department Operational Profile service — persistence layer.
 *
 * All decisions live in the pure modules (baseline, lifecycle, certification,
 * configuration, access). This layer loads bounded data, delegates to pure
 * rules, and persists results transactionally.
 *
 * No runtime surface consumes profiles in Wave 14B; the future Projection
 * engine will consume ACTIVE profiles.
 */

import type { Prisma } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import type { AuthMethod, FacilitySession } from "@/lib/auth";
import { requireDepartmentManage } from "@/lib/department-authority/access";
import { loadDepartmentChangeAccess } from "@/lib/department-authority/changes";
import { prisma } from "@/lib/prisma";

import { assertExperienceCatalogBaselinesNotWritable } from "./baseline";
import {
  validateProfileForCertification,
  type CertificationResult,
} from "./certification";
import { validateExperienceConfiguration } from "./configuration";
import {
  assertProfileEditable,
  assertProfileTransition,
  nextProfileVersion,
  planProfileActivation,
} from "./lifecycle";
import {
  assertPatternAuthoringAccess,
  assertProfileWriteAccess,
} from "./profile-access";
import type {
  ExperienceConfiguration,
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "./profile-types";

/**
 * Location Function / archetype authoring is retired (Phase 2A / ARR-026).
 * Facility Builder owns places and responsibility. Engines use canonical place ids.
 */
export const LOCATION_FUNCTION_AUTHORING_RETIRED =
  "Location Function authoring is retired. Assign Department responsibility in Facility Builder. Operating Rhythm, Records, Coverage, and Menus use canonical places.";

export type ProfileActor = {
  userId: string | null;
  role: AppRole;
  facilityId: string;
  authMethod?: AuthMethod;
};

async function assertWrite(actor: ProfileActor, targetFacilityId: string, departmentId: string): Promise<void> {
  assertProfileWriteAccess({
    role: actor.role,
    sessionFacilityId: actor.facilityId,
    targetFacilityId,
  });
  if (!actor.userId) return;
  const access = await loadDepartmentChangeAccess(
    prisma,
    {
      uid: actor.userId,
      name: "",
      email: "",
      role: actor.role,
      facilityId: actor.facilityId,
      authKind: "user",
      authMethod: actor.authMethod ?? "PASSWORD",
      scopeKind: "facility",
      accessKind: "internal",
    } as unknown as FacilitySession,
    { facilityId: targetFacilityId, departmentId },
  );
  if (access) requireDepartmentManage(access);
}

function assertPatternWrite(actor: ProfileActor, targetFacilityId: string): void {
  assertPatternAuthoringAccess({
    role: actor.role,
    authMethod: actor.authMethod ?? "PASSWORD",
    sessionFacilityId: actor.facilityId,
    targetFacilityId,
  });
}

// ---------------------------------------------------------------------------
// Loading (bounded queries — one nested query group per profile)
// ---------------------------------------------------------------------------

const PROFILE_INCLUDE = {
  department: { select: { id: true, key: true, facilityId: true, isActive: true } },
  areas: {
    orderBy: { sortOrder: "asc" as const },
    include: { experiences: { orderBy: { sortOrder: "asc" as const } } },
  },
  archetypes: {
    orderBy: { sortOrder: "asc" as const },
    include: { experiences: { orderBy: { sortOrder: "asc" as const } } },
  },
  roomBindings: true,
  roomExceptions: true,
} satisfies Prisma.DepartmentOperationalProfileInclude;

type LoadedProfile = Prisma.DepartmentOperationalProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;

function asConfiguration(value: Prisma.JsonValue | null): ExperienceConfiguration | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ExperienceConfiguration;
}

export function toProfileSnapshot(row: LoadedProfile): ProfileSnapshot {
  return {
    id: row.id,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    departmentKey: row.department.key,
    name: row.name,
    version: row.version,
    status: row.status,
    baselineKey: row.baselineKey,
    areas: row.areas.map((area) => ({
      id: area.id,
      key: area.key,
      name: area.name,
      description: area.description,
      sortOrder: area.sortOrder,
      isActive: area.isActive,
      experiences: area.experiences.map((experience) => ({
        id: experience.id,
        experienceKey: experience.experienceKey,
        sortOrder: experience.sortOrder,
        isActive: experience.isActive,
        configuration: asConfiguration(experience.configurationJson),
      })),
    })),
    archetypes: row.archetypes.map((archetype) => ({
      id: archetype.id,
      key: archetype.key,
      name: archetype.name,
      description: archetype.description,
      isActive: archetype.isActive,
      sortOrder: archetype.sortOrder,
      experiences: archetype.experiences.map((selection) => ({
        id: selection.id,
        areaExperienceId: selection.areaExperienceId,
        isActive: selection.isActive,
        sortOrder: selection.sortOrder,
        configuration: asConfiguration(selection.configurationJson),
      })),
    })),
  };
}

export async function loadProfile(profileId: string): Promise<LoadedProfile> {
  return prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: PROFILE_INCLUDE,
  });
}

export async function listProfilesForFacility(facilityId: string) {
  return prisma.departmentOperationalProfile.findMany({
    where: { facilityId },
    orderBy: [{ departmentId: "asc" }, { version: "desc" }],
    select: {
      id: true,
      departmentId: true,
      name: true,
      version: true,
      status: true,
      baselineKey: true,
      certifiedAt: true,
      activatedAt: true,
      retiredAt: true,
      department: { select: { key: true, name: true } },
    },
  });
}

/** Batched room context for certification — one query for rooms + assignments. */
async function loadRoomContexts(
  facilityId: string,
  roomIds: readonly string[],
  departmentId: string,
): Promise<RoomContext[]> {
  const rooms = await prisma.unitSpace.findMany({
    where: {
      OR: [
        { id: { in: [...roomIds] } },
        { facilityId, responsibilities: { some: { departmentId } } },
      ],
    },
    select: {
      id: true,
      facilityId: true,
      isActive: true,
      unitId: true,
      unit: { select: { hierarchyRole: true } },
      responsibilities: { select: { departmentId: true } },
    },
  });
  return rooms.map((room) => ({
    id: room.id,
    facilityId: room.facilityId,
    isActive: room.isActive,
    unitId: room.unitId,
    parentHierarchyRole: room.unit?.hierarchyRole ?? null,
    assignedDepartmentIds: room.responsibilities.map((r) => r.departmentId),
  }));
}

// ---------------------------------------------------------------------------
// Baseline draft creation
// ---------------------------------------------------------------------------

export async function createBaselineDraft(
  actor: ProfileActor,
  input: { facilityId: string; departmentId: string },
): Promise<{ profileId: string; version: number }> {
  void actor;
  void input;
  assertExperienceCatalogBaselinesNotWritable();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function certifyProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<CertificationResult> {
  const row = await loadProfile(profileId);
  await assertWrite(actor, row.facilityId, row.departmentId);
  assertProfileTransition(row.status, "CERTIFIED");

  const snapshot = toProfileSnapshot(row);
  const bindings: RoomArchetypeBindingSnapshot[] = row.roomBindings.map((b) => ({
    id: b.id,
    unitSpaceId: b.unitSpaceId,
    archetypeId: b.archetypeId,
  }));
  const exceptions: RoomExceptionSnapshot[] = row.roomExceptions.map((e) => ({
    id: e.id,
    unitSpaceId: e.unitSpaceId,
    areaExperienceId: e.areaExperienceId,
    mode: e.mode,
    configuration: asConfiguration(e.configurationJson),
    reason: e.reason,
  }));

  const referencedRoomIds = [
    ...new Set([
      ...bindings.map((b) => b.unitSpaceId),
      ...exceptions.map((e) => e.unitSpaceId),
    ]),
  ];
  const rooms = await loadRoomContexts(
    row.facilityId,
    referencedRoomIds,
    row.departmentId,
  );

  const result = validateProfileForCertification({
    profile: snapshot,
    bindings,
    exceptions,
    rooms,
    facility: { id: row.facilityId },
    department: {
      id: row.department.id,
      facilityId: row.department.facilityId,
      isActive: row.department.isActive,
    },
  });

  if (!result.certifiable) {
    return result;
  }

  await prisma.departmentOperationalProfile.update({
    where: { id: profileId, status: "DRAFT" },
    data: {
      status: "CERTIFIED",
      certifiedByUserId: actor.userId,
      certifiedAt: new Date(),
    },
  });

  return result;
}

export async function activateProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<void> {
  const target = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  await assertWrite(actor, target.facilityId, target.departmentId);

  const siblings = await prisma.departmentOperationalProfile.findMany({
    where: { departmentId: target.departmentId },
    select: { id: true, status: true, facilityId: true, departmentId: true },
  });

  const plan = planProfileActivation(siblings, profileId);
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }
  assertProfileTransition(target.status, "ACTIVE");

  const now = new Date();
  await prisma.$transaction([
    ...plan.retireIds.map((id) =>
      prisma.departmentOperationalProfile.update({
        where: { id, status: "ACTIVE" },
        data: { status: "RETIRED", retiredAt: now },
      }),
    ),
    prisma.departmentOperationalProfile.update({
      where: { id: plan.activateId, status: "CERTIFIED" },
      data: { status: "ACTIVE", activatedAt: now },
    }),
  ]);
}

/** Create the next DRAFT version by copying an existing profile's model. */
export async function createNextDraftVersion(
  actor: ProfileActor,
  sourceProfileId: string,
): Promise<{ profileId: string; version: number }> {
  const source = await loadProfile(sourceProfileId);
  assertPatternWrite(actor, source.facilityId);

  const versions = await prisma.departmentOperationalProfile.findMany({
    where: { departmentId: source.departmentId },
    select: { version: true },
  });
  const version = nextProfileVersion(versions.map((p) => p.version));

  const profileId = await prisma.$transaction(async (tx) => {
    const draft = await tx.departmentOperationalProfile.create({
      data: {
        facilityId: source.facilityId,
        departmentId: source.departmentId,
        name: source.name,
        version,
        status: "DRAFT",
        baselineKey: source.baselineKey,
        createdByUserId: actor.userId,
      },
    });

    const areaExperienceIdMap = new Map<string, string>();
    for (const area of source.areas) {
      const newArea = await tx.departmentOperationalArea.create({
        data: {
          profileId: draft.id,
          key: area.key,
          name: area.name,
          description: area.description,
          sortOrder: area.sortOrder,
          isActive: area.isActive,
        },
      });
      for (const experience of area.experiences) {
        const created = await tx.departmentAreaExperience.create({
          data: {
            areaId: newArea.id,
            experienceKey: experience.experienceKey,
            sortOrder: experience.sortOrder,
            isActive: experience.isActive,
            configurationJson: experience.configurationJson ?? undefined,
          },
        });
        areaExperienceIdMap.set(experience.id, created.id);
      }
    }

    const archetypeIdMap = new Map<string, string>();
    for (const archetype of source.archetypes) {
      const newArchetype = await tx.departmentRoomArchetype.create({
        data: {
          profileId: draft.id,
          key: archetype.key,
          name: archetype.name,
          description: archetype.description,
          sortOrder: archetype.sortOrder,
          isActive: archetype.isActive,
        },
      });
      archetypeIdMap.set(archetype.id, newArchetype.id);
      for (const selection of archetype.experiences) {
        const mappedAreaExperienceId = areaExperienceIdMap.get(
          selection.areaExperienceId,
        );
        if (!mappedAreaExperienceId) continue;
        await tx.departmentArchetypeExperience.create({
          data: {
            archetypeId: newArchetype.id,
            areaExperienceId: mappedAreaExperienceId,
            isActive: selection.isActive,
            sortOrder: selection.sortOrder,
            configurationJson: selection.configurationJson ?? undefined,
          },
        });
      }
    }

    for (const binding of source.roomBindings) {
      const mappedArchetypeId = archetypeIdMap.get(binding.archetypeId);
      if (!mappedArchetypeId) continue;
      await tx.departmentRoomArchetypeBinding.create({
        data: {
          profileId: draft.id,
          archetypeId: mappedArchetypeId,
          unitSpaceId: binding.unitSpaceId,
        },
      });
    }

    for (const exception of source.roomExceptions) {
      const mappedAreaExperienceId = areaExperienceIdMap.get(
        exception.areaExperienceId,
      );
      if (!mappedAreaExperienceId) continue;
      await tx.departmentRoomExperienceException.create({
        data: {
          profileId: draft.id,
          unitSpaceId: exception.unitSpaceId,
          areaExperienceId: mappedAreaExperienceId,
          mode: exception.mode,
          configurationJson: exception.configurationJson ?? undefined,
          reason: exception.reason,
        },
      });
    }

    return draft.id;
  });

  return { profileId, version };
}

// ---------------------------------------------------------------------------
// Room bindings and exceptions (DRAFT-only edits)
// ---------------------------------------------------------------------------

export async function bindRoomToArchetype(
  _actor: ProfileActor,
  _input: { profileId: string; archetypeId: string; unitSpaceId: string },
): Promise<{ bindingId: string }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

export async function addRoomExperienceException(
  actor: ProfileActor,
  input: {
    profileId: string;
    unitSpaceId: string;
    areaExperienceId: string;
    mode: "ENABLE" | "DISABLE" | "OVERRIDE";
    configuration?: ExperienceConfiguration | null;
    reason?: string | null;
  },
): Promise<{ exceptionId: string }> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: input.profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  await assertWrite(actor, profile.facilityId, profile.departmentId);
  assertProfileEditable(profile.status);

  const areaExperience = await prisma.departmentAreaExperience.findUniqueOrThrow({
    where: { id: input.areaExperienceId },
    select: { area: { select: { profileId: true } } },
  });
  if (areaExperience.area.profileId !== profile.id) {
    throw new Error("Exception must reference an Experience in the same profile.");
  }

  const configIssues = validateExperienceConfiguration(input.configuration);
  if (configIssues.length > 0) {
    throw new Error(
      `Invalid exception configuration: ${configIssues.map((i) => i.message).join("; ")}`,
    );
  }

  const room = await prisma.unitSpace.findUniqueOrThrow({
    where: { id: input.unitSpaceId },
    select: { facilityId: true },
  });
  if (room.facilityId !== profile.facilityId) {
    throw new Error("Cross-facility room rejected.");
  }

  const exception = await prisma.departmentRoomExperienceException.upsert({
    where: {
      profileId_unitSpaceId_areaExperienceId: {
        profileId: profile.id,
        unitSpaceId: input.unitSpaceId,
        areaExperienceId: input.areaExperienceId,
      },
    },
    create: {
      profileId: profile.id,
      unitSpaceId: input.unitSpaceId,
      areaExperienceId: input.areaExperienceId,
      mode: input.mode,
      configurationJson: (input.configuration ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
    },
    update: {
      mode: input.mode,
      configurationJson: (input.configuration ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
    },
  });

  return { exceptionId: exception.id };
}

export async function clearRoomArchetypeBinding(
  _actor: ProfileActor,
  _input: { profileId: string; unitSpaceId: string },
): Promise<void> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

export async function bindRoomsToArchetype(
  _actor: ProfileActor,
  _input: { profileId: string; archetypeId: string; unitSpaceIds: readonly string[] },
): Promise<{ bound: number }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** From-scratch DRAFT for departments without a system baseline. */
async function createEmptyPatternDraft(
  actor: ProfileActor,
  input: { facilityId: string; departmentId: string; departmentName: string },
): Promise<{ profileId: string; version: number }> {
  assertPatternWrite(actor, input.facilityId);
  const existing = await prisma.departmentOperationalProfile.findMany({
    where: { departmentId: input.departmentId },
    select: { version: true },
  });
  const version = nextProfileVersion(existing.map((p) => p.version));
  const profile = await prisma.departmentOperationalProfile.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      name: `${input.departmentName} operational types`,
      version,
      status: "DRAFT",
      createdByUserId: actor.userId,
    },
  });
  return { profileId: profile.id, version };
}

/** Ensure a DRAFT profile exists so Locations can author operational types. */
export async function ensureWorkingDraftForPatterns(
  actor: ProfileActor,
  input: { facilityId: string; departmentId: string },
): Promise<{ profileId: string; version: number; created: boolean }> {
  assertPatternWrite(actor, input.facilityId);

  const rows = await prisma.departmentOperationalProfile.findMany({
    where: { facilityId: input.facilityId, departmentId: input.departmentId },
    orderBy: [{ version: "desc" }],
    select: { id: true, version: true, status: true },
  });
  const draft = rows.find((r) => r.status === "DRAFT");
  if (draft) {
    return { profileId: draft.id, version: draft.version, created: false };
  }

  if (rows.length === 0) {
    const department = await prisma.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
      select: { key: true, name: true },
    });
    if (!department) throw new Error("Department not found.");
    const created = await createEmptyPatternDraft(actor, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      departmentName: department.name,
    });
    return { ...created, created: true };
  }

  const source =
    rows.find((r) => r.status === "ACTIVE") ??
    rows.find((r) => r.status === "CERTIFIED") ??
    rows[0]!;
  const next = await createNextDraftVersion(actor, source.id);
  return { ...next, created: true };
}

export async function removeRoomExperienceException(
  actor: ProfileActor,
  input: { profileId: string; exceptionId: string },
): Promise<void> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: input.profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  await assertWrite(actor, profile.facilityId, profile.departmentId);
  assertProfileEditable(profile.status);

  const exception = await prisma.departmentRoomExperienceException.findUniqueOrThrow({
    where: { id: input.exceptionId },
    select: { profileId: true },
  });
  if (exception.profileId !== profile.id) {
    throw new Error("Exception does not belong to the profile.");
  }

  await prisma.departmentRoomExperienceException.delete({
    where: { id: input.exceptionId },
  });
}

// ---------------------------------------------------------------------------
// Draft Area / Experience editing
// ---------------------------------------------------------------------------

async function loadEditableProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<{ id: string; facilityId: string; departmentId: string; status: "DRAFT" }> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  await assertWrite(actor, profile.facilityId, profile.departmentId);
  assertProfileEditable(profile.status);
  return profile as { id: string; facilityId: string; departmentId: string; status: "DRAFT" };
}

async function loadEditablePatternProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<{ id: string; facilityId: string; departmentId: string; status: "DRAFT" }> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  assertPatternWrite(actor, profile.facilityId);
  assertProfileEditable(profile.status);
  return profile as { id: string; facilityId: string; departmentId: string; status: "DRAFT" };
}

export async function setAreaExperienceActive(
  actor: ProfileActor,
  input: { profileId: string; areaExperienceId: string; isActive: boolean },
): Promise<void> {
  const profile = await loadEditableProfile(actor, input.profileId);
  const areaExperience = await prisma.departmentAreaExperience.findUniqueOrThrow({
    where: { id: input.areaExperienceId },
    select: { area: { select: { profileId: true } } },
  });
  if (areaExperience.area.profileId !== profile.id) {
    throw new Error("Experience does not belong to the profile.");
  }
  await prisma.departmentAreaExperience.update({
    where: { id: input.areaExperienceId },
    data: { isActive: input.isActive },
  });
}

export async function reorderAreaExperiences(
  actor: ProfileActor,
  input: { profileId: string; areaId: string; orderedAreaExperienceIds: readonly string[] },
): Promise<void> {
  const profile = await loadEditableProfile(actor, input.profileId);
  const area = await prisma.departmentOperationalArea.findUniqueOrThrow({
    where: { id: input.areaId },
    select: {
      profileId: true,
      experiences: { select: { id: true } },
    },
  });
  if (area.profileId !== profile.id) {
    throw new Error("Area does not belong to the profile.");
  }
  const existing = new Set(area.experiences.map((e) => e.id));
  if (input.orderedAreaExperienceIds.length !== existing.size) {
    throw new Error("Reorder must include every Experience in the Area.");
  }
  for (const id of input.orderedAreaExperienceIds) {
    if (!existing.has(id)) {
      throw new Error("Reorder includes an Experience outside the Area.");
    }
  }

  await prisma.$transaction(
    input.orderedAreaExperienceIds.map((id, index) =>
      prisma.departmentAreaExperience.update({
        where: { id },
        data: { sortOrder: (index + 1) * 10 },
      }),
    ),
  );
}

export async function moveAreaExperience(
  actor: ProfileActor,
  input: {
    profileId: string;
    areaExperienceId: string;
    targetAreaId: string;
  },
): Promise<void> {
  const profile = await loadEditableProfile(actor, input.profileId);

  const [areaExperience, targetArea] = await Promise.all([
    prisma.departmentAreaExperience.findUniqueOrThrow({
      where: { id: input.areaExperienceId },
      select: {
        id: true,
        experienceKey: true,
        isActive: true,
        configurationJson: true,
        areaId: true,
        area: { select: { profileId: true } },
      },
    }),
    prisma.departmentOperationalArea.findUniqueOrThrow({
      where: { id: input.targetAreaId },
      select: {
        id: true,
        profileId: true,
        experiences: { select: { experienceKey: true, sortOrder: true } },
      },
    }),
  ]);

  if (areaExperience.area.profileId !== profile.id) {
    throw new Error("Experience does not belong to the profile.");
  }
  if (targetArea.profileId !== profile.id) {
    throw new Error("Target Area does not belong to the profile.");
  }
  if (areaExperience.areaId === targetArea.id) {
    return;
  }
  if (targetArea.experiences.some((e) => e.experienceKey === areaExperience.experienceKey)) {
    throw new Error("Target Area already contains this Experience.");
  }

  // An Experience may only live in one Area — move is delete+create under target,
  // remapping archetype selections and room exceptions that reference the old id.
  const maxSort =
    targetArea.experiences.reduce((max, e) => Math.max(max, e.sortOrder), 0) + 10;

  await prisma.$transaction(async (tx) => {
    const created = await tx.departmentAreaExperience.create({
      data: {
        areaId: targetArea.id,
        experienceKey: areaExperience.experienceKey,
        sortOrder: maxSort,
        isActive: areaExperience.isActive,
        configurationJson: areaExperience.configurationJson ?? undefined,
      },
    });

    await tx.departmentArchetypeExperience.updateMany({
      where: { areaExperienceId: areaExperience.id },
      data: { areaExperienceId: created.id },
    });
    await tx.departmentRoomExperienceException.updateMany({
      where: { areaExperienceId: areaExperience.id },
      data: { areaExperienceId: created.id },
    });
    await tx.departmentAreaExperience.delete({ where: { id: areaExperience.id } });
  });
}

// ---------------------------------------------------------------------------
// Draft Archetype editing
// ---------------------------------------------------------------------------

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function adoptProductLocationFunction(
  _actor: ProfileActor,
  _input: {
    profileId: string;
    productKey: string;
    functionKey: string;
    displayName?: string | null;
  },
): Promise<{ archetypeId: string; alreadyAdopted: boolean }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function bindLocationFunction(
  _actor: ProfileActor,
  _input: {
    facilityId: string;
    departmentId: string;
    unitSpaceId: string;
    functionKey: string;
  },
): Promise<{ profileId: string; bindingId: string; functionKey: string }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function clearLocationFunction(
  _actor: ProfileActor,
  _input: { facilityId: string; departmentId: string; unitSpaceId: string },
): Promise<{ profileId: string }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function publishLocationFunctionDraft(
  _actor: ProfileActor,
  _input: { facilityId: string; departmentId: string },
): Promise<{ profileId: string }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function createRoomArchetype(
  _actor: ProfileActor,
  _input: {
    profileId: string;
    key?: string;
    name: string;
    description?: string | null;
  },
): Promise<{ archetypeId: string }> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function updateRoomArchetype(
  _actor: ProfileActor,
  _input: {
    profileId: string;
    archetypeId: string;
    name?: string;
    description?: string | null;
    isActive?: boolean;
  },
): Promise<void> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** @deprecated Location Function authoring retired (Phase 2A). */
export async function setArchetypeExperiences(
  _actor: ProfileActor,
  _input: {
    profileId: string;
    archetypeId: string;
    selections: readonly {
      areaExperienceId: string;
      isActive?: boolean;
      sortOrder?: number;
    }[];
  },
): Promise<void> {
  throw new Error(LOCATION_FUNCTION_AUTHORING_RETIRED);
}

/** Retire an ACTIVE profile without activating a replacement. */
export async function retireActiveProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<void> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  await assertWrite(actor, profile.facilityId, profile.departmentId);
  assertProfileTransition(profile.status, "RETIRED");

  await prisma.departmentOperationalProfile.update({
    where: { id: profileId, status: "ACTIVE" },
    data: { status: "RETIRED", retiredAt: new Date() },
  });
}
