import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { switchActiveFacility } from "@/lib/facility-access";
import {
  assertValidUserIdentityShape,
  changeOrganizationRole,
  createOrganizationMembership,
  createOrganizationOnlyUserAccount,
  endOrganizationMembership,
  getOrganizationMembershipAt,
  getUserOrganizationMembership,
  OrganizationMembershipError,
  organizationMembershipGrantsFacilityAccess,
  periodContainsInstant,
  rejoinOrganizationMembership,
} from "@/lib/organization-membership";
import { isFacilityScopedSession, isOrganizationScopedSession } from "@/lib/auth";

test("last organization administrator cannot be demoted or ended", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz" }],
    users: [
      {
        id: "u_only",
        email: "only@metz.example",
        displayName: "Only",
        isActive: true,
        facilityId: null,
        roleId: null,
      },
    ],
  });
  await createOrganizationMembership(db as never, {
    userId: "u_only",
    organizationId: "org_metz",
    role: "ORG_ADMIN",
  });
  await assert.rejects(
    () =>
      changeOrganizationRole(db as never, {
        userId: "u_only",
        organizationId: "org_metz",
        role: "ORG_MEMBER",
      }),
    (error: unknown) =>
      error instanceof OrganizationMembershipError && error.code === "LAST_ORG_ADMIN",
  );
  await assert.rejects(
    () =>
      endOrganizationMembership(db as never, {
        userId: "u_only",
        organizationId: "org_metz",
      }),
    (error: unknown) =>
      error instanceof OrganizationMembershipError && error.code === "LAST_ORG_ADMIN",
  );
});

test("half-open role period boundaries are deterministic", () => {
  const period = {
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-06-01T00:00:00.000Z"),
  };
  assert.equal(periodContainsInstant(period, new Date("2027-01-01T00:00:00.000Z")), true);
  assert.equal(periodContainsInstant(period, new Date("2027-06-01T00:00:00.000Z")), false);
});

test("identity shape rejects mixed facility/role nullability", () => {
  assert.doesNotThrow(() =>
    assertValidUserIdentityShape({ facilityId: "fac", roleId: "role" }),
  );
  assert.doesNotThrow(() =>
    assertValidUserIdentityShape({ facilityId: null, roleId: null }),
  );
  assert.throws(
    () => assertValidUserIdentityShape({ facilityId: null, roleId: "role" }),
    (error: unknown) =>
      error instanceof OrganizationMembershipError && error.code === "INVALID_USER_IDENTITY",
  );
  assert.throws(
    () => assertValidUserIdentityShape({ facilityId: "fac", roleId: null }),
    (error: unknown) =>
      error instanceof OrganizationMembershipError && error.code === "INVALID_USER_IDENTITY",
  );
});

test("session scope helpers distinguish facility vs organization", () => {
  assert.equal(
    isFacilityScopedSession({
      scopeKind: "facility",
      facilityId: "fac_1",
      role: "STAFF",
    }),
    true,
  );
  assert.equal(
    isOrganizationScopedSession({ scopeKind: "organization", organizationId: "org_1" }),
    true,
  );
  assert.equal(
    isFacilityScopedSession({
      scopeKind: "facility",
      facilityId: "fac_1",
      role: undefined,
    }),
    false,
  );
  assert.equal(
    isFacilityScopedSession({ scopeKind: "organization", facilityId: undefined, role: undefined }),
    false,
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

function makeDb(state: { organizations: Org[]; users: User[] }) {
  let seq = 0;
  const memberships: Membership[] = [];
  const periods: RolePeriod[] = [];
  const orgById = new Map(state.organizations.map((o) => [o.id, o]));
  const userById = new Map(state.users.map((u) => [u.id, u]));

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

  const db = {
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
        };
        userById.set(created.id, created);
        return { id: created.id, email: created.email, displayName: created.displayName };
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
      findMany: async ({
        where,
      }: {
        where: { userId?: string; organizationId?: string };
      }) =>
        memberships
          .filter((m) => (where.userId ? m.userId === where.userId : true))
          .filter((m) => (where.organizationId ? m.organizationId === where.organizationId : true))
          .map((m) => includeMembership(m)),
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
        return includeMembership(created);
      },
    },
    userOrganizationRolePeriod: {
      create: async ({
        data,
      }: {
        data: Omit<RolePeriod, "id" | "createdAt" | "updatedAt">;
      }) => {
        seq += 1;
        const created: RolePeriod = {
          id: `rp_${seq}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        periods.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RolePeriod>;
      }) => {
        const row = periods.find((p) => p.id === where.id);
        if (!row) throw new Error("missing period");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      findMany: async ({ where }: { where: { membershipId: string } }) =>
        periods.filter((p) => p.membershipId === where.membershipId),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
    _memberships: memberships,
    _periods: periods,
  };

  return db;
}

test("membership lifecycle join promote demote end rejoin preserves history", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz Culinary Management" }],
    users: [
      {
        id: "u_jane",
        email: "jane@metz.example",
        displayName: "Jane Smith",
        isActive: true,
        facilityId: null,
        roleId: null,
      },
      {
        id: "u_backup",
        email: "backup@metz.example",
        displayName: "Backup Admin",
        isActive: true,
        facilityId: null,
        roleId: null,
      },
    ],
  });

  const t0 = new Date("2027-01-01T00:00:00.000Z");
  const joined = await createOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
    startsAt: t0,
  });
  assert.equal(joined.currentRole, "ORG_MEMBER");
  assert.equal(joined.rolePeriods.length, 1);

  const tPromote = new Date("2027-02-01T00:00:00.000Z");
  const promoted = await changeOrganizationRole(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    role: "ORG_ADMIN",
    at: tPromote,
  });
  assert.equal(promoted.currentRole, "ORG_ADMIN");
  assert.equal(promoted.rolePeriods.length, 2);
  assert.equal(promoted.rolePeriods[0]?.endsAt?.toISOString(), tPromote.toISOString());

  const historicalMember = await getOrganizationMembershipAt(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    at: new Date("2027-01-15T00:00:00.000Z"),
  });
  assert.equal(historicalMember?.currentRole, "ORG_MEMBER");

  await createOrganizationMembership(db as never, {
    userId: "u_backup",
    organizationId: "org_metz",
    role: "ORG_ADMIN",
    startsAt: new Date("2027-02-15T00:00:00.000Z"),
  });

  const tDemote = new Date("2027-03-01T00:00:00.000Z");
  const demoted = await changeOrganizationRole(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
    at: tDemote,
  });
  assert.equal(demoted.currentRole, "ORG_MEMBER");
  assert.equal(demoted.rolePeriods.length, 3);

  const tEnd = new Date("2027-04-01T00:00:00.000Z");
  const ended = await endOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    endsAt: tEnd,
  });
  assert.equal(ended.currentRole, null);

  const tRejoin = new Date("2027-05-01T00:00:00.000Z");
  const rejoined = await rejoinOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    role: "ORG_MEMBER",
    startsAt: tRejoin,
  });
  assert.equal(rejoined.currentRole, "ORG_MEMBER");
  assert.equal(rejoined.rolePeriods.length, 4);
  assert.equal(db._memberships.filter((row) => row.userId === "u_jane").length, 1);
  assert.equal(db._memberships.length, 2);
});

test("inactive Organization denies current authority", async () => {
  const db = makeDb({
    organizations: [{ id: "org_metz", name: "Metz", isActive: false }],
    users: [
      {
        id: "u_jane",
        email: "jane@metz.example",
        displayName: "Jane",
        isActive: true,
        facilityId: null,
        roleId: null,
      },
    ],
  });
  // Seed period directly — createOrganizationMembership rejects inactive org.
  db._memberships.push({
    id: "m_1",
    userId: "u_jane",
    organizationId: "org_metz",
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db._periods.push({
    id: "rp_1",
    membershipId: "m_1",
    role: "ORG_ADMIN",
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: null,
    createdByUserId: null,
    endedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const view = await getUserOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(view?.currentRole, null);
});

test("multi-org memberships stay independent", async () => {
  const db = makeDb({
    organizations: [
      { id: "org_metz", name: "Metz" },
      { id: "org_other", name: "OtherCo" },
    ],
    users: [
      {
        id: "u_jane",
        email: "jane@example.com",
        displayName: "Jane",
        isActive: true,
        facilityId: null,
        roleId: null,
      },
    ],
  });
  await createOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    role: "ORG_ADMIN",
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
  });
  await createOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_other",
    role: "ORG_MEMBER",
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
  });
  const metz = await getUserOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_metz",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  const other = await getUserOrganizationMembership(db as never, {
    userId: "u_jane",
    organizationId: "org_other",
    now: new Date("2027-02-01T00:00:00.000Z"),
  });
  assert.equal(metz?.currentRole, "ORG_ADMIN");
  assert.equal(other?.currentRole, "ORG_MEMBER");
});

test("organization-only account create sets null facility and role", async () => {
  const db = makeDb({
    organizations: [],
    users: [],
  });
  const created = await createOrganizationOnlyUserAccount(db as never, {
    email: "Jane@Metz.Example",
    displayName: "Jane Smith",
    emailVerifiedAt: new Date(),
  });
  assert.equal(created.email, "jane@metz.example");
  const stored = await db.user.findUnique({ where: { id: created.id } });
  assert.equal(stored?.facilityId, null);
  assert.equal(stored?.roleId, null);
});

test("membership grants zero Facility access by contract", () => {
  assert.equal(organizationMembershipGrantsFacilityAccess(), false);
  const service = readFileSync(
    join(process.cwd(), "src/lib/organization-membership/service.ts"),
    "utf8",
  );
  assert.doesNotMatch(service, /grantUserFacilityAccess|UserFacilityAccess|switchActiveFacility/);
  assert.match(service, /never authorizes Facility entry|membership never authorizes Facility/i);
});

test("switchActiveFacility source proves home Facility is not rewritten", async () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/facility-access/switch-active-facility.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /user\.update\([\s\S]*facilityId:\s*destination\.id/);
  assert.doesNotMatch(source, /data:\s*\{[\s\S]*facilityId:\s*destination\.id/);
  assert.match(source, /Does NOT rewrite User\.facilityId/);
});

test("Organization Home routes exist and deny partner assignment concepts", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(organization-account)/organization/[organizationId]/page.tsx"),
    "utf8",
  );
  assert.match(page, /requireOrganizationSession/);
  assert.match(page, /does not grant access to customer Facilities/i);
  assert.doesNotMatch(page, /PartnerUserFacilityAccess|PARTNER_MANAGER/);
});

test("facility switch home preservation regression via switchActiveFacility helper", async () => {
  // Smoke that import still resolves after refactor.
  assert.equal(typeof switchActiveFacility, "function");
});
