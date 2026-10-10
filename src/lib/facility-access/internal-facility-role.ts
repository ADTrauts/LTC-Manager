import { Prisma, type PrismaClient, type RoleKey } from "@prisma/client";

import type { AppRole } from "@/lib/access";

import { userHasActiveFacilityAccess } from "./assert-user-facility-access";
import {
  assertNoOverlappingInternalRolePeriods,
  findCurrentInternalRolePeriod,
} from "./periods";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type InternalFacilityRoleResolution = {
  accessId: string;
  facilityId: string;
  roleKey: RoleKey;
  periodId: string;
};

export class InternalFacilityRoleError extends Error {
  constructor(
    readonly code:
      | "ACCESS_DENIED"
      | "NO_CURRENT_ROLE"
      | "OVERLAPPING_PERIOD"
      | "INVALID_ROLE"
      | "USER_INACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "InternalFacilityRoleError";
  }
}

function isAppRole(value: string): value is AppRole {
  return (
    value === "FACILITY_ADMINISTRATOR" ||
    value === "GM" ||
    value === "MANAGER" ||
    value === "SUPERVISOR" ||
    value === "LEAD_TEAM_MEMBER" ||
    value === "STAFF"
  );
}

export function internalRoleKeyAsAppRole(roleKey: RoleKey): AppRole {
  if (!isAppRole(roleKey)) {
    throw new InternalFacilityRoleError("INVALID_ROLE", "Internal Facility RoleKey is not an AppRole.");
  }
  return roleKey;
}

async function lockUserFacilityAccess(db: DbClient, accessId: string): Promise<void> {
  if (typeof db.$queryRaw !== "function") return;
  await db.$queryRaw(Prisma.sql`SELECT "id" FROM "UserFacilityAccess" WHERE "id" = ${accessId} FOR UPDATE`);
}

async function loadActiveGrant(
  db: DbClient,
  input: { userId: string; facilityId: string },
) {
  return db.userFacilityAccess.findFirst({
    where: {
      userId: input.userId,
      facilityId: input.facilityId,
      isActive: true,
      revokedAt: null,
    },
    select: {
      id: true,
      facilityId: true,
      rolePeriods: {
        select: {
          id: true,
          roleKey: true,
          startsAt: true,
          endsAt: true,
        },
        orderBy: { startsAt: "asc" },
      },
    },
  });
}

async function roleKeyIsActive(db: DbClient, roleKey: RoleKey): Promise<boolean> {
  const role = await db.role.findFirst({
    where: { key: roleKey, isActive: true },
    select: { id: true },
  });
  return Boolean(role);
}

/**
 * Canonical Path A role resolver. Home Facility is not a bypass.
 * Fail closed on missing grant, 0/>1 current periods, inactive User, or inactive RoleKey.
 */
export async function resolveCurrentInternalFacilityRole(
  db: DbClient,
  input: { userId: string; facilityId: string; instant?: Date },
): Promise<InternalFacilityRoleResolution | null> {
  if (!input.userId?.trim() || !input.facilityId?.trim()) return null;
  const instant = input.instant ?? new Date();

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { isActive: true },
  });
  if (!user?.isActive) return null;

  const grant = await loadActiveGrant(db, input);
  if (!grant) return null;

  const current = findCurrentInternalRolePeriod(grant.rolePeriods, instant);
  if (!current) return null;
  if (!(await roleKeyIsActive(db, current.roleKey))) return null;

  return {
    accessId: grant.id,
    facilityId: grant.facilityId,
    roleKey: current.roleKey,
    periodId: current.id,
  };
}

/** Login / invite mint helper: resolve the grant role, repairing a missing current period from fallback. */
export async function resolveInternalFacilitySessionRole(
  db: DbClient,
  input: { userId: string; facilityId: string; fallbackRoleKey?: RoleKey | null },
): Promise<InternalFacilityRoleResolution | null> {
  return (
    (await resolveCurrentInternalFacilityRole(db, input)) ??
    (await ensureCurrentInternalFacilityRole(db, {
      userId: input.userId,
      facilityId: input.facilityId,
      roleKey: input.fallbackRoleKey,
    }))
  );
}

export async function listCurrentInternalFacilityRoles(
  db: DbClient,
  input: { userId: string; instant?: Date },
): Promise<Array<{ facilityId: string; roleKey: RoleKey; accessId: string }>> {
  const instant = input.instant ?? new Date();
  const accesses = await db.userFacilityAccess.findMany({
    where: { userId: input.userId, isActive: true, revokedAt: null },
    select: {
      id: true,
      facilityId: true,
      rolePeriods: {
        select: { id: true, roleKey: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: "asc" },
      },
    },
    orderBy: { grantedAt: "asc" },
  });

  const candidates = accesses.flatMap((access) => {
    const current = findCurrentInternalRolePeriod(access.rolePeriods, instant);
    return current ? [{ access, current }] : [];
  });
  const uniqueKeys = [...new Set(candidates.map((row) => row.current.roleKey))];
  const activeRoles =
    uniqueKeys.length === 0
      ? []
      : await db.role.findMany({
          where: { key: { in: uniqueKeys }, isActive: true },
          select: { key: true },
        });
  const activeKeys = new Set(activeRoles.map((role) => role.key));

  return candidates
    .filter((row) => activeKeys.has(row.current.roleKey))
    .map((row) => ({
      facilityId: row.access.facilityId,
      roleKey: row.current.roleKey,
      accessId: row.access.id,
    }));
}

async function resolveFallbackRoleKey(
  db: DbClient,
  input: { userId: string; roleKey?: RoleKey | null },
): Promise<RoleKey | null> {
  if (input.roleKey) return input.roleKey;
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { role: { select: { key: true, isActive: true } } },
  });
  if (!user?.role?.isActive || !user.role.key) return null;
  return user.role.key;
}

/**
 * Open a current role period when an active grant has none.
 * Used by login repair, signup, employee-created Users, and new grants.
 * Does not overwrite an existing current period.
 */
export async function ensureCurrentInternalFacilityRole(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    roleKey?: RoleKey | null;
    createdByUserId?: string | null;
    at?: Date;
  },
): Promise<InternalFacilityRoleResolution | null> {
  const at = input.at ?? new Date();
  const existing = await resolveCurrentInternalFacilityRole(db, {
    userId: input.userId,
    facilityId: input.facilityId,
    instant: at,
  });
  if (existing) return existing;

  const hasAccess = await userHasActiveFacilityAccess(db, input.userId, input.facilityId);
  if (!hasAccess) return null;

  const grant = await loadActiveGrant(db, input);
  if (!grant) return null;

  const roleKey = await resolveFallbackRoleKey(db, input);
  if (!roleKey) return null;
  if (!(await roleKeyIsActive(db, roleKey))) return null;

  const open = (tx: DbClient) =>
    openCurrentRoleIfMissing(tx, {
      userId: input.userId,
      grant,
      roleKey,
      createdByUserId: input.createdByUserId,
      at,
    });

  if (typeof db.$transaction === "function") {
    return (db as PrismaClient).$transaction((tx) => open(tx));
  }
  return open(db);
}

async function openCurrentRoleIfMissing(
  db: DbClient,
  input: {
    userId: string;
    grant: NonNullable<Awaited<ReturnType<typeof loadActiveGrant>>>;
    roleKey: RoleKey;
    createdByUserId?: string | null;
    at: Date;
  },
): Promise<InternalFacilityRoleResolution | null> {
  await lockUserFacilityAccess(db, input.grant.id);
  const refreshed = await loadActiveGrant(db, {
    userId: input.userId,
    facilityId: input.grant.facilityId,
  });
  if (!refreshed) return null;
  const current = findCurrentInternalRolePeriod(refreshed.rolePeriods, input.at);
  if (current) {
    return {
      accessId: refreshed.id,
      facilityId: refreshed.facilityId,
      roleKey: current.roleKey,
      periodId: current.id,
    };
  }

  assertNoOverlappingInternalRolePeriods([
    ...refreshed.rolePeriods.map((period) => ({ startsAt: period.startsAt, endsAt: period.endsAt })),
    { startsAt: input.at, endsAt: null },
  ]);

  const created = await db.userFacilityRolePeriod.create({
    data: {
      userFacilityAccessId: refreshed.id,
      roleKey: input.roleKey,
      startsAt: input.at,
      endsAt: null,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true, roleKey: true },
  });
  return {
    accessId: refreshed.id,
    facilityId: refreshed.facilityId,
    roleKey: created.roleKey,
    periodId: created.id,
  };
}

/**
 * Close the current period and open a new one in the same transaction.
 * Updates User.roleId only when this Facility is the User's home (compatibility).
 * Stale JWTs fail closed on ROLE_STALE because validation reads the current period.
 */
export async function changeInternalFacilityRole(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    roleKey: RoleKey;
    at?: Date;
    actorUserId?: string | null;
  },
): Promise<InternalFacilityRoleResolution> {
  const at = input.at ?? new Date();
  if (!(await roleKeyIsActive(db, input.roleKey))) {
    throw new InternalFacilityRoleError("INVALID_ROLE", "Role configuration is missing for this facility.");
  }

  const run = async (tx: Prisma.TransactionClient): Promise<InternalFacilityRoleResolution> => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, facilityId: true },
    });
    if (!user) {
      throw new InternalFacilityRoleError("USER_INACTIVE", "User not found.");
    }
    if (!user.isActive) {
      throw new InternalFacilityRoleError("USER_INACTIVE", "User is inactive.");
    }

    const grant = await loadActiveGrant(tx, input);
    if (!grant) {
      throw new InternalFacilityRoleError("ACCESS_DENIED", "Facility access denied.");
    }
    await lockUserFacilityAccess(tx, grant.id);
    const locked = await loadActiveGrant(tx, input);
    if (!locked) {
      throw new InternalFacilityRoleError("ACCESS_DENIED", "Facility access denied.");
    }

    const current = findCurrentInternalRolePeriod(locked.rolePeriods, at);
    if (!current) {
      throw new InternalFacilityRoleError(
        "NO_CURRENT_ROLE",
        "No current internal Facility role period.",
      );
    }
    if (current.roleKey === input.roleKey) {
      return {
        accessId: locked.id,
        facilityId: locked.facilityId,
        roleKey: current.roleKey,
        periodId: current.id,
      };
    }

    await tx.userFacilityRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: at, endedByUserId: input.actorUserId ?? null },
    });

    const afterClose = await tx.userFacilityRolePeriod.findMany({
      where: { userFacilityAccessId: locked.id },
      select: { startsAt: true, endsAt: true },
    });
    assertNoOverlappingInternalRolePeriods([...afterClose, { startsAt: at, endsAt: null }]);

    const opened = await tx.userFacilityRolePeriod.create({
      data: {
        userFacilityAccessId: locked.id,
        roleKey: input.roleKey,
        startsAt: at,
        endsAt: null,
        createdByUserId: input.actorUserId ?? null,
      },
      select: { id: true, roleKey: true },
    });

    if (user.facilityId === input.facilityId) {
      const roleRow = await tx.role.findFirst({
        where: { key: input.roleKey, isActive: true },
        select: { id: true },
      });
      if (roleRow) {
        await tx.user.update({
          where: { id: input.userId },
          data: { roleId: roleRow.id },
        });
      }
    }

    return {
      accessId: locked.id,
      facilityId: locked.facilityId,
      roleKey: opened.roleKey,
      periodId: opened.id,
    };
  };

  return "$transaction" in db
    ? (db as PrismaClient).$transaction(run)
    : run(db as Prisma.TransactionClient);
}

export async function closeCurrentInternalFacilityRole(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    at?: Date;
    actorUserId?: string | null;
  },
): Promise<void> {
  const at = input.at ?? new Date();
  const grant = await loadActiveGrant(db, input);
  if (!grant) return;
  const current = findCurrentInternalRolePeriod(grant.rolePeriods, at);
  if (!current) return;
  await db.userFacilityRolePeriod.update({
    where: { id: current.id },
    data: { endsAt: at, endedByUserId: input.actorUserId ?? null },
  });
}
