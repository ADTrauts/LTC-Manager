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
import { isDepartmentOperationalProfilesEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { materializeBaselineProfilePlan } from "./baseline";
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
import { assertProfileWriteAccess } from "./profile-access";
import type {
  ExperienceConfiguration,
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "./profile-types";
import { isRoomStagedOrUndesignated } from "./profile-types";

export type ProfileActor = {
  userId: string | null;
  role: AppRole;
  facilityId: string;
};

function assertWrite(actor: ProfileActor, targetFacilityId: string): void {
  assertProfileWriteAccess({
    flagEnabled: isDepartmentOperationalProfilesEnabled(),
    role: actor.role,
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
  assertWrite(actor, input.facilityId);

  const department = await prisma.department.findUniqueOrThrow({
    where: { id: input.departmentId },
    select: { id: true, key: true, facilityId: true, isActive: true },
  });
  if (department.facilityId !== input.facilityId) {
    throw new Error("Department does not belong to the facility.");
  }

  const plan = materializeBaselineProfilePlan(department.key);

  const existing = await prisma.departmentOperationalProfile.findMany({
    where: { departmentId: department.id },
    select: { version: true },
  });
  const version = nextProfileVersion(existing.map((p) => p.version));

  // One transaction: profile + areas + experiences + archetypes + selections.
  const profileId = await prisma.$transaction(async (tx) => {
    const profile = await tx.departmentOperationalProfile.create({
      data: {
        facilityId: input.facilityId,
        departmentId: department.id,
        name: plan.name,
        version,
        status: "DRAFT",
        baselineKey: plan.baselineKey,
        createdByUserId: actor.userId,
      },
    });

    const areaExperienceIdByKey = new Map<string, string>();
    for (const areaPlan of plan.areas) {
      const area = await tx.departmentOperationalArea.create({
        data: {
          profileId: profile.id,
          key: areaPlan.key,
          name: areaPlan.name,
          description: areaPlan.description,
          sortOrder: areaPlan.sortOrder,
        },
      });
      let sortOrder = 10;
      for (const experienceKey of areaPlan.experienceKeys) {
        const areaExperience = await tx.departmentAreaExperience.create({
          data: {
            areaId: area.id,
            experienceKey,
            sortOrder,
          },
        });
        areaExperienceIdByKey.set(experienceKey, areaExperience.id);
        sortOrder += 10;
      }
    }

    for (const archetypePlan of plan.archetypes) {
      const archetype = await tx.departmentRoomArchetype.create({
        data: {
          profileId: profile.id,
          key: archetypePlan.key,
          name: archetypePlan.name,
          description: archetypePlan.description,
          sortOrder: archetypePlan.sortOrder,
        },
      });
      let sortOrder = 10;
      for (const experienceKey of archetypePlan.experienceKeys) {
        const areaExperienceId = areaExperienceIdByKey.get(experienceKey);
        if (!areaExperienceId) {
          throw new Error(
            `Baseline archetype ${archetypePlan.key} references missing Experience ${experienceKey}`,
          );
        }
        await tx.departmentArchetypeExperience.create({
          data: { archetypeId: archetype.id, areaExperienceId, sortOrder },
        });
        sortOrder += 10;
      }
    }

    return profile.id;
  });

  return { profileId, version };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function certifyProfile(
  actor: ProfileActor,
  profileId: string,
): Promise<CertificationResult> {
  const row = await loadProfile(profileId);
  assertWrite(actor, row.facilityId);
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
  assertWrite(actor, target.facilityId);

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
  assertWrite(actor, source.facilityId);

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
  actor: ProfileActor,
  input: { profileId: string; archetypeId: string; unitSpaceId: string },
): Promise<{ bindingId: string }> {
  const profile = await prisma.departmentOperationalProfile.findUniqueOrThrow({
    where: { id: input.profileId },
    select: { id: true, facilityId: true, departmentId: true, status: true },
  });
  assertWrite(actor, profile.facilityId);
  assertProfileEditable(profile.status);

  const archetype = await prisma.departmentRoomArchetype.findUniqueOrThrow({
    where: { id: input.archetypeId },
    select: { profileId: true },
  });
  if (archetype.profileId !== profile.id) {
    throw new Error("Archetype does not belong to the profile.");
  }

  const [room] = await loadRoomContexts(
    profile.facilityId,
    [input.unitSpaceId],
    profile.departmentId,
  ).then((rooms) => rooms.filter((r) => r.id === input.unitSpaceId));

  if (!room) throw new Error("Room not found.");
  if (room.facilityId !== profile.facilityId) {
    throw new Error("Cross-facility room rejected.");
  }
  if (isRoomStagedOrUndesignated(room)) {
    throw new Error("Staged/undesignated rooms cannot be bound.");
  }
  if (!room.assignedDepartmentIds.includes(profile.departmentId)) {
    throw new Error("Room is not assigned to the department in Facility Builder.");
  }

  const binding = await prisma.departmentRoomArchetypeBinding.upsert({
    where: {
      profileId_unitSpaceId: {
        profileId: profile.id,
        unitSpaceId: input.unitSpaceId,
      },
    },
    create: {
      profileId: profile.id,
      archetypeId: input.archetypeId,
      unitSpaceId: input.unitSpaceId,
    },
    update: { archetypeId: input.archetypeId },
  });

  return { bindingId: binding.id };
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
  assertWrite(actor, profile.facilityId);
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
