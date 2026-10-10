import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OrganizationPartnerRole, RoleKey } from "@prisma/client";

import { listAvailableContexts } from "@/lib/available-contexts";
import { isAccountSession, verifySessionToken } from "@/lib/auth";
import { ContextEntryError, enterContext } from "@/lib/context-entry";

import { routeAuthenticatedUser } from "./route";
import { PostAuthRoutingError } from "./types";

process.env.AUTH_SECRET ??= "post-auth-routing-secret";

function at(iso: string): Date {
  return new Date(iso);
}

const NOW = at("2026-10-10T12:00:00.000Z");

type Org = {
  id: string;
  name: string;
  displayName: string | null;
  isActive: boolean;
};

type User = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  facilityId: string | null;
  roleId: string | null;
  sessionVersion: number;
};

type Facility = {
  id: string;
  displayName: string;
  organizationId: string;
};

type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  createdAt: Date;
  rolePeriods: Array<{
    id: string;
    role: "ORG_ADMIN" | "ORG_MEMBER";
    startsAt: Date;
    endsAt: Date | null;
  }>;
};

type Grant = {
  id: string;
  userId: string;
  facilityId: string;
  isActive: boolean;
  revokedAt: Date | null;
  grantedAt: Date;
  rolePeriods: Array<{ id: string; roleKey: RoleKey; startsAt: Date; endsAt: Date | null }>;
};

type Partnership = {
  id: string;
  facilityId: string;
  organizationId: string;
  endedAt: Date | null;
};

function createWorld() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const users: User[] = [];
  const organizations: Org[] = [];
  const facilities: Facility[] = [];
  const memberships: Membership[] = [];
  const grants: Grant[] = [];
  const roles: Array<{ key: RoleKey; isActive: boolean }> = [
    { key: "FACILITY_ADMINISTRATOR", isActive: true },
    { key: "GM", isActive: true },
    { key: "MANAGER", isActive: true },
    { key: "SUPERVISOR", isActive: true },
    { key: "LEAD_TEAM_MEMBER", isActive: true },
    { key: "STAFF", isActive: true },
  ];
  const partnerships: Partnership[] = [];
  const accessPeriods: Array<{
    facilityPartnerOrganizationId: string;
    startsAt: Date;
    endsAt: Date | null;
  }> = [];
  const ceilings: Array<{
    facilityPartnerOrganizationId: string;
    maxPartnerRole: OrganizationPartnerRole;
    startsAt: Date;
    endsAt: Date | null;
  }> = [];
  const departments: Array<{ id: string; facilityId: string; name: string; isActive: boolean }> = [];
  const scopes: Array<{
    facilityPartnerOrganizationId: string;
    departmentId: string;
    startsAt: Date;
    endsAt: Date | null;
  }> = [];
  const assignments: Array<{
    id: string;
    userId: string;
    facilityPartnerOrganizationId: string;
  }> = [];
  const partnerRoles: Array<{
    partnerUserFacilityAccessId: string;
    partnerRole: OrganizationPartnerRole;
    startsAt: Date;
    endsAt: Date | null;
  }> = [];
  const restrictions: Array<{
    userId: string;
    facilityPartnerOrganizationId: string;
    startsAt: Date;
    endsAt: Date | null;
  }> = [];
  const queryCounts = {
    user: 0,
    memberships: 0,
    grants: 0,
    partnerAssignments: 0,
    pathB: 0,
  };

  function orgOf(id: string): Org {
    const row = organizations.find((item) => item.id === id);
    if (!row) throw new Error(`missing org ${id}`);
    return row;
  }

  function facilityLabel(id: string): string {
    return facilities.find((item) => item.id === id)?.displayName ?? id;
  }

  const db = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        queryCounts.user += 1;
        return users.find((row) => row.id === where.id) ?? null;
      },
    },
    userOrganizationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        queryCounts.memberships += 1;
        return memberships
          .filter((row) => row.userId === where.userId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((row) => {
            const organization = orgOf(row.organizationId);
            return {
              ...row,
              createdByUserId: null,
              updatedAt: row.createdAt,
              organization: {
                id: organization.id,
                name: organization.name,
                displayName: organization.displayName,
                legalName: null,
                organizationType: null,
                isActive: organization.isActive,
              },
              rolePeriods: row.rolePeriods.map((period) => ({
                ...period,
                membershipId: row.id,
                createdByUserId: null,
                endedByUserId: null,
                createdAt: period.startsAt,
                updatedAt: period.startsAt,
              })),
            };
          });
      },
      findUnique: async ({
        where,
      }: {
        where: { userId_organizationId: { userId: string; organizationId: string } };
      }) => {
        queryCounts.memberships += 1;
        const row = memberships.find(
          (item) =>
            item.userId === where.userId_organizationId.userId &&
            item.organizationId === where.userId_organizationId.organizationId,
        );
        if (!row) return null;
        const organization = orgOf(row.organizationId);
        return {
          ...row,
          createdByUserId: null,
          updatedAt: row.createdAt,
          organization: {
            id: organization.id,
            name: organization.name,
            displayName: organization.displayName,
            legalName: null,
            organizationType: null,
            isActive: organization.isActive,
          },
          rolePeriods: row.rolePeriods.map((period) => ({
            ...period,
            membershipId: row.id,
            createdByUserId: null,
            endedByUserId: null,
            createdAt: period.startsAt,
            updatedAt: period.startsAt,
          })),
        };
      },
    },
    userFacilityAccess: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; isActive: boolean; revokedAt: null };
      }) => {
        queryCounts.grants += 1;
        return grants
          .filter(
            (row) =>
              row.userId === where.userId &&
              row.isActive === where.isActive &&
              row.revokedAt === null,
          )
          .sort((left, right) => left.grantedAt.getTime() - right.grantedAt.getTime())
          .map((row) => ({
            id: row.id,
            facilityId: row.facilityId,
            rolePeriods: row.rolePeriods,
          }));
      },
      findFirst: async ({
        where,
      }: {
        where: { userId: string; facilityId: string; isActive: boolean; revokedAt: null };
      }) => {
        queryCounts.grants += 1;
        const row = grants.find(
          (grant) =>
            grant.userId === where.userId &&
            grant.facilityId === where.facilityId &&
            grant.isActive &&
            grant.revokedAt === null,
        );
        return row
          ? { id: row.id, facilityId: row.facilityId, rolePeriods: row.rolePeriods }
          : null;
      },
    },
    role: {
      findMany: async ({ where }: { where: { key: { in: RoleKey[] }; isActive: boolean } }) =>
        roles.filter((row) => where.key.in.includes(row.key) && row.isActive === where.isActive),
      findFirst: async ({ where }: { where: { key: RoleKey; isActive: boolean } }) =>
        roles.find((row) => row.key === where.key && row.isActive === where.isActive) ?? null,
    },
    facility: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        facilities
          .filter((row) => where.id.in.includes(row.id))
          .map((row) => {
            const organization = orgOf(row.organizationId);
            return {
              ...row,
              organization: {
                id: organization.id,
                name: organization.name,
                displayName: organization.displayName,
                isActive: organization.isActive,
              },
            };
          }),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = facilities.find((item) => item.id === where.id);
        if (!row) return null;
        const organization = orgOf(row.organizationId);
        return {
          ...row,
          organization: { isActive: organization.isActive },
        };
      },
    },
    facilityPartnerOrganization: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = partnerships.find((item) => item.id === where.id);
        return row
          ? { id: row.id, facilityId: row.facilityId, organizationId: row.organizationId }
          : null;
      },
    },
    department: {
      findMany: async ({
        where,
      }: {
        where: { facilityId?: string; isActive: boolean; id?: { in: string[] } };
      }) =>
        departments
          .filter((row) => (where.facilityId ? row.facilityId === where.facilityId : true))
          .filter((row) => row.isActive === where.isActive)
          .filter((row) => !where.id?.in || where.id.in.includes(row.id))
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((row) => ({ id: row.id, name: row.name, facilityId: row.facilityId })),
    },
    employee: {
      findFirst: async () => null,
    },
    partnerUserFacilityAccess: {
      findMany: async ({
        where,
      }: {
        where: {
          userId: string;
          facilityPartnerOrganization?: { facilityId?: string; organizationId?: string };
        };
      }) => {
        queryCounts.partnerAssignments += 1;
        return assignments
          .filter((row) => row.userId === where.userId)
          .filter((row) => {
            const partnership = partnerships.find((item) => item.id === row.facilityPartnerOrganizationId);
            const filter = where.facilityPartnerOrganization;
            if (filter?.facilityId && partnership?.facilityId !== filter.facilityId) return false;
            if (filter?.organizationId && partnership?.organizationId !== filter.organizationId) {
              return false;
            }
            return true;
          })
          .map((row) => {
            const partnership = partnerships.find((item) => item.id === row.facilityPartnerOrganizationId)!;
            const organization = orgOf(partnership.organizationId);
            return {
              ...row,
              rolePeriods: partnerRoles.filter((period) => period.partnerUserFacilityAccessId === row.id),
              facilityPartnerOrganization: {
                id: partnership.id,
                facilityId: partnership.facilityId,
                organizationId: partnership.organizationId,
                endedAt: partnership.endedAt,
                organization: {
                  isActive: organization.isActive,
                  name: organization.name,
                  displayName: organization.displayName,
                },
                facility: { displayName: facilityLabel(partnership.facilityId) },
              },
            };
          });
      },
    },
    facilityPartnerAccessPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) => {
        queryCounts.pathB += 1;
        return accessPeriods.filter(
          (row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId,
        );
      },
    },
    facilityPartnerRoleCeilingPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        ceilings.filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId),
    },
    facilityPartnerDepartmentScope: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        scopes
          .filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId)
          .map((row) => ({
            ...row,
            department:
              departments.find((department) => department.id === row.departmentId) ?? {
                id: row.departmentId,
                facilityId: "missing",
                isActive: false,
              },
          })),
    },
    facilityPartnerUserRestrictionPeriod: {
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId: string; userId: string };
      }) =>
        restrictions.filter(
          (row) =>
            row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId &&
            row.userId === where.userId,
        ),
    },
  };

  return {
    db: db as never,
    grants,
    users,
    queryCounts,
    addUser(input: User) {
      users.push(input);
    },
    addOrg(input: Org) {
      organizations.push(input);
    },
    addFacility(input: Facility) {
      facilities.push(input);
    },
    addMembership(input: {
      userId: string;
      organizationId: string;
      role: "ORG_ADMIN" | "ORG_MEMBER";
    }) {
      const id = nextId("mem");
      memberships.push({
        id,
        userId: input.userId,
        organizationId: input.organizationId,
        createdAt: at("2020-01-01T00:00:00.000Z"),
        rolePeriods: [
          {
            id: `${id}_role`,
            role: input.role,
            startsAt: at("2020-01-01T00:00:00.000Z"),
            endsAt: null,
          },
        ],
      });
      return id;
    },
    addGrant(input: { userId: string; facilityId: string; roleKey: RoleKey }) {
      const id = nextId("grant");
      grants.push({
        id,
        userId: input.userId,
        facilityId: input.facilityId,
        isActive: true,
        revokedAt: null,
        grantedAt: at("2020-01-01T00:00:00.000Z"),
        rolePeriods: [
          {
            id: `${id}_role`,
            roleKey: input.roleKey,
            startsAt: at("2020-01-01T00:00:00.000Z"),
            endsAt: null,
          },
        ],
      });
      return id;
    },
    revokeGrant(id: string) {
      const row = grants.find((item) => item.id === id);
      if (!row) throw new Error("missing grant");
      row.isActive = false;
      row.revokedAt = NOW;
    },
    addPartnership(input: {
      id: string;
      facilityId: string;
      organizationId: string;
      departmentId: string;
    }) {
      partnerships.push({
        id: input.id,
        facilityId: input.facilityId,
        organizationId: input.organizationId,
        endedAt: null,
      });
      accessPeriods.push({
        facilityPartnerOrganizationId: input.id,
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
      ceilings.push({
        facilityPartnerOrganizationId: input.id,
        maxPartnerRole: "PARTNER_MANAGER",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
      departments.push({
        id: input.departmentId,
        facilityId: input.facilityId,
        name: "Dietary",
        isActive: true,
      });
      scopes.push({
        facilityPartnerOrganizationId: input.id,
        departmentId: input.departmentId,
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
    },
    addAssignment(input: { userId: string; facilityPartnerOrganizationId: string }) {
      const id = nextId("asg");
      assignments.push({
        id,
        userId: input.userId,
        facilityPartnerOrganizationId: input.facilityPartnerOrganizationId,
      });
      partnerRoles.push({
        partnerUserFacilityAccessId: id,
        partnerRole: "PARTNER_MANAGER",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
      return id;
    },
    deactivateUser(id: string) {
      const row = users.find((item) => item.id === id);
      if (row) row.isActive = false;
    },
    bumpSession(id: string) {
      const row = users.find((item) => item.id === id);
      if (row) row.sessionVersion += 1;
    },
  };
}

function addActiveUser(
  world: ReturnType<typeof createWorld>,
  input: { id: string; facilityId?: string | null; roleId?: string | null },
) {
  world.addUser({
    id: input.id,
    email: `${input.id}@example.com`,
    displayName: input.id,
    isActive: true,
    facilityId: input.facilityId ?? null,
    roleId: input.roleId ?? null,
    sessionVersion: 1,
  });
}

function seedFacilities(world: ReturnType<typeof createWorld>) {
  world.addOrg({ id: "metz", name: "Metz", displayName: "Metz", isActive: true });
  world.addOrg({ id: "ecmc", name: "ECMC", displayName: "ECMC", isActive: true });
  world.addFacility({ id: "terrace", displayName: "Terrace View", organizationId: "ecmc" });
  world.addFacility({ id: "hospital", displayName: "ECMC Hospital", organizationId: "ecmc" });
}

async function route(world: ReturnType<typeof createWorld>, userId: string) {
  return routeAuthenticatedUser(world.db, {
    userId,
    sessionVersion: 1,
    now: NOW,
  });
}

test("zero contexts mint an account session to /access", async () => {
  const world = createWorld();
  addActiveUser(world, { id: "lonely" });
  const landing = await route(world, "lonely");
  assert.equal(landing.kind, "account");
  assert.equal(landing.redirectPath, "/access");
  assert.equal(landing.contextCount, 0);
  const session = await verifySessionToken(landing.token);
  assert.ok(isAccountSession(session));
  assert.equal(session.uid, "lonely");
  assert.equal(session.facilityId, undefined);
  assert.equal(session.organizationId, undefined);
  assert.equal(session.role, undefined);
});

test("one internal context enters live and uses the period role", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "sara", facilityId: "terrace", roleId: "MANAGER" });
  world.addGrant({ userId: "sara", facilityId: "terrace", roleKey: "STAFF" });
  const landing = await route(world, "sara");
  assert.equal(landing.kind, "context");
  assert.equal(landing.contextCount, 1);
  assert.equal(landing.kind === "context" && landing.contextKey, "facility_internal:terrace");
  assert.equal(landing.kind === "context" && landing.destinationKind, "facility_internal");
  assert.equal(landing.kind === "context" && landing.role, "STAFF");
  assert.equal(landing.redirectPath, "/logs");
  const session = await verifySessionToken(landing.token);
  assert.equal(session.scopeKind, "facility");
  assert.equal(session.role, "STAFF");
  assert.equal(session.facilityId, "terrace");
  assert.notEqual(session.role, "MANAGER");
});

test("one Organization context enters /organization/<id>", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "orgonly" });
  world.addMembership({ userId: "orgonly", organizationId: "metz", role: "ORG_MEMBER" });
  const landing = await route(world, "orgonly");
  assert.equal(landing.kind, "context");
  assert.equal(landing.redirectPath, "/organization/metz");
  assert.equal(landing.kind === "context" && landing.destinationKind, "organization");
  const session = await verifySessionToken(landing.token);
  assert.equal(session.scopeKind, "organization");
  assert.equal(session.organizationId, "metz");
  assert.equal(session.role, undefined);
});

test("two Organizations mint account and do not pick first", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "multi-org" });
  world.addMembership({ userId: "multi-org", organizationId: "metz", role: "ORG_MEMBER" });
  world.addMembership({ userId: "multi-org", organizationId: "ecmc", role: "ORG_ADMIN" });
  const landing = await route(world, "multi-org");
  assert.equal(landing.kind, "account");
  assert.equal(landing.redirectPath, "/access");
  assert.equal(landing.contextCount, 2);
  const session = await verifySessionToken(landing.token);
  assert.ok(isAccountSession(session));
  assert.equal(session.organizationId, undefined);
});

test("two internal Facilities mint account and home does not win", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "homes", facilityId: "terrace", roleId: "MANAGER" });
  world.addGrant({ userId: "homes", facilityId: "terrace", roleKey: "MANAGER" });
  world.addGrant({ userId: "homes", facilityId: "hospital", roleKey: "STAFF" });
  const landing = await route(world, "homes");
  assert.equal(landing.kind, "account");
  assert.equal(landing.redirectPath, "/access");
  assert.equal(landing.contextCount, 2);
  const session = await verifySessionToken(landing.token);
  assert.ok(isAccountSession(session));
  assert.equal(session.facilityId, undefined);
});

test("internal plus Organization is two contexts", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "mixed", facilityId: "terrace" });
  world.addGrant({ userId: "mixed", facilityId: "terrace", roleKey: "MANAGER" });
  world.addMembership({ userId: "mixed", organizationId: "metz", role: "ORG_MEMBER" });
  const landing = await route(world, "mixed");
  assert.equal(landing.kind, "account");
  assert.equal(landing.contextCount, 2);
  assert.equal(landing.redirectPath, "/access");
});

test("Organization plus partner is two contexts", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "partnered" });
  world.addMembership({ userId: "partnered", organizationId: "metz", role: "ORG_MEMBER" });
  world.addPartnership({
    id: "metz-terrace",
    facilityId: "terrace",
    organizationId: "metz",
    departmentId: "dept-terrace",
  });
  world.addAssignment({ userId: "partnered", facilityPartnerOrganizationId: "metz-terrace" });
  const landing = await route(world, "partnered");
  assert.equal(landing.kind, "account");
  assert.ok(landing.contextCount >= 2);
  assert.equal(landing.redirectPath, "/access");
});

test("same Facility internal plus partner counts as two or more contexts", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "dual", facilityId: "terrace" });
  world.addGrant({ userId: "dual", facilityId: "terrace", roleKey: "MANAGER" });
  world.addMembership({ userId: "dual", organizationId: "metz", role: "ORG_MEMBER" });
  world.addPartnership({
    id: "metz-terrace",
    facilityId: "terrace",
    organizationId: "metz",
    departmentId: "dept-terrace",
  });
  world.addAssignment({ userId: "dual", facilityPartnerOrganizationId: "metz-terrace" });
  const listed = await listAvailableContexts(world.db, { userId: "dual", now: NOW });
  assert.ok(listed.length >= 2);
  assert.ok(listed.some((row) => row.kind === "facility_internal" && row.facilityId === "terrace"));
  assert.ok(
    listed.some((row) => row.kind === "facility_partner" && row.facilityId === "terrace"),
  );
  const landing = await route(world, "dual");
  assert.equal(landing.kind, "account");
  assert.ok(landing.contextCount >= 2);
});

test("sole-context TOCTOU falls back to account /access", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "race" });
  const grantId = world.addGrant({ userId: "race", facilityId: "terrace", roleKey: "MANAGER" });
  const landing = await routeAuthenticatedUser(
    world.db,
    { userId: "race", sessionVersion: 1, now: NOW },
    {
      listAvailableContexts: async (db, input) => {
        const contexts = await listAvailableContexts(db, input);
        assert.equal(contexts.length, 1);
        world.revokeGrant(grantId);
        return contexts;
      },
    },
  );
  assert.equal(landing.kind, "account");
  assert.equal(landing.redirectPath, "/access");
  const session = await verifySessionToken(landing.token);
  assert.ok(isAccountSession(session));
});

test("home Facility plus no current grant does not invent an internal context", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "orphan", facilityId: "terrace", roleId: "MANAGER" });
  const grantCountBefore = world.grants.length;
  const landing = await route(world, "orphan");
  assert.equal(landing.kind, "account");
  assert.equal(landing.contextCount, 0);
  assert.equal(world.grants.length, grantCountBefore);
});

test("User inactive after list fails closed", async () => {
  const world = createWorld();
  addActiveUser(world, { id: "gone" });
  await assert.rejects(
    () =>
      routeAuthenticatedUser(
        world.db,
        { userId: "gone", sessionVersion: 1, now: NOW },
        {
          listAvailableContexts: async (db, input) => {
            const contexts = await listAvailableContexts(db, input);
            world.deactivateUser("gone");
            return contexts;
          },
        },
      ),
    (error: unknown) =>
      error instanceof PostAuthRoutingError && error.code === "USER_INACTIVE",
  );
});

test("sessionVersion stale after list fails closed", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "stale" });
  world.addGrant({ userId: "stale", facilityId: "terrace", roleKey: "MANAGER" });
  await assert.rejects(
    () =>
      routeAuthenticatedUser(
        world.db,
        { userId: "stale", sessionVersion: 1, now: NOW },
        {
          listAvailableContexts: async (db, input) => {
            const contexts = await listAvailableContexts(db, input);
            world.bumpSession("stale");
            return contexts;
          },
        },
      ),
    (error: unknown) =>
      error instanceof PostAuthRoutingError && error.code === "SESSION_VERSION_STALE",
  );
});

test("infrastructure failure is not treated as zero contexts", async () => {
  const world = createWorld();
  addActiveUser(world, { id: "down" });
  await assert.rejects(
    () =>
      routeAuthenticatedUser(
        world.db,
        { userId: "down", sessionVersion: 1, now: NOW },
        {
          listAvailableContexts: async () => {
            throw new Error("database unavailable");
          },
        },
      ),
    (error: unknown) => error instanceof Error && error.message === "database unavailable",
  );
});

test("typical one-internal login performs zero Path B validations", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "cheap" });
  world.addGrant({ userId: "cheap", facilityId: "terrace", roleKey: "MANAGER" });
  await route(world, "cheap");
  assert.equal(world.queryCounts.partnerAssignments, 1);
  assert.equal(world.queryCounts.pathB, 0);
});

test("router source uses only the context directory and live entry", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/post-auth-routing/route.ts"), "utf8");
  assert.ok(source.includes("listAvailableContexts"));
  assert.ok(source.includes("enterContext"));
  assert.ok(source.includes("enterAccountContext"));
  assert.equal(source.includes("ensureUserFacilityAccessGrant"), false);
  assert.equal(source.includes("ensureCurrentInternalFacilityRole"), false);
  assert.equal(source.includes("userFacilityAccess"), false);
  assert.equal(source.includes("partnerUserFacilityAccess"), false);
  assert.equal(source.includes("UserFacilityAccess"), false);
});

test("password login uses the post-auth router and no longer classifies identity", () => {
  const login = readFileSync(join(process.cwd(), "src/app/api/auth/login/route.ts"), "utf8");
  assert.ok(login.includes("routeAuthenticatedUser"));
  assert.ok(login.includes("redirectPath"));
  assert.ok(login.includes("applyAccountSessionCookies"));
  assert.ok(login.includes("applyContextTransitionCookies"));
  assert.equal(login.includes("isFacilityNative"), false);
  assert.equal(login.includes("isOrganizationOnly"), false);
  assert.equal(login.includes("Account identity is incomplete"), false);
  assert.equal(login.includes("No organization membership"), false);
  assert.equal(login.includes("ensureUserFacilityAccessGrant"), false);
  assert.equal(login.includes("ensureCurrentInternalFacilityRole"), false);
  assert.equal(login.includes("createPartnerFacilitySessionToken"), false);
  assert.equal(login.includes("listAvailableContexts"), false);
  assert.equal(login.includes("enterContext("), false);
});

test("login page bounces account to /access and partner to /partner", () => {
  const page = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8");
  assert.ok(page.includes("isAccountSession"));
  assert.ok(page.includes('redirect("/access")'));
  assert.ok(page.includes("isPartnerFacilitySession"));
  assert.ok(page.includes('redirect("/partner")'));
});

test("PIN login does not use User context routing", () => {
  const pin = readFileSync(join(process.cwd(), "src/app/api/auth/pin-login/route.ts"), "utf8");
  assert.equal(pin.includes("listAvailableContexts"), false);
  assert.equal(pin.includes("routeAuthenticatedUser"), false);
  assert.equal(pin.includes("enterAccountContext"), false);
  assert.equal(pin.includes("enterContext"), false);
});

test("Harbor login does not use User context routing", () => {
  const harbor = readFileSync(join(process.cwd(), "src/app/api/console/auth/login/route.ts"), "utf8");
  assert.equal(harbor.includes("listAvailableContexts"), false);
  assert.equal(harbor.includes("routeAuthenticatedUser"), false);
  assert.equal(harbor.includes("enterAccountContext"), false);
  assert.equal(harbor.includes("enterContext"), false);
});

test("signup, verification, and invites remain deferred from the post-auth router", () => {
  const deferred = [
    "src/app/api/auth/signup/route.ts",
    "src/app/api/auth/email-verification/confirm/route.ts",
    "src/app/api/auth/account-invite/confirm/route.ts",
    "src/app/api/auth/organization-member-invitation/accept/route.ts",
    "src/app/api/auth/organization-claim/accept/route.ts",
    "src/app/api/auth/employee-link/accept/route.ts",
  ];
  for (const relative of deferred) {
    const source = readFileSync(join(process.cwd(), relative), "utf8");
    assert.equal(source.includes("routeAuthenticatedUser"), false, relative);
  }
});

test("login client follows server redirectPath and does not count contexts", () => {
  const form = readFileSync(join(process.cwd(), "src/components/login-form.tsx"), "utf8");
  assert.ok(form.includes("router.push(redirectPath)"));
  assert.equal(form.includes("/dashboard"), false);
  assert.equal(form.includes("listAvailableContexts"), false);
  assert.equal(form.includes("routeAuthenticatedUser"), false);
});

test("enterContext remains the sole-context authority, not the list row", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "live" });
  world.addGrant({ userId: "live", facilityId: "terrace", roleKey: "MANAGER" });
  let enteredKey: string | null = null;
  const landing = await routeAuthenticatedUser(
    world.db,
    { userId: "live", sessionVersion: 1, now: NOW },
    {
      enterContext: async (db, input) => {
        enteredKey = input.contextKey;
        return enterContext(db, input);
      },
    },
  );
  assert.equal(enteredKey, "facility_internal:terrace");
  assert.equal(landing.kind, "context");
});

test("CONTEXT_NOT_AVAILABLE from enterContext does not retry another key", async () => {
  const world = createWorld();
  seedFacilities(world);
  addActiveUser(world, { id: "only" });
  world.addGrant({ userId: "only", facilityId: "terrace", roleKey: "MANAGER" });
  let enterCalls = 0;
  const landing = await routeAuthenticatedUser(
    world.db,
    { userId: "only", sessionVersion: 1, now: NOW },
    {
      enterContext: async () => {
        enterCalls += 1;
        throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
      },
    },
  );
  assert.equal(enterCalls, 1);
  assert.equal(landing.kind, "account");
  assert.equal(landing.redirectPath, "/access");
});
