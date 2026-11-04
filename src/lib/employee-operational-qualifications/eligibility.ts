import { isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";

/**
 * Ordinary staffing eligibility.
 * OPERATIONAL_ROLE_REGISTRY does not model licensure, certification, or another
 * mandatory credential. An exception is not a waiver of a legal requirement,
 * because this release has no such requirement to waive.
 */
export type QualificationStatus = "ACTIVE" | "REVOKED";

export type QualificationRow = {
  roleKey: string;
  status: QualificationStatus;
};

export function activeRoleKeys(rows: readonly QualificationRow[]): string[] {
  return rows.filter((row) => row.status === "ACTIVE").map((row) => row.roleKey);
}

export function assertQualificationSelection(input: {
  isDepartmentMember: boolean;
  departmentKey: string;
  roleKeys: readonly string[];
}): string[] {
  if (!input.isDepartmentMember) {
    throw new Error("Operational eligibility requires Department membership.");
  }
  const unique = [...new Set(input.roleKeys.map((key) => key.trim()).filter(Boolean))];
  for (const roleKey of unique) {
    if (!isRoleValidForDepartment(roleKey, input.departmentKey)) {
      throw new Error(`Role "${roleKey}" is not an operational role for this Department.`);
    }
  }
  return unique;
}

export type QualificationWritePlan = {
  create: string[];
  activate: string[];
  revoke: string[];
};

/** Current-state plan. Revoke keeps the row. It does not rewrite Assignments. */
export function planQualificationWrites(input: {
  existing: readonly QualificationRow[];
  desiredRoleKeys: readonly string[];
}): QualificationWritePlan {
  const desired = new Set(input.desiredRoleKeys);
  const existing = new Map(input.existing.map((row) => [row.roleKey, row.status]));
  const create: string[] = [];
  const activate: string[] = [];
  const revoke: string[] = [];
  for (const roleKey of desired) {
    const status = existing.get(roleKey);
    if (!status) create.push(roleKey);
    else if (status === "REVOKED") activate.push(roleKey);
  }
  for (const [roleKey, status] of existing) {
    if (!desired.has(roleKey) && status === "ACTIVE") revoke.push(roleKey);
  }
  return { create, activate, revoke };
}

export type StaffingDecision =
  | { allow: true; recordExceptionReason: null }
  | { allow: true; recordExceptionReason: string }
  | { allow: false; message: string };

export function decideOperationalStaffing(input: {
  qualified: boolean;
  exceptionReason: string | null | undefined;
  canOverride: boolean;
}): StaffingDecision {
  if (input.qualified) return { allow: true, recordExceptionReason: null };
  const reason = input.exceptionReason?.trim() ?? "";
  if (!reason) {
    return {
      allow: false,
      message: "This employee is not eligible for this operational role.",
    };
  }
  if (!input.canOverride) {
    return {
      allow: false,
      message: "An eligibility exception requires assignment authority.",
    };
  }
  return { allow: true, recordExceptionReason: reason };
}
