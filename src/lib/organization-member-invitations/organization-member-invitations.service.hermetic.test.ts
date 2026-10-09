import assert from "node:assert/strict";
import test from "node:test";

import { userHasActiveFacilityAccess } from "@/lib/facility-access";
import {
  getOrganizationMembershipAt,
  organizationMembershipGrantsFacilityAccess,
} from "@/lib/organization-membership";

import {
  acceptOrganizationMemberInvitation,
  changeOrganizationMemberRole,
  endOrganizationMember,
  findAcceptableMemberInvitationByRawToken,
  hashOrganizationMemberInvitationToken,
  inviteOrganizationMember,
  OrganizationMemberInvitationError,
  resendOrganizationMemberInvitation,
  revokeOrganizationMemberInvitation,
} from "./index";

type User = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  facilityId: string | null;
  roleId: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
};
type Org = { id: string; name: string; isActive?: boolean };
type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type Period = {
  id: string;
  membershipId: string;
  role: "ORG_ADMIN" | "ORG_MEMBER";
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type Invitation = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  intendedRole: "ORG_ADMIN" | "ORG_MEMBER";
  tokenHash: string | null;
  expiresAt: Date | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  lastInvitationDeliveredAt: Date | null;
  lastInvitationDeliveryStatus: string | null;
  lastInvitationDeliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeDb(seed: { organizations: Org[]; users: User[] }) {
  let seq = 0;
  const users = new Map(seed.users.map((user) => [user.id, user]));
  const orgs = new Map(seed.organizations.map((org) => [org.id, org]));
  const memberships: Membership[] = [];
  const periods: Period[] = [];
  const invitations: Invitation[] = [];
  let facilityAccessCreates = 0;

  const orgView = (id: string) => {
    const org = orgs.get(id)!;
    return {
      id: org.id,
      name: org.name,
      displayName: org.name,
      legalName: null,
      organizationType: "MANAGEMENT_COMPANY" as const,
      isActive: org.isActive ?? true,
    };
  };
  const withPeriods = (membership: Membership) => ({
    ...membership,
    organization: orgView(membership.organizationId),
    rolePeriods: periods
      .filter((period) => period.membershipId === membership.id)
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    user: users.get(membership.userId)!,
  });

  const db = {
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const org = orgs.get(where.id);
        return org ? orgView(org.id) : null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const user = where.id
          ? users.get(where.id)
          : [...users.values()].find((row) => row.email === where.email);
        return user ? { ...user } : null;
      },
      create: async ({
        data,
      }: {
        data: {
          email: string;
          displayName: string;
          passwordHash: string | null;
          facilityId: null;
          roleId: null;
          emailVerifiedAt: Date | null;
          isActive: boolean;
        };
      }) => {
        seq += 1;
        const created: User = {
          id: `u_${seq}`,
          email: data.email,
          displayName: data.displayName,
          isActive: data.isActive,
          facilityId: null,
          roleId: null,
          passwordHash: data.passwordHash,
          emailVerifiedAt: data.emailVerifiedAt,
          sessionVersion: 1,
        };
        users.set(created.id, created);
        return { id: created.id, email: created.email, displayName: created.displayName };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          passwordHash?: string;
          emailVerifiedAt?: Date;
          sessionVersion?: { increment: number };
        };
      }) => {
        const user = users.get(where.id);
        if (!user) throw new Error("missing user");
        if (data.passwordHash) user.passwordHash = data.passwordHash;
        if (data.emailVerifiedAt) user.emailVerifiedAt = data.emailVerifiedAt;
        if (data.sessionVersion?.increment) user.sessionVersion += data.sessionVersion.increment;
        return { ...user };
      },
    },
    userOrganizationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { userId_organizationId?: { userId: string; organizationId: string } };
      }) => {
        const key = where.userId_organizationId!;
        const membership = memberships.find(
          (row) => row.userId === key.userId && row.organizationId === key.organizationId,
        );
        return membership ? withPeriods(membership) : null;
      },
      findMany: async ({ where }: { where: { userId?: string; organizationId?: string } }) =>
        memberships
          .filter((row) => (where.userId ? row.userId === where.userId : true))
          .filter((row) => (where.organizationId ? row.organizationId === where.organizationId : true))
          .map((row) => withPeriods(row)),
      create: async ({
        data,
      }: {
        data: { userId: string; organizationId: string; createdByUserId: string | null };
      }) => {
        seq += 1;
        const created: Membership = {
          id: `m_${seq}`,
          userId: data.userId,
          organizationId: data.organizationId,
          createdByUserId: data.createdByUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        memberships.push(created);
        return withPeriods(created);
      },
    },
    userOrganizationRolePeriod: {
      create: async ({ data }: { data: Omit<Period, "id" | "createdAt" | "updatedAt"> }) => {
        seq += 1;
        const created: Period = { id: `rp_${seq}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        periods.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Period> }) => {
        const row = periods.find((period) => period.id === where.id);
        if (!row) throw new Error("missing period");
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: { where: { membershipId: string } }) =>
        periods.filter((period) => period.membershipId === where.membershipId),
    },
    organizationMemberInvitation: {
      create: async ({ data }: { data: Partial<Invitation> & { organizationId: string; targetEmailNormalized: string; intendedRole: Invitation["intendedRole"]; invitedByUserId: string } }) => {
        seq += 1;
        const now = new Date();
        const row: Invitation = {
          id: `inv_${seq}`,
          organizationId: data.organizationId,
          targetEmailNormalized: data.targetEmailNormalized,
          intendedRole: data.intendedRole,
          tokenHash: data.tokenHash ?? null,
          expiresAt: data.expiresAt ?? null,
          status: data.status ?? "PENDING",
          invitedByUserId: data.invitedByUserId,
          acceptedByUserId: null,
          acceptedAt: null,
          revokedByUserId: null,
          revokedAt: null,
          lastInvitationDeliveredAt: null,
          lastInvitationDeliveryStatus: null,
          lastInvitationDeliveryError: null,
          createdAt: now,
          updatedAt: now,
        };
        invitations.push(row);
        return { ...row };
      },
      findUnique: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
        const row = where.id
          ? invitations.find((invitation) => invitation.id === where.id)
          : invitations.find((invitation) => invitation.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: { organizationId: string; targetEmailNormalized: string; status: Invitation["status"] };
      }) => {
        const row = invitations.find(
          (invitation) =>
            invitation.organizationId === where.organizationId &&
            invitation.targetEmailNormalized === where.targetEmailNormalized &&
            invitation.status === where.status,
        );
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Invitation> }) => {
        const row = invitations.find((invitation) => invitation.id === where.id);
        if (!row) throw new Error("missing invitation");
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      findMany: async () => invitations.map((row) => ({ ...row })),
    },
    userFacilityAccess: {
      findFirst: async () => null,
      create: async () => {
        facilityAccessCreates += 1;
        throw new Error("Facility access must not be created by organization invitation.");
      },
    },
    partnerUserFacilityAccess: {
      findMany: async () => [],
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
    $queryRaw: async () => [{ id: "locked" }],
    _users: users,
    _memberships: memberships,
    _periods: periods,
    _invitations: invitations,
    _facilityAccessCreates: () => facilityAccessCreates,
  };
  return db;
}

function user(partial: Partial<User> & Pick<User, "id" | "email">): User {
  return {
    displayName: partial.displayName ?? partial.email,
    isActive: true,
    facilityId: null,
    roleId: null,
    passwordHash: "hash",
    emailVerifiedAt: new Date("2027-01-01T00:00:00.000Z"),
    sessionVersion: 1,
    ...partial,
  };
}

function metzFixture() {
  return makeDb({
    organizations: [
      { id: "org_metz", name: "Metz Culinary Management" },
      { id: "org_other", name: "OtherCo" },
    ],
    users: [
      user({ id: "u_john", email: "john@metz.example", displayName: "John Doe" }),
      user({
        id: "u_sarah",
        email: "sarah@facility.example",
        displayName: "Sarah Jones",
        facilityId: "fac_a",
        roleId: "role_manager",
      }),
    ],
  });
}

async function seedJohnAdmin(db: ReturnType<typeof makeDb>) {
  const { createOrganizationMembership } = await import("@/lib/organization-membership");
  await createOrganizationMembership(db as never, {
    userId: "u_john",
    organizationId: "org_metz",
    role: "ORG_ADMIN",
    startsAt: new Date("2020-01-01T00:00:00.000Z"),
  });
}

test("new organization-only user acceptance creates membership without facility access", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const invited = await inviteOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetEmail: "Jane@Example.com",
    intendedRole: "ORG_MEMBER",
  });
  const accepted = await acceptOrganizationMemberInvitation(db as never, {
    rawToken: invited.rawToken,
    displayName: "Jane Smith",
    passwordHash: "pw",
  });
  assert.equal(accepted.createdUser, true);
  const jane = db._users.get(accepted.userId);
  assert.ok(jane);
  assert.equal(jane?.email, "jane@example.com");
  assert.equal(jane?.facilityId, null);
  assert.equal(jane?.roleId, null);
  const membership = db._memberships.find((row) => row.userId === jane?.id);
  assert.ok(membership);
  const period = db._periods.find((row) => row.membershipId === membership?.id && row.endsAt == null);
  assert.equal(period?.role, "ORG_MEMBER");
  const invitation = db._invitations.find((row) => row.id === invited.invitation.id);
  assert.equal(invitation?.status, "ACCEPTED");
  assert.equal(invitation?.tokenHash, null);
  assert.equal(await findAcceptableMemberInvitationByRawToken(db as never, invited.rawToken), null);
  assert.equal(db._facilityAccessCreates(), 0);
  assert.equal(organizationMembershipGrantsFacilityAccess(), false);
  assert.equal(await userHasActiveFacilityAccess(db as never, jane!.id, "fac_terrace"), false);
  await assert.rejects(
    () => acceptOrganizationMemberInvitation(db as never, { rawToken: invited.rawToken }),
    (error: unknown) => error instanceof OrganizationMemberInvitationError && error.code === "TOKEN_INVALID",
  );
});

test("existing facility-native user keeps home facility and role", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const beforeId = "u_sarah";
  const invited = await inviteOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetEmail: "sarah@facility.example",
    intendedRole: "ORG_MEMBER",
  });
  const accepted = await acceptOrganizationMemberInvitation(db as never, {
    rawToken: invited.rawToken,
    authenticatedUserId: beforeId,
  });
  assert.equal(accepted.createdUser, false);
  assert.equal(accepted.userId, beforeId);
  assert.equal(db._users.get(beforeId)?.facilityId, "fac_a");
  assert.equal(db._users.get(beforeId)?.roleId, "role_manager");
  assert.equal(db._memberships.filter((row) => row.userId === beforeId).length, 1);
  assert.equal(
    db._periods.find((row) => row.endsAt == null && row.membershipId !== db._memberships[0]?.id)?.role,
    "ORG_MEMBER",
  );
  assert.equal(await userHasActiveFacilityAccess(db as never, beforeId, "fac_terrace"), false);
});

test("former member rejoin reuses durable membership and preserves history", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const { createOrganizationMembership } = await import("@/lib/organization-membership");
  await createOrganizationMembership(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
    startsAt: new Date("2027-02-01T00:00:00.000Z"),
  });
  await endOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetUserId: "u_sarah",
    now: new Date("2027-03-01T00:00:00.000Z"),
  });
  const durableId = db._memberships.find((row) => row.userId === "u_sarah")?.id;
  const invited = await inviteOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetEmail: "sarah@facility.example",
    intendedRole: "ORG_ADMIN",
    now: new Date("2027-04-01T00:00:00.000Z"),
  });
  await acceptOrganizationMemberInvitation(db as never, {
    rawToken: invited.rawToken,
    authenticatedUserId: "u_sarah",
    now: new Date("2027-04-02T00:00:00.000Z"),
  });
  assert.equal(db._memberships.filter((row) => row.userId === "u_sarah").length, 1);
  assert.equal(db._memberships.find((row) => row.userId === "u_sarah")?.id, durableId);
  const oldRole = await getOrganizationMembershipAt(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    at: new Date("2027-02-15T00:00:00.000Z"),
  });
  const gap = await getOrganizationMembershipAt(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    at: new Date("2027-03-15T00:00:00.000Z"),
  });
  const rejoined = await getOrganizationMembershipAt(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    at: new Date("2027-04-15T00:00:00.000Z"),
  });
  assert.equal(oldRole?.currentRole, "ORG_MEMBER");
  assert.equal(gap?.currentRole, null);
  assert.equal(rejoined?.currentRole, "ORG_ADMIN");
  assert.equal(db._users.get("u_sarah")?.facilityId, "fac_a");
});

test("current member invitations do not overlap or silently change role", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const { createOrganizationMembership } = await import("@/lib/organization-membership");
  await createOrganizationMembership(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
  });
  const periodsBefore = db._periods.length;
  await assert.rejects(
    () =>
      inviteOrganizationMember(db as never, {
        organizationId: "org_metz",
        actorUserId: "u_john",
        targetEmail: "sarah@facility.example",
        intendedRole: "ORG_MEMBER",
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError && error.code === "ALREADY_CURRENT_MEMBER",
  );
  await assert.rejects(
    () =>
      inviteOrganizationMember(db as never, {
        organizationId: "org_metz",
        actorUserId: "u_john",
        targetEmail: "sarah@facility.example",
        intendedRole: "ORG_ADMIN",
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError &&
      error.code === "ROLE_CHANGE_REQUIRES_ADMIN_ACTION",
  );
  assert.equal(db._periods.length, periodsBefore);
  assert.equal(db._invitations.length, 0);
});

test("metz administrator cannot administer another organization", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  await assert.rejects(
    () =>
      inviteOrganizationMember(db as never, {
        organizationId: "org_other",
        actorUserId: "u_john",
        targetEmail: "jane@example.com",
        intendedRole: "ORG_MEMBER",
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError && error.code === "NOT_ORG_ADMIN",
  );
  await assert.rejects(
    () =>
      changeOrganizationMemberRole(db as never, {
        organizationId: "org_other",
        actorUserId: "u_john",
        targetUserId: "u_sarah",
        role: "ORG_ADMIN",
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError && error.code === "NOT_ORG_ADMIN",
  );
  assert.equal(db._memberships.every((row) => row.organizationId === "org_metz"), true);
});

test("acceptance service enforces token lifecycle and email binding", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const invited = await inviteOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetEmail: "newperson@example.com",
    intendedRole: "ORG_MEMBER",
  });
  await assert.rejects(
    () => acceptOrganizationMemberInvitation(db as never, { rawToken: "not-a-real-token-value-xxxx" }),
    (error: unknown) => error instanceof OrganizationMemberInvitationError && error.code === "TOKEN_INVALID",
  );

  const resent = await resendOrganizationMemberInvitation(db as never, {
    invitationId: invited.invitation.id,
    actorUserId: "u_john",
  });
  assert.notEqual(invited.rawToken, resent.rawToken);
  assert.equal(await findAcceptableMemberInvitationByRawToken(db as never, invited.rawToken), null);
  assert.equal(
    hashOrganizationMemberInvitationToken(resent.rawToken),
    db._invitations[0]?.tokenHash,
  );

  const stored = db._invitations[0]!;
  stored.expiresAt = new Date("2020-01-01T00:00:00.000Z");
  await assert.rejects(
    () =>
      acceptOrganizationMemberInvitation(db as never, {
        rawToken: resent.rawToken,
        now: new Date("2027-01-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError && error.code === "INVITATION_EXPIRED",
  );
  stored.expiresAt = new Date("2028-01-01T00:00:00.000Z");

  await revokeOrganizationMemberInvitation(db as never, {
    invitationId: invited.invitation.id,
    actorUserId: "u_john",
  });
  await assert.rejects(
    () => acceptOrganizationMemberInvitation(db as never, { rawToken: resent.rawToken }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError &&
      (error.code === "INVITATION_REVOKED" || error.code === "TOKEN_INVALID"),
  );

  const again = await inviteOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetEmail: "newperson@example.com",
    intendedRole: "ORG_MEMBER",
  });
  db._users.set(
    "u_other",
    user({ id: "u_other", email: "other@example.com", displayName: "Other" }),
  );
  await assert.rejects(
    () =>
      acceptOrganizationMemberInvitation(db as never, {
        rawToken: again.rawToken,
        authenticatedUserId: "u_other",
      }),
    (error: unknown) =>
      error instanceof OrganizationMemberInvitationError && error.code === "EMAIL_MISMATCH",
  );
  const ok = await acceptOrganizationMemberInvitation(db as never, {
    rawToken: again.rawToken,
    displayName: "New Person",
    passwordHash: "pw",
  });
  assert.equal(db._users.get(ok.userId)?.email, "newperson@example.com");
});

test("role change and membership end increment sessionVersion", async () => {
  const db = metzFixture();
  await seedJohnAdmin(db);
  const { createOrganizationMembership } = await import("@/lib/organization-membership");
  await createOrganizationMembership(db as never, {
    userId: "u_sarah",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
  });
  const before = db._users.get("u_sarah")?.sessionVersion;
  await changeOrganizationMemberRole(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetUserId: "u_sarah",
    role: "ORG_ADMIN",
  });
  assert.equal(db._users.get("u_sarah")?.sessionVersion, (before ?? 0) + 1);
  await endOrganizationMember(db as never, {
    organizationId: "org_metz",
    actorUserId: "u_john",
    targetUserId: "u_sarah",
  });
  assert.equal(db._users.get("u_sarah")?.sessionVersion, (before ?? 0) + 2);
  assert.equal(db._users.get("u_sarah")?.facilityId, "fac_a");
});
