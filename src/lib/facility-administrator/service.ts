import {
  EmployeeStatus,
  RoleKey,
  type FacilityAdministratorInvitationKind,
  type FacilityAdministratorInvitationStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  changeInternalFacilityRole,
  ensureCurrentInternalFacilityRole,
  lockFacilityForAdministratorChange,
  resolveCurrentInternalFacilityRole,
} from "@/lib/facility-access";
import { getCurrentOrganizationRole } from "@/lib/organization-membership";
import { revokeEmployeeSessions, revokeUserSessions } from "@/lib/session-revocation";

import {
  FACILITY_ADMINISTRATOR_INVITATION_TTL_MS,
  holderGoneReason,
  invitationIsLive,
  isOutgoingRoleChoice,
  organizationMayAppoint,
  type FacilityAdministratorSeat,
} from "./rules";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class FacilityAdministratorInvitationError extends Error {
  constructor(
    readonly code:
      | "NOT_ADMINISTRATOR"
      | "NOT_ORGANIZATION_ADMIN"
      | "INVALID_SUCCESSOR"
      | "INVALID_ROLE"
      | "PENDING_EXISTS"
      | "SEAT_HELD"
      | "NOT_FOUND"
      | "NOT_INVITEE"
      | "NOT_ALLOWED"
      | "CLOSED"
      | "EXPIRED"
      | "STALE",
    message: string,
  ) {
    super(message);
    this.name = "FacilityAdministratorInvitationError";
  }
}

export type FacilityAdministratorCandidate = {
  userId: string;
  displayName: string;
  email: string;
  roleKey: RoleKey | null;
};

export type FacilityAdministratorInvitationView = {
  id: string;
  facilityId: string;
  facilityName: string;
  kind: FacilityAdministratorInvitationKind;
  status: FacilityAdministratorInvitationStatus;
  invitee: { userId: string; displayName: string; email: string };
  invitedBy: { userId: string; displayName: string } | null;
  outgoing: { userId: string; displayName: string } | null;
  outgoingRoleKey: RoleKey | null;
  expiresAt: Date;
  createdAt: Date;
};

const invitationViewSelect = {
  id: true,
  facilityId: true,
  kind: true,
  status: true,
  outgoingRoleKey: true,
  expiresAt: true,
  createdAt: true,
  facility: { select: { displayName: true } },
  invitedUser: { select: { id: true, displayName: true, email: true } },
  invitedByUser: { select: { id: true, displayName: true } },
  outgoingUser: { select: { id: true, displayName: true } },
} satisfies Prisma.FacilityAdministratorInvitationSelect;

function toInvitationView(
  row: Prisma.FacilityAdministratorInvitationGetPayload<{ select: typeof invitationViewSelect }>,
): FacilityAdministratorInvitationView {
  return {
    id: row.id,
    facilityId: row.facilityId,
    facilityName: row.facility.displayName,
    kind: row.kind,
    status: row.status,
    invitee: { userId: row.invitedUser.id, displayName: row.invitedUser.displayName, email: row.invitedUser.email },
    invitedBy: row.invitedByUser ? { userId: row.invitedByUser.id, displayName: row.invitedByUser.displayName } : null,
    outgoing: row.outgoingUser ? { userId: row.outgoingUser.id, displayName: row.outgoingUser.displayName } : null,
    outgoingRoleKey: row.outgoingRoleKey,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** The open Facility Administrator period at a facility, and whether its holder has left. */
export async function loadFacilityAdministratorSeat(
  db: DbClient,
  facilityId: string,
): Promise<FacilityAdministratorSeat> {
  const period = await db.userFacilityRolePeriod.findFirst({
    where: { roleKey: RoleKey.FACILITY_ADMINISTRATOR, endsAt: null, userFacilityAccess: { facilityId } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      userFacilityAccess: {
        select: {
          isActive: true,
          revokedAt: true,
          user: { select: { id: true, displayName: true, email: true, isActive: true } },
        },
      },
    },
  });
  if (!period) return { kind: "EMPTY" };
  const user = period.userFacilityAccess.user;
  const employee = await db.employee.findUnique({
    where: { facilityId_userId: { facilityId, userId: user.id } },
    select: { status: true },
  });
  const holder = {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    periodId: period.id,
    since: period.startsAt,
  };
  const reason = holderGoneReason({
    userActive: user.isActive,
    accessActive: period.userFacilityAccess.isActive && period.userFacilityAccess.revokedAt === null,
    employmentEnded: employee?.status === EmployeeStatus.TERMINATED,
  });
  return reason ? { kind: "GONE", holder, reason } : { kind: "HELD", holder };
}

function candidateAccessWhere(
  facilityId: string,
  user: Prisma.UserWhereInput = {},
): Prisma.UserFacilityAccessWhereInput {
  return {
    facilityId,
    isActive: true,
    revokedAt: null,
    user: { ...user, isActive: true, passwordHash: { not: null }, emailVerifiedAt: { not: null } },
  };
}

/** People who already have an activated account and active access at this facility. */
export async function listFacilityAdministratorCandidates(
  db: DbClient,
  input: { facilityId: string; excludeUserIds?: readonly string[] },
): Promise<FacilityAdministratorCandidate[]> {
  const rows = await db.userFacilityAccess.findMany({
    where: {
      ...candidateAccessWhere(input.facilityId),
      ...(input.excludeUserIds?.length ? { userId: { notIn: [...input.excludeUserIds] } } : {}),
    },
    select: {
      user: { select: { id: true, displayName: true, email: true } },
      rolePeriods: { where: { endsAt: null }, select: { roleKey: true } },
    },
    orderBy: { user: { displayName: "asc" } },
  });
  return rows.map((row) => ({
    userId: row.user.id,
    displayName: row.user.displayName,
    email: row.user.email,
    roleKey: row.rolePeriods[0]?.roleKey ?? null,
  }));
}

export async function loadLiveFacilityAdministratorInvitation(
  db: DbClient,
  input: { facilityId: string; now?: Date },
): Promise<FacilityAdministratorInvitationView | null> {
  const now = input.now ?? new Date();
  const row = await db.facilityAdministratorInvitation.findFirst({
    where: { facilityId: input.facilityId, status: "PENDING", expiresAt: { gt: now } },
    select: invitationViewSelect,
  });
  return row ? toInvitationView(row) : null;
}

export async function listFacilityAdministratorInvitationsForInvitee(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<FacilityAdministratorInvitationView[]> {
  const now = input.now ?? new Date();
  const rows = await db.facilityAdministratorInvitation.findMany({
    where: { invitedUserId: input.userId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    select: invitationViewSelect,
  });
  return rows.map(toInvitationView);
}

async function assertEligibleSuccessor(
  tx: Prisma.TransactionClient,
  input: { facilityId: string; userId: string },
): Promise<void> {
  const eligible = await tx.userFacilityAccess.findFirst({
    where: { ...candidateAccessWhere(input.facilityId), userId: input.userId },
    select: { id: true },
  });
  if (!eligible) {
    throw new FacilityAdministratorInvitationError(
      "INVALID_SUCCESSOR",
      "Choose someone who already has an active account at this facility. Add new people in People first.",
    );
  }
}

async function expireStaleInvitations(tx: Prisma.TransactionClient, facilityId: string, now: Date): Promise<void> {
  await tx.facilityAdministratorInvitation.updateMany({
    where: { facilityId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", closedAt: now },
  });
}

async function assertNoPendingInvitation(tx: Prisma.TransactionClient, facilityId: string): Promise<void> {
  const pending = await tx.facilityAdministratorInvitation.findFirst({
    where: { facilityId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    throw new FacilityAdministratorInvitationError(
      "PENDING_EXISTS",
      "An invitation is already waiting for an answer. Cancel it before sending another.",
    );
  }
}

async function isCurrentFacilityAdministrator(
  db: DbClient,
  input: { userId: string; facilityId: string; now: Date },
): Promise<boolean> {
  const current = await resolveCurrentInternalFacilityRole(db, {
    userId: input.userId,
    facilityId: input.facilityId,
    instant: input.now,
  });
  return current?.roleKey === RoleKey.FACILITY_ADMINISTRATOR;
}

async function isOrganizationAdminForFacility(
  db: DbClient,
  input: { userId: string; facilityId: string; now: Date },
): Promise<boolean> {
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true },
  });
  if (!facility) return false;
  const role = await getCurrentOrganizationRole(db, {
    userId: input.userId,
    organizationId: facility.organizationId,
    now: input.now,
  });
  return role === "ORG_ADMIN";
}

/** The current Facility Administrator invites an existing account holder to take over. */
export async function inviteFacilityAdministratorSuccessor(
  db: PrismaClient,
  input: {
    actorUserId: string;
    facilityId: string;
    invitedUserId: string;
    outgoingRoleKey: unknown;
    now?: Date;
  },
): Promise<FacilityAdministratorInvitationView> {
  const now = input.now ?? new Date();
  if (!isOutgoingRoleChoice(input.outgoingRoleKey)) {
    throw new FacilityAdministratorInvitationError(
      "INVALID_ROLE",
      "Choose General Manager, Manager or Supervisor for your role after the transfer.",
    );
  }
  const outgoingRoleKey = input.outgoingRoleKey;
  return db.$transaction(async (tx) => {
    await lockFacilityForAdministratorChange(tx, input.facilityId);
    if (!(await isCurrentFacilityAdministrator(tx, { userId: input.actorUserId, facilityId: input.facilityId, now }))) {
      throw new FacilityAdministratorInvitationError(
        "NOT_ADMINISTRATOR",
        "Only the current Facility Administrator can transfer the role.",
      );
    }
    if (input.invitedUserId === input.actorUserId) {
      throw new FacilityAdministratorInvitationError("INVALID_SUCCESSOR", "Choose someone other than yourself.");
    }
    await assertEligibleSuccessor(tx, { facilityId: input.facilityId, userId: input.invitedUserId });
    await expireStaleInvitations(tx, input.facilityId, now);
    await assertNoPendingInvitation(tx, input.facilityId);
    const created = await tx.facilityAdministratorInvitation.create({
      data: {
        facilityId: input.facilityId,
        kind: "TRANSFER",
        invitedUserId: input.invitedUserId,
        invitedByUserId: input.actorUserId,
        outgoingUserId: input.actorUserId,
        outgoingRoleKey,
        expiresAt: new Date(now.getTime() + FACILITY_ADMINISTRATOR_INVITATION_TTL_MS),
      },
      select: invitationViewSelect,
    });
    return toInvitationView(created);
  });
}

/**
 * The parent organization's admin appoints a Facility Administrator when the seat is empty or
 * its holder has left. Anything else goes through Vssyl support.
 */
export async function appointFacilityAdministratorByOrganization(
  db: PrismaClient,
  input: { actorUserId: string; facilityId: string; invitedEmail: string; now?: Date },
): Promise<FacilityAdministratorInvitationView> {
  const now = input.now ?? new Date();
  const email = input.invitedEmail.trim().toLowerCase();
  return db.$transaction(async (tx) => {
    await lockFacilityForAdministratorChange(tx, input.facilityId);
    if (!(await isOrganizationAdminForFacility(tx, { userId: input.actorUserId, facilityId: input.facilityId, now }))) {
      throw new FacilityAdministratorInvitationError(
        "NOT_ORGANIZATION_ADMIN",
        "Only an admin of this facility's organization can appoint a Facility Administrator.",
      );
    }
    const seat = await loadFacilityAdministratorSeat(tx, input.facilityId);
    if (!organizationMayAppoint(seat)) {
      throw new FacilityAdministratorInvitationError(
        "SEAT_HELD",
        "This facility has an active Facility Administrator. Only they can transfer the role; contact Vssyl support if that is wrong.",
      );
    }
    const holderUserId = seat.kind === "GONE" ? seat.holder.userId : null;
    const invitee = email
      ? await tx.userFacilityAccess.findFirst({
          where: {
            ...candidateAccessWhere(input.facilityId, { email: { equals: email, mode: "insensitive" } }),
            ...(holderUserId ? { userId: { not: holderUserId } } : {}),
          },
          select: { userId: true },
        })
      : null;
    if (!invitee) {
      throw new FacilityAdministratorInvitationError(
        "INVALID_SUCCESSOR",
        "No one with that email has an active account at this facility. They must be added in People first.",
      );
    }
    const invitedUserId = invitee.userId;
    await expireStaleInvitations(tx, input.facilityId, now);
    // A transfer sent by someone no longer in the seat cannot complete.
    await tx.facilityAdministratorInvitation.updateMany({
      where: { facilityId: input.facilityId, status: "PENDING", kind: "TRANSFER" },
      data: { status: "CANCELLED", closedAt: now, closedByUserId: input.actorUserId },
    });
    await assertNoPendingInvitation(tx, input.facilityId);
    const created = await tx.facilityAdministratorInvitation.create({
      data: {
        facilityId: input.facilityId,
        kind: "RECOVERY",
        invitedUserId,
        invitedByUserId: input.actorUserId,
        outgoingUserId: holderUserId,
        outgoingRoleKey: null,
        expiresAt: new Date(now.getTime() + FACILITY_ADMINISTRATOR_INVITATION_TTL_MS),
      },
      select: invitationViewSelect,
    });
    return toInvitationView(created);
  });
}

async function lockInvitation(tx: Prisma.TransactionClient, invitationId: string) {
  const head = await tx.facilityAdministratorInvitation.findUnique({
    where: { id: invitationId },
    select: { facilityId: true },
  });
  if (!head) {
    throw new FacilityAdministratorInvitationError("NOT_FOUND", "Invitation not found.");
  }
  await lockFacilityForAdministratorChange(tx, head.facilityId);
  const invitation = await tx.facilityAdministratorInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    select: {
      id: true,
      facilityId: true,
      kind: true,
      status: true,
      invitedUserId: true,
      invitedByUserId: true,
      outgoingUserId: true,
      outgoingRoleKey: true,
      expiresAt: true,
    },
  });
  return invitation;
}

function assertLive(invitation: { status: FacilityAdministratorInvitationStatus; expiresAt: Date }, now: Date) {
  if (invitation.status !== "PENDING") {
    throw new FacilityAdministratorInvitationError("CLOSED", "This invitation is no longer open.");
  }
  if (!invitationIsLive(invitation, now)) {
    throw new FacilityAdministratorInvitationError("EXPIRED", "This invitation has expired. Ask for a new one.");
  }
}

export async function cancelFacilityAdministratorInvitation(
  db: PrismaClient,
  input: { actorUserId: string; invitationId: string; now?: Date },
): Promise<{ facilityId: string }> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const invitation = await lockInvitation(tx, input.invitationId);
    if (invitation.status !== "PENDING") {
      throw new FacilityAdministratorInvitationError("CLOSED", "This invitation is no longer open.");
    }
    const facts = { userId: input.actorUserId, facilityId: invitation.facilityId, now };
    const allowed =
      invitation.invitedByUserId === input.actorUserId ||
      (invitation.kind === "TRANSFER"
        ? await isCurrentFacilityAdministrator(tx, facts)
        : await isOrganizationAdminForFacility(tx, facts));
    if (!allowed) {
      throw new FacilityAdministratorInvitationError("NOT_ALLOWED", "You cannot cancel this invitation.");
    }
    await tx.facilityAdministratorInvitation.update({
      where: { id: invitation.id },
      data: { status: "CANCELLED", closedAt: now, closedByUserId: input.actorUserId },
    });
    return { facilityId: invitation.facilityId };
  });
}

export async function declineFacilityAdministratorInvitation(
  db: PrismaClient,
  input: { actorUserId: string; invitationId: string; now?: Date },
): Promise<{ facilityId: string }> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const invitation = await lockInvitation(tx, input.invitationId);
    if (invitation.invitedUserId !== input.actorUserId) {
      throw new FacilityAdministratorInvitationError("NOT_INVITEE", "This invitation is for someone else.");
    }
    assertLive(invitation, now);
    await tx.facilityAdministratorInvitation.update({
      where: { id: invitation.id },
      data: { status: "DECLINED", closedAt: now, closedByUserId: input.actorUserId },
    });
    return { facilityId: invitation.facilityId };
  });
}

async function syncLinkedEmployeeRole(
  tx: Prisma.TransactionClient,
  input: { facilityId: string; userId: string; roleKey: RoleKey; actorUserId: string },
): Promise<void> {
  const employee = await tx.employee.findUnique({
    where: { facilityId_userId: { facilityId: input.facilityId, userId: input.userId } },
    select: { id: true, roleType: true },
  });
  if (!employee || employee.roleType === input.roleKey) return;
  await tx.employee.update({ where: { id: employee.id }, data: { roleType: input.roleKey } });
  await revokeEmployeeSessions(tx, employee.id);
  await tx.employeeHrAuditLog.create({
    data: {
      facilityId: input.facilityId,
      employeeId: employee.id,
      userId: input.actorUserId,
      fieldKey: "profile.roleType",
      oldValue: employee.roleType,
      newValue: input.roleKey,
    },
  });
}

async function seatInvitee(
  tx: Prisma.TransactionClient,
  input: { facilityId: string; userId: string; now: Date },
): Promise<void> {
  const current = await resolveCurrentInternalFacilityRole(tx, {
    userId: input.userId,
    facilityId: input.facilityId,
    instant: input.now,
  });
  if (current) {
    await changeInternalFacilityRole(tx, {
      userId: input.userId,
      facilityId: input.facilityId,
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      at: input.now,
      actorUserId: input.userId,
    });
    return;
  }
  const opened = await ensureCurrentInternalFacilityRole(tx, {
    userId: input.userId,
    facilityId: input.facilityId,
    roleKey: RoleKey.FACILITY_ADMINISTRATOR,
    createdByUserId: input.userId,
    at: input.now,
  });
  if (opened?.roleKey !== RoleKey.FACILITY_ADMINISTRATOR) {
    throw new FacilityAdministratorInvitationError(
      "INVALID_SUCCESSOR",
      "Your access to this facility is no longer active.",
    );
  }
}

/**
 * The invitee accepts. The seat changes hands in one transaction: a transfer moves the sender to
 * the role they chose; a recovery closes the departed holder's period.
 */
export async function acceptFacilityAdministratorInvitation(
  db: PrismaClient,
  input: { actorUserId: string; invitationId: string; now?: Date },
): Promise<{ facilityId: string; kind: FacilityAdministratorInvitationKind; previousHolderUserId: string | null }> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const invitation = await lockInvitation(tx, input.invitationId);
    if (invitation.invitedUserId !== input.actorUserId) {
      throw new FacilityAdministratorInvitationError("NOT_INVITEE", "This invitation is for someone else.");
    }
    assertLive(invitation, now);
    await assertEligibleSuccessor(tx, { facilityId: invitation.facilityId, userId: input.actorUserId });

    const seat = await loadFacilityAdministratorSeat(tx, invitation.facilityId);
    let previousHolderUserId: string | null = null;

    if (invitation.kind === "TRANSFER") {
      const sender = invitation.outgoingUserId;
      if (!sender || !invitation.outgoingRoleKey || seat.kind !== "HELD" || seat.holder.userId !== sender) {
        throw new FacilityAdministratorInvitationError(
          "STALE",
          "The person who sent this invitation is no longer the Facility Administrator.",
        );
      }
      await changeInternalFacilityRole(tx, {
        userId: sender,
        facilityId: invitation.facilityId,
        roleKey: invitation.outgoingRoleKey,
        at: now,
        actorUserId: input.actorUserId,
      });
      await syncLinkedEmployeeRole(tx, {
        facilityId: invitation.facilityId,
        userId: sender,
        roleKey: invitation.outgoingRoleKey,
        actorUserId: input.actorUserId,
      });
      previousHolderUserId = sender;
    } else {
      if (seat.kind === "HELD") {
        throw new FacilityAdministratorInvitationError(
          "SEAT_HELD",
          "This facility has an active Facility Administrator again. Only they can transfer the role.",
        );
      }
      if (seat.kind === "GONE") {
        await tx.userFacilityRolePeriod.update({
          where: { id: seat.holder.periodId },
          data: { endsAt: now, endedByUserId: input.actorUserId },
        });
        await revokeUserSessions(tx, seat.holder.userId);
        previousHolderUserId = seat.holder.userId;
      }
    }

    await seatInvitee(tx, { facilityId: invitation.facilityId, userId: input.actorUserId, now });
    await syncLinkedEmployeeRole(tx, {
      facilityId: invitation.facilityId,
      userId: input.actorUserId,
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      actorUserId: input.actorUserId,
    });
    await tx.facilityAdministratorInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", closedAt: now, closedByUserId: input.actorUserId },
    });
    return { facilityId: invitation.facilityId, kind: invitation.kind, previousHolderUserId };
  });
}

export type OrganizationFacilityAdministratorRow = {
  facilityId: string;
  facilityName: string;
  seat: FacilityAdministratorSeat;
  pending: FacilityAdministratorInvitationView | null;
};

/**
 * Every facility in the organization with its seat. Facility staff are not listed: the
 * organization has no facility access, so recovery names the successor by email.
 */
export async function listOrganizationFacilityAdministratorSeats(
  db: DbClient,
  input: { organizationId: string; now?: Date },
): Promise<OrganizationFacilityAdministratorRow[]> {
  const now = input.now ?? new Date();
  const facilities = await db.facility.findMany({
    where: { organizationId: input.organizationId },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  return Promise.all(
    facilities.map(async (facility) => {
      const [seat, pending] = await Promise.all([
        loadFacilityAdministratorSeat(db, facility.id),
        loadLiveFacilityAdministratorInvitation(db, { facilityId: facility.id, now }),
      ]);
      return { facilityId: facility.id, facilityName: facility.displayName, seat, pending };
    }),
  );
}
