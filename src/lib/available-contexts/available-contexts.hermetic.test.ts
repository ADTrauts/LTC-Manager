import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OrganizationPartnerRole, RoleKey } from "@prisma/client";

import { listAvailableContextRecords, listAvailableContexts } from "./list";
import {
  internalFacilityContextKey,
  organizationContextKey,
  partnerFacilityContextKey,
} from "./keys";
import { departmentSummary, presentAvailableContexts } from "./presentation";
import { AvailableContextError } from "./types";

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
  const employees: Array<{ id: string; userId: string; facilityId: string }> = [];

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
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((row) => row.id === where.id) ?? null,
    },
    userOrganizationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        memberships
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
          }),
      findUnique: async ({
        where,
      }: {
        where: { userId_organizationId: { userId: string; organizationId: string } };
      }) => {
        const row = memberships.find(
          (item) =>
            item.userId === where.userId_organizationId.userId &&
            item.organizationId === where.userId_organizationId.organizationId,
        );
        if (!row) return null;
        const organization = orgOf(row.organizationId);
        return {
          ...row,
          organization: { isActive: organization.isActive },
          rolePeriods: row.rolePeriods,
        };
      },
    },
    userFacilityAccess: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; isActive: boolean; revokedAt: null };
      }) =>
        grants
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
          })),
      findFirst: async ({
        where,
      }: {
        where: { userId: string; facilityId: string; isActive: boolean; revokedAt: null };
      }) => {
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
      // Path B's unused internal branch may look up Employee for department
      // scope. Available-context modules never treat that row as a context.
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
      }) =>
        assignments
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
          }),
    },
    facilityPartnerAccessPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        accessPeriods.filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId),
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
    db,
    employees,
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
      id?: string;
      userId: string;
      organizationId: string;
      role: "ORG_ADMIN" | "ORG_MEMBER";
      createdAt?: Date;
      startsAt?: Date;
      endsAt?: Date | null;
    }) {
      const id = input.id ?? nextId("mem");
      memberships.push({
        id,
        userId: input.userId,
        organizationId: input.organizationId,
        createdAt: input.createdAt ?? at("2020-01-01T00:00:00.000Z"),
        rolePeriods: [
          {
            id: `${id}_role`,
            role: input.role,
            startsAt: input.startsAt ?? at("2020-01-01T00:00:00.000Z"),
            endsAt: input.endsAt ?? null,
          },
        ],
      });
      return id;
    },
    endMembership(userId: string, organizationId: string, atInstant = NOW) {
      const row = memberships.find(
        (item) => item.userId === userId && item.organizationId === organizationId,
      );
      const period = row?.rolePeriods.find((item) => item.endsAt === null);
      if (period) period.endsAt = atInstant;
    },
    addGrant(input: {
      id?: string;
      userId: string;
      facilityId: string;
      roleKey: RoleKey;
      startsAt?: Date;
    }) {
      const id = input.id ?? nextId("grant");
      grants.push({
        id,
        userId: input.userId,
        facilityId: input.facilityId,
        isActive: true,
        revokedAt: null,
        grantedAt: input.startsAt ?? at("2020-01-01T00:00:00.000Z"),
        rolePeriods: [
          {
            id: `${id}_role`,
            roleKey: input.roleKey,
            startsAt: input.startsAt ?? at("2020-01-01T00:00:00.000Z"),
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
    changeGrantRole(id: string, roleKey: RoleKey) {
      const row = grants.find((item) => item.id === id);
      if (!row) throw new Error("missing grant");
      const current = row.rolePeriods.find((period) => period.endsAt === null);
      if (current) current.endsAt = NOW;
      row.rolePeriods.push({
        id: nextId("role"),
        roleKey,
        startsAt: NOW,
        endsAt: null,
      });
    },
    addPartnership(input: {
      id: string;
      facilityId: string;
      organizationId: string;
      departmentId: string;
      departmentName: string;
      maxPartnerRole?: OrganizationPartnerRole;
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
        maxPartnerRole: input.maxPartnerRole ?? "PARTNER_MANAGER",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
      if (!departments.some((row) => row.id === input.departmentId)) {
        departments.push({
          id: input.departmentId,
          facilityId: input.facilityId,
          name: input.departmentName,
          isActive: true,
        });
      }
      scopes.push({
        facilityPartnerOrganizationId: input.id,
        departmentId: input.departmentId,
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
    },
    addAssignment(input: {
      userId: string;
      facilityPartnerOrganizationId: string;
      partnerRole?: OrganizationPartnerRole;
    }) {
      const id = nextId("asg");
      assignments.push({
        id,
        userId: input.userId,
        facilityPartnerOrganizationId: input.facilityPartnerOrganizationId,
      });
      partnerRoles.push({
        partnerUserFacilityAccessId: id,
        partnerRole: input.partnerRole ?? "PARTNER_MANAGER",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
      return id;
    },
    endAssignment(assignmentId: string) {
      const period = partnerRoles.find(
        (row) => row.partnerUserFacilityAccessId === assignmentId && row.endsAt === null,
      );
      if (period) period.endsAt = NOW;
    },
    restrict(userId: string, facilityPartnerOrganizationId: string) {
      restrictions.push({
        userId,
        facilityPartnerOrganizationId,
        startsAt: NOW,
        endsAt: null,
      });
    },
    endPartnership(id: string) {
      const row = partnerships.find((item) => item.id === id);
      if (row) row.endedAt = NOW;
    },
    emptyDepartmentScope(facilityPartnerOrganizationId: string) {
      for (const scope of scopes) {
        if (scope.facilityPartnerOrganizationId === facilityPartnerOrganizationId) {
          scope.endsAt = NOW;
        }
      }
    },
    closeCeiling(facilityPartnerOrganizationId: string) {
      for (const ceiling of ceilings) {
        if (ceiling.facilityPartnerOrganizationId === facilityPartnerOrganizationId && ceiling.endsAt === null) {
          ceiling.endsAt = NOW;
        }
      }
    },
    addDepartment(input: { id: string; facilityId: string; name: string }) {
      departments.push({ ...input, isActive: true });
    },
    addScope(input: { facilityPartnerOrganizationId: string; departmentId: string }) {
      scopes.push({
        ...input,
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      });
    },
    addEmployee(input: { id: string; userId: string; facilityId: string }) {
      employees.push(input);
    },
    deactivateUser(id: string) {
      const row = users.find((item) => item.id === id);
      if (row) row.isActive = false;
    },
    deactivateOrg(id: string) {
      orgOf(id).isActive = false;
    },
  };
}

function seedSarahBase(world: ReturnType<typeof createWorld>) {
  world.addOrg({
    id: "metz",
    name: "Metz Culinary Management",
    displayName: "Metz Culinary Management",
    isActive: true,
  });
  world.addOrg({
    id: "ecmc",
    name: "ECMC",
    displayName: "ECMC",
    isActive: true,
  });
  world.addFacility({ id: "terrace", displayName: "Terrace View", organizationId: "ecmc" });
  world.addFacility({ id: "hospital", displayName: "ECMC Hospital", organizationId: "ecmc" });
  world.addFacility({ id: "highpointe", displayName: "HighPointe", organizationId: "ecmc" });
  world.addUser({
    id: "sarah",
    email: "sarah@example.com",
    displayName: "Sarah Johnson",
    isActive: true,
    facilityId: "terrace",
  });
}

test("available-context source does not treat Employee, PIN, or Harbor as contexts", () => {
  const files = [
    "index.ts",
    "list.ts",
    "organization.ts",
    "internal.ts",
    "partner.ts",
    "presentation.ts",
    "types.ts",
    "user.ts",
    "keys.ts",
    "for-request.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), "src/lib/available-contexts", file), "utf8");
    assert.equal(source.includes("employee-identity"), false, file);
    assert.equal(source.includes("prisma.employee"), false, file);
    assert.equal(source.includes("pinDigest"), false, file);
    assert.equal(source.includes("PlatformStaff"), false, file);
    assert.equal(source.includes("harbor_staff"), false, file);
  }
});

test("unknown User throws USER_NOT_FOUND", async () => {
  const world = createWorld();
  await assert.rejects(
    () => listAvailableContexts(world.db as never, { userId: "missing", now: NOW }),
    (error: unknown) => error instanceof AvailableContextError && error.code === "USER_NOT_FOUND",
  );
});

test("inactive User throws USER_INACTIVE, not empty list", async () => {
  const world = createWorld();
  world.addUser({
    id: "sarah",
    email: "sarah@example.com",
    displayName: "Sarah",
    isActive: false,
    facilityId: null,
  });
  await assert.rejects(
    () => listAvailableContexts(world.db as never, { userId: "sarah", now: NOW }),
    (error: unknown) => error instanceof AvailableContextError && error.code === "USER_INACTIVE",
  );
});

test("active User with no relationships returns []", async () => {
  const world = createWorld();
  world.addUser({
    id: "sarah",
    email: "sarah@example.com",
    displayName: "Sarah",
    isActive: true,
    facilityId: null,
  });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.deepEqual(contexts, []);
});

test("one Organization context uses current membership role", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0], {
    kind: "organization",
    contextKey: organizationContextKey("metz"),
    organizationId: "metz",
    membershipId: contexts[0] && contexts[0].kind === "organization" ? contexts[0].membershipId : "",
    organizationRole: "ORG_ADMIN",
  });
});

test("multiple Organizations stay independent", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  world.addMembership({ userId: "sarah", organizationId: "ecmc", role: "ORG_MEMBER" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  const orgs = contexts.filter((row) => row.kind === "organization");
  assert.equal(orgs.length, 2);
  assert.equal(orgs.find((row) => row.organizationId === "metz")?.organizationRole, "ORG_ADMIN");
  assert.equal(orgs.find((row) => row.organizationId === "ecmc")?.organizationRole, "ORG_MEMBER");
});

test("one internal Facility uses grant period role, not User.roleId", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]?.kind, "facility_internal");
  if (contexts[0]?.kind !== "facility_internal") throw new Error("expected internal");
  assert.equal(contexts[0].role, "MANAGER");
  assert.equal(contexts[0].isHome, true);
  assert.equal(contexts[0].contextKey, internalFacilityContextKey("terrace"));
});

test("multiple internal Facilities keep distinct roles", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  world.addGrant({ userId: "sarah", facilityId: "hospital", roleKey: "STAFF" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  const internals = contexts.filter((row) => row.kind === "facility_internal");
  assert.equal(internals.length, 2);
  assert.equal(internals.find((row) => row.facilityId === "terrace")?.role, "MANAGER");
  assert.equal(internals.find((row) => row.facilityId === "hospital")?.role, "STAFF");
  assert.equal(internals.find((row) => row.facilityId === "hospital")?.isHome, false);
});

test("home Facility without a live grant is omitted", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addGrant({ userId: "sarah", facilityId: "hospital", roleKey: "STAFF" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0] && contexts[0].kind === "facility_internal" && contexts[0].facilityId, "hospital");
});

test("inactive owner Organization hides internal Facility context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  world.deactivateOrg("ecmc");
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.deepEqual(contexts, []);
});

test("corporate ownership / ORG_ADMIN does not create internal Facility contexts", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "ecmc", role: "ORG_ADMIN" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]?.kind, "organization");
  assert.equal(contexts.some((row) => row.kind === "facility_internal"), false);
});

test("Employee link only creates no context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addEmployee({ id: "emp_sarah_terrace", userId: "sarah", facilityId: "terrace" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.deepEqual(contexts, []);
  assert.equal(world.employees.length, 1);
});

test("internal access without Employee still returns the Facility context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  assert.equal(world.employees.length, 0);
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]?.kind, "facility_internal");
});

function seedMetzPartner(
  world: ReturnType<typeof createWorld>,
  input?: { facilityId?: string; partnershipId?: string; departmentId?: string },
) {
  const facilityId = input?.facilityId ?? "terrace";
  const partnershipId = input?.partnershipId ?? "fpo_metz_terrace";
  world.addPartnership({
    id: partnershipId,
    facilityId,
    organizationId: "metz",
    departmentId: input?.departmentId ?? "dietary_terrace",
    departmentName: "Food & Nutrition",
  });
  return partnershipId;
}

test("one partner context uses Path B and partnership id as key", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
  const partnershipId = seedMetzPartner(world);
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: partnershipId });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  const partners = contexts.filter((row) => row.kind === "facility_partner");
  assert.equal(partners.length, 1);
  assert.equal(partners[0]?.contextKey, partnerFacilityContextKey(partnershipId));
  assert.equal(partners[0] && partners[0].kind === "facility_partner" && partners[0].effectivePartnerRole, "PARTNER_MANAGER");
});

test("ORG_ADMIN without personal assignment gets no partner context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  seedMetzPartner(world);
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.filter((row) => row.kind === "facility_partner").length, 0);
  assert.equal(contexts.filter((row) => row.kind === "organization").length, 1);
});

test("multiple partner Facilities stay separate", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
  const terrace = seedMetzPartner(world);
  const highpointe = seedMetzPartner(world, {
    facilityId: "highpointe",
    partnershipId: "fpo_metz_hp",
    departmentId: "dietary_hp",
  });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: terrace });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: highpointe });
  const partners = (await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).filter(
    (row) => row.kind === "facility_partner",
  );
  assert.equal(partners.length, 2);
  assert.deepEqual(
    partners.map((row) => row.kind === "facility_partner" && row.facilityId).sort(),
    ["highpointe", "terrace"],
  );
});

test("same Facility internal + partner returns two contexts", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  const partnershipId = seedMetzPartner(world);
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: partnershipId });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(contexts.length, 3);
  assert.equal(contexts.filter((row) => row.kind === "organization").length, 1);
  assert.equal(contexts.filter((row) => row.kind === "facility_internal").length, 1);
  assert.equal(contexts.filter((row) => row.kind === "facility_partner").length, 1);
  assert.equal(
    new Set(contexts.map((row) => row.contextKey)).size,
    contexts.length,
  );
});

test("same Facility via two partner Organizations stays two partner contexts", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addOrg({
    id: "vendorb",
    name: "Vendor B",
    displayName: "Vendor B",
    isActive: true,
  });
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
  world.addMembership({ userId: "sarah", organizationId: "vendorb", role: "ORG_MEMBER" });
  const metz = seedMetzPartner(world);
  world.addPartnership({
    id: "fpo_vendor_terrace",
    facilityId: "terrace",
    organizationId: "vendorb",
    departmentId: "dietary_terrace",
    departmentName: "Food & Nutrition",
  });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: metz });
  world.addAssignment({
    userId: "sarah",
    facilityPartnerOrganizationId: "fpo_vendor_terrace",
    partnerRole: "PARTNER_VIEWER",
  });
  const partners = (await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).filter(
    (row) => row.kind === "facility_partner",
  );
  assert.equal(partners.length, 2);
  assert.deepEqual(
    partners.map((row) => row.contextKey).sort(),
    [partnerFacilityContextKey("fpo_metz_terrace"), partnerFacilityContextKey("fpo_vendor_terrace")].sort(),
  );
});

test("revoked internal grant disappears", async () => {
  const world = createWorld();
  seedSarahBase(world);
  const grantId = world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  assert.equal((await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).length, 1);
  world.revokeGrant(grantId);
  assert.deepEqual(await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW }), []);
});

test("ended Organization membership disappears and removes dependent partner context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
  world.addGrant({ userId: "sarah", facilityId: "hospital", roleKey: "STAFF" });
  const partnershipId = seedMetzPartner(world);
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: partnershipId });
  assert.equal((await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).length, 3);
  world.endMembership("sarah", "metz");
  const after = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(after.length, 1);
  assert.equal(after[0]?.kind, "facility_internal");
  assert.equal(after[0] && after[0].kind === "facility_internal" && after[0].facilityId, "hospital");
});

test("restricted, ended, empty-scope, or ceiling-closed partner contexts disappear", async () => {
  for (const mutate of ["restrict", "end", "empty", "ceiling"] as const) {
    const world = createWorld();
    seedSarahBase(world);
    world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
    const partnershipId = seedMetzPartner(world);
    world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: partnershipId });
    assert.equal(
      (await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).filter(
        (row) => row.kind === "facility_partner",
      ).length,
      1,
    );
    if (mutate === "restrict") world.restrict("sarah", partnershipId);
    if (mutate === "end") world.endPartnership(partnershipId);
    if (mutate === "empty") world.emptyDepartmentScope(partnershipId);
    if (mutate === "ceiling") world.closeCeiling(partnershipId);
    const after = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
    assert.equal(
      after.filter((row) => row.kind === "facility_partner").length,
      0,
      mutate,
    );
  }
});

test("internal role change keeps the same context key", async () => {
  const world = createWorld();
  seedSarahBase(world);
  const grantId = world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  const before = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  world.changeGrantRole(grantId, "SUPERVISOR");
  const after = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  assert.equal(before[0]?.contextKey, after[0]?.contextKey);
  assert.equal(after[0] && after[0].kind === "facility_internal" && after[0].role, "SUPERVISOR");
});

test("duplicate display names stay distinct by ids", async () => {
  const world = createWorld();
  world.addOrg({ id: "org_a", name: "Metz", displayName: "Metz", isActive: true });
  world.addOrg({ id: "org_b", name: "Metz", displayName: "Metz", isActive: true });
  world.addFacility({ id: "fac_a", displayName: "Terrace View", organizationId: "org_a" });
  world.addFacility({ id: "fac_b", displayName: "Terrace View", organizationId: "org_b" });
  world.addUser({
    id: "sarah",
    email: "sarah@example.com",
    displayName: "Sarah",
    isActive: true,
    facilityId: "fac_a",
  });
  world.addMembership({ userId: "sarah", organizationId: "org_a", role: "ORG_MEMBER" });
  world.addMembership({ userId: "sarah", organizationId: "org_b", role: "ORG_ADMIN" });
  world.addGrant({ userId: "sarah", facilityId: "fac_a", roleKey: "MANAGER" });
  world.addGrant({ userId: "sarah", facilityId: "fac_b", roleKey: "STAFF" });
  const contexts = await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW });
  const keys = contexts.map((row) => row.contextKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(contexts.filter((row) => row.kind === "organization").length, 2);
  assert.equal(contexts.filter((row) => row.kind === "facility_internal").length, 2);
});

test("presentation uses persona labels, grouping, and department summary", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  world.addGrant({ userId: "sarah", facilityId: "terrace", roleKey: "MANAGER" });
  const partnershipId = seedMetzPartner(world);
  world.addDepartment({ id: "retail_terrace", facilityId: "terrace", name: "Retail" });
  world.addDepartment({ id: "clinical_terrace", facilityId: "terrace", name: "Dietary Clinical" });
  world.addScope({ facilityPartnerOrganizationId: partnershipId, departmentId: "retail_terrace" });
  world.addScope({ facilityPartnerOrganizationId: partnershipId, departmentId: "clinical_terrace" });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: partnershipId });
  const records = await listAvailableContextRecords(world.db as never, { userId: "sarah", now: NOW });
  const presented = presentAvailableContexts(records);
  assert.deepEqual(
    presented.map((row) => row.group),
    ["Organizations", "Internal Facilities", "Client Facilities"],
  );
  assert.equal(presented[0]?.roleLabel, "Administrator");
  assert.equal(presented[0]?.subtitle, "Organization · Administrator");
  assert.equal(presented[1]?.roleLabel, "Manager");
  assert.equal(presented[1]?.subtitle, "Internal · Manager");
  assert.equal(presented[2]?.roleLabel, "Partner Manager");
  assert.match(presented[2]?.subtitle ?? "", /Via Metz Culinary Management · Partner Manager/);
  assert.equal(presented[2]?.departmentSummary, "3 Departments");
  assert.equal(departmentSummary(["Food & Nutrition"]), "Food & Nutrition");
  assert.equal(departmentSummary(["Food & Nutrition", "Retail"]), "Food & Nutrition, Retail");
  assert.equal(presented.some((row) => row.roleLabel === "Staff" || row.roleLabel === "Lead"), false);
});

test("Partner assignment end removes only that partner context", async () => {
  const world = createWorld();
  seedSarahBase(world);
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_MEMBER" });
  const terrace = seedMetzPartner(world);
  const highpointe = seedMetzPartner(world, {
    facilityId: "highpointe",
    partnershipId: "fpo_metz_hp",
    departmentId: "dietary_hp",
  });
  const ended = world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: terrace });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: highpointe });
  world.endAssignment(ended);
  const partners = (await listAvailableContexts(world.db as never, { userId: "sarah", now: NOW })).filter(
    (row) => row.kind === "facility_partner",
  );
  assert.equal(partners.length, 1);
  assert.equal(partners[0] && partners[0].kind === "facility_partner" && partners[0].facilityId, "highpointe");
});
