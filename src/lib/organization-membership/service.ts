import type { OrganizationMembershipRole, Prisma, PrismaClient } from "@prisma/client";

import { revokeUserSessions } from "@/lib/session-revocation";
import { trackEvent } from "@/lib/telemetry";

import { assertValidUserIdentityShape } from "./account";
import {
  assertNoOverlappingPeriods,
  findPeriodContainingInstant,
  periodContainsInstant,
} from "./periods";
import {
  OrganizationMembershipError,
  type OrganizationMembershipRolePeriodView,
  type OrganizationMembershipView,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

const organizationSelect = {
  id: true,
  name: true,
  displayName: true,
  legalName: true,
  organizationType: true,
  isActive: true,
} as const;

function toRolePeriodView(row: {
  id: string;
  membershipId: string;
  role: OrganizationMembershipRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationMembershipRolePeriodView {
  return {
    id: row.id,
    membershipId: row.membershipId,
    role: row.role,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

async function loadMembershipRow(
  db: DbClient,
  input: { membershipId?: string; userId?: string; organizationId?: string },
) {
  const row = input.membershipId
    ? await db.userOrganizationMembership.findUnique({
        where: { id: input.membershipId },
        include: {
          organization: { select: organizationSelect },
          rolePeriods: { orderBy: { startsAt: "asc" } },
        },
      })
    : input.userId && input.organizationId
      ? await db.userOrganizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: input.userId,
              organizationId: input.organizationId,
            },
          },
          include: {
            organization: { select: organizationSelect },
            rolePeriods: { orderBy: { startsAt: "asc" } },
          },
        })
      : null;

  if (!row) {
    throw new OrganizationMembershipError(
      "MEMBERSHIP_NOT_FOUND",
      "Organization membership not found.",
    );
  }
  return row;
}

function toMembershipView(
  row: Awaited<ReturnType<typeof loadMembershipRow>>,
  now: Date = new Date(),
): OrganizationMembershipView {
  const rolePeriods = row.rolePeriods.map(toRolePeriodView);
  const currentRolePeriod =
    row.organization.isActive
      ? findPeriodContainingInstant(rolePeriods, now)
      : null;
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    organization: row.organization,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentRole: currentRolePeriod?.role ?? null,
    currentRolePeriod,
    rolePeriods,
  };
}

export async function getUserOrganizationMembership(
  db: DbClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<OrganizationMembershipView | null> {
  try {
    const row = await loadMembershipRow(db, {
      userId: input.userId,
      organizationId: input.organizationId,
    });
    return toMembershipView(row, input.now ?? new Date());
  } catch (error) {
    if (error instanceof OrganizationMembershipError && error.code === "MEMBERSHIP_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function getCurrentOrganizationRole(
  db: DbClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<OrganizationMembershipRole | null> {
  const membership = await getUserOrganizationMembership(db, input);
  return membership?.currentRole ?? null;
}

export async function getOrganizationMembershipAt(
  db: DbClient,
  input: { userId: string; organizationId: string; at: Date },
): Promise<OrganizationMembershipView | null> {
  return getUserOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    now: input.at,
  });
}

export async function listCurrentOrganizationMembershipsForUser(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<OrganizationMembershipView[]> {
  const rows = await db.userOrganizationMembership.findMany({
    where: { userId: input.userId },
    include: {
      organization: { select: organizationSelect },
      rolePeriods: { orderBy: { startsAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const now = input.now ?? new Date();
  return rows
    .map((row) => toMembershipView(row, now))
    .filter((view) => view.currentRole !== null);
}

export async function getOrganizationMembers(
  db: DbClient,
  input: { organizationId: string; now?: Date },
): Promise<
  Array<{
    membership: OrganizationMembershipView;
    user: { id: string; email: string; displayName: string };
  }>
> {
  const rows = await db.userOrganizationMembership.findMany({
    where: { organizationId: input.organizationId },
    include: {
      organization: { select: organizationSelect },
      rolePeriods: { orderBy: { startsAt: "asc" } },
      user: { select: { id: true, email: true, displayName: true, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const now = input.now ?? new Date();
  return rows
    .map((row) => ({
      membership: toMembershipView(row, now),
      user: {
        id: row.user.id,
        email: row.user.email,
        displayName: row.user.displayName,
      },
    }))
    .filter((row) => row.membership.currentRole !== null);
}

export async function createOrganizationMembership(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    role: OrganizationMembershipRole;
    startsAt?: Date;
    createdByUserId?: string | null;
    revokeSessions?: boolean;
  },
): Promise<OrganizationMembershipView> {
  const startsAt = input.startsAt ?? new Date();

  const [user, organization] = await Promise.all([
    db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, facilityId: true, roleId: true },
    }),
    db.organization.findUnique({
      where: { id: input.organizationId },
      select: organizationSelect,
    }),
  ]);
  if (!user) {
    throw new OrganizationMembershipError("USER_NOT_FOUND", "User not found.");
  }
  if (!user.isActive) {
    throw new OrganizationMembershipError("USER_INACTIVE", "User is inactive.");
  }
  assertValidUserIdentityShape(user);
  if (!organization) {
    throw new OrganizationMembershipError("ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  if (!organization.isActive) {
    throw new OrganizationMembershipError("ORGANIZATION_INACTIVE", "Organization is inactive.");
  }

  const existing = await getUserOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    now: startsAt,
  });
  if (existing?.currentRole) {
    throw new OrganizationMembershipError(
      "ALREADY_ACTIVE_MEMBER",
      "User already has an active Organization membership.",
    );
  }

  await runInTransaction(db, async (tx) => {
    let membership = await tx.userOrganizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      },
      include: { rolePeriods: true },
    });

    if (!membership) {
      membership = await tx.userOrganizationMembership.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          createdByUserId: input.createdByUserId ?? null,
        },
        include: { rolePeriods: true },
      });
    }

    assertNoOverlappingPeriods([
      ...membership.rolePeriods.map((p) => ({ startsAt: p.startsAt, endsAt: p.endsAt })),
      { startsAt, endsAt: null },
    ]);

    await tx.userOrganizationRolePeriod.create({
      data: {
        membershipId: membership.id,
        role: input.role,
        startsAt,
        endsAt: null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  });

  await trackEvent("organization_member.joined", {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    startsAt: startsAt.toISOString(),
    actorUserId: input.createdByUserId ?? null,
  });

  if (input.revokeSessions === true && "$transaction" in db) {
    await revokeUserSessions(db as PrismaClient, input.userId);
  }

  const view = await getUserOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    now: startsAt,
  });
  if (!view) {
    throw new OrganizationMembershipError("MEMBERSHIP_NOT_FOUND", "Membership missing after create.");
  }
  return view;
}

export async function changeOrganizationRole(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    role: OrganizationMembershipRole;
    at?: Date;
    actorUserId?: string | null;
    revokeSessions?: boolean;
  },
): Promise<OrganizationMembershipView> {
  const at = input.at ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadMembershipRow(tx, {
      userId: input.userId,
      organizationId: input.organizationId,
    });
    if (!row.organization.isActive) {
      throw new OrganizationMembershipError("ORGANIZATION_INACTIVE", "Organization is inactive.");
    }
    const current = findPeriodContainingInstant(row.rolePeriods, at);
    if (!current) {
      throw new OrganizationMembershipError(
        "NOT_ACTIVE_MEMBER",
        "User is not currently a member of this Organization.",
      );
    }
    if (current.role === input.role) {
      return;
    }

    await tx.userOrganizationRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: at, endedByUserId: input.actorUserId ?? null },
    });

    const afterClose = await tx.userOrganizationRolePeriod.findMany({
      where: { membershipId: row.id },
      select: { startsAt: true, endsAt: true },
    });
    assertNoOverlappingPeriods([...afterClose, { startsAt: at, endsAt: null }]);

    await tx.userOrganizationRolePeriod.create({
      data: {
        membershipId: row.id,
        role: input.role,
        startsAt: at,
        endsAt: null,
        createdByUserId: input.actorUserId ?? null,
      },
    });
  });

  await trackEvent("organization_member.role_changed", {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    at: at.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  if (input.revokeSessions === true && "$transaction" in db) {
    await revokeUserSessions(db as PrismaClient, input.userId);
  }

  const view = await getUserOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    now: at,
  });
  if (!view) {
    throw new OrganizationMembershipError("MEMBERSHIP_NOT_FOUND", "Membership missing after role change.");
  }
  return view;
}

export async function endOrganizationMembership(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    endsAt?: Date;
    actorUserId?: string | null;
    revokeSessions?: boolean;
  },
): Promise<OrganizationMembershipView> {
  const endsAt = input.endsAt ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadMembershipRow(tx, {
      userId: input.userId,
      organizationId: input.organizationId,
    });
    const current = findPeriodContainingInstant(row.rolePeriods, endsAt);
    if (!current) {
      throw new OrganizationMembershipError(
        "NOT_ACTIVE_MEMBER",
        "User is not currently a member of this Organization.",
      );
    }
    await tx.userOrganizationRolePeriod.update({
      where: { id: current.id },
      data: { endsAt, endedByUserId: input.actorUserId ?? null },
    });
  });

  await trackEvent("organization_member.ended", {
    userId: input.userId,
    organizationId: input.organizationId,
    endsAt: endsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  if (input.revokeSessions === true && "$transaction" in db) {
    await revokeUserSessions(db as PrismaClient, input.userId);
  }

  const view = await getUserOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    now: endsAt,
  });
  if (!view) {
    throw new OrganizationMembershipError("MEMBERSHIP_NOT_FOUND", "Membership missing after end.");
  }
  return view;
}

export async function rejoinOrganizationMembership(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    role: OrganizationMembershipRole;
    startsAt?: Date;
    actorUserId?: string | null;
    revokeSessions?: boolean;
  },
): Promise<OrganizationMembershipView> {
  return createOrganizationMembership(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    startsAt: input.startsAt,
    createdByUserId: input.actorUserId,
    revokeSessions: input.revokeSessions,
  });
}

export async function assertOrganizationMember(
  db: DbClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<OrganizationMembershipView> {
  const membership = await getUserOrganizationMembership(db, input);
  if (!membership?.currentRole) {
    throw new OrganizationMembershipError(
      "NOT_ACTIVE_MEMBER",
      "Active Organization membership required.",
    );
  }
  return membership;
}

export async function assertOrganizationAdmin(
  db: DbClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<OrganizationMembershipView> {
  const membership = await assertOrganizationMember(db, input);
  if (membership.currentRole !== "ORG_ADMIN") {
    throw new OrganizationMembershipError(
      "NOT_ACTIVE_MEMBER",
      "Organization Administrator membership required.",
    );
  }
  return membership;
}

/** Phase 2B1: membership never authorizes Facility entry. */
export function organizationMembershipGrantsFacilityAccess(): false {
  return false;
}

export function userHasCurrentOrganizationMembershipAt(
  membership: OrganizationMembershipView | null,
  instant: Date = new Date(),
): boolean {
  if (!membership || !membership.organization.isActive) return false;
  return Boolean(
    membership.rolePeriods.some((period) => periodContainsInstant(period, instant)),
  );
}
