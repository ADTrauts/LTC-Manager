import { EmployeeStatus, Prisma, type PrismaClient, type RoleKey } from "@prisma/client";

import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";

import { EmployeeIdentityError } from "./types";
import {
  buildEmployeeLinkInvitationUrl,
  EMPLOYEE_LINK_INVITE_EXPIRES_DAYS,
  hashEmployeeLinkInvitationToken,
  mintEmployeeLinkInvitationToken,
} from "./tokens";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

async function lockEmployee(db: Prisma.TransactionClient, employeeId: string): Promise<void> {
  if (typeof db.$queryRaw !== "function") return;
  await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`);
}

async function userMayLinkAtFacility(
  db: DbClient,
  input: { userId: string; facilityId: string },
): Promise<{ ok: true; hasGrant: boolean } | { ok: false; reason: "USER_INACTIVE" | "CROSS_ORGANIZATION" }> {
  const [user, facility] = await Promise.all([
    db.user.findUnique({
      where: { id: input.userId },
      select: {
        isActive: true,
        facilityId: true,
        facility: { select: { organizationId: true } },
        facilityAccesses: {
          where: { isActive: true, revokedAt: null },
          select: { facilityId: true, facility: { select: { organizationId: true } } },
        },
      },
    }),
    db.facility.findUnique({
      where: { id: input.facilityId },
      select: { organizationId: true },
    }),
  ]);
  if (!user?.isActive) return { ok: false, reason: "USER_INACTIVE" };
  if (!facility) return { ok: false, reason: "CROSS_ORGANIZATION" };

  if (user.facilityAccesses.some((access) => access.facilityId === input.facilityId)) {
    return { ok: true, hasGrant: true };
  }
  if (!user.facilityId || !user.facility) {
    return { ok: false, reason: "CROSS_ORGANIZATION" };
  }
  const orgIds = new Set<string>([
    user.facility.organizationId,
    ...user.facilityAccesses.map((access) => access.facility.organizationId),
  ]);
  if (!orgIds.has(facility.organizationId)) {
    return { ok: false, reason: "CROSS_ORGANIZATION" };
  }
  return { ok: true, hasGrant: false };
}

export async function findExistingUserByEmail(db: DbClient, email: string) {
  const normalized = normalizeAccountIdentifier(email);
  if (!normalized) return null;
  return db.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, isActive: true, facilityId: true },
  });
}

export async function issueEmployeeUserLinkInvitation(
  db: DbClient,
  input: {
    employeeId: string;
    facilityId: string;
    targetEmail: string;
    intendedRoleKey: RoleKey;
    invitedByUserId: string;
    now?: Date;
  },
): Promise<{ invitationId: string; rawToken: string; expiresAt: Date; targetEmail: string }> {
  const now = input.now ?? new Date();
  const email = normalizeAccountIdentifier(input.targetEmail);
  if (!email) {
    throw new EmployeeIdentityError("CONFLICT", "A valid email is required to invite an existing account.");
  }

  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: { id: true, userId: true, status: true },
  });
  if (!employee) {
    throw new EmployeeIdentityError("EMPLOYEE_NOT_FOUND", "Employee not found.");
  }
  if (employee.status === EmployeeStatus.TERMINATED) {
    throw new EmployeeIdentityError("EMPLOYEE_INACTIVE", "A terminated employee cannot be invited to link.");
  }
  if (employee.userId) {
    throw new EmployeeIdentityError("ALREADY_LINKED", "This employee is already connected to an account.");
  }

  const existingUser = await findExistingUserByEmail(db, email);
  if (!existingUser?.isActive) {
    throw new EmployeeIdentityError("CONFLICT", "No active Vssyl account exists for this email.");
  }

  const minted = mintEmployeeLinkInvitationToken(now);
  await db.employeeUserLinkInvitation.updateMany({
    where: { employeeId: employee.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  const created = await db.employeeUserLinkInvitation.create({
    data: {
      employeeId: employee.id,
      facilityId: input.facilityId,
      targetEmailNormalized: email,
      intendedRoleKey: input.intendedRoleKey,
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
      invitedByUserId: input.invitedByUserId,
    },
    select: { id: true },
  });

  return {
    invitationId: created.id,
    rawToken: minted.rawToken,
    expiresAt: minted.expiresAt,
    targetEmail: email,
  };
}

export async function findPendingLinkInvitationForEmployee(
  db: DbClient,
  employeeId: string,
  now: Date = new Date(),
): Promise<{ id: string; targetEmailNormalized: string; expiresAt: Date } | null> {
  return db.employeeUserLinkInvitation.findFirst({
    where: {
      employeeId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    select: { id: true, targetEmailNormalized: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function acceptEmployeeUserLinkInvitation(
  db: DbClient,
  input: {
    rawToken: string;
    authenticatedUserId: string;
    now?: Date;
  },
): Promise<{ employeeId: string; userId: string; facilityId: string }> {
  const now = input.now ?? new Date();
  const tokenHash = hashEmployeeLinkInvitationToken(input.rawToken);

  return runInTransaction(db, async (tx) => {
    const invitation = await tx.employeeUserLinkInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        employeeId: true,
        facilityId: true,
        targetEmailNormalized: true,
        intendedRoleKey: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt.getTime() <= now.getTime()) {
      throw new EmployeeIdentityError(
        "INVITATION_INVALID",
        "This invitation link is invalid, expired, or already used.",
      );
    }

    await lockEmployee(tx, invitation.employeeId);

    const [employee, user] = await Promise.all([
      tx.employee.findUnique({
        where: { id: invitation.employeeId },
        select: { id: true, userId: true, status: true, facilityId: true },
      }),
      tx.user.findUnique({
        where: { id: input.authenticatedUserId },
        select: { id: true, email: true, isActive: true },
      }),
    ]);

    if (!user?.isActive) {
      throw new EmployeeIdentityError("USER_INACTIVE", "Account is inactive.");
    }
    if (normalizeAccountIdentifier(user.email) !== invitation.targetEmailNormalized) {
      throw new EmployeeIdentityError("WRONG_USER", "This invitation belongs to a different account.");
    }
    if (!employee || employee.facilityId !== invitation.facilityId) {
      throw new EmployeeIdentityError("EMPLOYEE_NOT_FOUND", "Employee not found.");
    }
    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new EmployeeIdentityError("EMPLOYEE_INACTIVE", "This employee record is no longer active.");
    }
    if (employee.userId && employee.userId !== user.id) {
      throw new EmployeeIdentityError("ALREADY_LINKED", "This employee is already connected to another account.");
    }
    if (employee.userId === user.id) {
      await tx.employeeUserLinkInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: now, acceptedByUserId: user.id },
      });
      return { employeeId: employee.id, userId: user.id, facilityId: invitation.facilityId };
    }

    const other = await tx.employee.findFirst({
      where: {
        facilityId: invitation.facilityId,
        userId: user.id,
        id: { not: employee.id },
      },
      select: { id: true },
    });
    if (other) {
      throw new EmployeeIdentityError(
        "CONFLICT",
        "This account is already connected to an employee at this Facility.",
      );
    }

    const eligibility = await userMayLinkAtFacility(tx, {
      userId: user.id,
      facilityId: invitation.facilityId,
    });
    if (!eligibility.ok) {
      throw new EmployeeIdentityError(
        eligibility.reason,
        "This account cannot be connected to that Facility.",
      );
    }

    if (!eligibility.hasGrant) {
      await ensureUserFacilityAccessGrant(tx, {
        userId: user.id,
        facilityId: invitation.facilityId,
        grantedByUserId: user.id,
        reactivate: true,
        roleKey: invitation.intendedRoleKey,
      });
    }

    await tx.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
    });
    await tx.employeeUserLinkInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: now, acceptedByUserId: user.id },
    });

    return { employeeId: employee.id, userId: user.id, facilityId: invitation.facilityId };
  });
}

export function employeeLinkInviteExpiresDays(): number {
  return EMPLOYEE_LINK_INVITE_EXPIRES_DAYS;
}

export { buildEmployeeLinkInvitationUrl };
