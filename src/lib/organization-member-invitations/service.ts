import type { OrganizationMembershipRole, Prisma, PrismaClient } from "@prisma/client";

import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import {
  assertOrganizationAdmin,
  changeOrganizationRole,
  createOrganizationMembership,
  createOrganizationOnlyUserAccount,
  endOrganizationMembership,
  getUserOrganizationMembership,
  OrganizationMembershipError,
} from "@/lib/organization-membership";
import { trackEvent } from "@/lib/telemetry";

import {
  isAcceptableMemberInvitation,
  toMemberInvitationView,
} from "./state";
import {
  hashOrganizationMemberInvitationToken,
  mintOrganizationMemberInvitationToken,
} from "./tokens";
import {
  OrganizationMemberInvitationError,
  type OrganizationMemberInvitationView,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

const invitationSelect = {
  id: true,
  organizationId: true,
  targetEmailNormalized: true,
  intendedRole: true,
  expiresAt: true,
  status: true,
  invitedByUserId: true,
  acceptedByUserId: true,
  acceptedAt: true,
  revokedByUserId: true,
  revokedAt: true,
  lastInvitationDeliveredAt: true,
  lastInvitationDeliveryStatus: true,
  lastInvitationDeliveryError: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn, { isolationLevel: "Serializable" });
  }
  return fn(db as Prisma.TransactionClient);
}

async function requireActiveOrgAdmin(
  db: DbClient,
  input: { actorUserId: string; organizationId: string; now: Date },
) {
  try {
    return await assertOrganizationAdmin(db, {
      userId: input.actorUserId,
      organizationId: input.organizationId,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof OrganizationMembershipError) {
      if (error.code === "ORGANIZATION_INACTIVE") {
        throw new OrganizationMemberInvitationError(
          "ORGANIZATION_INACTIVE",
          "Organization is inactive.",
        );
      }
      throw new OrganizationMemberInvitationError(
        "NOT_ORG_ADMIN",
        "Only a current Organization Administrator can manage members.",
      );
    }
    throw error;
  }
}

function assertIntendedRole(role: OrganizationMembershipRole) {
  if (role !== "ORG_ADMIN" && role !== "ORG_MEMBER") {
    throw new OrganizationMemberInvitationError("INVALID_INPUT", "Unsupported organization role.");
  }
}

export async function inviteOrganizationMember(
  db: DbClient,
  input: {
    organizationId: string;
    actorUserId: string;
    targetEmail: string;
    intendedRole: OrganizationMembershipRole;
    now?: Date;
  },
): Promise<{ invitation: OrganizationMemberInvitationView; rawToken: string }> {
  const now = input.now ?? new Date();
  const email = normalizeAccountIdentifier(input.targetEmail);
  if (!email) {
    throw new OrganizationMemberInvitationError("INVALID_INPUT", "A valid email is required.");
  }
  assertIntendedRole(input.intendedRole);
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    now,
  });

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });
  if (existingUser) {
    const membership = await getUserOrganizationMembership(db, {
      userId: existingUser.id,
      organizationId: input.organizationId,
      now,
    });
    if (membership?.currentRole === input.intendedRole) {
      throw new OrganizationMemberInvitationError(
        "ALREADY_CURRENT_MEMBER",
        "This person is already a current member with that role.",
      );
    }
    if (membership?.currentRole && membership.currentRole !== input.intendedRole) {
      throw new OrganizationMemberInvitationError(
        "ROLE_CHANGE_REQUIRES_ADMIN_ACTION",
        "Change this member's role from Organization administration. An invitation will not change an existing role.",
      );
    }
  }

  const minted = mintOrganizationMemberInvitationToken(now);
  const invitation = await runInTransaction(db, async (tx) => {
    const live = await tx.organizationMemberInvitation.findFirst({
      where: {
        organizationId: input.organizationId,
        targetEmailNormalized: email,
        status: "PENDING",
      },
      select: invitationSelect,
    });
    if (live && live.status === "PENDING" && !live.acceptedAt && !live.revokedAt) {
      const rotated = await tx.organizationMemberInvitation.update({
        where: { id: live.id },
        data: {
          intendedRole: input.intendedRole,
          tokenHash: minted.tokenHash,
          expiresAt: minted.expiresAt,
          invitedByUserId: input.actorUserId,
        },
        select: invitationSelect,
      });
      return rotated;
    }
    return tx.organizationMemberInvitation.create({
      data: {
        organizationId: input.organizationId,
        targetEmailNormalized: email,
        intendedRole: input.intendedRole,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
        status: "PENDING",
        invitedByUserId: input.actorUserId,
      },
      select: invitationSelect,
    });
  });

  await trackEvent("organization_member.invited", {
    organizationId: input.organizationId,
    invitationId: invitation.id,
    actorUserId: input.actorUserId,
    targetEmailNormalized: email,
    intendedRole: input.intendedRole,
  });

  return {
    invitation: toMemberInvitationView(invitation, now),
    rawToken: minted.rawToken,
  };
}

export async function resendOrganizationMemberInvitation(
  db: DbClient,
  input: { invitationId: string; actorUserId: string; now?: Date },
): Promise<{ invitation: OrganizationMemberInvitationView; rawToken: string }> {
  const now = input.now ?? new Date();
  const existing = await db.organizationMemberInvitation.findUnique({
    where: { id: input.invitationId },
    select: invitationSelect,
  });
  if (!existing) {
    throw new OrganizationMemberInvitationError(
      "INVITATION_NOT_FOUND",
      "Invitation not found.",
    );
  }
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: existing.organizationId,
    now,
  });
  if (existing.status !== "PENDING" || existing.acceptedAt || existing.revokedAt) {
    throw new OrganizationMemberInvitationError(
      "INVITATION_NOT_PENDING",
      "Only a pending invitation can be resent.",
    );
  }

  const minted = mintOrganizationMemberInvitationToken(now);
  const updated = await db.organizationMemberInvitation.update({
    where: { id: existing.id },
    data: {
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
    },
    select: invitationSelect,
  });

  await trackEvent("organization_member.invitation_resent", {
    organizationId: existing.organizationId,
    invitationId: existing.id,
    actorUserId: input.actorUserId,
    targetEmailNormalized: existing.targetEmailNormalized,
  });

  return {
    invitation: toMemberInvitationView(updated, now),
    rawToken: minted.rawToken,
  };
}

export async function revokeOrganizationMemberInvitation(
  db: DbClient,
  input: { invitationId: string; actorUserId: string; now?: Date },
): Promise<OrganizationMemberInvitationView> {
  const now = input.now ?? new Date();
  const existing = await db.organizationMemberInvitation.findUnique({
    where: { id: input.invitationId },
    select: invitationSelect,
  });
  if (!existing) {
    throw new OrganizationMemberInvitationError(
      "INVITATION_NOT_FOUND",
      "Invitation not found.",
    );
  }
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: existing.organizationId,
    now,
  });
  if (existing.status !== "PENDING") {
    throw new OrganizationMemberInvitationError(
      "INVITATION_NOT_PENDING",
      "Only a pending invitation can be revoked.",
    );
  }
  const updated = await db.organizationMemberInvitation.update({
    where: { id: existing.id },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revokedByUserId: input.actorUserId,
      tokenHash: null,
    },
    select: invitationSelect,
  });
  await trackEvent("organization_member.invitation_revoked", {
    organizationId: existing.organizationId,
    invitationId: existing.id,
    actorUserId: input.actorUserId,
    targetEmailNormalized: existing.targetEmailNormalized,
  });
  return toMemberInvitationView(updated, now);
}

export async function findAcceptableMemberInvitationByRawToken(
  db: DbClient,
  rawToken: string,
  now: Date = new Date(),
): Promise<OrganizationMemberInvitationView | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = hashOrganizationMemberInvitationToken(rawToken);
  const row = await db.organizationMemberInvitation.findUnique({
    where: { tokenHash },
    select: invitationSelect,
  });
  if (!row || !isAcceptableMemberInvitation(row, now)) return null;
  return toMemberInvitationView(row, now);
}

export async function acceptOrganizationMemberInvitation(
  db: DbClient,
  input: {
    rawToken: string;
    authenticatedUserId?: string | null;
    passwordHash?: string | null;
    displayName?: string | null;
    now?: Date;
  },
): Promise<{
  invitation: OrganizationMemberInvitationView;
  userId: string;
  organizationId: string;
  createdUser: boolean;
}> {
  const now = input.now ?? new Date();
  const tokenHash = hashOrganizationMemberInvitationToken(input.rawToken);

  return runInTransaction(db, async (tx) => {
    const invitation = await tx.organizationMemberInvitation.findUnique({
      where: { tokenHash },
      select: invitationSelect,
    });
    if (!invitation) {
      throw new OrganizationMemberInvitationError("TOKEN_INVALID", "This invitation link is invalid.");
    }
    if (invitation.status === "REVOKED" || invitation.revokedAt) {
      throw new OrganizationMemberInvitationError(
        "INVITATION_REVOKED",
        "This invitation was revoked.",
      );
    }
    if (invitation.status === "ACCEPTED" || invitation.acceptedAt) {
      throw new OrganizationMemberInvitationError("TOKEN_INVALID", "This invitation was already used.");
    }
    if (!isAcceptableMemberInvitation(invitation, now)) {
      throw new OrganizationMemberInvitationError(
        "INVITATION_EXPIRED",
        "This invitation has expired.",
      );
    }

    const organization = await tx.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { id: true, isActive: true },
    });
    if (!organization?.isActive) {
      throw new OrganizationMemberInvitationError(
        "ORGANIZATION_INACTIVE",
        "Organization is inactive.",
      );
    }

    let user = await tx.user.findUnique({
      where: { email: invitation.targetEmailNormalized },
      select: {
        id: true,
        email: true,
        isActive: true,
        facilityId: true,
        roleId: true,
      },
    });
    let createdUser = false;
    if (input.authenticatedUserId && user && user.id !== input.authenticatedUserId) {
      throw new OrganizationMemberInvitationError(
        "EMAIL_MISMATCH",
        "Signed-in account does not match this invitation.",
      );
    }
    if (!user) {
      const created = await createOrganizationOnlyUserAccount(tx, {
        email: invitation.targetEmailNormalized,
        displayName: input.displayName?.trim() || invitation.targetEmailNormalized,
        passwordHash: input.passwordHash ?? null,
        emailVerifiedAt: now,
      });
      createdUser = true;
      user = {
        id: created.id,
        email: created.email,
        isActive: true,
        facilityId: null,
        roleId: null,
      };
    } else if (!user.isActive) {
      throw new OrganizationMemberInvitationError("USER_INACTIVE", "This account is inactive.");
    } else if (input.passwordHash && !user.facilityId) {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: input.passwordHash, emailVerifiedAt: now },
      });
    }

    const membership = await getUserOrganizationMembership(tx, {
      userId: user.id,
      organizationId: invitation.organizationId,
      now,
    });
    if (membership?.currentRole === invitation.intendedRole) {
      throw new OrganizationMemberInvitationError(
        "ALREADY_CURRENT_MEMBER",
        "This account is already a current member with that role.",
      );
    }
    if (membership?.currentRole && membership.currentRole !== invitation.intendedRole) {
      throw new OrganizationMemberInvitationError(
        "ROLE_CHANGE_REQUIRES_ADMIN_ACTION",
        "An invitation cannot change the role of a current member.",
      );
    }

    const homeFacilityId = user.facilityId;
    const homeRoleId = user.roleId;
    await createOrganizationMembership(tx, {
      userId: user.id,
      organizationId: invitation.organizationId,
      role: invitation.intendedRole,
      startsAt: now,
      createdByUserId: invitation.invitedByUserId,
      revokeSessions: false,
    });
    const after = await tx.user.findUnique({
      where: { id: user.id },
      select: { facilityId: true, roleId: true },
    });
    if (after?.facilityId !== homeFacilityId || after?.roleId !== homeRoleId) {
      throw new OrganizationMemberInvitationError(
        "INVALID_INPUT",
        "Organization invitation must not change Facility identity.",
      );
    }

    const accepted = await tx.organizationMemberInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedByUserId: user.id,
        tokenHash: null,
      },
      select: invitationSelect,
    });

    await trackEvent(
      membership ? "organization_member.rejoined" : "organization_member.invitation_accepted",
      {
        organizationId: invitation.organizationId,
        invitationId: invitation.id,
        userId: user.id,
        intendedRole: invitation.intendedRole,
        createdUser,
      },
    );

    return {
      invitation: toMemberInvitationView(accepted, now),
      userId: user.id,
      organizationId: invitation.organizationId,
      createdUser,
    };
  });
}

export async function changeOrganizationMemberRole(
  db: DbClient,
  input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    role: OrganizationMembershipRole;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  assertIntendedRole(input.role);
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    now,
  });
  return changeOrganizationRole(db, {
    userId: input.targetUserId,
    organizationId: input.organizationId,
    role: input.role,
    at: now,
    actorUserId: input.actorUserId,
    revokeSessions: true,
  });
}

export async function endOrganizationMember(
  db: DbClient,
  input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    now,
  });
  return endOrganizationMembership(db, {
    userId: input.targetUserId,
    organizationId: input.organizationId,
    endsAt: now,
    actorUserId: input.actorUserId,
    revokeSessions: true,
  });
}

export async function listOrganizationMemberInvitations(
  db: DbClient,
  input: { organizationId: string; actorUserId: string; now?: Date },
): Promise<OrganizationMemberInvitationView[]> {
  const now = input.now ?? new Date();
  await requireActiveOrgAdmin(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    now,
  });
  const rows = await db.organizationMemberInvitation.findMany({
    where: { organizationId: input.organizationId, status: "PENDING" },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => toMemberInvitationView(row, now));
}
