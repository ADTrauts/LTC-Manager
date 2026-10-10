import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { jwtVerify } from "jose";
import type { OrganizationPartnerRole, RoleKey } from "@prisma/client";

import { isAccountSession, isPartnerFacilitySession, verifySessionToken } from "@/lib/auth";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { DEVICE_FACILITY_COOKIE } from "@/lib/device-cookie";
import { PARTNER_ACTIVE_DEPARTMENT_COOKIE } from "@/lib/partner-operational-context";
import { classifySessionRejection, validateSessionAuthority } from "@/lib/session-revocation";

import { applyContextTransitionCookies } from "./cookies";
import { enterAccountContext, enterContext } from "./enter";
import { parseContextKey } from "./parse";
import { ContextEntryError } from "./types";

process.env.AUTH_SECRET ??= "account-session-context-entry-secret";

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

  function orgOf(id: string): Org {
    const row = organizations.find((item) => item.id === id);
    if (!row) throw new Error(`missing org ${id}`);
    return row;
  }

  const db = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((row) => row.id === where.id) ?? null,
    },
    userOrganizationMembership: {
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
      findFirst: async ({ where }: { where: { key: RoleKey; isActive: boolean } }) =>
        roles.find((row) => row.key === where.key && row.isActive === where.isActive) ?? null,
    },
    facility: {
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
                organization: { isActive: organization.isActive },
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
    db: db as never,
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
    },
    endMembership(userId: string, organizationId: string) {
      const row = memberships.find(
        (item) => item.userId === userId && item.organizationId === organizationId,
      );
      const period = row?.rolePeriods.find((item) => item.endsAt === null);
      if (period) period.endsAt = NOW;
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
    restrict(userId: string, facilityPartnerOrganizationId: string) {
      restrictions.push({
        userId,
        facilityPartnerOrganizationId,
        startsAt: NOW,
        endsAt: null,
      });
    },
  };
}

function sarahWorld() {
  const world = createWorld();
  world.addUser({
    id: "sarah",
    email: "sarah@example.com",
    displayName: "Sarah",
    isActive: true,
    facilityId: "terrace",
    sessionVersion: 3,
  });
  world.addOrg({ id: "owner", name: "Owner Health", displayName: "Owner Health", isActive: true });
  world.addOrg({ id: "metz", name: "Metz", displayName: "Metz", isActive: true });
  world.addFacility({ id: "terrace", displayName: "Terrace View", organizationId: "owner" });
  world.addFacility({ id: "ecmc", displayName: "ECMC Hospital", organizationId: "owner" });
  world.addMembership({ userId: "sarah", organizationId: "metz", role: "ORG_ADMIN" });
  const terraceGrantId = world.addGrant({
    userId: "sarah",
    facilityId: "terrace",
    roleKey: "MANAGER",
  });
  world.addPartnership({
    id: "metz-terrace",
    facilityId: "terrace",
    organizationId: "metz",
    departmentId: "dept-terrace",
  });
  world.addPartnership({
    id: "metz-ecmc",
    facilityId: "ecmc",
    organizationId: "metz",
    departmentId: "dept-ecmc",
  });
  world.addAssignment({ userId: "sarah", facilityPartnerOrganizationId: "metz-terrace" });
  return { ...world, terraceGrantId };
}

test("parseContextKey accepts the three exact prefixes and rejects malformed keys", () => {
  assert.deepEqual(parseContextKey("organization:org_1"), {
    kind: "organization",
    organizationId: "org_1",
    contextKey: "organization:org_1",
  });
  assert.deepEqual(parseContextKey("facility_internal:fac_1"), {
    kind: "facility_internal",
    facilityId: "fac_1",
    contextKey: "facility_internal:fac_1",
  });
  assert.deepEqual(parseContextKey("facility_partner:fpo_1"), {
    kind: "facility_partner",
    facilityPartnerOrganizationId: "fpo_1",
    contextKey: "facility_partner:fpo_1",
  });

  const rejected = [
    "",
    "organization:",
    "organization: ",
    "facility_internal",
    "facility:fac_1",
    "ORGANIZATION:org_1",
    "organization:org_1:extra",
    "facility_partner:a:b",
  ];
  for (const raw of rejected) {
    assert.throws(
      () => parseContextKey(raw),
      (error: unknown) => error instanceof ContextEntryError && error.code === "INVALID_CONTEXT_KEY",
      raw,
    );
  }
});

test("classifySessionRejection splits identity failure from context failure", () => {
  assert.equal(classifySessionRejection("IDENTITY_NOT_FOUND"), "identity");
  assert.equal(classifySessionRejection("IDENTITY_INACTIVE"), "identity");
  assert.equal(classifySessionRejection("VERSION_STALE"), "identity");
  assert.equal(classifySessionRejection("VERSION_CLAIM_MISSING"), "identity");
  assert.equal(classifySessionRejection("AUTH_METHOD_NOT_ALLOWED"), "identity");
  assert.equal(classifySessionRejection("FACILITY_ACCESS_REVOKED"), "context");
  assert.equal(classifySessionRejection("ROLE_STALE"), "context");
});

test("account session JWT is identity-only", async () => {
  const world = sarahWorld();
  const result = await enterAccountContext(world.db, { userId: "sarah", sessionVersion: 3 });
  assert.equal(result.redirectPath, "/access");
  assert.equal(result.kind, "account");
  const session = await verifySessionToken(result.token);
  assert.ok(isAccountSession(session));
  assert.equal(session.uid, "sarah");
  assert.equal(session.authKind, "user");
  assert.equal(session.scopeKind, "account");
  assert.equal(session.name, "Sarah");
  assert.equal(session.email, "sarah@example.com");
  assert.equal(session.sessionVersion, 3);
  assert.equal(session.role, undefined);
  assert.equal(session.facilityId, undefined);
  assert.equal(session.organizationId, undefined);

  const { payload } = await jwtVerify(
    result.token,
    new TextEncoder().encode(process.env.AUTH_SECRET),
  );
  for (const claim of [
    "facilityId",
    "organizationId",
    "role",
    "accessKind",
    "partnerOrganizationId",
    "facilityPartnerOrganizationId",
    "primaryDepartmentId",
    "activeUnitId",
  ]) {
    assert.equal(payload[claim], undefined, claim);
  }
});

test("account session validator live-checks User only", async () => {
  const users = new Map([
    ["sarah", { isActive: true, sessionVersion: 3 }],
    ["inactive", { isActive: false, sessionVersion: 1 }],
  ]);
  const client = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
  };
  const base = {
    uid: "sarah",
    authKind: "user" as const,
    authMethod: "PASSWORD" as const,
    name: "Sarah",
    email: "sarah@example.com",
    scopeKind: "account" as const,
    sessionVersion: 3,
  };
  const valid = await validateSessionAuthority(base, client as never);
  assert.equal(valid.valid, true);

  const missing = await validateSessionAuthority({ ...base, uid: "missing" }, client as never);
  assert.deepEqual(missing, { valid: false, reason: "IDENTITY_NOT_FOUND" });

  const inactive = await validateSessionAuthority({ ...base, uid: "inactive", sessionVersion: 1 }, client as never);
  assert.deepEqual(inactive, { valid: false, reason: "IDENTITY_INACTIVE" });

  const stale = await validateSessionAuthority({ ...base, sessionVersion: 2 }, client as never);
  assert.deepEqual(stale, { valid: false, reason: "VERSION_STALE" });
});

test("explicit partner leave remains org-return, not account recovery", () => {
  const leave = readFileSync(join(process.cwd(), "src/app/partner/actions.ts"), "utf8");
  assert.ok(leave.includes("leavePartnerFacilityAction"));
  assert.ok(leave.includes("completePartnerFacilityTransition"));
  assert.equal(leave.includes("enterAccountContext"), false);
  const accountPage = readFileSync(join(process.cwd(), "src/app/account/page.tsx"), "utf8");
  assert.equal(accountPage.includes("enterAccountContext"), false);
});

test("enterContext does not call listAvailableContexts", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/context-entry/enter.ts"), "utf8");
  assert.equal(source.includes("listAvailableContexts"), false);
  assert.ok(source.includes("resolveFacilityAuthorization"));
  assert.ok(source.includes('accessKind: "partner"'));
  assert.equal(source.includes("listAuthorizedPartnerFacilitiesForUser"), false);
});

test("organization entry live-validates membership and remints", async () => {
  const world = sarahWorld();
  const result = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "organization:metz",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(result.kind, "organization");
  assert.equal(result.redirectPath, "/organization/metz");
  const session = await verifySessionToken(result.token);
  assert.equal(session.scopeKind, "organization");
  assert.equal(session.organizationId, "metz");
  assert.equal(session.role, undefined);
  assert.equal(session.facilityId, undefined);
});

test("organization TOCTOU — ended membership does not mint", async () => {
  const world = sarahWorld();
  world.endMembership("sarah", "metz");
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "sarah",
        contextKey: "organization:metz",
        now: NOW,
        sessionVersion: 3,
      }),
    (error: unknown) =>
      error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE",
  );
});

test("internal entry uses current grant role, never User.roleId", async () => {
  const world = sarahWorld();
  const result = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_internal:terrace",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(result.kind, "facility_internal");
  assert.equal(result.role, "MANAGER");
  const session = await verifySessionToken(result.token);
  assert.equal(session.scopeKind, "facility");
  assert.equal(session.authKind, "user");
  assert.equal(session.accessKind, undefined);
  assert.equal(session.role, "MANAGER");
  assert.equal(session.facilityId, "terrace");
});

test("internal TOCTOU — revoked grant does not mint", async () => {
  const world = sarahWorld();
  const grantId = world.addGrant({ userId: "sarah", facilityId: "ecmc", roleKey: "STAFF" });
  world.revokeGrant(grantId);
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "sarah",
        contextKey: "facility_internal:ecmc",
        now: NOW,
        sessionVersion: 3,
      }),
    (error: unknown) =>
      error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE",
  );
});

test("internal re-entry remints the current role after ROLE change", async () => {
  const world = sarahWorld();
  const first = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_internal:terrace",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(first.role, "MANAGER");
  world.changeGrantRole(world.terraceGrantId, "STAFF");
  const second = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_internal:terrace",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(second.role, "STAFF");
  const session = await verifySessionToken(second.token);
  assert.equal(session.role, "STAFF");
});

test("partner entry live-validates Path B and does not require an Organization session", async () => {
  const world = sarahWorld();
  const result = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_partner:metz-terrace",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(result.kind, "facility_partner");
  assert.equal(result.redirectPath, "/partner");
  assert.equal(result.facilityId, "terrace");
  assert.equal(result.partnerOrganizationId, "metz");
  assert.equal(result.facilityPartnerOrganizationId, "metz-terrace");
  const session = await verifySessionToken(result.token);
  assert.ok(isPartnerFacilitySession(session));
  assert.equal(session.role, undefined);
});

test("partner TOCTOU — restriction after list does not mint", async () => {
  const world = sarahWorld();
  world.restrict("sarah", "metz-terrace");
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "sarah",
        contextKey: "facility_partner:metz-terrace",
        now: NOW,
        sessionVersion: 3,
      }),
    (error: unknown) =>
      error instanceof ContextEntryError && error.code === "CONTEXT_NOT_AVAILABLE",
  );
});

test("same Facility dual context is determined by context key", async () => {
  const world = sarahWorld();
  const internal = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_internal:terrace",
    now: NOW,
    sessionVersion: 3,
  });
  const partner = await enterContext(world.db, {
    userId: "sarah",
    contextKey: "facility_partner:metz-terrace",
    now: NOW,
    sessionVersion: 3,
  });
  assert.equal(internal.kind, "facility_internal");
  assert.equal(partner.kind, "facility_partner");
  assert.equal(internal.facilityId, partner.facilityId);
  const internalSession = await verifySessionToken(internal.token);
  const partnerSession = await verifySessionToken(partner.token);
  assert.equal(internalSession.role, "MANAGER");
  assert.ok(isPartnerFacilitySession(partnerSession));
});

test("source session kind is irrelevant — every destination remints exclusively", async () => {
  const world = sarahWorld();
  for (const key of [
    "organization:metz",
    "facility_internal:terrace",
    "facility_partner:metz-terrace",
  ] as const) {
    const result = await enterContext(world.db, {
      userId: "sarah",
      contextKey: key,
      now: NOW,
      sessionVersion: 3,
    });
    assert.ok(result.token.length > 0, key);
  }
});

test("identity errors do not mint a workspace or account recovery token from enterContext", async () => {
  const world = sarahWorld();
  world.addUser({
    id: "inactive",
    email: "inactive@example.com",
    displayName: "Inactive",
    isActive: false,
    facilityId: null,
    sessionVersion: 1,
  });
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "missing",
        contextKey: "organization:metz",
        now: NOW,
      }),
    (error: unknown) => error instanceof ContextEntryError && error.code === "USER_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "inactive",
        contextKey: "organization:metz",
        now: NOW,
      }),
    (error: unknown) => error instanceof ContextEntryError && error.code === "USER_INACTIVE",
  );
  await assert.rejects(
    () =>
      enterContext(world.db, {
        userId: "sarah",
        contextKey: "organization:metz",
        now: NOW,
        sessionVersion: 99,
      }),
    (error: unknown) =>
      error instanceof ContextEntryError && error.code === "SESSION_VERSION_STALE",
  );
});

test("cookie transition clears incompatible department cookies and never copies across kinds", () => {
  const writes: Array<{ name: string; value: string }> = [];
  const jar = {
    set(name: string, value: string) {
      writes.push({ name, value });
    },
  };

  applyContextTransitionCookies(
    jar,
    {
      kind: "facility_internal",
      token: "internal-token",
      facilityId: "terrace",
    },
    {
      session: {
        uid: "sarah",
        authKind: "user",
        authMethod: "PASSWORD",
        name: "Sarah",
        email: "sarah@example.com",
        scopeKind: "facility",
        accessKind: "partner",
        facilityId: "terrace",
        partnerOrganizationId: "metz",
        facilityPartnerOrganizationId: "metz-terrace",
      },
      partnerDepartmentId: "dept-terrace",
    },
  );
  assert.ok(writes.some((row) => row.name === "ltc_session" && row.value === "internal-token"));
  assert.ok(writes.some((row) => row.name === PARTNER_ACTIVE_DEPARTMENT_COOKIE && row.value === ""));
  assert.ok(writes.some((row) => row.name === ACTIVE_DEPARTMENT_COOKIE && row.value === ""));
  assert.ok(writes.some((row) => row.name === DEVICE_FACILITY_COOKIE && row.value === "terrace"));

  writes.length = 0;
  applyContextTransitionCookies(
    jar,
    {
      kind: "facility_partner",
      token: "partner-b",
      facilityPartnerOrganizationId: "metz-ecmc",
      allowedDepartmentIds: ["dept-ecmc"],
    },
    {
      session: {
        uid: "sarah",
        authKind: "user",
        authMethod: "PASSWORD",
        name: "Sarah",
        email: "sarah@example.com",
        scopeKind: "facility",
        accessKind: "partner",
        facilityId: "terrace",
        partnerOrganizationId: "metz",
        facilityPartnerOrganizationId: "metz-terrace",
      },
      partnerDepartmentId: "dept-terrace",
    },
  );
  assert.ok(writes.some((row) => row.name === PARTNER_ACTIVE_DEPARTMENT_COOKIE && row.value === ""));

  writes.length = 0;
  applyContextTransitionCookies(
    jar,
    {
      kind: "facility_partner",
      token: "partner-a",
      facilityPartnerOrganizationId: "metz-terrace",
      allowedDepartmentIds: ["dept-terrace"],
    },
    {
      session: {
        uid: "sarah",
        authKind: "user",
        authMethod: "PASSWORD",
        name: "Sarah",
        email: "sarah@example.com",
        scopeKind: "facility",
        accessKind: "partner",
        facilityId: "terrace",
        partnerOrganizationId: "metz",
        facilityPartnerOrganizationId: "metz-terrace",
      },
      partnerDepartmentId: "dept-terrace",
    },
  );
  assert.ok(
    writes.some((row) => row.name === PARTNER_ACTIVE_DEPARTMENT_COOKIE && row.value === "dept-terrace"),
  );
});
