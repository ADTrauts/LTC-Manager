import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OrganizationPartnerRole } from "@prisma/client";

import { grantUserFacilityAccess } from "@/lib/facility-access";
import { periodsOverlap } from "@/lib/partner-access";
import { APP_ROLES } from "@/lib/access";
import {
  assignPartnerUser,
  changePartnerUserRole,
  comparePartnerRoles,
  endPartnerUserAssignment,
  isPartnerRoleAtOrBelow,
  minPartnerRole,
  PartnerUserAccessError,
  partnerRoleRank,
  resolveFacilityAuthorization,
  setFacilityPartnerRoleCeiling,
  UNVERSIONED_AUTHORIZATION_FACTS,
} from "@/lib/partner-user-access";

const root = process.cwd();

test("partner role rank is explicit and ignores string order", () => {
  assert.equal(partnerRoleRank("PARTNER_VIEWER"), 1);
  assert.equal(partnerRoleRank("PARTNER_OPERATOR"), 2);
  assert.equal(partnerRoleRank("PARTNER_MANAGER"), 3);
  assert.ok(comparePartnerRoles("PARTNER_VIEWER", "PARTNER_OPERATOR") < 0);
  assert.ok(comparePartnerRoles("PARTNER_OPERATOR", "PARTNER_MANAGER") < 0);
  assert.equal(minPartnerRole("PARTNER_MANAGER", "PARTNER_VIEWER"), "PARTNER_VIEWER");
  assert.equal(isPartnerRoleAtOrBelow("PARTNER_OPERATOR", "PARTNER_MANAGER"), true);
  assert.equal(isPartnerRoleAtOrBelow("PARTNER_MANAGER", "PARTNER_VIEWER"), false);
  assert.ok("PARTNER_MANAGER" < "PARTNER_OPERATOR");
  assert.ok(comparePartnerRoles("PARTNER_MANAGER", "PARTNER_OPERATOR") > 0);
  for (const role of APP_ROLES) {
    assert.equal(role.startsWith("PARTNER_"), false);
  }
});

test("phase 2C1 does not issue a partner facility session", () => {
  const auth = readFileSync(join(root, "src/lib/auth.ts"), "utf8");
  const switching = readFileSync(
    join(root, "src/lib/facility-access/switch-active-facility.ts"),
    "utf8",
  );
  const validation = readFileSync(
    join(root, "src/lib/session-revocation/session-version.ts"),
    "utf8",
  );
  const service = readFileSync(join(root, "src/lib/partner-user-access/service.ts"), "utf8");
  assert.equal(auth.includes("OrganizationPartnerRole"), false);
  assert.equal(auth.includes('accessKind: "partner"'), false);
  assert.equal(switching.includes("PartnerUser"), false);
  assert.equal(validation.includes("PartnerUser"), false);
  assert.equal(service.includes("DepartmentOperatorRelationship"), false);
  assert.equal(service.includes("userFacilityAccess.create"), false);
  assert.equal(service.includes("switchActiveFacility"), false);
});

test("facility administrator assignment preserves history and denies broken links", async () => {
  const world = createWorld();
  const { db, actor } = world;

  await assert.rejects(
    () => assignPartnerUser(db, { ...actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "CEILING_ABSENT",
  );

  const viewerAt = at("2026-01-01T00:00:00.000Z");
  const ceiling = await setFacilityPartnerRoleCeiling(db, {
    ...actor,
    maxPartnerRole: "PARTNER_VIEWER",
    at: viewerAt,
  });
  assert.equal(ceiling?.maxPartnerRole, "PARTNER_VIEWER");

  await assert.rejects(
    () =>
      assignPartnerUser(db, {
        ...actor,
        userId: "jane",
        partnerRole: "PARTNER_OPERATOR",
        at: at("2026-01-02T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ROLE_ABOVE_CEILING",
  );

  await setFacilityPartnerRoleCeiling(db, {
    ...actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-03T00:00:00.000Z"),
  });
  const lowered = await setFacilityPartnerRoleCeiling(db, {
    ...actor,
    maxPartnerRole: "PARTNER_OPERATOR",
    at: at("2026-03-01T00:00:00.000Z"),
  });
  assert.equal(lowered?.maxPartnerRole, "PARTNER_OPERATOR");
  await setFacilityPartnerRoleCeiling(db, {
    ...actor,
    maxPartnerRole: null,
    at: at("2026-04-01T00:00:00.000Z"),
  });
  const restored = await setFacilityPartnerRoleCeiling(db, {
    ...actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-05-01T00:00:00.000Z"),
  });
  assert.equal(restored?.maxPartnerRole, "PARTNER_MANAGER");
  assert.equal(overlapping(world.ceilings), false);
  assert.equal(
    ceilingAt(world, at("2026-01-02T00:00:00.000Z"))?.maxPartnerRole,
    "PARTNER_VIEWER",
  );
  assert.equal(
    ceilingAt(world, at("2026-03-15T00:00:00.000Z"))?.maxPartnerRole,
    "PARTNER_OPERATOR",
  );
  assert.equal(ceilingAt(world, at("2026-04-15T00:00:00.000Z")), null);
  assert.equal(
    ceilingAt(world, at("2026-06-01T00:00:00.000Z"))?.maxPartnerRole,
    "PARTNER_MANAGER",
  );

  const jane = await assignPartnerUser(db, {
    ...actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-05-02T00:00:00.000Z"),
  });
  const john = await assignPartnerUser(db, {
    ...actor,
    userId: "john",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-05-02T00:00:00.000Z"),
  });
  assert.notEqual(jane.assignmentId, john.assignmentId);
  assert.equal(world.facilityAccesses.length, 0);
  assert.equal(world.users.find((user) => user.id === "jane")?.facilityId, null);
  assert.equal(world.users.find((user) => user.id === "jane")?.roleId, null);

  await changePartnerUserRole(db, {
    ...actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-05-10T00:00:00.000Z"),
  });
  await changePartnerUserRole(db, {
    ...actor,
    userId: "jane",
    partnerRole: "PARTNER_MANAGER",
    at: at("2026-05-20T00:00:00.000Z"),
  });
  await endPartnerUserAssignment(db, {
    ...actor,
    userId: "jane",
    at: at("2026-06-01T00:00:00.000Z"),
  });
  const rejoined = await assignPartnerUser(db, {
    ...actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(rejoined.assignmentId, jane.assignmentId);
  const janePeriods = world.rolePeriods.filter(
    (period) => period.partnerUserFacilityAccessId === jane.assignmentId,
  );
  assert.equal(janePeriods.length, 4);
  assert.equal(overlapping(janePeriods), false);
  assert.deepEqual(
    janePeriods.map((period) => period.partnerRole),
    ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER", "PARTNER_OPERATOR"],
  );

  const current = await resolveFacilityAuthorization(db, {
    userId: "jane",
    facilityId: "fac",
    instant: at("2026-07-15T00:00:00.000Z"),
    accessKind: "partner",
  });
  assert.equal(current.authorization.path, "partner");
  if (current.authorization.path === "partner") {
    assert.equal(current.authorization.assignedRole, "PARTNER_OPERATOR");
    assert.equal(current.authorization.effectiveRole, "PARTNER_OPERATOR");
    assert.deepEqual(current.authorization.allowedDepartmentIds, ["dietary"]);
  }
  assert.deepEqual(current.unversionedFacts, UNVERSIONED_AUTHORIZATION_FACTS);

  await assertDenied(db, "jane", () => {
    const membership = world.memberships.find((row) => row.userId === "jane");
    const open = membership?.rolePeriods.find((period) => period.endsAt === null);
    if (open) open.endsAt = at("2026-07-16T00:00:00.000Z");
  });
  const membership = world.memberships.find((row) => row.userId === "jane");
  const closed = membership?.rolePeriods.find((period) => period.endsAt);
  if (closed) closed.endsAt = null;

  world.organizations[0]!.isActive = false;
  await assertDenied(db, "jane");
  world.organizations[0]!.isActive = true;

  world.users.find((user) => user.id === "jane")!.isActive = false;
  const historicalWhileInactive = await resolveFacilityAuthorization(db, {
    userId: "jane",
    facilityId: "fac",
    instant: at("2026-07-15T00:00:00.000Z"),
    accessKind: "partner",
  });
  assert.equal(historicalWhileInactive.authorization.path, "none");
  world.users.find((user) => user.id === "jane")!.isActive = true;

  const access = world.accessPeriods[0]!;
  access.endsAt = at("2026-07-16T00:00:00.000Z");
  await assertDenied(db, "jane", undefined, at("2026-07-20T00:00:00.000Z"));
  access.endsAt = null;

  world.partnerships[0]!.endedAt = at("2026-07-01T00:00:00.000Z");
  await assertDenied(db, "jane");
  world.partnerships[0]!.endedAt = null;

  world.departments[0]!.isActive = false;
  await assertDenied(db, "jane");
  world.departments[0]!.isActive = true;

  world.departments[0]!.facilityId = "other-fac";
  await assertDenied(db, "jane");
  world.departments[0]!.facilityId = "fac";

  world.scopes[0]!.endsAt = at("2026-07-02T00:00:00.000Z");
  await assertDenied(db, "jane");
  world.scopes[0]!.endsAt = null;

  const openCeiling = world.ceilings.find((period) => period.endsAt === null);
  if (openCeiling) openCeiling.endsAt = at("2026-07-02T00:00:00.000Z");
  await assertDenied(db, "jane");
  if (openCeiling) openCeiling.endsAt = null;

  await endPartnerUserAssignment(db, {
    ...actor,
    userId: "jane",
    at: at("2026-08-01T00:00:00.000Z"),
  });
  await assertDenied(db, "jane", undefined, at("2026-08-02T00:00:00.000Z"));
});

test("historical ceiling caps effective role without rewriting the assignment", async () => {
  const world = createWorld();
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_VIEWER",
    at: at("2026-03-01T00:00:00.000Z"),
  });
  await assert.rejects(
    () =>
      changePartnerUserRole(world.db, {
        ...world.actor,
        userId: "jane",
        partnerRole: "PARTNER_OPERATOR",
        at: at("2026-04-01T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ROLE_ABOVE_CEILING",
  );
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_OPERATOR",
    at: at("2026-05-01T00:00:00.000Z"),
  });
  await changePartnerUserRole(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-05-01T00:00:00.000Z"),
  });
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_VIEWER",
    at: at("2026-05-01T00:00:01.000Z"),
  });
  await endPartnerUserAssignment(world.db, {
    ...world.actor,
    userId: "jane",
    at: at("2026-06-01T00:00:00.000Z"),
  });

  const jan = await partnerAt(world.db, "2026-01-15T00:00:00.000Z");
  const apr = await partnerAt(world.db, "2026-04-15T00:00:00.000Z");
  const may = await partnerAt(world.db, "2026-05-15T00:00:00.000Z");
  const jul = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    instant: at("2026-07-15T00:00:00.000Z"),
    accessKind: "partner",
  });
  assert.equal(jan.assignedRole, "PARTNER_MANAGER");
  assert.equal(jan.effectiveRole, "PARTNER_MANAGER");
  assert.equal(apr.assignedRole, "PARTNER_MANAGER");
  assert.equal(apr.facilityRoleCeiling, "PARTNER_VIEWER");
  assert.equal(apr.effectiveRole, "PARTNER_VIEWER");
  assert.equal(may.assignedRole, "PARTNER_OPERATOR");
  assert.equal(may.effectiveRole, "PARTNER_VIEWER");
  assert.equal(jul.authorization.path, "none");
  assert.equal(world.rolePeriods.filter((period) => period.partnerRole === "PARTNER_MANAGER").length, 1);
});

test("effective role is the lower of assignment and ceiling", async () => {
  const world = createWorld();
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_VIEWER",
  });
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
  });
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_MANAGER",
  });
  await changePartnerUserRole(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
  });
  const operator = await partnerAt(world.db);
  assert.equal(operator.assignedRole, "PARTNER_OPERATOR");
  assert.equal(operator.effectiveRole, "PARTNER_OPERATOR");

  await changePartnerUserRole(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_MANAGER",
  });
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_VIEWER",
  });
  const capped = await partnerAt(world.db);
  assert.equal(capped.assignedRole, "PARTNER_MANAGER");
  assert.equal(capped.effectiveRole, "PARTNER_VIEWER");
});

test("path A and path B stay separate", async () => {
  const world = createWorld();
  world.departments.push({ id: "evs", facilityId: "fac", isActive: true });
  world.users.push({
    id: "sarah",
    email: "sarah@terrace.example",
    displayName: "Sarah",
    isActive: true,
    facilityId: "fac",
    roleId: "role_fa",
    role: { key: "FACILITY_ADMINISTRATOR", isActive: true },
  });
  world.memberships.push({
    id: "mem_sarah",
    userId: "sarah",
    organizationId: "metz",
    createdAt: at("2020-01-01T00:00:00.000Z"),
    rolePeriods: [
      {
        id: "mem_sarah_period",
        role: "ORG_MEMBER",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      },
    ],
  });
  await setFacilityPartnerRoleCeiling(world.db, { ...world.actor, maxPartnerRole: "PARTNER_MANAGER" });
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "sarah",
    partnerRole: "PARTNER_MANAGER",
  });
  world.scopes.push({
    id: "scope_evs",
    facilityPartnerOrganizationId: "partnership",
    departmentId: "evs",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });

  const both = await resolveFacilityAuthorization(world.db, {
    userId: "sarah",
    facilityId: "fac",
  });
  assert.equal(both.authorization.path, "internal");
  assert.deepEqual(both.paths.internal?.allowedDepartmentIds, ["dietary", "evs"]);
  assert.equal(both.paths.internal?.facilityRole, "FACILITY_ADMINISTRATOR");
  assert.deepEqual(both.paths.partner?.allowedDepartmentIds, ["dietary", "evs"]);
  assert.equal("facilityRole" in (both.paths.partner ?? {}), false);

  world.scopes.splice(
    world.scopes.findIndex((scope) => scope.id === "scope_evs"),
    1,
  );
  const split = await resolveFacilityAuthorization(world.db, {
    userId: "sarah",
    facilityId: "fac",
    accessKind: "partner",
  });
  assert.deepEqual(split.paths.internal?.allowedDepartmentIds, ["dietary", "evs"]);
  assert.deepEqual(split.paths.partner?.allowedDepartmentIds, ["dietary"]);
  assert.equal(split.authorization.path, "partner");
  if (split.authorization.path === "partner") {
    assert.equal("facilityRole" in split.authorization, false);
  }
});

test("internal authorization ignores partner tables and still rejects cross-organization grants", async () => {
  const world = createWorld();
  const internal = await resolveFacilityAuthorization(world.db, {
    userId: "actor",
    facilityId: "fac",
  });
  assert.equal(internal.authorization.path, "internal");
  assert.equal(internal.paths.partner, null);

  await assert.rejects(
    () =>
      grantUserFacilityAccess(crossOrgDb(), {
        actorUserId: "actor",
        actorFacilityId: "fac_a",
        targetUserId: "native",
        targetFacilityId: "fac_b",
      }),
    /Cross-organization facility grant rejected/,
  );
});

test("assignment eligibility fails closed", async () => {
  const world = createWorld();
  await setFacilityPartnerRoleCeiling(world.db, { ...world.actor, maxPartnerRole: "PARTNER_MANAGER" });

  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "stranger", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
  );

  const ended = world.memberships.find((row) => row.userId === "former")!;
  ended.rolePeriods[0]!.endsAt = at("2026-01-01T00:00:00.000Z");
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "former", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
  );

  world.users.find((user) => user.id === "jane")!.isActive = false;
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "USER_INACTIVE",
  );
  world.users.find((user) => user.id === "jane")!.isActive = true;

  world.organizations[0]!.isActive = false;
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ORGANIZATION_INACTIVE",
  );
  world.organizations[0]!.isActive = true;

  world.accessPeriods[0]!.endsAt = at("2026-01-01T00:00:00.000Z");
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNERSHIP_INACTIVE",
  );
  world.accessPeriods[0]!.endsAt = null;

  world.partnerships[0]!.endedAt = at("2026-01-01T00:00:00.000Z");
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNERSHIP_ENDED",
  );
  world.partnerships[0]!.endedAt = null;

  world.scopes[0]!.endsAt = at("2026-01-01T00:00:00.000Z");
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...world.actor, userId: "jane", partnerRole: "PARTNER_VIEWER" }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "SCOPE_EMPTY",
  );
  world.scopes[0]!.endsAt = null;

  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        actorUserId: "john",
        partnershipId: "partnership",
        facilityId: "fac",
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
      }),
    (error: unknown) =>
      error instanceof PartnerUserAccessError && error.code === "NOT_FACILITY_ADMINISTRATOR",
  );
});

function at(iso: string): Date {
  return new Date(iso);
}

async function partnerAt(db: ReturnType<typeof createWorld>["db"], iso?: string) {
  const result = await resolveFacilityAuthorization(db, {
    userId: "jane",
    facilityId: "fac",
    instant: iso ? at(iso) : new Date(),
    accessKind: "partner",
  });
  assert.equal(result.authorization.path, "partner");
  if (result.authorization.path !== "partner") throw new Error("expected partner");
  return result.authorization;
}

async function assertDenied(
  db: ReturnType<typeof createWorld>["db"],
  userId: string,
  mutate?: () => void,
  instant?: Date,
) {
  mutate?.();
  const result = await resolveFacilityAuthorization(db, {
    userId,
    facilityId: "fac",
    instant,
    accessKind: "partner",
  });
  assert.equal(result.authorization.path, "none");
}

function overlapping(periods: Array<{ startsAt: Date; endsAt: Date | null }>): boolean {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) return true;
    }
  }
  return false;
}

function ceilingAt(world: ReturnType<typeof createWorld>, instant: Date) {
  return (
    world.ceilings.find(
      (period) =>
        period.startsAt.getTime() <= instant.getTime() &&
        (period.endsAt === null || instant.getTime() < period.endsAt.getTime()),
    ) ?? null
  );
}

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  facilityId: string | null;
  roleId: string | null;
  role: { key: string; isActive: boolean } | null;
};

type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  createdAt: Date;
  rolePeriods: Array<{ id: string; role: "ORG_ADMIN" | "ORG_MEMBER"; startsAt: Date; endsAt: Date | null }>;
};

function createWorld() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const organizations = [{ id: "metz", isActive: true }];
  const partnerships = [
    { id: "partnership", facilityId: "fac", organizationId: "metz", endedAt: null as Date | null },
  ];
  const users: UserRow[] = [
    {
      id: "actor",
      email: "fa@terrace.example",
      displayName: "Facility Admin",
      isActive: true,
      facilityId: "fac",
      roleId: "role_fa",
      role: { key: "FACILITY_ADMINISTRATOR", isActive: true },
    },
    {
      id: "jane",
      email: "jane@metz.example",
      displayName: "Jane Smith",
      isActive: true,
      facilityId: null,
      roleId: null,
      role: null,
    },
    {
      id: "john",
      email: "john@metz.example",
      displayName: "John Doe",
      isActive: true,
      facilityId: null,
      roleId: null,
      role: null,
    },
    {
      id: "former",
      email: "former@metz.example",
      displayName: "Former",
      isActive: true,
      facilityId: null,
      roleId: null,
      role: null,
    },
    {
      id: "stranger",
      email: "stranger@example.com",
      displayName: "Stranger",
      isActive: true,
      facilityId: null,
      roleId: null,
      role: null,
    },
  ];
  const memberships: Membership[] = [
    {
      id: "mem_jane",
      userId: "jane",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_jane_period", role: "ORG_MEMBER", startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null },
      ],
    },
    {
      id: "mem_john",
      userId: "john",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_john_period", role: "ORG_ADMIN", startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null },
      ],
    },
    {
      id: "mem_former",
      userId: "former",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_former_period", role: "ORG_MEMBER", startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null },
      ],
    },
  ];
  const accessPeriods = [
    {
      id: "access",
      facilityPartnerOrganizationId: "partnership",
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null as Date | null,
    },
  ];
  const departments = [{ id: "dietary", facilityId: "fac", isActive: true }];
  const scopes = [
    {
      id: "scope_dietary",
      facilityPartnerOrganizationId: "partnership",
      departmentId: "dietary",
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null as Date | null,
    },
  ];
  const ceilings: Array<{
    id: string;
    facilityPartnerOrganizationId: string;
    maxPartnerRole: OrganizationPartnerRole;
    startsAt: Date;
    endsAt: Date | null;
    createdByUserId: string | null;
    endedByUserId: string | null;
  }> = [];
  const assignments: Array<{
    id: string;
    userId: string;
    facilityPartnerOrganizationId: string;
    createdByUserId: string | null;
  }> = [];
  const rolePeriods: Array<{
    id: string;
    partnerUserFacilityAccessId: string;
    partnerRole: OrganizationPartnerRole;
    startsAt: Date;
    endsAt: Date | null;
    createdByUserId: string | null;
    endedByUserId: string | null;
  }> = [];
  const facilityAccesses: Array<{ id: string; userId: string; facilityId: string; isActive: boolean; revokedAt: Date | null }> = [];

  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    $queryRaw: async (query: { values?: unknown[] }) => {
      const id = String(query.values?.[0] ?? "");
      return partnerships.some((row) => row.id === id) ? [{ id }] : [];
    },
    user: {
      findUnique: async ({ where }: { where: { id: string }; select?: { facilityAccesses?: { where?: { facilityId?: string } } } }) => {
        const user = users.find((row) => row.id === where.id);
        if (!user) return null;
        return {
          ...user,
          facilityAccesses: facilityAccesses.filter(
            (grant) => grant.userId === user.id && grant.isActive && grant.revokedAt === null,
          ),
        };
      },
    },
    department: {
      findMany: async ({ where }: { where: { facilityId: string; isActive: boolean } }) =>
        departments
          .filter((row) => row.facilityId === where.facilityId && row.isActive === where.isActive)
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((row) => ({ id: row.id })),
    },
    employee: {
      findFirst: async () => null,
    },
    facilityPartnerOrganization: {
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) => {
        const row = partnerships.find((item) => item.id === where.id && item.facilityId === where.facilityId);
        if (!row) return null;
        const organization = organizations.find((item) => item.id === row.organizationId);
        return { ...row, organization: { id: organization?.id, isActive: organization?.isActive } };
      },
    },
    facilityPartnerRoleCeilingPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        ceilings
          .filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId)
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({ data }: { data: Omit<(typeof ceilings)[number], "id" | "endsAt" | "endedByUserId"> & { endsAt?: Date | null; endedByUserId?: string | null } }) => {
        const row = {
          id: nextId("ceiling"),
          endedByUserId: null,
          endsAt: null,
          ...data,
        };
        ceilings.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: { endsAt?: Date; endedByUserId?: string } }) => {
        const row = ceilings.find((item) => item.id === where.id);
        if (!row) throw new Error("missing ceiling");
        Object.assign(row, data);
        return row;
      },
    },
    facilityPartnerAccessPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        accessPeriods.filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId),
    },
    facilityPartnerDepartmentScope: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        scopes
          .filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId)
          .map((row) => ({
            ...row,
            department: departments.find((department) => department.id === row.departmentId) ?? {
              id: row.departmentId,
              facilityId: "missing",
              isActive: false,
            },
          })),
    },
    userOrganizationMembership: {
      findUnique: async ({ where }: { where: { userId_organizationId: { userId: string; organizationId: string } } }) => {
        const row = memberships.find(
          (item) =>
            item.userId === where.userId_organizationId.userId &&
            item.organizationId === where.userId_organizationId.organizationId,
        );
        if (!row) return null;
        const organization = organizations.find((item) => item.id === row.organizationId);
        return { ...row, organization: { isActive: organization?.isActive ?? false } };
      },
      findMany: async () => [],
    },
    partnerUserFacilityAccess: {
      findUnique: async ({ where }: { where: { userId_facilityPartnerOrganizationId: { userId: string; facilityPartnerOrganizationId: string } } }) => {
        const row = assignments.find(
          (item) =>
            item.userId === where.userId_facilityPartnerOrganizationId.userId &&
            item.facilityPartnerOrganizationId ===
              where.userId_facilityPartnerOrganizationId.facilityPartnerOrganizationId,
        );
        if (!row) return null;
        return {
          ...row,
          rolePeriods: rolePeriods.filter((period) => period.partnerUserFacilityAccessId === row.id),
        };
      },
      findMany: async ({ where }: { where: { userId?: string; facilityPartnerOrganizationId?: string; facilityPartnerOrganization?: { facilityId: string } } }) => {
        return assignments
          .filter((row) => {
            if (where.userId && row.userId !== where.userId) return false;
            if (where.facilityPartnerOrganizationId && row.facilityPartnerOrganizationId !== where.facilityPartnerOrganizationId) return false;
            if (where.facilityPartnerOrganization) {
              const partnership = partnerships.find((item) => item.id === row.facilityPartnerOrganizationId);
              if (partnership?.facilityId !== where.facilityPartnerOrganization.facilityId) return false;
            }
            return true;
          })
          .map((row) => {
            const partnership = partnerships.find((item) => item.id === row.facilityPartnerOrganizationId)!;
            const organization = organizations.find((item) => item.id === partnership.organizationId);
            const user = users.find((item) => item.id === row.userId);
            return {
              ...row,
              rolePeriods: rolePeriods.filter((period) => period.partnerUserFacilityAccessId === row.id),
              user,
              facilityPartnerOrganization: {
                ...partnership,
                organization: { isActive: organization?.isActive ?? false },
              },
            };
          });
      },
      create: async ({ data }: { data: { userId: string; facilityPartnerOrganizationId: string; createdByUserId: string | null } }) => {
        const row = { id: nextId("assignment"), ...data };
        assignments.push(row);
        return { ...row, rolePeriods: [] };
      },
    },
    partnerUserRolePeriod: {
      create: async ({ data }: { data: Omit<(typeof rolePeriods)[number], "id" | "endsAt" | "endedByUserId"> }) => {
        const row = { id: nextId("role"), endsAt: null, endedByUserId: null, ...data };
        rolePeriods.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: { endsAt?: Date; endedByUserId?: string } }) => {
        const row = rolePeriods.find((item) => item.id === where.id);
        if (!row) throw new Error("missing role period");
        Object.assign(row, data);
        return row;
      },
    },
  };

  return {
    db: db as never,
    actor: { actorUserId: "actor", partnershipId: "partnership", facilityId: "fac" },
    users,
    organizations,
    partnerships,
    accessPeriods,
    departments,
    scopes,
    ceilings,
    assignments,
    rolePeriods,
    facilityAccesses,
    memberships,
  };
}

function crossOrgDb() {
  const facilities = [
    { id: "fac_a", organizationId: "org_a" },
    { id: "fac_b", organizationId: "org_b" },
  ];
  return {
    facility: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        facilities.find((row) => row.id === where.id) ?? null,
    },
    user: {
      findUnique: async () => ({
        id: "native",
        facilityId: "fac_a",
        isActive: true,
        facility: { organizationId: "org_a" },
        facilityAccesses: [],
      }),
    },
    userFacilityAccess: {
      create: async () => {
        throw new Error("cross-org grant must not create access");
      },
    },
  } as never;
}
