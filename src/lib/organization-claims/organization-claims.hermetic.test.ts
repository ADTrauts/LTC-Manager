import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { organizationMembershipGrantsFacilityAccess } from "@/lib/organization-membership";
import { phase2aGrantsNoUserFacilityAccess } from "@/lib/partner-access";

import {
  acceptOrganizationClaim,
  approveOrganizationClaim,
  canRequestOrganizationClaim,
  findClaimableInvitationByRawToken,
  getOrganizationClaimState,
  hashOrganizationClaimToken,
  OrganizationClaimError,
  rejectOrganizationClaim,
  requestOrganizationClaim,
  revokeOrganizationClaim,
} from "./index";
import {
  deriveInvitationDisplayStatus,
  deriveOrganizationClaimDisplayState,
  isClaimableInvitation,
} from "./state";

test("claim display state: unclaimed / pending / administrable", () => {
  assert.equal(
    deriveOrganizationClaimDisplayState({ currentOrgAdminCount: 0, openClaims: [] }),
    "UNCLAIMED",
  );
  assert.equal(
    deriveOrganizationClaimDisplayState({
      currentOrgAdminCount: 0,
      openClaims: [
        {
          status: "REQUESTED",
          expiresAt: null,
          acceptedAt: null,
          revokedAt: null,
        },
      ],
    }),
    "CLAIM_PENDING",
  );
  assert.equal(
    deriveOrganizationClaimDisplayState({
      currentOrgAdminCount: 1,
      openClaims: [
        {
          status: "REQUESTED",
          expiresAt: null,
          acceptedAt: null,
          revokedAt: null,
        },
      ],
    }),
    "ADMINISTRABLE",
  );
});

test("expired approved claim is derived EXPIRED and not live pending", () => {
  const now = new Date("2027-06-01T00:00:00.000Z");
  const expired = {
    status: "APPROVED" as const,
    expiresAt: new Date("2027-05-01T00:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
  };
  assert.equal(deriveInvitationDisplayStatus(expired, now), "EXPIRED");
  assert.equal(isClaimableInvitation(expired, now), false);
  assert.equal(
    deriveOrganizationClaimDisplayState({
      currentOrgAdminCount: 0,
      openClaims: [expired],
      now,
    }),
    "UNCLAIMED",
  );
});

test("historical rejected claim does not imply pending", () => {
  assert.equal(
    deriveOrganizationClaimDisplayState({
      currentOrgAdminCount: 0,
      openClaims: [],
    }),
    "UNCLAIMED",
  );
});

type Org = { id: string; name: string; isActive?: boolean };
type User = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  facilityId: string | null;
  roleId: string | null;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
};
type Partnership = {
  id: string;
  facilityId: string;
  organizationId: string;
  endedAt: Date | null;
  accessPeriods: Array<{ startsAt: Date; endsAt: Date | null }>;
};
type Claim = {
  id: string;
  organizationId: string;
  targetEmailNormalized: string;
  contactName: string | null;
  notes: string | null;
  tokenHash: string | null;
  expiresAt: Date | null;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "REVOKED" | "ACCEPTED";
  requestedByUserId: string | null;
  requestedFromFacilityId: string | null;
  approvedByPlatformStaffId: string | null;
  approvedAt: Date | null;
  rejectedByPlatformStaffId: string | null;
  rejectedAt: Date | null;
  revokedByPlatformStaffId: string | null;
  revokedAt: Date | null;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type RolePeriod = {
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

function makeDb(state: {
  organizations: Org[];
  users: User[];
  partnerships: Partnership[];
}) {
  let seq = 0;
  const claims: Claim[] = [];
  const memberships: Membership[] = [];
  const periods: RolePeriod[] = [];
  const orgById = new Map(state.organizations.map((o) => [o.id, o]));
  const userById = new Map(state.users.map((u) => [u.id, u]));
  const partnerships = state.partnerships.slice();

  const includeMembership = (m: Membership) => ({
    ...m,
    organization: {
      id: orgById.get(m.organizationId)!.id,
      name: orgById.get(m.organizationId)!.name,
      displayName: orgById.get(m.organizationId)!.name,
      legalName: null,
      organizationType: "MANAGEMENT_COMPANY",
      isActive: orgById.get(m.organizationId)!.isActive ?? true,
    },
    rolePeriods: periods
      .filter((p) => p.membershipId === m.id)
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    user: userById.get(m.userId)!,
  });

  const db: {
    organization: {
      findUnique: (args: { where: { id: string } }) => Promise<unknown>;
      update: (args: { where: { id: string }; data: { updatedAt: Date } }) => Promise<unknown>;
    };
    user: Record<string, unknown>;
    facilityPartnerOrganization: Record<string, unknown>;
    organizationClaimInvitation: Record<string, unknown>;
    userOrganizationMembership: Record<string, unknown>;
    userOrganizationRolePeriod: Record<string, unknown>;
    $transaction: (
      fn: (tx: unknown) => Promise<unknown>,
      _options?: unknown,
    ) => Promise<unknown>;
    _claims: Claim[];
    _users: Map<string, User>;
    _memberships: Membership[];
    _periods: RolePeriod[];
  } = {
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const o = orgById.get(where.id);
        if (!o) return null;
        return {
          id: o.id,
          name: o.name,
          displayName: o.name,
          legalName: null,
          organizationType: "MANAGEMENT_COMPANY",
          isActive: o.isActive ?? true,
        };
      },
      update: async ({ where }: { where: { id: string }; data: { updatedAt: Date } }) => {
        const o = orgById.get(where.id);
        if (!o) throw new Error("org missing");
        return { id: o.id };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          const u = userById.get(where.id);
          return u ? { ...u } : null;
        }
        if (where.email) {
          const u = [...userById.values()].find((row) => row.email === where.email);
          return u ? { ...u } : null;
        }
        return null;
      },
      create: async ({
        data,
      }: {
        data: {
          email: string;
          displayName: string;
          passwordHash?: string | null;
          facilityId: null;
          roleId: null;
          emailVerifiedAt?: Date | null;
          isActive: boolean;
        };
      }) => {
        const id = `u_${++seq}`;
        const row: User = {
          id,
          email: data.email,
          displayName: data.displayName,
          isActive: data.isActive,
          facilityId: null,
          roleId: null,
          passwordHash: data.passwordHash ?? null,
          emailVerifiedAt: data.emailVerifiedAt ?? null,
        };
        userById.set(id, row);
        return { id: row.id, email: row.email, displayName: row.displayName };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<User>;
      }) => {
        const u = userById.get(where.id)!;
        Object.assign(u, data);
        return { ...u };
      },
    },
    facilityPartnerOrganization: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_organizationId: { facilityId: string; organizationId: string } };
      }) => {
        const row = partnerships.find(
          (p) =>
            p.facilityId === where.facilityId_organizationId.facilityId &&
            p.organizationId === where.facilityId_organizationId.organizationId,
        );
        return row ? { ...row } : null;
      },
    },
    organizationClaimInvitation: {
      create: async ({ data }: { data: Partial<Claim> & { organizationId: string; targetEmailNormalized: string; status: Claim["status"] } }) => {
        const now = new Date();
        const row: Claim = {
          id: `claim_${++seq}`,
          organizationId: data.organizationId,
          targetEmailNormalized: data.targetEmailNormalized,
          contactName: data.contactName ?? null,
          notes: data.notes ?? null,
          tokenHash: data.tokenHash ?? null,
          expiresAt: data.expiresAt ?? null,
          status: data.status,
          requestedByUserId: data.requestedByUserId ?? null,
          requestedFromFacilityId: data.requestedFromFacilityId ?? null,
          approvedByPlatformStaffId: data.approvedByPlatformStaffId ?? null,
          approvedAt: data.approvedAt ?? null,
          rejectedByPlatformStaffId: data.rejectedByPlatformStaffId ?? null,
          rejectedAt: data.rejectedAt ?? null,
          revokedByPlatformStaffId: data.revokedByPlatformStaffId ?? null,
          revokedAt: data.revokedAt ?? null,
          acceptedByUserId: data.acceptedByUserId ?? null,
          acceptedAt: data.acceptedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        claims.push(row);
        return { ...row };
      },
      findUnique: async ({
        where,
      }: {
        where: { id?: string; tokenHash?: string };
      }) => {
        if (where.id) {
          const row = claims.find((c) => c.id === where.id);
          return row ? { ...row } : null;
        }
        if (where.tokenHash) {
          const row = claims.find((c) => c.tokenHash === where.tokenHash);
          return row ? { ...row } : null;
        }
        return null;
      },
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          status: Claim["status"];
          id: { not: string };
        };
      }) => {
        const row = claims.find(
          (c) =>
            c.organizationId === where.organizationId &&
            c.status === where.status &&
            c.id !== where.id.not,
        );
        return row ? { ...row } : null;
      },
      findMany: async ({
        where,
      }: {
        where: {
          organizationId?: string;
          status?: { in: Claim["status"][] } | Claim["status"];
          requestedFromFacilityId?: string;
        };
      }) => {
        return claims
          .filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.requestedFromFacilityId && c.requestedFromFacilityId !== where.requestedFromFacilityId)
              return false;
            if (where.status && typeof where.status === "object" && "in" in where.status) {
              return where.status.in.includes(c.status);
            }
            if (typeof where.status === "string") return c.status === where.status;
            return true;
          })
          .map((c) => ({ ...c }));
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Claim>;
      }) => {
        const row = claims.find((c) => c.id === where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          organizationId: string;
          status: Claim["status"];
          id: { not: string };
          acceptedAt?: null;
        };
        data: Partial<Claim>;
      }) => {
        let count = 0;
        for (const row of claims) {
          if (row.organizationId !== where.organizationId) continue;
          if (row.status !== where.status) continue;
          if (row.id === where.id.not) continue;
          if (where.acceptedAt === null && row.acceptedAt != null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    userOrganizationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; userId_organizationId?: { userId: string; organizationId: string } };
      }) => {
        const m = where.id
          ? memberships.find((row) => row.id === where.id)
          : memberships.find(
              (row) =>
                row.userId === where.userId_organizationId!.userId &&
                row.organizationId === where.userId_organizationId!.organizationId,
            );
        return m ? includeMembership(m) : null;
      },
      findMany: async ({ where }: { where: { organizationId?: string; userId?: string } }) => {
        return memberships
          .filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.userId && m.userId !== where.userId) return false;
            return true;
          })
          .map(includeMembership);
      },
      create: async ({
        data,
      }: {
        data: { userId: string; organizationId: string; createdByUserId?: string | null };
      }) => {
        const m: Membership = {
          id: `m_${++seq}`,
          userId: data.userId,
          organizationId: data.organizationId,
          createdByUserId: data.createdByUserId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        memberships.push(m);
        return includeMembership(m);
      },
    },
    userOrganizationRolePeriod: {
      create: async ({
        data,
      }: {
        data: {
          membershipId: string;
          role: "ORG_ADMIN" | "ORG_MEMBER";
          startsAt: Date;
          endsAt: Date | null;
          createdByUserId?: string | null;
        };
      }) => {
        const p: RolePeriod = {
          id: `p_${++seq}`,
          membershipId: data.membershipId,
          role: data.role,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          createdByUserId: data.createdByUserId ?? null,
          endedByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        periods.push(p);
        return { ...p };
      },
      findMany: async ({ where }: { where: { membershipId: string } }) => {
        return periods
          .filter((p) => p.membershipId === where.membershipId)
          .map((p) => ({ startsAt: p.startsAt, endsAt: p.endsAt }));
      },
      update: async () => {
        throw new Error("unused");
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, _options?: unknown) => fn(db),
    _claims: claims,
    _users: userById,
    _memberships: memberships,
    _periods: periods,
  };

  return db;
}

test("FA may request claim for own Facility partner; unrelated org denied", async () => {
  const db = makeDb({
    organizations: [
      { id: "org_metz", name: "Metz" },
      { id: "org_other", name: "Other" },
    ],
    users: [
      {
        id: "u_fa",
        email: "fa@terrace.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "role_fa",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  const ok = await canRequestOrganizationClaim(db as never, {
    facilityId: "fac_tv",
    organizationId: "org_metz",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(ok.ok, true);

  const denied = await canRequestOrganizationClaim(db as never, {
    facilityId: "fac_tv",
    organizationId: "org_other",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "PARTNERSHIP_REQUIRED");

  const claim = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "John@Metz.Example",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(claim.status, "REQUESTED");
  assert.equal(claim.targetEmailNormalized, "john@metz.example");
  assert.equal((db as { _claims: Claim[] })._claims[0]!.tokenHash, null);

  const state = await getOrganizationClaimState(db as never, {
    organizationId: "org_metz",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(state.displayState, "CLAIM_PENDING");
});

test("ended partnership cannot initiate claim", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: new Date("2027-01-15T00:00:00.000Z"),
        accessPeriods: [
          {
            startsAt: new Date("2027-01-01T00:00:00.000Z"),
            endsAt: new Date("2027-01-15T00:00:00.000Z"),
          },
        ],
      },
    ],
  });
  const result = await canRequestOrganizationClaim(db as never, {
    facilityId: "fac_tv",
    organizationId: "org_metz",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PARTNERSHIP_ENDED");
});

test("inactive organization cannot receive claim request", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz", isActive: false }],
    users: [],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });
  const result = await canRequestOrganizationClaim(db as never, {
    facilityId: "fac_tv",
    organizationId: "org_metz",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ORGANIZATION_INACTIVE");
});

test("Harbor approve creates token hash only; reject creates no token; revoke invalidates", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  const requested = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "jane@metz.example",
  });

  const approved = await approveOrganizationClaim(db as never, {
    claimId: requested.id,
    platformStaffId: "staff_1",
  });
  assert.equal(approved.claim.status, "APPROVED");
  assert.ok(approved.rawToken.length >= 20);
  const stored = (db as { _claims: Claim[] })._claims.find((c) => c.id === requested.id)!;
  assert.equal(stored.tokenHash, hashOrganizationClaimToken(approved.rawToken));
  assert.notEqual(stored.tokenHash, approved.rawToken);
  assert.ok(!JSON.stringify(stored).includes(approved.rawToken));

  const rejected = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "other@metz.example",
  });
  // Competing approve blocked while first remains claimable.
  await assert.rejects(
    () =>
      approveOrganizationClaim(db as never, {
        claimId: rejected.id,
        platformStaffId: "staff_1",
      }),
    (error: unknown) =>
      error instanceof OrganizationClaimError && error.code === "APPROVED_CLAIM_EXISTS",
  );

  await revokeOrganizationClaim(db as never, {
    claimId: requested.id,
    platformStaffId: "staff_1",
  });
  assert.equal(
    await findClaimableInvitationByRawToken(db as never, approved.rawToken),
    null,
  );

  const rejectedOnly = await rejectOrganizationClaim(db as never, {
    claimId: rejected.id,
    platformStaffId: "staff_1",
  });
  assert.equal(rejectedOnly.status, "REJECTED");
  assert.equal(
    (db as { _claims: Claim[] })._claims.find((c) => c.id === rejected.id)!.tokenHash,
    null,
  );
});

test("accept existing User links membership without rewriting home Facility", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
      {
        id: "u_jane",
        email: "jane@metz.example",
        displayName: "Jane",
        isActive: true,
        facilityId: "fac_a",
        roleId: "role_mgr",
        passwordHash: "hash",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  const requested = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "jane@metz.example",
  });
  const { rawToken } = await approveOrganizationClaim(db as never, {
    claimId: requested.id,
    platformStaffId: "staff_1",
  });

  const accepted = await acceptOrganizationClaim(db as never, {
    rawToken,
    authenticatedUserId: "u_jane",
  });
  assert.equal(accepted.userId, "u_jane");
  assert.equal(accepted.createdUser, false);
  const jane = (db as { _users: Map<string, User> })._users.get("u_jane")!;
  assert.equal(jane.facilityId, "fac_a");
  assert.equal(jane.roleId, "role_mgr");
  const periods = (db as { _periods: RolePeriod[] })._periods;
  assert.equal(periods.length, 1);
  assert.equal(periods[0]!.role, "ORG_ADMIN");

  await assert.rejects(
    () => acceptOrganizationClaim(db as never, { rawToken, authenticatedUserId: "u_jane" }),
    (error: unknown) =>
      error instanceof OrganizationClaimError &&
      (error.code === "CLAIM_ALREADY_ACCEPTED" || error.code === "TOKEN_INVALID"),
  );
});

test("accept new org-only User creates null facility/role and ORG_ADMIN", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  const requested = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "john@metz.example",
    contactName: "John Doe",
  });
  const { rawToken } = await approveOrganizationClaim(db as never, {
    claimId: requested.id,
    platformStaffId: "staff_1",
  });

  const accepted = await acceptOrganizationClaim(db as never, {
    rawToken,
    passwordHash: "hashed-password",
    displayName: "John Doe",
  });
  assert.equal(accepted.createdUser, true);
  const user = (db as { _users: Map<string, User> })._users.get(accepted.userId)!;
  assert.equal(user.facilityId, null);
  assert.equal(user.roleId, null);
  assert.equal(user.email, "john@metz.example");
  assert.ok(user.emailVerifiedAt);
  assert.equal((db as { _periods: RolePeriod[] })._periods[0]!.role, "ORG_ADMIN");

  const state = await getOrganizationClaimState(db as never, { organizationId: "org_metz" });
  assert.equal(state.displayState, "ADMINISTRABLE");
  assert.equal(state.currentOrgAdminCount, 1);
});

test("stale second acceptance cannot create another first admin", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
      {
        id: "u_john",
        email: "john@metz.example",
        displayName: "John",
        isActive: true,
        facilityId: null,
        roleId: null,
        passwordHash: "h1",
      },
      {
        id: "u_jane",
        email: "jane@metz.example",
        displayName: "Jane",
        isActive: true,
        facilityId: null,
        roleId: null,
        passwordHash: "h2",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  const r1 = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "john@metz.example",
  });
  const { rawToken: token1 } = await approveOrganizationClaim(db as never, {
    claimId: r1.id,
    platformStaffId: "staff_1",
  });

  // Force a second APPROVED claim to simulate a race/stale approval.
  const r2 = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "jane@metz.example",
  });
  const mintedHash = hashOrganizationClaimToken("stale-token-aaaaaaaaaaaaaaaaaaaa");
  await (
    db.organizationClaimInvitation as {
      update: (args: {
        where: { id: string };
        data: Partial<Claim>;
      }) => Promise<Claim>;
    }
  ).update({
    where: { id: r2.id },
    data: {
      status: "APPROVED",
      tokenHash: mintedHash,
      expiresAt: new Date(Date.now() + 86400000),
      approvedAt: new Date(),
      approvedByPlatformStaffId: "staff_1",
    },
  });

  await acceptOrganizationClaim(db as never, {
    rawToken: token1,
    authenticatedUserId: "u_john",
  });

  await assert.rejects(
    () =>
      acceptOrganizationClaim(db as never, {
        rawToken: "stale-token-aaaaaaaaaaaaaaaaaaaa",
        authenticatedUserId: "u_jane",
      }),
    (error: unknown) =>
      error instanceof OrganizationClaimError &&
      (error.code === "ALREADY_ADMINISTRABLE" || error.code === "CLAIM_REVOKED"),
  );

  assert.equal((db as { _periods: RolePeriod[] })._periods.length, 1);
  assert.equal(
    (db as { _memberships: Membership[] })._memberships.filter((m) => m.organizationId === "org_metz")
      .length,
    1,
  );
});

test("email mismatch and wrong token denied", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
      {
        id: "u_other",
        email: "other@example.com",
        displayName: "Other",
        isActive: true,
        facilityId: null,
        roleId: null,
        passwordHash: "h",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });
  const requested = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "john@metz.example",
  });
  const { rawToken } = await approveOrganizationClaim(db as never, {
    claimId: requested.id,
    platformStaffId: "staff_1",
  });

  assert.equal(await findClaimableInvitationByRawToken(db as never, "wrong-token-bbbbbbbbbbbbbbbbbb"), null);

  await assert.rejects(
    () =>
      acceptOrganizationClaim(db as never, {
        rawToken,
        authenticatedUserId: "u_other",
      }),
    (error: unknown) =>
      error instanceof OrganizationClaimError && error.code === "EMAIL_MISMATCH",
  );
});

test("Organization with existing ORG_ADMIN cannot receive first-admin approval", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_fa",
        email: "fa@tv.example",
        displayName: "FA",
        isActive: true,
        facilityId: "fac_tv",
        roleId: "r1",
      },
      {
        id: "u_admin",
        email: "admin@metz.example",
        displayName: "Admin",
        isActive: true,
        facilityId: null,
        roleId: null,
        passwordHash: "h",
      },
    ],
    partnerships: [
      {
        id: "p1",
        facilityId: "fac_tv",
        organizationId: "org_metz",
        endedAt: null,
        accessPeriods: [{ startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null }],
      },
    ],
  });

  // Seed membership via accept path once.
  const first = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "admin@metz.example",
  });
  const { rawToken } = await approveOrganizationClaim(db as never, {
    claimId: first.id,
    platformStaffId: "staff_1",
  });
  await acceptOrganizationClaim(db as never, {
    rawToken,
    authenticatedUserId: "u_admin",
  });

  const second = await requestOrganizationClaim(db as never, {
    organizationId: "org_metz",
    facilityId: "fac_tv",
    requestedByUserId: "u_fa",
    targetEmail: "new@metz.example",
  }).catch((error: unknown) => error);
  // Request itself should fail once administrable.
  assert.ok(second instanceof OrganizationClaimError);
  assert.equal(second.code, "ALREADY_ADMINISTRABLE");
});

test("facility isolation contract: claim/membership grant zero Facility access", () => {
  assert.equal(organizationMembershipGrantsFacilityAccess(), false);
  assert.equal(phase2aGrantsNoUserFacilityAccess(), true);
  const service = readFileSync(
    join(process.cwd(), "src/lib/organization-claims/service.ts"),
    "utf8",
  );
  assert.doesNotMatch(service, /grantUserFacilityAccess|UserFacilityAccess|PartnerUserFacilityAccess/);
  assert.doesNotMatch(service, /DepartmentOperatorRelationship/);
  assert.match(service, /revokeSessions:\s*false/);
});

test("claim routes and docs exist without Phase 2B3 invitation surfaces", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/partners/[partnershipId]/page.tsx"),
    "utf8",
  );
  assert.match(page, /Organization administration/);
  assert.match(page, /cannot approve/);
  assert.doesNotMatch(page, /Invite member|ORG_MEMBER invitation/i);

  const harbor = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/organization-claims/page.tsx"),
    "utf8",
  );
  assert.match(harbor, /Organization Claims/);
  assert.match(harbor, /requireHarborStaff/);

  const accept = readFileSync(
    join(process.cwd(), "src/app/organization/claim/[token]/page.tsx"),
    "utf8",
  );
  assert.match(accept, /findClaimableInvitationByRawToken/);
  assert.doesNotMatch(accept, /facilityId:\s*session/);
});
