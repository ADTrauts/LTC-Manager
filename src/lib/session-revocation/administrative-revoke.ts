import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";

import { describeRevocation } from "./triggers";
import { revokeEmployeeSessions, revokeUserSessions, type PrismaLike } from "./session-version";

/**
 * The minimum role that may end another person's sessions.
 *
 * Matches `updateEmployeeStatusAction`, which is the closest existing authority: someone who can
 * mark an employee terminated can already end their access, so requiring more here would leave the
 * weaker control as the easier path.
 */
const REVOKE_MINIMUM_ROLE: AppRole = "MANAGER";

/**
 * Roles whose authority spans the whole facility. Below this tier the actor must share a
 * department with the target, so a department manager cannot sign out unrelated staff.
 */
function actsFacilityWide(role: AppRole): boolean {
  return hasAtLeastRole(role, "GM");
}

export type AdministrativeRevokeFailure =
  | "INSUFFICIENT_ROLE"
  | "TARGET_NOT_FOUND"
  | "DEPARTMENT_SCOPE_REQUIRED";

export type AdministrativeRevokeResult =
  | { ok: true; revokedEmployee: boolean; revokedUser: boolean }
  | { ok: false; reason: AdministrativeRevokeFailure };

/**
 * End every session for a managed employee, and for the app account that shares their email.
 *
 * An employee promoted into a leadership role has both a PIN identity and a User row, and ending
 * only one of them would leave the other usable. The lookup is scoped to the session facility, so
 * another facility's employee resolves to nothing and is reported as not found rather than
 * forbidden — the identifier's existence is not disclosed.
 */
export async function revokeEmployeeSessionsAdministratively(
  client: PrismaClient,
  input: {
    actorRole: AppRole;
    actorFacilityId: string;
    /** Departments the actor holds authority in. Ignored for facility-wide roles. */
    actorDepartmentIds: string[];
    actorUserId: string | null;
    targetEmployeeId: string;
  },
): Promise<AdministrativeRevokeResult> {
  if (!hasAtLeastRole(input.actorRole, REVOKE_MINIMUM_ROLE)) {
    return { ok: false, reason: "INSUFFICIENT_ROLE" };
  }

  const target = await client.employee.findFirst({
    where: { id: input.targetEmployeeId, facilityId: input.actorFacilityId },
    select: {
      id: true,
      email: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!target) {
    return { ok: false, reason: "TARGET_NOT_FOUND" };
  }

  if (!actsFacilityWide(input.actorRole)) {
    const targetDepartments = new Set<string>([
      ...(target.primaryDepartmentId ? [target.primaryDepartmentId] : []),
      ...target.employeeDepartments.map((row) => row.departmentId),
    ]);
    const shares = input.actorDepartmentIds.some((id) => targetDepartments.has(id));
    if (!shares) {
      return { ok: false, reason: "DEPARTMENT_SCOPE_REQUIRED" };
    }
  }

  const email = target.email?.trim().toLowerCase() ?? null;

  return client.$transaction(async (tx) => {
    await revokeEmployeeSessions(tx, target.id);

    let revokedUser = false;
    if (email) {
      const linkedUser = await tx.user.findFirst({
        where: {
          facilityId: input.actorFacilityId,
          email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (linkedUser) {
        await revokeUserSessions(tx, linkedUser.id);
        revokedUser = true;
      }
    }

    await tx.employeeHrAuditLog.create({
      data: {
        facilityId: input.actorFacilityId,
        employeeId: target.id,
        userId: input.actorUserId,
        fieldKey: "employee.sessionRevocation",
        oldValue: null,
        newValue: describeRevocation("EXPLICIT_REVOKE"),
      },
    });

    return { ok: true as const, revokedEmployee: true, revokedUser };
  });
}

/** End every session for the calling identity. Used by explicit "sign out everywhere". */
export async function revokeOwnSessions(
  client: PrismaLike,
  identity: { kind: "user" | "employee"; id: string },
): Promise<number> {
  return identity.kind === "employee"
    ? revokeEmployeeSessions(client, identity.id)
    : revokeUserSessions(client, identity.id);
}
