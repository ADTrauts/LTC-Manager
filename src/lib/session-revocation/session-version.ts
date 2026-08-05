import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";

/**
 * Any Prisma surface that can increment a session version — the client itself or a transaction
 * handle. Revocation almost always belongs inside the same transaction as the authority change it
 * accompanies, so every helper here accepts either.
 */
export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * The value every identity starts at, and the value the migration backfills onto existing rows.
 *
 * Deterministic rather than random: a fresh identity and a pre-existing one are indistinguishable,
 * so nothing has to special-case "this row predates revocation".
 */
export const INITIAL_SESSION_VERSION = 0;

/**
 * Why a session was rejected. Reported to the caller so pages, APIs, and Server Actions can each
 * respond appropriately, and so the reason can be logged without logging the token.
 */
export type SessionRejection =
  | "IDENTITY_NOT_FOUND"
  | "IDENTITY_INACTIVE"
  | "VERSION_CLAIM_MISSING"
  | "VERSION_STALE"
  | "FACILITY_ACCESS_REVOKED";

export type SessionValidation =
  | {
      valid: true;
      /**
       * Department authority the identity still holds. Null when the session's department claim is
       * no longer backed by a relationship, so a caller reading this instead of the raw claim
       * cannot act on removed department authority.
       */
      effectiveDepartmentId: string | null;
    }
  | { valid: false; reason: SessionRejection };

/**
 * Validate a signature-valid session against current server-owned state.
 *
 * A signed token proves the server issued the session. It does not prove the holder still has the
 * authority the session was issued under, which is the whole point of this check: termination, a
 * role change, or a password reset must take effect before the token's twelve-hour expiry rather
 * than after it.
 *
 * Reads exactly one row per request (see `loadSessionAuthority`), so this is a single indexed
 * primary-key lookup rather than a per-call cost.
 */
export async function validateSessionAuthority(
  session: AppJwtPayload,
  client: PrismaLike,
): Promise<SessionValidation> {
  // A token minted before this release carries no version, so it cannot be compared against
  // anything. Treating "unknown" as "current" would let exactly the sessions we cannot vouch for
  // survive, so the missing claim fails closed and the holder signs in again once.
  if (typeof session.sessionVersion !== "number") {
    return { valid: false, reason: "VERSION_CLAIM_MISSING" };
  }

  return session.authKind === "employee"
    ? validateEmployeeSession(session, client)
    : validateUserSession(session, client);
}

async function validateUserSession(
  session: AppJwtPayload,
  client: PrismaLike,
): Promise<SessionValidation> {
  const user = await client.user.findUnique({
    where: { id: session.uid },
    select: {
      isActive: true,
      sessionVersion: true,
      facilityId: true,
      primaryDepartmentId: true,
      facilityAccesses: {
        where: { facilityId: session.facilityId, isActive: true, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) {
    return { valid: false, reason: "IDENTITY_NOT_FOUND" };
  }
  if (!user.isActive) {
    return { valid: false, reason: "IDENTITY_INACTIVE" };
  }
  if (user.sessionVersion !== session.sessionVersion) {
    return { valid: false, reason: "VERSION_STALE" };
  }

  // The session names a facility. Home facility or an active access grant both count; losing both
  // ends the session even if nothing incremented the version, which covers an access row deleted
  // outside the helpers below.
  const hasFacility =
    user.facilityId === session.facilityId || user.facilityAccesses.length > 0;
  if (!hasFacility) {
    return { valid: false, reason: "FACILITY_ACCESS_REVOKED" };
  }

  return { valid: true, effectiveDepartmentId: user.primaryDepartmentId };
}

async function validateEmployeeSession(
  session: AppJwtPayload,
  client: PrismaLike,
): Promise<SessionValidation> {
  const employee = await client.employee.findUnique({
    where: { id: session.uid },
    select: {
      status: true,
      sessionVersion: true,
      facilityId: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });

  if (!employee) {
    return { valid: false, reason: "IDENTITY_NOT_FOUND" };
  }
  // `OFF` means off-shift, not deactivated, and Phase 3 already established that an employee
  // covering an unscheduled shift keeps their operational authority. Only separation ends a session.
  if (employee.status === "TERMINATED") {
    return { valid: false, reason: "IDENTITY_INACTIVE" };
  }
  if (employee.sessionVersion !== session.sessionVersion) {
    return { valid: false, reason: "VERSION_STALE" };
  }
  if (employee.facilityId !== session.facilityId) {
    return { valid: false, reason: "FACILITY_ACCESS_REVOKED" };
  }

  const departmentIds = new Set<string>([
    ...(employee.primaryDepartmentId ? [employee.primaryDepartmentId] : []),
    ...employee.employeeDepartments.map((row) => row.departmentId),
  ]);
  const claimed = session.primaryDepartmentId ?? null;

  return {
    valid: true,
    // A removed membership drops the department claim rather than ending the session: the employee
    // still works here, they just no longer carry that department's authority.
    effectiveDepartmentId: claimed && departmentIds.has(claimed) ? claimed : null,
  };
}

/**
 * Invalidate every session issued for a user before this moment.
 *
 * Increments rather than assigns, so two concurrent revocations both take effect and neither can
 * lower the version or restore a session the other ended.
 */
export async function revokeUserSessions(client: PrismaLike, userId: string): Promise<number> {
  const updated = await client.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return updated.sessionVersion;
}

/** Invalidate every PIN session issued for an employee before this moment. */
export async function revokeEmployeeSessions(
  client: PrismaLike,
  employeeId: string,
): Promise<number> {
  const updated = await client.employee.update({
    where: { id: employeeId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return updated.sessionVersion;
}

/**
 * Revoke sessions for several users at once, for actions that change authority in bulk.
 *
 * Returns the number of rows affected rather than the new versions, because a bulk change has no
 * single version to report.
 */
export async function revokeUserSessionsMany(
  client: PrismaLike,
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = await client.user.updateMany({
    where: { id: { in: userIds } },
    data: { sessionVersion: { increment: 1 } },
  });
  return result.count;
}

/** Revoke sessions for several employees at once. */
export async function revokeEmployeeSessionsMany(
  client: PrismaLike,
  employeeIds: string[],
): Promise<number> {
  if (employeeIds.length === 0) return 0;
  const result = await client.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { sessionVersion: { increment: 1 } },
  });
  return result.count;
}
