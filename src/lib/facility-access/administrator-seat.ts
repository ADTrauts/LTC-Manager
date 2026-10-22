import { Prisma, RoleKey, type PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const FACILITY_ADMINISTRATOR_TAKEN_MESSAGE =
  "This facility already has a Facility Administrator. The role moves only by transfer.";

export const FACILITY_ADMINISTRATOR_ASSIGN_REFUSAL =
  "Facility Administrator is not assigned in People. The current Facility Administrator transfers the role, or the parent organization appoints one when the seat is empty.";

export const FACILITY_ADMINISTRATOR_CHANGE_REFUSAL =
  "The Facility Administrator's role changes only by transfer. They choose their new role when they hand it over.";

/**
 * People and imports never assign or remove Facility Administrator; transfer and recovery do.
 * The seat holder's Employee keeps the role; anyone else may not be given it.
 */
export function facilityAdministratorRoleEditRefusal(input: {
  holdsAdministratorSeat: boolean;
  requestedRoleType: RoleKey;
}): string | null {
  const requested = input.requestedRoleType === RoleKey.FACILITY_ADMINISTRATOR;
  if (input.holdsAdministratorSeat === requested) return null;
  return requested ? FACILITY_ADMINISTRATOR_ASSIGN_REFUSAL : FACILITY_ADMINISTRATOR_CHANGE_REFUSAL;
}

export async function userHoldsFacilityAdministratorSeat(
  db: DbClient,
  input: { userId: string | null; facilityId: string },
): Promise<boolean> {
  if (!input.userId) return false;
  const row = await db.userFacilityRolePeriod.findFirst({
    where: {
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      endsAt: null,
      userFacilityAccess: { userId: input.userId, facilityId: input.facilityId },
    },
    select: { id: true },
  });
  return row != null;
}

/** Serializes Facility Administrator changes for one facility. Taken before any access-row lock. */
export async function lockFacilityForAdministratorChange(db: DbClient, facilityId: string): Promise<void> {
  if (typeof db.$queryRaw !== "function") return;
  await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR UPDATE`);
}

/** The open Facility Administrator period at this facility held by someone else, if any. */
export async function findOtherOpenFacilityAdministratorPeriod(
  db: DbClient,
  input: { facilityId: string; exceptUserId?: string | null },
): Promise<{ id: string; userId: string } | null> {
  const row = await db.userFacilityRolePeriod.findFirst({
    where: {
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      endsAt: null,
      userFacilityAccess: {
        facilityId: input.facilityId,
        ...(input.exceptUserId ? { userId: { not: input.exceptUserId } } : {}),
      },
    },
    select: { id: true, userFacilityAccess: { select: { userId: true } } },
  });
  return row ? { id: row.id, userId: row.userFacilityAccess.userId } : null;
}
