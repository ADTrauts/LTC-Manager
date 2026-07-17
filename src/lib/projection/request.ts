/**
 * Wave 15D — ProjectionRequest construction helpers.
 *
 * Builds validated request objects from already-resolved principal context.
 * Does not query Prisma or invent eligibility.
 */

import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ProjectionAccessClass,
  ProjectionLens,
  ProjectionLocationReference,
  ProjectionPrincipalKind,
  ProjectionPurpose,
  ProjectionRequest,
} from "./types";

export type ProjectionRequestPrincipalInput = {
  principalKind: ProjectionPrincipalKind;
  role: AppRole | string;
  /** Pre-resolved unit access — never broadened by Projection. */
  allowedUnitIds: readonly string[] | "ALL";
  /** PIN / kiosk lock; maps from session.activeUnitId when locked. */
  lockedUnitId?: string;
  /**
   * Pre-resolved Experience/action permission keys.
   * Callers may pass ["*"] for entitled managers/admins.
   */
  permissionKeys: readonly string[];
  accessClassKey?: string;
};

export type BuildProjectionRequestInput = {
  facilityId: string;
  lens: ProjectionLens;
  principal: ProjectionRequestPrincipalInput;
  purpose: ProjectionPurpose;
  focus?: ProjectionLocationReference;
  operationContextKey?: string;
  asOf?: string;
};

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildAccessClass(
  principal: ProjectionRequestPrincipalInput,
): ProjectionAccessClass {
  const key =
    principal.accessClassKey ??
    [
      principal.principalKind,
      principal.role,
      principal.allowedUnitIds === "ALL"
        ? "units:ALL"
        : `units:${[...principal.allowedUnitIds].sort().join(",")}`,
      principal.lockedUnitId ? `lock:${principal.lockedUnitId}` : "lock:none",
      `perms:${[...principal.permissionKeys].sort().join("|")}`,
    ].join(":");

  return {
    key,
    principalKind: principal.principalKind,
    role: principal.role,
    allowedUnitIds: principal.allowedUnitIds,
    lockedUnitId: principal.lockedUnitId,
    permissionKeys: principal.permissionKeys,
  };
}

/**
 * Default permission band helpers for common roles.
 * These are request-construction conveniences — not a parallel RBAC system.
 */
export function permissionKeysForRoleBand(
  role: AppRole | string,
): readonly string[] {
  switch (role) {
    case "FACILITY_ADMINISTRATOR":
    case "GM":
    case "MANAGER":
      return ["*"];
    case "SUPERVISOR":
    case "LEAD_TEAM_MEMBER":
      return ["*"];
    case "STAFF":
    default:
      return [];
  }
}

export function buildDepartmentLens(
  departmentId: string,
  departmentKey: OperationalDepartmentKey,
): ProjectionLens {
  return { mode: "DEPARTMENT", departmentId, departmentKey };
}

export function buildFacilityLens(): ProjectionLens {
  return { mode: "FACILITY" };
}

export function buildProjectionRequest(
  input: BuildProjectionRequestInput,
): ProjectionRequest {
  if (!nonEmpty(input.facilityId)) {
    throw new Error("ProjectionRequest requires facilityId");
  }
  if (input.lens.mode === "DEPARTMENT") {
    if (!nonEmpty(input.lens.departmentId) || !nonEmpty(input.lens.departmentKey)) {
      throw new Error("Department lens requires departmentId and departmentKey");
    }
  }
  if (input.focus && input.focus.facilityId !== input.facilityId) {
    throw new Error("Projection focus facilityId must match request facilityId");
  }

  return {
    facilityId: input.facilityId,
    lens: input.lens,
    accessClass: buildAccessClass(input.principal),
    purpose: input.purpose,
    focus: input.focus,
    operationContextKey: input.operationContextKey,
    asOf: input.asOf,
  };
}

/** PIN / employee tablet sessions lock to the active unit. */
export function buildPinAccessPrincipal(input: {
  role?: string;
  lockedUnitId: string;
  permissionKeys: readonly string[];
}): ProjectionRequestPrincipalInput {
  return {
    principalKind: "EMPLOYEE",
    role: input.role ?? "STAFF",
    allowedUnitIds: [input.lockedUnitId],
    lockedUnitId: input.lockedUnitId,
    permissionKeys: input.permissionKeys,
    accessClassKey: `pin:${input.lockedUnitId}`,
  };
}
