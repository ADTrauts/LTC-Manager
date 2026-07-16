/**
 * Profile certification validation — pure.
 *
 * A profile may certify only when structurally valid. Incomplete room
 * mapping is a diagnostic, not an error (complete mapping is not required
 * in this milestone).
 */

import { isExperienceKey } from "@/lib/experiences";

import { validateExperienceConfiguration } from "./configuration";
import {
  isRoomStagedOrUndesignated,
  type ProfileSnapshot,
  type RoomArchetypeBindingSnapshot,
  type RoomContext,
  type RoomExceptionSnapshot,
} from "./profile-types";

export type CertificationError = { code: string; message: string };
export type CertificationDiagnostic = { code: string; message: string };

export type CertificationResult = {
  certifiable: boolean;
  errors: CertificationError[];
  diagnostics: CertificationDiagnostic[];
};

export type CertificationInput = {
  profile: ProfileSnapshot;
  bindings: readonly RoomArchetypeBindingSnapshot[];
  exceptions: readonly RoomExceptionSnapshot[];
  /** Context for every room referenced by bindings/exceptions, plus (optionally) all department-assigned rooms for diagnostics. */
  rooms: readonly RoomContext[];
  facility: { id: string; isActive?: boolean };
  department: { id: string; facilityId: string; isActive: boolean };
};

/** Threshold above which repeated identical exceptions suggest a missing archetype. */
const EXCEPTION_PATTERN_THRESHOLD = 3;

export function validateProfileForCertification(
  input: CertificationInput,
): CertificationResult {
  const { profile, bindings, exceptions, rooms, facility, department } = input;
  const errors: CertificationError[] = [];
  const diagnostics: CertificationDiagnostic[] = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));

  // Facility / department compatibility
  if (facility.isActive === false) {
    errors.push({ code: "facility_inactive", message: "Facility is inactive" });
  }
  if (!department.isActive) {
    errors.push({ code: "department_inactive", message: "Department is inactive" });
  }
  if (department.facilityId !== facility.id) {
    errors.push({
      code: "department_facility_mismatch",
      message: "Department does not belong to the facility",
    });
  }
  if (profile.facilityId !== facility.id) {
    errors.push({
      code: "profile_facility_mismatch",
      message: "Profile does not belong to the facility",
    });
  }
  if (profile.departmentId !== department.id) {
    errors.push({
      code: "profile_department_mismatch",
      message: "Profile does not belong to the department",
    });
  }

  // Areas + Experiences
  const areaKeys = new Set<string>();
  const experienceOwnership = new Map<string, string>(); // experienceKey → areaKey
  const areaExperienceIds = new Map<string, { areaKey: string; experienceKey: string; isActive: boolean }>();

  for (const area of profile.areas) {
    if (areaKeys.has(area.key)) {
      errors.push({
        code: "duplicate_area_key",
        message: `Duplicate area key: ${area.key}`,
      });
    }
    areaKeys.add(area.key);

    for (const experience of area.experiences) {
      areaExperienceIds.set(experience.id, {
        areaKey: area.key,
        experienceKey: experience.experienceKey,
        isActive: experience.isActive && area.isActive,
      });

      if (!isExperienceKey(experience.experienceKey)) {
        errors.push({
          code: "unknown_experience",
          message: `Unknown Experience key: ${experience.experienceKey} (area ${area.key})`,
        });
      }

      if (experience.isActive && area.isActive) {
        const owner = experienceOwnership.get(experience.experienceKey);
        if (owner && owner !== area.key) {
          errors.push({
            code: "experience_multiple_areas",
            message: `Experience ${experience.experienceKey} is active in both ${owner} and ${area.key}`,
          });
        }
        experienceOwnership.set(experience.experienceKey, area.key);
      }

      const configIssues = validateExperienceConfiguration(
        experience.configuration,
      );
      for (const issue of configIssues) {
        errors.push({
          code: "invalid_configuration",
          message: `Experience ${experience.experienceKey}: ${issue.message} (${issue.path || "root"})`,
        });
      }
    }
  }

  // Archetypes
  const archetypeKeys = new Set<string>();
  const archetypeIds = new Set<string>();
  for (const archetype of profile.archetypes) {
    archetypeIds.add(archetype.id);
    if (archetypeKeys.has(archetype.key)) {
      errors.push({
        code: "duplicate_archetype_key",
        message: `Duplicate archetype key: ${archetype.key}`,
      });
    }
    archetypeKeys.add(archetype.key);

    for (const selection of archetype.experiences) {
      if (!areaExperienceIds.has(selection.areaExperienceId)) {
        errors.push({
          code: "archetype_experience_out_of_profile",
          message: `Archetype ${archetype.key} references an Experience not present in the profile`,
        });
      }
      const configIssues = validateExperienceConfiguration(
        selection.configuration,
      );
      for (const issue of configIssues) {
        errors.push({
          code: "invalid_configuration",
          message: `Archetype ${archetype.key}: ${issue.message} (${issue.path || "root"})`,
        });
      }
    }
  }

  // Room bindings
  const boundRoomIds = new Set<string>();
  for (const binding of bindings) {
    if (boundRoomIds.has(binding.unitSpaceId)) {
      errors.push({
        code: "duplicate_room_binding",
        message: `Room ${binding.unitSpaceId} is bound to more than one archetype`,
      });
    }
    boundRoomIds.add(binding.unitSpaceId);

    if (!archetypeIds.has(binding.archetypeId)) {
      errors.push({
        code: "binding_unknown_archetype",
        message: `Binding references unknown archetype ${binding.archetypeId}`,
      });
    }

    const room = roomById.get(binding.unitSpaceId);
    if (!room) {
      errors.push({
        code: "binding_unknown_room",
        message: `Binding references unknown room ${binding.unitSpaceId}`,
      });
      continue;
    }
    if (room.facilityId !== facility.id) {
      errors.push({
        code: "binding_cross_facility",
        message: `Room ${room.id} belongs to another facility`,
      });
    }
    if (!room.assignedDepartmentIds.includes(department.id)) {
      errors.push({
        code: "binding_room_not_assigned",
        message: `Room ${room.id} is not assigned to the department in Facility Builder`,
      });
    }
    if (isRoomStagedOrUndesignated(room)) {
      errors.push({
        code: "binding_staged_room",
        message: `Room ${room.id} is staged/undesignated and cannot be bound`,
      });
    }
    if (!room.isActive) {
      diagnostics.push({
        code: "binding_inactive_room",
        message: `Room ${room.id} is inactive but still bound`,
      });
    }
  }

  // Sparse exceptions
  const exceptionPatterns = new Map<string, number>(); // areaExperienceId+mode → count
  for (const exception of exceptions) {
    if (!areaExperienceIds.has(exception.areaExperienceId)) {
      errors.push({
        code: "exception_unknown_experience",
        message: `Exception references an Experience not present in the profile`,
      });
    }
    const room = roomById.get(exception.unitSpaceId);
    if (room && room.facilityId !== facility.id) {
      errors.push({
        code: "exception_cross_facility",
        message: `Exception room ${room.id} belongs to another facility`,
      });
    }
    const configIssues = validateExperienceConfiguration(
      exception.configuration,
    );
    for (const issue of configIssues) {
      errors.push({
        code: "invalid_configuration",
        message: `Room exception: ${issue.message} (${issue.path || "root"})`,
      });
    }

    const pattern = `${exception.areaExperienceId}:${exception.mode}`;
    exceptionPatterns.set(pattern, (exceptionPatterns.get(pattern) ?? 0) + 1);
  }

  for (const [pattern, count] of exceptionPatterns) {
    if (count >= EXCEPTION_PATTERN_THRESHOLD) {
      const [areaExperienceId, mode] = pattern.split(":");
      const info = areaExperienceIds.get(areaExperienceId!);
      diagnostics.push({
        code: "exception_pattern_missing_archetype",
        message: `${count} rooms share the same ${mode} exception for ${info?.experienceKey ?? areaExperienceId}; consider defining an archetype instead`,
      });
    }
  }

  // Coverage diagnostics (not errors in this milestone)
  for (const room of rooms) {
    if (
      room.facilityId === facility.id &&
      room.assignedDepartmentIds.includes(department.id) &&
      room.isActive &&
      !isRoomStagedOrUndesignated(room) &&
      !boundRoomIds.has(room.id)
    ) {
      diagnostics.push({
        code: "assigned_room_unmapped",
        message: `Assigned room ${room.id} has no archetype binding`,
      });
    }
  }

  return { certifiable: errors.length === 0, errors, diagnostics };
}
