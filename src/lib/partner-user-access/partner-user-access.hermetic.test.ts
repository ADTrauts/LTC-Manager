import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OrganizationPartnerRole } from "@prisma/client";

import { grantUserFacilityAccess } from "@/lib/facility-access";
import { periodsOverlap } from "@/lib/partner-access";
import { APP_ROLES } from "@/lib/access";
import {
  createPartnerFacilitySessionToken,
  createSessionToken,
  isFacilityScopedSession,
  isPartnerFacilitySession,
  verifySessionToken,
  type AppJwtPayload,
} from "@/lib/auth";
import {
  completePartnerFacilityTransition,
  PartnerFacilitySessionError,
  resolvePartnerFacilityEntry,
} from "@/lib/partner-facility-session";
import { resolvePartnerOperationalContext } from "@/lib/partner-operational-context";
import { getCurrentOrganizationRole } from "@/lib/organization-membership";
import { authorizeRoute } from "@/lib/route-registry/authorize";
import {
  assignPartnerUser,
  blockPartnerUser,
  changePartnerUserRole,
  comparePartnerRoles,
  disablePartnerStaffingDelegation,
  enablePartnerStaffingDelegation,
  endPartnerUserAssignment,
  isPartnerRoleAtOrBelow,
  isPartnerStaffingDelegated,
  listAuthorizedPartnerFacilities,
  minPartnerRole,
  PartnerUserAccessError,
  partnerRoleRank,
  resolveFacilityAuthorization,
  setFacilityPartnerRoleCeiling,
  unblockPartnerUser,
  UNVERSIONED_AUTHORIZATION_FACTS,
} from "@/lib/partner-user-access";
import { validateSessionAuthority } from "@/lib/session-revocation";

process.env.AUTH_SECRET ??= "partner-facility-session-test-secret";

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

test("phase 2C2 keeps internal facility sessions separate from partner sessions", () => {
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
  const partnerMint = auth.slice(
    auth.indexOf("export async function createPartnerFacilitySessionToken"),
    auth.indexOf("export async function createOrganizationSessionToken"),
  );
  assert.equal(auth.includes("OrganizationPartnerRole"), false);
  assert.equal(auth.includes("getAnyFacilitySession"), false);
  assert.equal(partnerMint.includes("partnerRole"), false);
  assert.equal(partnerMint.includes("allowedDepartmentIds"), false);
  assert.equal(partnerMint.includes("primaryDepartmentId"), false);
  assert.match(auth, /export async function getSession\(\)[\s\S]*isFacilityScopedSession\(session\)/);
  assert.equal(switching.includes("PartnerUser"), false);
  assert.equal(validation.includes("cookies("), false);
  assert.equal(validation.includes("createOrganizationSessionToken"), false);
  assert.match(validation, /accessKind === "partner"/);
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
  sessionVersion?: number;
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
  const departments: Array<{ id: string; facilityId: string; isActive: boolean; sortOrder?: number }> = [
    { id: "dietary", facilityId: "fac", isActive: true, sortOrder: 10 },
  ];
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
    createdByAuthorityKind: "facility_admin" | "partner_org_admin";
    createdByOrganizationId: string | null;
    endedByAuthorityKind: "facility_admin" | "partner_org_admin" | null;
    endedByOrganizationId: string | null;
  }> = [];
  const policies: Array<{
    id: string;
    facilityPartnerOrganizationId: string;
    startsAt: Date;
    endsAt: Date | null;
    createdByUserId: string | null;
    endedByUserId: string | null;
    createdByAuthorityKind: "facility_admin" | "partner_org_admin";
    createdByOrganizationId: string | null;
    endedByAuthorityKind: "facility_admin" | "partner_org_admin" | null;
    endedByOrganizationId: string | null;
  }> = [];
  const restrictions: Array<{
    id: string;
    userId: string;
    facilityPartnerOrganizationId: string;
    startsAt: Date;
    endsAt: Date | null;
    note: string | null;
    createdByUserId: string | null;
    endedByUserId: string | null;
    createdByAuthorityKind: "facility_admin" | "partner_org_admin";
    createdByOrganizationId: string | null;
    endedByAuthorityKind: "facility_admin" | "partner_org_admin" | null;
    endedByOrganizationId: string | null;
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
          sessionVersion: user.sessionVersion ?? 0,
          facilityAccesses: facilityAccesses.filter(
            (grant) => grant.userId === user.id && grant.isActive && grant.revokedAt === null,
          ),
        };
      },
    },
    department: {
      findMany: async ({
        where,
      }: {
        where: { facilityId: string; isActive: boolean; id?: { in: string[] } };
      }) =>
        departments
          .filter((row) => row.facilityId === where.facilityId && row.isActive === where.isActive)
          .filter((row) => !where.id?.in || where.id.in.includes(row.id))
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((row) => ({
            id: row.id,
            sortOrder: row.sortOrder ?? (row.id === "evs" ? 20 : 10),
            name:
              row.id === "dietary" || row.id === "dietary_hp"
                ? "Food & Nutrition"
                : row.id === "evs"
                  ? "EVS"
                  : row.id,
          })),
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
              const filter = where.facilityPartnerOrganization as {
                facilityId?: string;
                organizationId?: string;
              };
              if (filter.facilityId && partnership?.facilityId !== filter.facilityId) return false;
              if (filter.organizationId && partnership?.organizationId !== filter.organizationId) return false;
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
                facility: {
                  displayName:
                    partnership.facilityId === "fac"
                      ? "Terrace View"
                      : partnership.facilityId === "hp"
                        ? "HighPointe"
                        : partnership.facilityId,
                },
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
      create: async ({ data }: { data: Omit<(typeof rolePeriods)[number], "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId"> }) => {
        const row = {
          id: nextId("role"),
          endsAt: null,
          endedByUserId: null,
          endedByAuthorityKind: null,
          endedByOrganizationId: null,
          ...data,
        };
        rolePeriods.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rolePeriods.find((item) => item.id === where.id);
        if (!row) throw new Error("missing role period");
        Object.assign(row, data);
        return row;
      },
    },
    facilityPartnerStaffingPolicyPeriod: {
      findMany: async ({ where }: { where: { facilityPartnerOrganizationId: string } }) =>
        policies
          .filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId)
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({ data }: { data: Omit<(typeof policies)[number], "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId"> }) => {
        const row = {
          id: nextId("policy"),
          endsAt: null,
          endedByUserId: null,
          endedByAuthorityKind: null,
          endedByOrganizationId: null,
          ...data,
        };
        policies.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = policies.find((item) => item.id === where.id);
        if (!row) throw new Error("missing policy");
        Object.assign(row, data);
        return row;
      },
    },
    facilityPartnerUserRestrictionPeriod: {
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId: string; userId?: string };
      }) =>
        restrictions
          .filter((row) => row.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId)
          .filter((row) => !where.userId || row.userId === where.userId)
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({ data }: { data: Omit<(typeof restrictions)[number], "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId" | "note"> & { note?: string | null } }) => {
        const row = {
          id: nextId("restriction"),
          endsAt: null,
          endedByUserId: null,
          endedByAuthorityKind: null,
          endedByOrganizationId: null,
          note: null,
          ...data,
        };
        restrictions.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = restrictions.find((item) => item.id === where.id);
        if (!row) throw new Error("missing restriction");
        Object.assign(row, data);
        return row;
      },
    },
    facility: {
      findUnique: async () => ({ id: "fac", displayName: "Terrace View" }),
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
    policies,
    restrictions,
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

async function grantJane(world: ReturnType<typeof createWorld>, role: "PARTNER_MANAGER" | "PARTNER_VIEWER" = "PARTNER_MANAGER") {
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: role,
    at: at("2026-01-02T00:00:00.000Z"),
  });
}

async function janePartnerToken(world: ReturnType<typeof createWorld>) {
  return createPartnerFacilitySessionToken({
    uid: "jane",
    name: "Jane Smith",
    email: "jane@metz.example",
    facilityId: "fac",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "partnership",
    sessionVersion: world.users.find((user) => user.id === "jane")?.sessionVersion ?? 0,
  });
}

test("partner facility token names context and carries no operational authority", async () => {
  const token = await createPartnerFacilitySessionToken({
    uid: "jane",
    name: "Jane Smith",
    email: "jane@metz.example",
    facilityId: "fac",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "partnership",
    sessionVersion: 0,
  });
  const session = await verifySessionToken(token);
  assert.equal(isPartnerFacilitySession(session), true);
  assert.equal(isFacilityScopedSession(session), false);
  assert.equal(session.scopeKind, "facility");
  assert.equal(session.accessKind, "partner");
  assert.equal("role" in session, false);
  assert.equal("partnerRole" in session, false);
  assert.equal("allowedDepartmentIds" in session, false);
  assert.equal("primaryDepartmentId" in session, false);
  const raw = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
  assert.equal(raw.role, undefined);
  assert.equal(raw.partnerRole, undefined);
  assert.equal(raw.allowedDepartmentIds, undefined);
  assert.equal(raw.primaryDepartmentId, undefined);
});

test("internal facility token still requires a Facility role and is not a partner session", async () => {
  const token = await createSessionToken({
    uid: "actor",
    role: "FACILITY_ADMINISTRATOR",
    name: "Facility Admin",
    email: "fa@terrace.example",
    facilityId: "fac",
    sessionVersion: 0,
  });
  const session = await verifySessionToken(token);
  assert.equal(session.accessKind, undefined);
  assert.equal(isFacilityScopedSession(session), true);
  assert.equal(isPartnerFacilitySession(session), false);
  assert.equal(session.role, "FACILITY_ADMINISTRATOR");
});

test("partner entry, live revalidation, and client list stay on Path B", async () => {
  const world = createWorld();
  await grantJane(world);
  const beforeAccess = world.facilityAccesses.length;
  const jane = world.users.find((user) => user.id === "jane")!;
  const home = jane.facilityId;
  const roleId = jane.roleId;

  const entered = await resolvePartnerFacilityEntry(world.db, {
    userId: "jane",
    organizationId: "metz",
    facilityId: "fac",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(entered.effectiveRole, "PARTNER_MANAGER");
  assert.deepEqual(entered.allowedDepartmentIds, ["dietary"]);
  assert.equal(world.facilityAccesses.length, beforeAccess);
  assert.equal(jane.facilityId, home);
  assert.equal(jane.roleId, roleId);

  await assert.rejects(
    () =>
      resolvePartnerFacilityEntry(world.db, {
        userId: "jane",
        organizationId: "otherco",
        facilityId: "fac",
        facilityPartnerOrganizationId: "partnership",
      }),
    (error: unknown) =>
      error instanceof PartnerFacilitySessionError && error.code === "PARTNERSHIP_NOT_IN_ORGANIZATION",
  );
  await assert.rejects(
    () =>
      resolvePartnerFacilityEntry(world.db, {
        userId: "john",
        organizationId: "metz",
        facilityId: "fac",
        facilityPartnerOrganizationId: "partnership",
      }),
    (error: unknown) => error instanceof PartnerFacilitySessionError && error.code === "PARTNER_ACCESS_DENIED",
  );

  const listed = await listAuthorizedPartnerFacilities(world.db, { userId: "jane", organizationId: "metz" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.facilityDisplayName, "Terrace View");
  assert.deepEqual(listed[0]?.departmentNames, ["Food & Nutrition"]);
  assert.equal(listed[0]?.effectiveRole, "PARTNER_MANAGER");
  const john = await listAuthorizedPartnerFacilities(world.db, { userId: "john", organizationId: "metz" });
  assert.equal(john.length, 0);
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "john",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-01-02T00:00:00.000Z"),
  });
  const adminEntered = await resolvePartnerFacilityEntry(world.db, {
    userId: "john",
    organizationId: "metz",
    facilityId: "fac",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(adminEntered.effectiveRole, "PARTNER_VIEWER");

  const session = await verifySessionToken(await janePartnerToken(world));
  const live = await validateSessionAuthority(session, world.db);
  assert.equal(live.valid, true);
  if (live.valid) assert.equal(live.effectiveDepartmentId, null);

  await changePartnerUserRole(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
  });
  const downgraded = await validateSessionAuthority(session, world.db);
  assert.equal(downgraded.valid, true);
  const afterRole = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(afterRole.authorization.path, "partner");
  if (afterRole.authorization.path === "partner") {
    assert.equal(afterRole.authorization.effectiveRole, "PARTNER_VIEWER");
  }

  const mismatches = [
    { ...session, facilityPartnerOrganizationId: "other" },
    { ...session, facilityId: "other" },
    { ...session, partnerOrganizationId: "otherco" },
  ];
  for (const forged of mismatches) {
    const denied = await validateSessionAuthority(forged as AppJwtPayload, world.db);
    assert.equal(denied.valid, false);
  }

  jane.sessionVersion = 3;
  const stale = await validateSessionAuthority(session, world.db);
  assert.equal(stale.valid, false);
  if (!stale.valid) assert.equal(stale.reason, "VERSION_STALE");
  jane.sessionVersion = 0;
});

test("partner session fails closed when Path B facts break and does not bump sessionVersion", async () => {
  async function deniedAfter(mutate: (world: ReturnType<typeof createWorld>) => Promise<void>) {
    const world = createWorld();
    await grantJane(world);
    const session = await verifySessionToken(await janePartnerToken(world));
    const version = world.users.find((user) => user.id === "jane")!.sessionVersion ?? 0;
    await mutate(world);
    const result = await validateSessionAuthority(session, world.db);
    assert.equal(result.valid, false);
    assert.equal(world.users.find((user) => user.id === "jane")!.sessionVersion ?? 0, version);
  }

  await deniedAfter(async (world) => {
    await endPartnerUserAssignment(world.db, { ...world.actor, userId: "jane" });
  });
  await deniedAfter(async (world) => {
    const membership = world.memberships.find((row) => row.userId === "jane")!;
    membership.rolePeriods[0]!.endsAt = new Date(Date.now() - 1000);
  });
  await deniedAfter(async (world) => {
    world.organizations[0]!.isActive = false;
  });
  await deniedAfter(async (world) => {
    world.partnerships[0]!.endedAt = new Date(Date.now() - 1000);
  });
  await deniedAfter(async (world) => {
    await setFacilityPartnerRoleCeiling(world.db, {
      ...world.actor,
      maxPartnerRole: null,
    });
  });
  await deniedAfter(async (world) => {
    world.scopes[0]!.endsAt = new Date(Date.now() - 1000);
  });
  await deniedAfter(async (world) => {
    world.accessPeriods[0]!.endsAt = new Date(Date.now() - 1000);
  });
});

test("partner holding surface ignores the department cookie and internal loaders", () => {
  const page = readFileSync(join(root, "src/app/partner/page.tsx"), "utf8");
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
  const exitRoute = readFileSync(join(root, "src/app/partner/exit/route.ts"), "utf8");
  const login = readFileSync(join(root, "src/app/api/auth/login/route.ts"), "utf8");
  assert.equal(page.includes("getSession("), false);
  assert.equal(page.includes("requireFacilitySession"), false);
  assert.equal(page.includes("resolveActiveDepartmentForNav"), false);
  assert.equal(page.includes("ltc_active_department"), false);
  assert.equal(page.includes("ACTIVE_DEPARTMENT_COOKIE"), false);
  assert.match(proxy, /sessionScope: "partner"/);
  assert.match(exitRoute, /requestedOrganizationId: request\.nextUrl\.searchParams\.get\("organizationId"\)/);
  assert.equal(exitRoute.includes("organizationId="), false);
  assert.equal(exitRoute.includes("createOrganizationSessionToken"), false);
  assert.equal(login.includes("createPartnerFacilitySessionToken"), false);
});

function tokenClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
}

async function mintPartnerToken(
  world: ReturnType<typeof createWorld>,
  userId: "jane" | "john",
  partnershipId = "partnership",
  facilityId = "fac",
) {
  const user = world.users.find((row) => row.id === userId)!;
  const authorization = await resolvePartnerFacilityEntry(world.db, {
    userId,
    organizationId: "metz",
    facilityId,
    facilityPartnerOrganizationId: partnershipId,
  });
  return createPartnerFacilitySessionToken({
    uid: user.id,
    name: user.displayName,
    email: user.email,
    facilityId: authorization.facilityId,
    partnerOrganizationId: authorization.partnerOrganizationId,
    facilityPartnerOrganizationId: authorization.facilityPartnerOrganizationId,
    sessionVersion: user.sessionVersion ?? 0,
  });
}

function assertOrganizationReplacement(partnerToken: string, transition: Awaited<ReturnType<typeof completePartnerFacilityTransition>>) {
  assert.equal(transition.outcome, "organization");
  if (transition.outcome !== "organization") return;
  assert.equal(transition.organizationId, "metz");
  assert.notEqual(transition.token, partnerToken);
  const claims = tokenClaims(transition.token);
  assert.equal(claims.scopeKind, "organization");
  assert.equal(claims.organizationId, "metz");
  assert.equal(claims.facilityId, undefined);
  assert.equal(claims.role, undefined);
  assert.equal(claims.accessKind, undefined);
  assert.equal(claims.partnerOrganizationId, undefined);
  assert.equal(claims.facilityPartnerOrganizationId, undefined);
  assert.equal(claims.partnerRole, undefined);
  assert.equal(isFacilityScopedSession({ scopeKind: "organization", facilityId: undefined, role: undefined }), false);
}

test("partner leave and recovery replace the session only when Metz membership is current", async () => {
  const world = createWorld();
  await grantJane(world);
  const jane = world.users.find((user) => user.id === "jane")!;
  const home = jane.facilityId;
  const accessCount = world.facilityAccesses.length;
  const assignmentCount = world.assignments.length;

  const memberToken = await mintPartnerToken(world, "jane");
  const left = await completePartnerFacilityTransition(world.db, {
    token: memberToken,
    requestedOrganizationId: "otherco",
  });
  assertOrganizationReplacement(memberToken, left);
  const stillAssigned = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(stillAssigned.authorization.path, "partner");
  const reentered = await mintPartnerToken(world, "jane");
  const reenteredClaims = tokenClaims(reentered);
  assert.equal(reenteredClaims.accessKind, "partner");
  assert.equal(reenteredClaims.scopeKind, "facility");
  assert.equal(reenteredClaims.facilityId, "fac");
  assert.equal(reenteredClaims.partnerOrganizationId, "metz");
  assert.equal(reenteredClaims.role, undefined);
  assert.equal(jane.facilityId, home);
  assert.equal(world.facilityAccesses.length, accessCount);
  assert.equal(world.assignments.length, assignmentCount);
  assert.equal(await getCurrentOrganizationRole(world.db, { userId: "jane", organizationId: "metz" }), "ORG_MEMBER");

  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "john",
    partnerRole: "PARTNER_MANAGER",
    at: at("2026-01-02T00:00:00.000Z"),
  });
  const adminToken = await mintPartnerToken(world, "john");
  await endPartnerUserAssignment(world.db, { ...world.actor, userId: "john" });
  const adminPath = await validateSessionAuthority(await verifySessionToken(adminToken), world.db);
  assert.equal(adminPath.valid, false);
  const adminRecovery = await completePartnerFacilityTransition(world.db, { token: adminToken });
  assertOrganizationReplacement(adminToken, adminRecovery);
  assert.equal(await getCurrentOrganizationRole(world.db, { userId: "john", organizationId: "metz" }), "ORG_ADMIN");

  const revokedToken = await mintPartnerToken(world, "jane");
  await endPartnerUserAssignment(world.db, { ...world.actor, userId: "jane" });
  const revokedPath = await validateSessionAuthority(await verifySessionToken(revokedToken), world.db);
  assert.equal(revokedPath.valid, false);
  const revokedRecovery = await completePartnerFacilityTransition(world.db, {
    token: revokedToken,
    requestedOrganizationId: "otherco",
  });
  assertOrganizationReplacement(revokedToken, revokedRecovery);
  assert.equal(jane.facilityId, home);
  assert.equal(world.facilityAccesses.filter((grant) => grant.userId === "jane").length, 0);
  assert.equal(world.assignments.filter((row) => row.userId === "jane").length, 1);
  assert.ok(world.rolePeriods.some((period) => period.endsAt !== null));

  const suspended = createWorld();
  await grantJane(suspended);
  const suspendedToken = await mintPartnerToken(suspended, "jane");
  suspended.partnerships[0]!.endedAt = new Date(Date.now() - 1000);
  assert.equal((await validateSessionAuthority(await verifySessionToken(suspendedToken), suspended.db)).valid, false);
  assertOrganizationReplacement(
    suspendedToken,
    await completePartnerFacilityTransition(suspended.db, { token: suspendedToken }),
  );

  const cleared = createWorld();
  await grantJane(cleared);
  const clearedToken = await mintPartnerToken(cleared, "jane");
  await setFacilityPartnerRoleCeiling(cleared.db, { ...cleared.actor, maxPartnerRole: null });
  assert.equal((await validateSessionAuthority(await verifySessionToken(clearedToken), cleared.db)).valid, false);
  assertOrganizationReplacement(
    clearedToken,
    await completePartnerFacilityTransition(cleared.db, { token: clearedToken }),
  );

  const scoped = createWorld();
  await grantJane(scoped);
  scoped.departments.push({ id: "evs", facilityId: "fac", isActive: true });
  scoped.scopes.push({
    id: "scope_evs",
    facilityPartnerOrganizationId: "partnership",
    departmentId: "evs",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  const both = await resolveFacilityAuthorization(scoped.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(both.authorization.path, "partner");
  if (both.authorization.path === "partner") {
    assert.deepEqual(both.authorization.allowedDepartmentIds, ["dietary", "evs"]);
  }
  scoped.scopes.find((scope) => scope.departmentId === "evs")!.endsAt = new Date(Date.now() - 1000);
  const dietaryOnly = await resolveFacilityAuthorization(scoped.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal(dietaryOnly.authorization.path, "partner");
  if (dietaryOnly.authorization.path === "partner") {
    assert.deepEqual(dietaryOnly.authorization.allowedDepartmentIds, ["dietary"]);
    assert.deepEqual(
      dietaryOnly.authorization.allowedDepartmentIds.map((id) => (id === "dietary" ? "Food & Nutrition" : id)),
      ["Food & Nutrition"],
    );
  }
  const narrowedToken = await mintPartnerToken(scoped, "jane");
  assert.equal((await validateSessionAuthority(await verifySessionToken(narrowedToken), scoped.db)).valid, true);
  scoped.scopes.find((scope) => scope.departmentId === "dietary")!.endsAt = new Date(Date.now() - 1000);
  assert.equal((await validateSessionAuthority(await verifySessionToken(narrowedToken), scoped.db)).valid, false);
  assertOrganizationReplacement(
    narrowedToken,
    await completePartnerFacilityTransition(scoped.db, { token: narrowedToken }),
  );

  scoped.scopes.forEach((scope) => {
    scope.endsAt = null;
  });
  await changePartnerUserRole(scoped.db, {
    ...scoped.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
  });
  const downgradedToken = await mintPartnerToken(scoped, "jane");
  const downgraded = await resolveFacilityAuthorization(scoped.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
  });
  assert.equal((await validateSessionAuthority(await verifySessionToken(downgradedToken), scoped.db)).valid, true);
  if (downgraded.authorization.path === "partner") {
    assert.equal(downgraded.authorization.effectiveRole, "PARTNER_VIEWER");
  }
});

test("partner recovery refuses membership loss, inactive Organizations, and cross-organization input", async () => {
  const ended = createWorld();
  await grantJane(ended);
  const endedToken = await mintPartnerToken(ended, "jane");
  ended.memberships.find((row) => row.userId === "jane")!.rolePeriods[0]!.endsAt = new Date(Date.now() - 1000);
  assert.equal((await validateSessionAuthority(await verifySessionToken(endedToken), ended.db)).valid, false);
  const endedRecovery = await completePartnerFacilityTransition(ended.db, { token: endedToken });
  assert.deepEqual(endedRecovery, { outcome: "clear", reason: "MEMBERSHIP" });

  const inactive = createWorld();
  await grantJane(inactive);
  const inactiveToken = await mintPartnerToken(inactive, "jane");
  inactive.organizations[0]!.isActive = false;
  assert.equal((await validateSessionAuthority(await verifySessionToken(inactiveToken), inactive.db)).valid, false);
  const inactiveRecovery = await completePartnerFacilityTransition(inactive.db, { token: inactiveToken });
  assert.deepEqual(inactiveRecovery, { outcome: "clear", reason: "MEMBERSHIP" });

  const mismatched = await createPartnerFacilitySessionToken({
    uid: "jane",
    name: "Jane Smith",
    email: "jane@metz.example",
    facilityId: "fac",
    partnerOrganizationId: "otherco",
    facilityPartnerOrganizationId: "partnership",
    sessionVersion: 0,
  });
  const attack = createWorld();
  await grantJane(attack);
  attack.organizations.push({ id: "otherco", isActive: true });
  attack.memberships.push({
    id: "mem_jane_other",
    userId: "jane",
    organizationId: "otherco",
    createdAt: at("2020-01-01T00:00:00.000Z"),
    rolePeriods: [
      { id: "mem_jane_other_period", role: "ORG_MEMBER", startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null },
    ],
  });
  const mismatch = await completePartnerFacilityTransition(attack.db, {
    token: mismatched,
    requestedOrganizationId: "otherco",
  });
  assert.deepEqual(mismatch, { outcome: "clear", reason: "MISMATCH" });

  const internal = await createSessionToken({
    uid: "actor",
    role: "FACILITY_ADMINISTRATOR",
    name: "Facility Admin",
    email: "fa@terrace.example",
    facilityId: "fac",
    sessionVersion: 0,
  });
  assert.equal((await completePartnerFacilityTransition(attack.db, { token: internal })).outcome, "clear");
  const unsigned = await completePartnerFacilityTransition(attack.db, { token: "not-a-jwt" });
  assert.equal(unsigned.outcome, "clear");
  if (unsigned.outcome === "clear") assert.equal(unsigned.reason, "UNSIGNED");

  const listed = createWorld();
  await grantJane(listed);
  listed.partnerships.push({
    id: "hp_partnership",
    facilityId: "hp",
    organizationId: "metz",
    endedAt: null,
  });
  listed.accessPeriods.push({
    id: "hp_access",
    facilityPartnerOrganizationId: "hp_partnership",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  listed.departments.push({ id: "dietary_hp", facilityId: "hp", isActive: true });
  listed.scopes.push({
    id: "scope_hp",
    facilityPartnerOrganizationId: "hp_partnership",
    departmentId: "dietary_hp",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  listed.facilityAccesses.push({
    id: "actor_hp",
    userId: "actor",
    facilityId: "hp",
    isActive: true,
    revokedAt: null,
  });
  await setFacilityPartnerRoleCeiling(listed.db, {
    actorUserId: "actor",
    partnershipId: "hp_partnership",
    facilityId: "hp",
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await assignPartnerUser(listed.db, {
    actorUserId: "actor",
    partnershipId: "hp_partnership",
    facilityId: "hp",
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-01-02T00:00:00.000Z"),
  });
  await endPartnerUserAssignment(listed.db, { ...listed.actor, userId: "jane" });
  const clients = await listAuthorizedPartnerFacilities(listed.db, { userId: "jane", organizationId: "metz" });
  assert.deepEqual(clients.map((client) => client.facilityDisplayName), ["HighPointe"]);
});

test("partner operational context uses live allowed departments and ignores a stale preference", async () => {
  const world = createWorld();
  await grantJane(world);
  world.departments.push({ id: "evs", facilityId: "fac", isActive: true, sortOrder: 20 });
  world.scopes.push({
    id: "scope_evs",
    facilityPartnerOrganizationId: "partnership",
    departmentId: "evs",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  const input = {
    userId: "jane",
    facilityId: "fac",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "partnership",
  };
  const preferred = await resolvePartnerOperationalContext(world.db, {
    ...input,
    requestedDepartmentId: "evs",
  });
  assert.equal(preferred?.context.activeDepartmentId, "evs");
  assert.deepEqual(preferred?.context.allowedDepartmentIds, ["dietary", "evs"]);

  world.departments.find((department) => department.id === "evs")!.sortOrder = 5;
  const fallback = await resolvePartnerOperationalContext(world.db, input);
  assert.equal(fallback?.context.activeDepartmentId, "evs");

  world.scopes.find((scope) => scope.departmentId === "evs")!.endsAt = new Date(Date.now() - 1000);
  const reduced = await resolvePartnerOperationalContext(world.db, {
    ...input,
    requestedDepartmentId: "evs",
  });
  assert.equal(reduced?.context.activeDepartmentId, "dietary");
  assert.deepEqual(reduced?.context.allowedDepartmentIds, ["dietary"]);

  world.departments.find((department) => department.id === "dietary")!.isActive = false;
  const inactive = await resolvePartnerOperationalContext(world.db, {
    ...input,
    requestedDepartmentId: "dietary",
  });
  assert.equal(inactive, null);

  const internalCookie = "evs";
  assert.equal(internalCookie, "evs");
  assert.equal(world.users.find((user) => user.id === "jane")?.facilityId, null);
});

test("invalid partner recovery stays on /partner/exit and validation stays side-effect free", () => {
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
  const validation = readFileSync(join(root, "src/lib/session-revocation/session-version.ts"), "utf8");
  const resolver = readFileSync(join(root, "src/lib/partner-user-access/service.ts"), "utf8");
  const transition = readFileSync(join(root, "src/lib/partner-facility-session.ts"), "utf8");
  const start = proxy.indexOf("if (isPartnerFacilitySession(session))");
  const branch = proxy.slice(start, proxy.indexOf('session.scopeKind === "organization"', start));
  assert.match(branch, /\/partner\/exit/);
  assert.equal(branch.includes("/dashboard"), false);
  assert.equal(branch.includes("defaultHome"), false);
  assert.match(proxy, /anonymousDecision\.outcome === "ALLOW"/);
  assert.equal(validation.includes("cookies("), false);
  assert.equal(validation.includes("createOrganizationSessionToken"), false);
  assert.equal(resolver.includes("cookies("), false);
  assert.equal(resolver.includes("createOrganizationSessionToken"), false);
  assert.equal(transition.includes("cookies("), false);
  assert.equal(transition.includes("redirect("), false);
  const flags = { todaysWorkEnabled: true };
  assert.equal(authorizeRoute({ pathname: "/partner/exit", role: null, featureFlags: flags }).outcome, "ALLOW");
  assert.equal(
    authorizeRoute({ pathname: "/dashboard", role: null, sessionScope: "partner", featureFlags: flags }).outcome,
    "DENY",
  );
});

test("facility staffing policy and user restrictions govern assignment writers without changing Path B policy", async () => {
  const service = readFileSync(join(root, "src/lib/partner-user-access/service.ts"), "utf8");
  const migration = readFileSync(
    join(root, "prisma/migrations/20261009030000_partner_staffing_governance/migration.sql"),
    "utf8",
  );
  const partnerFn = service.slice(
    service.indexOf("async function resolvePartner"),
    service.indexOf("export async function resolveFacilityAuthorization"),
  );
  assert.equal(partnerFn.includes("StaffingPolicy"), false);
  assert.match(partnerFn, /restrictionPeriods/);
  assert.equal(service.includes("sessionVersion"), false);
  assert.match(migration, /"createdByAuthorityKind" = 'facility_admin'/);
  assert.match(migration, /"endedByAuthorityKind" = 'facility_admin'/);
  assert.equal(migration.includes('INSERT INTO "FacilityPartnerStaffingPolicyPeriod"'), false);
  assert.equal(migration.includes('INSERT INTO "FacilityPartnerUserRestrictionPeriod"'), false);

  const world = createWorld();
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(await isPartnerStaffingDelegated(world.db, { partnershipId: "partnership" }), false);

  const jane = await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-05-02T00:00:00.000Z"),
  });
  assert.equal(jane.rolePeriod.createdByAuthorityKind, "facility_admin");
  assert.equal(jane.rolePeriod.createdByOrganizationId, null);
  const beforeDisable = world.rolePeriods.length;
  await enablePartnerStaffingDelegation(world.db, {
    ...world.actor,
    at: at("2026-10-08T00:00:00.000Z"),
  });
  assert.equal(
    await isPartnerStaffingDelegated(world.db, {
      partnershipId: "partnership",
      instant: at("2026-10-20T00:00:00.000Z"),
    }),
    true,
  );
  await disablePartnerStaffingDelegation(world.db, {
    ...world.actor,
    at: at("2026-11-03T00:00:00.000Z"),
  });
  assert.equal(world.rolePeriods.length, beforeDisable);
  assert.equal(
    world.rolePeriods.find((period) => period.id === jane.rolePeriod.id)?.endsAt,
    null,
  );
  assert.equal(
    await isPartnerStaffingDelegated(world.db, {
      partnershipId: "partnership",
      instant: at("2026-11-10T00:00:00.000Z"),
    }),
    false,
  );
  await enablePartnerStaffingDelegation(world.db, {
    ...world.actor,
    at: at("2026-12-01T00:00:00.000Z"),
  });
  assert.equal(overlapping(world.policies), false);
  assert.equal(
    await isPartnerStaffingDelegated(world.db, {
      partnershipId: "partnership",
      instant: at("2026-12-02T00:00:00.000Z"),
    }),
    true,
  );

  const orgActor = {
    actorUserId: "john",
    partnershipId: "partnership",
    facilityId: "fac",
    authority: { kind: "partner_org_admin" as const, organizationId: "metz" },
  };
  for (const attempt of [
    () => enablePartnerStaffingDelegation(world.db, orgActor),
    () => disablePartnerStaffingDelegation(world.db, orgActor),
    () => blockPartnerUser(world.db, { ...orgActor, userId: "jane" }),
    () => unblockPartnerUser(world.db, { ...orgActor, userId: "jane" }),
  ]) {
    await assert.rejects(attempt, (error: unknown) => {
      return error instanceof PartnerUserAccessError && error.code === "PARTNER_STAFFING_NOT_ENABLED";
    });
  }
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        actorUserId: "john",
        partnershipId: "partnership",
        facilityId: "fac",
        userId: "john",
        partnerRole: "PARTNER_VIEWER",
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_FACILITY_ADMINISTRATOR",
  );

  const ended = await endPartnerUserAssignment(world.db, {
    ...world.actor,
    userId: "jane",
    at: at("2026-12-02T00:00:00.000Z"),
  });
  assert.equal(ended.endedByAuthorityKind, "facility_admin");
  assert.equal(ended.endedByOrganizationId, null);
  assert.equal(world.restrictions.length, 0);
  await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-12-03T00:00:00.000Z"),
  });

  const assignmentsBeforeBlock = world.assignments.length;
  await blockPartnerUser(world.db, {
    ...world.actor,
    userId: "john",
    note: "private facility note",
    at: at("2026-12-04T00:00:00.000Z"),
  });
  assert.equal(world.assignments.length, assignmentsBeforeBlock);
  assert.equal(world.restrictions.filter((row) => row.userId === "john" && row.endsAt === null).length, 1);

  await blockPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    note: "assigned block",
    at: at("2026-12-05T00:00:00.000Z"),
  });
  assert.equal(
    world.rolePeriods.filter((period) => period.endsAt === null && period.partnerUserFacilityAccessId === jane.assignmentId).length,
    0,
  );
  const blocked = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-12-06T00:00:00.000Z"),
  });
  assert.equal(blocked.authorization.path, "none");
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        ...world.actor,
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-12-07T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "USER_RESTRICTED",
  );

  await unblockPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    at: at("2026-12-08T00:00:00.000Z"),
  });
  assert.equal(
    world.rolePeriods.filter((period) => period.endsAt === null && period.partnerUserFacilityAccessId === jane.assignmentId).length,
    0,
  );
  const unblocked = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-12-09T00:00:00.000Z"),
  });
  assert.equal(unblocked.authorization.path, "none");

  const historical = createWorld();
  await setFacilityPartnerRoleCeiling(historical.db, {
    ...historical.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  const historicalJane = await assignPartnerUser(historical.db, {
    ...historical.actor,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-01-02T00:00:00.000Z"),
  });
  historical.restrictions.push({
    id: "restriction_hist",
    userId: "jane",
    facilityPartnerOrganizationId: "partnership",
    startsAt: at("2026-10-08T00:00:00.000Z"),
    endsAt: at("2026-11-03T00:00:00.000Z"),
    note: "private",
    createdByUserId: "actor",
    endedByUserId: "actor",
    createdByAuthorityKind: "facility_admin",
    createdByOrganizationId: null,
    endedByAuthorityKind: "facility_admin",
    endedByOrganizationId: null,
  });
  const before = await resolveFacilityAuthorization(historical.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-10-01T00:00:00.000Z"),
  });
  const during = await resolveFacilityAuthorization(historical.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-10-15T00:00:00.000Z"),
  });
  const after = await resolveFacilityAuthorization(historical.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-11-10T00:00:00.000Z"),
  });
  assert.equal(before.authorization.path, "partner");
  assert.equal(during.authorization.path, "none");
  assert.equal(after.authorization.path, "partner");
  assert.equal(historicalJane.rolePeriod.endsAt, null);
  assert.equal(historical.rolePeriods[0]?.endsAt, null);
});

test("delegated organization administrators staff the same assignment model", async () => {
  const org = {
    actorUserId: "john",
    partnershipId: "partnership",
    facilityId: "fac",
    authority: { kind: "partner_org_admin" as const, organizationId: "metz" },
  };

  const denied = createWorld();
  await setFacilityPartnerRoleCeiling(denied.db, {
    ...denied.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await assignPartnerUser(denied.db, {
    ...denied.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-01-02T00:00:00.000Z"),
  });
  for (const attempt of [
    () => assignPartnerUser(denied.db, { ...org, userId: "john", partnerRole: "PARTNER_VIEWER" }),
    () => changePartnerUserRole(denied.db, { ...org, userId: "jane", partnerRole: "PARTNER_OPERATOR" }),
    () => endPartnerUserAssignment(denied.db, { ...org, userId: "jane" }),
  ]) {
    await assert.rejects(
      attempt,
      (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNER_STAFFING_NOT_ENABLED",
    );
  }

  const world = createWorld();
  await setFacilityPartnerRoleCeiling(world.db, {
    ...world.actor,
    maxPartnerRole: "PARTNER_OPERATOR",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await enablePartnerStaffingDelegation(world.db, { ...world.actor, at: at("2026-01-02T00:00:00.000Z") });
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        actorUserId: "jane",
        partnershipId: "partnership",
        facilityId: "fac",
        userId: "john",
        partnerRole: "PARTNER_VIEWER",
        authority: { kind: "partner_org_admin", organizationId: "metz" },
      }),
    (error: unknown) =>
      error instanceof PartnerUserAccessError && error.code === "NOT_ORGANIZATION_ADMINISTRATOR",
  );
  world.memberships.find((row) => row.userId === "former")!.rolePeriods[0]!.endsAt = at("2026-01-03T00:00:00.000Z");
  await assert.rejects(
    () => assignPartnerUser(world.db, { ...org, userId: "former", partnerRole: "PARTNER_VIEWER", at: at("2026-02-01T00:00:00.000Z") }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
  );
  world.organizations.push({ id: "otherco", isActive: true });
  world.memberships.push({
    id: "mem_stranger",
    userId: "stranger",
    organizationId: "otherco",
    createdAt: at("2020-01-01T00:00:00.000Z"),
    rolePeriods: [
      { id: "mem_stranger_period", role: "ORG_ADMIN", startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null },
    ],
  });
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        actorUserId: "stranger",
        partnershipId: "partnership",
        facilityId: "fac",
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        authority: { kind: "partner_org_admin", organizationId: "otherco" },
      }),
    (error: unknown) =>
      error instanceof PartnerUserAccessError && error.code === "NOT_ORGANIZATION_ADMINISTRATOR",
  );
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        ...org,
        userId: "jane",
        partnerRole: "PARTNER_MANAGER",
        at: at("2026-02-02T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ROLE_ABOVE_CEILING",
  );

  const facilityJane = await assignPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-02-02T00:00:00.000Z"),
  });
  assert.equal(facilityJane.rolePeriod.createdByAuthorityKind, "facility_admin");
  assert.equal(facilityJane.rolePeriod.createdByOrganizationId, null);
  const changed = await changePartnerUserRole(world.db, {
    ...org,
    userId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-02-03T00:00:00.000Z"),
  });
  const closedByOrg = world.rolePeriods.find((period) => period.id === facilityJane.rolePeriod.id);
  assert.equal(closedByOrg?.endedByAuthorityKind, "partner_org_admin");
  assert.equal(closedByOrg?.endedByOrganizationId, "metz");
  assert.equal(changed.createdByAuthorityKind, "partner_org_admin");
  assert.equal(changed.createdByOrganizationId, "metz");
  const endedByOrg = await endPartnerUserAssignment(world.db, {
    ...org,
    userId: "jane",
    at: at("2026-02-04T00:00:00.000Z"),
  });
  assert.equal(endedByOrg.endedByAuthorityKind, "partner_org_admin");
  assert.equal(endedByOrg.endedByOrganizationId, "metz");

  const self = await assignPartnerUser(world.db, {
    ...org,
    userId: "john",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-02-05T00:00:00.000Z"),
  });
  assert.equal(self.rolePeriod.createdByUserId, "john");
  assert.equal(self.rolePeriod.createdByAuthorityKind, "partner_org_admin");
  assert.equal(self.rolePeriod.createdByOrganizationId, "metz");
  const facilityEdit = await changePartnerUserRole(world.db, {
    ...world.actor,
    userId: "john",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-02-06T00:00:00.000Z"),
  });
  assert.equal(facilityEdit.createdByAuthorityKind, "facility_admin");
  assert.equal(facilityEdit.createdByOrganizationId, null);

  const janeAgain = await assignPartnerUser(world.db, {
    ...org,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-02-07T00:00:00.000Z"),
  });
  const janePath = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-02-08T00:00:00.000Z"),
  });
  const johnPath = await resolveFacilityAuthorization(world.db, {
    userId: "john",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-02-08T00:00:00.000Z"),
  });
  assert.equal(janePath.authorization.path, "partner");
  assert.equal(johnPath.authorization.path, "partner");
  if (janePath.authorization.path === "partner" && johnPath.authorization.path === "partner") {
    assert.equal(janePath.authorization.effectiveRole, johnPath.authorization.effectiveRole);
    assert.equal(janeAgain.rolePeriod.createdByAuthorityKind, "partner_org_admin");
    assert.equal(facilityEdit.createdByAuthorityKind, "facility_admin");
  }

  await blockPartnerUser(world.db, {
    ...world.actor,
    userId: "jane",
    at: at("2026-02-09T00:00:00.000Z"),
  });
  const blockedPath = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-02-10T00:00:00.000Z"),
  });
  assert.equal(blockedPath.authorization.path, "none");
  const restrictionsBefore = world.restrictions.length;
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        ...org,
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-02-11T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "USER_RESTRICTED",
  );
  assert.equal(world.restrictions.length, restrictionsBefore);
  await unblockPartnerUser(world.db, { ...world.actor, userId: "jane", at: at("2026-02-12T00:00:00.000Z") });
  const unassigned = await resolveFacilityAuthorization(world.db, {
    userId: "jane",
    facilityId: "fac",
    accessKind: "partner",
    facilityPartnerOrganizationId: "partnership",
    instant: at("2026-02-13T00:00:00.000Z"),
  });
  assert.equal(unassigned.authorization.path, "none");
  await assignPartnerUser(world.db, {
    ...org,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-02-14T00:00:00.000Z"),
  });

  const openBeforeDisable = world.rolePeriods.filter((period) => period.endsAt === null).length;
  await disablePartnerStaffingDelegation(world.db, {
    ...world.actor,
    at: at("2026-03-01T00:00:00.000Z"),
  });
  assert.equal(world.rolePeriods.filter((period) => period.endsAt === null).length, openBeforeDisable);
  await assert.rejects(
    () =>
      endPartnerUserAssignment(world.db, { ...org, userId: "jane", at: at("2026-03-02T00:00:00.000Z") }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNER_STAFFING_NOT_ENABLED",
  );
  await endPartnerUserAssignment(world.db, {
    ...world.actor,
    userId: "jane",
    at: at("2026-03-02T00:00:00.000Z"),
  });

  world.memberships.find((row) => row.userId === "john")!.rolePeriods[0]!.endsAt = at("2026-03-03T00:00:00.000Z");
  world.memberships.find((row) => row.userId === "john")!.rolePeriods.push({
    id: "mem_john_member",
    role: "ORG_MEMBER",
    startsAt: at("2026-03-03T00:00:00.000Z"),
    endsAt: null,
  });
  assert.equal(self.rolePeriod.createdByAuthorityKind, "partner_org_admin");
  assert.equal(self.rolePeriod.createdByOrganizationId, "metz");
  await enablePartnerStaffingDelegation(world.db, { ...world.actor, at: at("2026-03-04T00:00:00.000Z") });
  await assert.rejects(
    () =>
      assignPartnerUser(world.db, {
        ...org,
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-03-05T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof PartnerUserAccessError && error.code === "NOT_ORGANIZATION_ADMINISTRATOR",
  );
  const historicalSelf = world.rolePeriods.find((period) => period.id === self.rolePeriod.id);
  assert.equal(historicalSelf?.createdByAuthorityKind, "partner_org_admin");
  assert.equal(historicalSelf?.createdByOrganizationId, "metz");
  assert.equal(
    world.rolePeriods.some(
      (period) => period.partnerUserFacilityAccessId === self.assignmentId && period.endsAt === null,
    ),
    true,
  );

  const empty = createWorld();
  await setFacilityPartnerRoleCeiling(empty.db, {
    ...empty.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await enablePartnerStaffingDelegation(empty.db, { ...empty.actor, at: at("2026-01-02T00:00:00.000Z") });
  empty.scopes[0]!.endsAt = at("2026-01-03T00:00:00.000Z");
  await assert.rejects(
    () =>
      assignPartnerUser(empty.db, {
        ...org,
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-02-01T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "SCOPE_EMPTY",
  );
  empty.scopes[0]!.endsAt = null;
  empty.accessPeriods[0]!.endsAt = at("2026-01-04T00:00:00.000Z");
  await assert.rejects(
    () =>
      assignPartnerUser(empty.db, {
        ...org,
        userId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-02-01T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNERSHIP_INACTIVE",
  );

  const split = createWorld();
  split.facilityAccesses.push({
    id: "fa_hp",
    userId: "actor",
    facilityId: "hp",
    isActive: true,
    revokedAt: null,
  });
  split.partnerships.push({
    id: "hp_partnership",
    facilityId: "hp",
    organizationId: "metz",
    endedAt: null,
  });
  split.accessPeriods.push({
    id: "hp_access",
    facilityPartnerOrganizationId: "hp_partnership",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  split.departments.push({ id: "dietary_hp", facilityId: "hp", isActive: true });
  split.scopes.push({
    id: "scope_hp",
    facilityPartnerOrganizationId: "hp_partnership",
    departmentId: "dietary_hp",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
  });
  await setFacilityPartnerRoleCeiling(split.db, {
    ...split.actor,
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await setFacilityPartnerRoleCeiling(split.db, {
    actorUserId: "actor",
    partnershipId: "hp_partnership",
    facilityId: "hp",
    maxPartnerRole: "PARTNER_MANAGER",
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await enablePartnerStaffingDelegation(split.db, { ...split.actor, at: at("2026-01-02T00:00:00.000Z") });
  await assignPartnerUser(split.db, {
    ...org,
    userId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-01-03T00:00:00.000Z"),
  });
  await assert.rejects(
    () =>
      assignPartnerUser(split.db, {
        ...org,
        partnershipId: "hp_partnership",
        facilityId: "hp",
        userId: "john",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-01-03T00:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNER_STAFFING_NOT_ENABLED",
  );
});
