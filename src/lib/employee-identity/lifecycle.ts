import { EmployeeStatus, type Prisma, type PrismaClient, type RoleKey } from "@prisma/client";

import {
  closeCurrentInternalFacilityRole,
} from "@/lib/facility-access/internal-facility-role";
import { revokeEmployeeSessions } from "@/lib/session-revocation";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Close that Facility's internal grant for employment end.
 * Does not disable the User, bump User.sessionVersion, or touch other Facilities.
 */
export async function revokeInternalAccessForEmploymentEnd(
  db: DbClient,
  input: { userId: string; facilityId: string; actorUserId?: string | null },
): Promise<boolean> {
  const grant = await db.userFacilityAccess.findFirst({
    where: {
      userId: input.userId,
      facilityId: input.facilityId,
      isActive: true,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (!grant) return false;

  await closeCurrentInternalFacilityRole(db, {
    userId: input.userId,
    facilityId: input.facilityId,
    actorUserId: input.actorUserId,
  });
  await db.userFacilityAccess.update({
    where: { id: grant.id },
    data: { isActive: false, revokedAt: new Date() },
  });
  return true;
}

export async function endEmployeeEmployment(
  db: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    actorUserId?: string | null;
    terminationDate?: Date | null;
  },
): Promise<{ userId: string | null; accessRevoked: boolean }> {
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: { id: true, userId: true, status: true },
  });
  if (!employee) {
    throw new Error("Employee not found.");
  }

  if (employee.status !== EmployeeStatus.TERMINATED) {
    await db.employee.update({
      where: { id: employee.id },
      data: {
        status: EmployeeStatus.TERMINATED,
        ...(input.terminationDate ? { terminationDate: input.terminationDate } : {}),
        onLeave: false,
      },
    });
  }

  await revokeEmployeeSessions(db, employee.id);

  let accessRevoked = false;
  if (employee.userId) {
    accessRevoked = await revokeInternalAccessForEmploymentEnd(db, {
      userId: employee.userId,
      facilityId: input.facilityId,
      actorUserId: input.actorUserId,
    });
  }

  return { userId: employee.userId, accessRevoked };
}

export async function restoreInternalAccessForRehire(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    roleKey: RoleKey;
    grantedByUserId?: string | null;
  },
): Promise<void> {
  const { ensureUserFacilityAccessGrant } = await import("@/lib/facility-access/assert-user-facility-access");
  await ensureUserFacilityAccessGrant(db, {
    userId: input.userId,
    facilityId: input.facilityId,
    grantedByUserId: input.grantedByUserId,
    reactivate: true,
    roleKey: input.roleKey,
  });
}
