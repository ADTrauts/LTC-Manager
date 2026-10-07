import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import {
  createOrganizationMembership,
  createOrganizationOnlyUserAccount,
  getOrganizationMembers,
} from "@/lib/organization-membership";
import {
  deriveFacilityPartnerLifecycleState,
} from "@/lib/partner-access";
import { trackEvent } from "@/lib/telemetry";

import {
  deriveOrganizationClaimDisplayState,
  isClaimableInvitation,
  isLiveClaimWorkflow,
  toClaimInvitationView,
} from "./state";
import { hashOrganizationClaimToken, mintOrganizationClaimToken } from "./tokens";
import {
  OrganizationClaimError,
  type OrganizationClaimInvitationView,
  type OrganizationClaimStateView,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

const claimSelect = {
  id: true,
  organizationId: true,
  targetEmailNormalized: true,
  contactName: true,
  notes: true,
  status: true,
  tokenHash: true,
  expiresAt: true,
  requestedByUserId: true,
  requestedFromFacilityId: true,
  approvedByPlatformStaffId: true,
  approvedAt: true,
  rejectedByPlatformStaffId: true,
  rejectedAt: true,
  revokedByPlatformStaffId: true,
  revokedAt: true,
  acceptedByUserId: true,
  acceptedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn, options);
  }
  return fn(db as Prisma.TransactionClient);
}

async function countCurrentOrgAdmins(
  db: DbClient,
  organizationId: string,
  now: Date,
): Promise<number> {
  const members = await getOrganizationMembers(db, { organizationId, now });
  return members.filter((row) => row.membership.currentRole === "ORG_ADMIN").length;
}

async function loadOpenClaims(
  db: DbClient,
  organizationId: string,
  now: Date,
): Promise<OrganizationClaimInvitationView[]> {
  const rows = await db.organizationClaimInvitation.findMany({
    where: {
      organizationId,
      status: { in: ["REQUESTED", "APPROVED"] },
    },
    select: claimSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows
    .filter((row) => isLiveClaimWorkflow(row, now))
    .map((row) => toClaimInvitationView(row, now));
}

export async function getOrganizationClaimState(
  db: DbClient,
  input: { organizationId: string; now?: Date },
): Promise<OrganizationClaimStateView> {
  const now = input.now ?? new Date();
  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, isActive: true },
  });
  if (!organization) {
    throw new OrganizationClaimError("ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  const currentOrgAdminCount = await countCurrentOrgAdmins(db, organization.id, now);
  const openClaims = await loadOpenClaims(db, organization.id, now);
  return {
    organizationId: organization.id,
    organizationActive: organization.isActive,
    currentOrgAdminCount,
    displayState: deriveOrganizationClaimDisplayState({
      currentOrgAdminCount,
      openClaims,
      now,
    }),
    openClaims,
  };
}

export async function listFacilityClaimsForPartner(
  db: DbClient,
  input: {
    facilityId: string;
    organizationId: string;
    now?: Date;
  },
): Promise<OrganizationClaimInvitationView[]> {
  const now = input.now ?? new Date();
  const rows = await db.organizationClaimInvitation.findMany({
    where: {
      organizationId: input.organizationId,
      requestedFromFacilityId: input.facilityId,
    },
    select: claimSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => toClaimInvitationView(row, now));
}

async function assertActivePartnerEligibleForClaimRequest(
  db: DbClient,
  input: { facilityId: string; organizationId: string; now: Date },
): Promise<void> {
  const partnership = await db.facilityPartnerOrganization.findUnique({
    where: {
      facilityId_organizationId: {
        facilityId: input.facilityId,
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      endedAt: true,
      accessPeriods: {
        select: { startsAt: true, endsAt: true },
        orderBy: { startsAt: "asc" },
      },
    },
  });
  if (!partnership) {
    throw new OrganizationClaimError(
      "PARTNERSHIP_REQUIRED",
      "A Facility partner relationship is required to request an Organization claim.",
    );
  }
  const lifecycle = deriveFacilityPartnerLifecycleState({
    endedAt: partnership.endedAt,
    accessPeriods: partnership.accessPeriods,
    now: input.now,
  });
  if (lifecycle === "ENDED") {
    throw new OrganizationClaimError(
      "PARTNERSHIP_ENDED",
      "Ended partnerships cannot initiate a new Organization claim.",
    );
  }
}

export async function canRequestOrganizationClaim(
  db: DbClient,
  input: {
    facilityId: string;
    organizationId: string;
    now?: Date;
  },
): Promise<{ ok: true } | { ok: false; code: OrganizationClaimError["code"]; message: string }> {
  const now = input.now ?? new Date();
  try {
    const organization = await db.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, isActive: true },
    });
    if (!organization) {
      throw new OrganizationClaimError("ORGANIZATION_NOT_FOUND", "Organization not found.");
    }
    if (!organization.isActive) {
      throw new OrganizationClaimError("ORGANIZATION_INACTIVE", "Organization is inactive.");
    }
    const adminCount = await countCurrentOrgAdmins(db, organization.id, now);
    if (adminCount > 0) {
      throw new OrganizationClaimError(
        "ALREADY_ADMINISTRABLE",
        "This Organization already has an Organization Administrator.",
      );
    }
    await assertActivePartnerEligibleForClaimRequest(db, {
      facilityId: input.facilityId,
      organizationId: input.organizationId,
      now,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}

export async function requestOrganizationClaim(
  db: DbClient,
  input: {
    organizationId: string;
    facilityId: string;
    requestedByUserId: string;
    targetEmail: string;
    contactName?: string | null;
    notes?: string | null;
    now?: Date;
  },
): Promise<OrganizationClaimInvitationView> {
  const now = input.now ?? new Date();
  const email = normalizeAccountIdentifier(input.targetEmail);
  if (!email || !email.includes("@")) {
    throw new OrganizationClaimError("INVALID_INPUT", "A valid contact email is required.");
  }

  const eligibility = await canRequestOrganizationClaim(db, {
    facilityId: input.facilityId,
    organizationId: input.organizationId,
    now,
  });
  if (!eligibility.ok) {
    throw new OrganizationClaimError(eligibility.code, eligibility.message);
  }

  const created = await db.organizationClaimInvitation.create({
    data: {
      organizationId: input.organizationId,
      targetEmailNormalized: email,
      contactName: input.contactName?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "REQUESTED",
      requestedByUserId: input.requestedByUserId,
      requestedFromFacilityId: input.facilityId,
    },
    select: claimSelect,
  });

  await trackEvent("organization_claim.requested", {
    organizationId: input.organizationId,
    claimId: created.id,
    facilityId: input.facilityId,
    actorType: "user",
    actorId: input.requestedByUserId,
    targetEmailNormalized: email,
  });

  return toClaimInvitationView(created, now);
}

/**
 * Harbor may create a first-admin claim request without a Facility requester
 * (direct platform bootstrap). Still REQUESTED until approved (no token yet).
 */
export async function createHarborOrganizationClaimRequest(
  db: DbClient,
  input: {
    organizationId: string;
    targetEmail: string;
    contactName?: string | null;
    notes?: string | null;
    platformStaffId: string;
    now?: Date;
  },
): Promise<OrganizationClaimInvitationView> {
  const now = input.now ?? new Date();
  const email = normalizeAccountIdentifier(input.targetEmail);
  if (!email || !email.includes("@")) {
    throw new OrganizationClaimError("INVALID_INPUT", "A valid contact email is required.");
  }

  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, isActive: true },
  });
  if (!organization) {
    throw new OrganizationClaimError("ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  if (!organization.isActive) {
    throw new OrganizationClaimError("ORGANIZATION_INACTIVE", "Organization is inactive.");
  }
  const adminCount = await countCurrentOrgAdmins(db, organization.id, now);
  if (adminCount > 0) {
    throw new OrganizationClaimError(
      "ALREADY_ADMINISTRABLE",
      "This Organization already has an Organization Administrator.",
    );
  }

  const created = await db.organizationClaimInvitation.create({
    data: {
      organizationId: input.organizationId,
      targetEmailNormalized: email,
      contactName: input.contactName?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "REQUESTED",
    },
    select: claimSelect,
  });

  await trackEvent("organization_claim.requested", {
    organizationId: input.organizationId,
    claimId: created.id,
    facilityId: null,
    actorType: "platform_staff",
    actorId: input.platformStaffId,
    targetEmailNormalized: email,
  });

  return toClaimInvitationView(created, now);
}

export async function approveOrganizationClaim(
  db: DbClient,
  input: {
    claimId: string;
    platformStaffId: string;
    now?: Date;
  },
): Promise<{ claim: OrganizationClaimInvitationView; rawToken: string }> {
  const now = input.now ?? new Date();

  return runInTransaction(
    db,
    async (tx) => {
      const claim = await tx.organizationClaimInvitation.findUnique({
        where: { id: input.claimId },
        select: claimSelect,
      });
      if (!claim) {
        throw new OrganizationClaimError("CLAIM_NOT_FOUND", "Claim invitation not found.");
      }
      if (claim.status !== "REQUESTED") {
        throw new OrganizationClaimError(
          "CLAIM_NOT_REQUESTED",
          "Only requested claims can be approved.",
        );
      }

      // Serialize first-admin approval against competing Harbor actions.
      await tx.organization.update({
        where: { id: claim.organizationId },
        data: { updatedAt: now },
      });

      const organization = await tx.organization.findUnique({
        where: { id: claim.organizationId },
        select: { id: true, isActive: true },
      });
      if (!organization) {
        throw new OrganizationClaimError("ORGANIZATION_NOT_FOUND", "Organization not found.");
      }
      if (!organization.isActive) {
        throw new OrganizationClaimError("ORGANIZATION_INACTIVE", "Organization is inactive.");
      }

      const adminCount = await countCurrentOrgAdmins(tx, claim.organizationId, now);
      if (adminCount > 0) {
        throw new OrganizationClaimError(
          "ALREADY_ADMINISTRABLE",
          "This Organization already has an Organization Administrator.",
        );
      }

      const competingApproved = await tx.organizationClaimInvitation.findFirst({
        where: {
          organizationId: claim.organizationId,
          status: "APPROVED",
          id: { not: claim.id },
        },
        select: claimSelect,
      });
      if (competingApproved && isClaimableInvitation(competingApproved, now)) {
        throw new OrganizationClaimError(
          "APPROVED_CLAIM_EXISTS",
          "Another approved first-admin claim already exists for this Organization.",
        );
      }

      const minted = mintOrganizationClaimToken();
      const updated = await tx.organizationClaimInvitation.update({
        where: { id: claim.id },
        data: {
          status: "APPROVED",
          tokenHash: minted.tokenHash,
          expiresAt: minted.expiresAt,
          approvedByPlatformStaffId: input.platformStaffId,
          approvedAt: now,
        },
        select: claimSelect,
      });

      await trackEvent("organization_claim.approved", {
        organizationId: claim.organizationId,
        claimId: claim.id,
        facilityId: claim.requestedFromFacilityId,
        actorType: "platform_staff",
        actorId: input.platformStaffId,
        targetEmailNormalized: claim.targetEmailNormalized,
      });

      return {
        claim: toClaimInvitationView(updated, now),
        rawToken: minted.rawToken,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function rejectOrganizationClaim(
  db: DbClient,
  input: {
    claimId: string;
    platformStaffId: string;
    now?: Date;
  },
): Promise<OrganizationClaimInvitationView> {
  const now = input.now ?? new Date();
  const claim = await db.organizationClaimInvitation.findUnique({
    where: { id: input.claimId },
    select: claimSelect,
  });
  if (!claim) {
    throw new OrganizationClaimError("CLAIM_NOT_FOUND", "Claim invitation not found.");
  }
  if (claim.status !== "REQUESTED") {
    throw new OrganizationClaimError(
      "CLAIM_NOT_REQUESTED",
      "Only requested claims can be rejected.",
    );
  }

  const updated = await db.organizationClaimInvitation.update({
    where: { id: claim.id },
    data: {
      status: "REJECTED",
      rejectedByPlatformStaffId: input.platformStaffId,
      rejectedAt: now,
    },
    select: claimSelect,
  });

  await trackEvent("organization_claim.rejected", {
    organizationId: claim.organizationId,
    claimId: claim.id,
    facilityId: claim.requestedFromFacilityId,
    actorType: "platform_staff",
    actorId: input.platformStaffId,
    targetEmailNormalized: claim.targetEmailNormalized,
  });

  return toClaimInvitationView(updated, now);
}

export async function revokeOrganizationClaim(
  db: DbClient,
  input: {
    claimId: string;
    platformStaffId: string;
    now?: Date;
  },
): Promise<OrganizationClaimInvitationView> {
  const now = input.now ?? new Date();
  const claim = await db.organizationClaimInvitation.findUnique({
    where: { id: input.claimId },
    select: claimSelect,
  });
  if (!claim) {
    throw new OrganizationClaimError("CLAIM_NOT_FOUND", "Claim invitation not found.");
  }
  if (claim.status !== "APPROVED") {
    throw new OrganizationClaimError(
      "CLAIM_NOT_APPROVED",
      "Only approved, unaccepted claims can be revoked.",
    );
  }
  if (claim.acceptedAt) {
    throw new OrganizationClaimError(
      "CLAIM_ALREADY_ACCEPTED",
      "Accepted claims cannot be revoked; manage membership instead.",
    );
  }

  const updated = await db.organizationClaimInvitation.update({
    where: { id: claim.id },
    data: {
      status: "REVOKED",
      revokedByPlatformStaffId: input.platformStaffId,
      revokedAt: now,
    },
    select: claimSelect,
  });

  await trackEvent("organization_claim.revoked", {
    organizationId: claim.organizationId,
    claimId: claim.id,
    facilityId: claim.requestedFromFacilityId,
    actorType: "platform_staff",
    actorId: input.platformStaffId,
    targetEmailNormalized: claim.targetEmailNormalized,
  });

  return toClaimInvitationView(updated, now);
}

export async function findClaimableInvitationByRawToken(
  db: DbClient,
  rawToken: string,
  now: Date = new Date(),
): Promise<OrganizationClaimInvitationView | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = hashOrganizationClaimToken(rawToken);
  const row = await db.organizationClaimInvitation.findUnique({
    where: { tokenHash },
    select: claimSelect,
  });
  if (!row || !isClaimableInvitation(row, now)) return null;
  return toClaimInvitationView(row, now);
}

export async function acceptOrganizationClaim(
  db: DbClient,
  input: {
    rawToken: string;
    /**
     * When set, must match claim target email (logged-in acceptor).
     * When null, a new or existing User is resolved by claim email.
     */
    authenticatedUserId?: string | null;
    /** Required when creating a new User or setting password on invite-pending User. */
    passwordHash?: string | null;
    displayName?: string | null;
    now?: Date;
  },
): Promise<{
  claim: OrganizationClaimInvitationView;
  userId: string;
  organizationId: string;
  createdUser: boolean;
}> {
  const now = input.now ?? new Date();
  const tokenHash = hashOrganizationClaimToken(input.rawToken);

  return runInTransaction(
    db,
    async (tx) => {
      const claim = await tx.organizationClaimInvitation.findUnique({
        where: { tokenHash },
        select: claimSelect,
      });
      if (!claim || claim.tokenHash !== tokenHash) {
        throw new OrganizationClaimError("TOKEN_INVALID", "This claim link is invalid.");
      }
      if (claim.status === "REVOKED" || claim.revokedAt) {
        throw new OrganizationClaimError("CLAIM_REVOKED", "This claim invitation was revoked.");
      }
      if (claim.status === "ACCEPTED" || claim.acceptedAt) {
        throw new OrganizationClaimError(
          "CLAIM_ALREADY_ACCEPTED",
          "This claim invitation was already used.",
        );
      }
      if (claim.status !== "APPROVED") {
        throw new OrganizationClaimError(
          "CLAIM_NOT_APPROVED",
          "This claim invitation is not approved.",
        );
      }
      if (!claim.expiresAt || claim.expiresAt.getTime() <= now.getTime()) {
        throw new OrganizationClaimError("CLAIM_EXPIRED", "This claim invitation has expired.");
      }

      // Serialize first-admin acceptance.
      await tx.organization.update({
        where: { id: claim.organizationId },
        data: { updatedAt: now },
      });

      const organization = await tx.organization.findUnique({
        where: { id: claim.organizationId },
        select: { id: true, isActive: true, name: true, displayName: true },
      });
      if (!organization) {
        throw new OrganizationClaimError("ORGANIZATION_NOT_FOUND", "Organization not found.");
      }
      if (!organization.isActive) {
        throw new OrganizationClaimError("ORGANIZATION_INACTIVE", "Organization is inactive.");
      }

      const adminCount = await countCurrentOrgAdmins(tx, claim.organizationId, now);
      if (adminCount > 0) {
        throw new OrganizationClaimError(
          "ALREADY_ADMINISTRABLE",
          "This Organization already has an Organization Administrator.",
        );
      }

      let user =
        input.authenticatedUserId != null
          ? await tx.user.findUnique({
              where: { id: input.authenticatedUserId },
              select: {
                id: true,
                email: true,
                displayName: true,
                isActive: true,
                facilityId: true,
                roleId: true,
                passwordHash: true,
              },
            })
          : await tx.user.findUnique({
              where: { email: claim.targetEmailNormalized },
              select: {
                id: true,
                email: true,
                displayName: true,
                isActive: true,
                facilityId: true,
                roleId: true,
                passwordHash: true,
              },
            });

      if (user && normalizeAccountIdentifier(user.email) !== claim.targetEmailNormalized) {
        throw new OrganizationClaimError(
          "EMAIL_MISMATCH",
          "This claim invitation belongs to a different email address.",
        );
      }
      if (user && !user.isActive) {
        throw new OrganizationClaimError("USER_INACTIVE", "User account is inactive.");
      }

      let createdUser = false;
      if (!user) {
        const displayName =
          input.displayName?.trim() ||
          claim.contactName?.trim() ||
          claim.targetEmailNormalized.split("@")[0] ||
          "Organization Administrator";
        if (!input.passwordHash) {
          throw new OrganizationClaimError(
            "INVALID_INPUT",
            "Password is required to create the Organization Administrator account.",
          );
        }
        const created = await createOrganizationOnlyUserAccount(tx, {
          email: claim.targetEmailNormalized,
          displayName,
          passwordHash: input.passwordHash,
          emailVerifiedAt: now,
        });
        user = {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          isActive: true,
          facilityId: null,
          roleId: null,
          passwordHash: input.passwordHash,
        };
        createdUser = true;
      } else if (!user.passwordHash) {
        if (!input.passwordHash) {
          throw new OrganizationClaimError(
            "INVALID_INPUT",
            "Password is required to finish setting up this account.",
          );
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: input.passwordHash,
            emailVerifiedAt: now,
            ...(input.displayName?.trim()
              ? { displayName: input.displayName.trim() }
              : {}),
          },
        });
      } else if (input.displayName?.trim()) {
        // Ignore displayName changes for established accounts.
      }

      // Do not rewrite home Facility / Facility RoleKey for existing Users.
      await createOrganizationMembership(tx, {
        userId: user.id,
        organizationId: claim.organizationId,
        role: "ORG_ADMIN",
        startsAt: now,
        createdByUserId: null,
        revokeSessions: false,
      });

      const updated = await tx.organizationClaimInvitation.update({
        where: { id: claim.id },
        data: {
          status: "ACCEPTED",
          acceptedByUserId: user.id,
          acceptedAt: now,
        },
        select: claimSelect,
      });

      // Fail-closed for competitors: revoke other approved unaccepted claims.
      await tx.organizationClaimInvitation.updateMany({
        where: {
          organizationId: claim.organizationId,
          status: "APPROVED",
          id: { not: claim.id },
          acceptedAt: null,
        },
        data: {
          status: "REVOKED",
          revokedAt: now,
        },
      });
      // Remaining REQUESTED proposals cannot become first-admin once administrable.
      await tx.organizationClaimInvitation.updateMany({
        where: {
          organizationId: claim.organizationId,
          status: "REQUESTED",
          id: { not: claim.id },
        },
        data: {
          status: "REJECTED",
          rejectedAt: now,
        },
      });

      await trackEvent("organization_claim.accepted", {
        organizationId: claim.organizationId,
        claimId: claim.id,
        facilityId: claim.requestedFromFacilityId,
        actorType: "user",
        actorId: user.id,
        targetEmailNormalized: claim.targetEmailNormalized,
        createdUser,
      });

      return {
        claim: toClaimInvitationView(updated, now),
        userId: user.id,
        organizationId: claim.organizationId,
        createdUser,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listHarborClaimQueue(
  db: DbClient,
  input?: { now?: Date; includeTerminal?: boolean },
): Promise<
  Array<
    OrganizationClaimInvitationView & {
      organizationName: string;
      organizationDisplayName: string | null;
      requestingFacilityName: string | null;
      requestedByEmail: string | null;
      currentOrgAdminCount: number;
    }
  >
> {
  const now = input?.now ?? new Date();
  const rows = await db.organizationClaimInvitation.findMany({
    where: input?.includeTerminal
      ? undefined
      : { status: { in: ["REQUESTED", "APPROVED"] } },
    select: {
      ...claimSelect,
      organization: { select: { id: true, name: true, displayName: true } },
      requestedFromFacility: { select: { id: true, displayName: true } },
      requestedByUser: { select: { id: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const results = [];
  for (const row of rows) {
    const view = toClaimInvitationView(row, now);
    const currentOrgAdminCount = await countCurrentOrgAdmins(db, row.organizationId, now);
    results.push({
      ...view,
      organizationName: row.organization.name,
      organizationDisplayName: row.organization.displayName,
      requestingFacilityName: row.requestedFromFacility?.displayName?.trim() || null,
      requestedByEmail: row.requestedByUser?.email ?? null,
      currentOrgAdminCount,
    });
  }
  return results;
}
