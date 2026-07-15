import { isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";

import type { ValidateAssignmentInput, ValidationResult } from "./types";

/**
 * Validate an operational assignment before creation.
 * Returns hard errors (must block) and soft warnings (informational).
 */
export function validateOperationalAssignment(input: ValidateAssignmentInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.employeeFacilityId !== input.facilityId) {
    errors.push("Employee does not belong to this facility.");
  }

  if (input.unitId && input.unitFacilityId && input.unitFacilityId !== input.facilityId) {
    errors.push("Unit does not belong to this facility.");
  }

  if (input.operationInstanceId && input.operationFacilityId && input.operationFacilityId !== input.facilityId) {
    errors.push("Operation does not belong to this facility.");
  }

  if (!isRoleValidForDepartment(input.roleKey, input.departmentKey)) {
    errors.push(`Role "${input.roleKey}" is not valid for department "${input.departmentKey}".`);
  }

  if (input.unitId && input.unitIsActive === false) {
    warnings.push("Unit is inactive.");
  }

  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) {
    errors.push("Assignment start time must be before end time.");
  }

  if (input.scheduledStart && input.scheduledEnd && input.startsAt && input.endsAt) {
    const schedStart = parseLocalTime(input.serviceDate, input.scheduledStart);
    const schedEnd = parseLocalTime(input.serviceDate, input.scheduledEnd);
    if (schedStart && schedEnd) {
      if (input.startsAt < schedStart || input.endsAt > schedEnd) {
        warnings.push("Assignment falls outside the employee's scheduled shift.");
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function parseLocalTime(dateIso: string, timeLocal: string): Date | null {
  const match = timeLocal.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, h, m] = match;
  return new Date(`${dateIso}T${h!.padStart(2, "0")}:${m}:00`);
}
