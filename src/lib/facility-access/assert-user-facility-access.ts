import type { PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import { trackEvent } from "@/lib/telemetry";
import { revokeUserSessions } from "@/lib/session-revocation";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function canManageFacilityAccess(role: AppRole): boolean {
  return hasAtLeastRole(role, "FACILITY_ADMINISTRATOR");
}

export async function userHasActiveFacilityAccess(
  db: DbClient,
  userId: string,
  facilityId: string,
): Promise<boolean> {
  if (!userId?.trim() || !facilityId?.trim()) return false;
  const row = await db.userFacilityAccess.findFirst({
    where: { userId, facilityId, isActive: true, revokedAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

export async function assertUserFacilityAccess(
  db: DbClient,
  userId: string,
  facilityId: string,
): Promise<void> {
  const ok = await userHasActiveFacilityAccess(db, userId, facilityId);
  if (!ok) {
    throw new Error("Facility access denied.");
  }
}

export async function listActiveFacilityAccesses(db: DbClient, userId: string) {
  return db.userFacilityAccess.findMany({
    where: { userId, isActive: true, revokedAt: null },
    select: {
      facilityId: true,
      facility: {
        select: {
          id: true,
          displayName: true,
          organizationId: true,
          organization: { select: { id: true, name: true, displayName: true } },
        },
      },
    },
    orderBy: { grantedAt: "asc" },
  });
}

/**
 * Idempotent grant upsert used by signup / user creation / backfill repair.
 * Does not reactivate a deliberately revoked grant unless `reactivate` is true.
 */
export async function ensureUserFacilityAccessGrant(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    grantedByUserId?: string | null;
    reactivate?: boolean;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await db.userFacilityAccess.findUnique({
    where: {
      userId_facilityId: { userId: input.userId, facilityId: input.facilityId },
    },
    select: { id: true, isActive: true, revokedAt: true },
  });

  if (existing) {
    if (existing.isActive && !existing.revokedAt) {
      return { id: existing.id, created: false };
    }
    if (input.reactivate) {
      await db.userFacilityAccess.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          revokedAt: null,
          grantedByUserId: input.grantedByUserId ?? null,
          grantedAt: new Date(),
        },
      });
      return { id: existing.id, created: false };
    }
    return { id: existing.id, created: false };
  }

  const created = await db.userFacilityAccess.create({
    data: {
      userId: input.userId,
      facilityId: input.facilityId,
      isActive: true,
      grantedByUserId: input.grantedByUserId ?? null,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export async function grantUserFacilityAccess(
  db: DbClient,
  input: {
    actorUserId: string;
    actorFacilityId: string;
    targetUserId: string;
    targetFacilityId: string;
  },
): Promise<{ id: string }> {
  if (input.actorUserId === input.targetUserId && input.targetFacilityId === input.actorFacilityId) {
    // Self-grant of current facility is a no-op ensure.
    return ensureUserFacilityAccessGrant(db, {
      userId: input.targetUserId,
      facilityId: input.targetFacilityId,
      grantedByUserId: input.actorUserId,
      reactivate: true,
    });
  }

  const [actorFacility, targetFacility, targetUser] = await Promise.all([
    db.facility.findUnique({
      where: { id: input.actorFacilityId },
      select: { id: true, organizationId: true },
    }),
    db.facility.findUnique({
      where: { id: input.targetFacilityId },
      select: { id: true, organizationId: true },
    }),
    db.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        id: true,
        facilityId: true,
        isActive: true,
        facility: { select: { organizationId: true } },
        facilityAccesses: {
          where: { isActive: true, revokedAt: null },
          select: { facility: { select: { organizationId: true } } },
        },
      },
    }),
  ]);

  if (!actorFacility || !targetFacility) {
    throw new Error("Facility not found.");
  }
  if (actorFacility.organizationId !== targetFacility.organizationId) {
    throw new Error("Cross-organization facility grant rejected.");
  }
  if (!targetUser || !targetUser.isActive) {
    throw new Error("Target user not found or inactive.");
  }

  const targetOrgIds = new Set<string>([
    targetUser.facility.organizationId,
    ...targetUser.facilityAccesses.map((a) => a.facility.organizationId),
  ]);
  if (!targetOrgIds.has(targetFacility.organizationId)) {
    throw new Error("Target user is not eligible for this Organization.");
  }

  const result = await ensureUserFacilityAccessGrant(db, {
    userId: input.targetUserId,
    facilityId: input.targetFacilityId,
    grantedByUserId: input.actorUserId,
    reactivate: true,
  });

  await trackEvent("facility_access.granted", {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    facilityId: input.targetFacilityId,
    organizationId: targetFacility.organizationId,
  });

  return { id: result.id };
}

export async function revokeUserFacilityAccess(
  db: DbClient,
  input: {
    actorUserId: string;
    actorFacilityId: string;
    targetUserId: string;
    targetFacilityId: string;
  },
): Promise<void> {
  const [actorFacility, targetFacility, targetUser, grant] = await Promise.all([
    db.facility.findUnique({
      where: { id: input.actorFacilityId },
      select: { organizationId: true },
    }),
    db.facility.findUnique({
      where: { id: input.targetFacilityId },
      select: { organizationId: true },
    }),
    db.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, facilityId: true },
    }),
    db.userFacilityAccess.findUnique({
      where: {
        userId_facilityId: {
          userId: input.targetUserId,
          facilityId: input.targetFacilityId,
        },
      },
      select: { id: true, isActive: true },
    }),
  ]);

  if (!actorFacility || !targetFacility) {
    throw new Error("Facility not found.");
  }
  if (actorFacility.organizationId !== targetFacility.organizationId) {
    throw new Error("Cross-organization facility revoke rejected.");
  }
  if (!targetUser) {
    throw new Error("Target user not found.");
  }
  if (!grant || !grant.isActive) {
    throw new Error("No active grant to revoke.");
  }

  const activeCount = await db.userFacilityAccess.count({
    where: { userId: input.targetUserId, isActive: true, revokedAt: null },
  });
  if (activeCount <= 1) {
    throw new Error("Cannot revoke a user's only facility access.");
  }

  if (targetUser.facilityId === input.targetFacilityId) {
    throw new Error(
      "Cannot revoke access to the user's current facility. Switch them to another facility first.",
    );
  }

  if (input.actorUserId === input.targetUserId && input.targetFacilityId === input.actorFacilityId) {
    throw new Error("Cannot revoke your own current facility access.");
  }

  await db.userFacilityAccess.update({
    where: { id: grant.id },
    data: { isActive: false, revokedAt: new Date() },
  });

  // A session already scoped into the revoked facility would otherwise keep working until its
  // token expired. Request-time validation catches that on its own, but incrementing here ends
  // the session immediately and records the change through the same code path as every other
  // revocation.
  await revokeUserSessions(db, input.targetUserId);

  await trackEvent("facility_access.revoked", {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    facilityId: input.targetFacilityId,
    organizationId: targetFacility.organizationId,
  });
}

export async function restoreUserFacilityAccess(
  db: DbClient,
  input: {
    actorUserId: string;
    actorFacilityId: string;
    targetUserId: string;
    targetFacilityId: string;
  },
): Promise<void> {
  await grantUserFacilityAccess(db, input);
  await trackEvent("facility_access.restored", {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    facilityId: input.targetFacilityId,
  });
}
