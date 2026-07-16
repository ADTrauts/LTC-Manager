/**
 * Room-profile resolution — pure.
 *
 * Resolves what a certified/active profile says about one room:
 * profile Experiences → archetype narrowing/tuning → sparse room exceptions.
 *
 * This is profile resolution, NOT Projection:
 * - no live operational data is loaded;
 * - no user access is applied;
 * - no navigation or query scopes are produced.
 */

import { mergeExperienceConfiguration } from "./configuration";
import type {
  ExperienceConfiguration,
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "./profile-types";

export type ResolvedExperienceSource = "PROFILE" | "ARCHETYPE" | "ROOM_EXCEPTION";

export type ResolvedRoomExperience = {
  experienceKey: string;
  sortOrder: number;
  effectiveConfiguration: ExperienceConfiguration | null;
  source: ResolvedExperienceSource;
};

export type ResolvedRoomArea = {
  areaKey: string;
  name: string;
  sortOrder: number;
  experiences: ResolvedRoomExperience[];
};

export type RoomProfileDiagnostic = { code: string; message: string };

export type ResolvedRoomProfile = {
  profileId: string;
  departmentId: string;
  roomId: string;
  archetype: { id: string; key: string; name: string } | null;
  areas: ResolvedRoomArea[];
  diagnostics: RoomProfileDiagnostic[];
};

export type ResolveRoomProfileInput = {
  profile: ProfileSnapshot;
  room: RoomContext;
  archetypeBinding: RoomArchetypeBindingSnapshot | null;
  exceptions: readonly RoomExceptionSnapshot[];
};

export function resolveDepartmentRoomProfile(
  input: ResolveRoomProfileInput,
): ResolvedRoomProfile {
  const { profile, room, archetypeBinding } = input;
  const diagnostics: RoomProfileDiagnostic[] = [];

  const roomExceptions = input.exceptions.filter(
    (exception) => exception.unitSpaceId === room.id,
  );

  // 1. Start with active profile Experiences (active areas only).
  const activeAreas = profile.areas
    .filter((area) => area.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 2. Resolve archetype selection/tuning.
  const archetype = archetypeBinding
    ? profile.archetypes.find((a) => a.id === archetypeBinding.archetypeId) ?? null
    : null;

  if (archetypeBinding && !archetype) {
    diagnostics.push({
      code: "binding_unknown_archetype",
      message: `Room binding references unknown archetype ${archetypeBinding.archetypeId}`,
    });
  }
  if (archetype && !archetype.isActive) {
    diagnostics.push({
      code: "archetype_inactive",
      message: `Archetype ${archetype.key} is inactive`,
    });
  }
  if (!archetypeBinding) {
    diagnostics.push({
      code: "room_unmapped",
      message: "Room has no archetype binding; profile-level Experiences shown",
    });
  }

  const archetypeSelection = new Map<
    string,
    { isActive: boolean; sortOrder: number; configuration: ExperienceConfiguration | null }
  >();
  if (archetype && archetype.isActive) {
    for (const selection of archetype.experiences) {
      archetypeSelection.set(selection.areaExperienceId, {
        isActive: selection.isActive,
        sortOrder: selection.sortOrder,
        configuration: selection.configuration,
      });
    }
  }
  const narrowedByArchetype = archetype !== null && archetype.isActive;

  // 3. Index exceptions by areaExperienceId.
  const exceptionByAreaExperience = new Map<string, RoomExceptionSnapshot>();
  for (const exception of roomExceptions) {
    exceptionByAreaExperience.set(exception.areaExperienceId, exception);
  }

  // 4. Compose areas.
  const areas: ResolvedRoomArea[] = [];
  for (const area of activeAreas) {
    const experiences: ResolvedRoomExperience[] = [];
    const ordered = [...area.experiences].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    for (const areaExperience of ordered) {
      const exception = exceptionByAreaExperience.get(areaExperience.id);

      // Inactive profile Experiences are suppressed and cannot be re-enabled by rooms.
      if (!areaExperience.isActive) {
        if (exception && exception.mode === "ENABLE") {
          diagnostics.push({
            code: "exception_on_inactive_experience",
            message: `Room exception cannot enable inactive Experience ${areaExperience.experienceKey}`,
          });
        }
        continue;
      }

      const selection = archetypeSelection.get(areaExperience.id);
      const selectedByArchetype = narrowedByArchetype
        ? (selection?.isActive ?? false)
        : true;

      let included = selectedByArchetype;
      let source: ResolvedExperienceSource = narrowedByArchetype
        ? "ARCHETYPE"
        : "PROFILE";
      let configuration = mergeExperienceConfiguration(
        areaExperience.configuration,
        selectedByArchetype ? selection?.configuration : null,
      );
      let sortOrder = selection?.sortOrder ?? areaExperience.sortOrder;

      if (exception) {
        if (exception.mode === "DISABLE") {
          included = false;
        } else if (exception.mode === "ENABLE") {
          if (!included) {
            included = true;
            source = "ROOM_EXCEPTION";
            configuration = mergeExperienceConfiguration(
              areaExperience.configuration,
              exception.configuration,
            );
            sortOrder = areaExperience.sortOrder;
          }
        } else if (exception.mode === "OVERRIDE") {
          if (included) {
            source = "ROOM_EXCEPTION";
            configuration = mergeExperienceConfiguration(
              configuration,
              exception.configuration,
            );
          }
        }
      }

      if (!included) continue;

      experiences.push({
        experienceKey: areaExperience.experienceKey,
        sortOrder,
        effectiveConfiguration: configuration,
        source,
      });
    }

    // 5. Suppress empty areas.
    if (experiences.length === 0) continue;

    experiences.sort((a, b) => a.sortOrder - b.sortOrder);
    areas.push({
      areaKey: area.key,
      name: area.name,
      sortOrder: area.sortOrder,
      experiences,
    });
  }

  return {
    profileId: profile.id,
    departmentId: profile.departmentId,
    roomId: room.id,
    archetype:
      archetype && archetype.isActive
        ? { id: archetype.id, key: archetype.key, name: archetype.name }
        : null,
    areas,
    diagnostics,
  };
}
