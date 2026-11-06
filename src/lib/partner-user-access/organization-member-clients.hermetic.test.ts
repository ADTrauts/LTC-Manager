import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OrganizationPartnerRole } from "@prisma/client";

import { authorizeRoute } from "@/lib/route-registry/authorize";
import {
  assignOrganizationClientMember,
  blockPartnerUser,
  changeOrganizationClientMemberRole,
  enablePartnerStaffingDelegation,
  endOrganizationClientMemberAccess,
  listAuthorizedPartnerFacilitiesForUser,
  listOrganizationMemberClientAssignments,
  PartnerUserAccessError,
  setFacilityPartnerRoleCeiling,
} from "@/lib/partner-user-access";

const root = process.cwd();
const NOW = at("2026-10-11T16:00:00.000Z");

test("member-client read model stays presentation-only and batched", () => {
  const source = readFileSync(join(root, "src/lib/partner-user-access/organization-member-clients.ts"), "utf8");
  assert.match(source, /facilityPartnerOrganizationId: \{ in: partnershipIds \}/);
  assert.equal(source.includes("listOrganizationClientStaffing"), false);
  assert.equal(source.includes("DepartmentOperatorRelationship"), false);
  assert.equal(source.includes("departmentOperatorRelationship"), false);
  assert.equal(source.includes("enterContext"), false);
  assert.equal(source.includes("createSessionToken"), false);
  assert.equal(source.includes("createPartnerFacilitySessionToken"), false);
  assert.equal(source.includes("facility.findMany"), false);
});

test("member client assignment UI expands on Members and does not mint sessions", () => {
  const page = readFileSync(
    join(root, "src/app/(organization-account)/organization/[organizationId]/members/page.tsx"),
    "utf8",
  );
  const ui = readFileSync(join(root, "src/components/organization-member-client-assignments.tsx"), "utf8");
  const actions = readFileSync(
    join(root, "src/app/(organization-account)/organization/client-staffing-actions.ts"),
    "utf8",
  );
  const nav = readFileSync(join(root, "src/components/organization-workspace-nav.tsx"), "utf8");
  const clients = readFileSync(
    join(root, "src/app/(organization-account)/organization/[organizationId]/clients/page.tsx"),
    "utf8",
  );
  const portfolio = readFileSync(
    join(root, "src/app/(organization-account)/organization/[organizationId]/page.tsx"),
    "utf8",
  );
  const registry = readFileSync(join(root, "src/lib/route-registry/platform-routes.ts"), "utf8");
  assert.match(page, /currentRole !== "ORG_ADMIN"/);
  assert.match(page, /OrganizationMemberClientAssignments/);
  assert.match(page, /Invite member/);
  assert.match(ui, /Manage client assignments/);
  assert.match(ui, /aria-expanded/);
  assert.match(ui, /partnerRolesAtOrBelow/);
  assert.match(ui, /partnerRoleLabel/);
  assert.match(ui, /loadOrganizationMemberClientAssignmentsAction/);
  assert.match(ui, /assignOrganizationClientAction/);
  assert.match(ui, /changeOrganizationClientRoleAction/);
  assert.match(ui, /endOrganizationClientAccessAction/);
  assert.equal(ui.includes("enterContext"), false);
  assert.equal(ui.includes("createSessionToken"), false);
  assert.equal(ui.includes("createPartnerFacilitySessionToken"), false);
  assert.equal(ui.includes("DepartmentOperatorRelationship"), false);
  assert.match(actions, /revalidatePath\(`\/organization\/\$\{organizationId\}\/members`\)/);
  assert.match(actions, /requireOrganizationSession/);
  assert.match(actions, /currentRole !== "ORG_ADMIN"/);
  assert.equal(actions.includes("enterContext"), false);
  assert.equal(actions.includes("createSessionToken"), false);
  assert.equal(actions.includes("createPartnerFacilitySessionToken"), false);
  assert.match(nav, /label: "Portfolio"/);
  assert.match(nav, /label: "Clients"/);
  assert.match(nav, /label: "Members"/);
  assert.equal(nav.includes("Assignments"), false);
  assert.equal(nav.includes("Staffing"), false);
  assert.equal(clients.includes("OrganizationMemberClientAssignments"), false);
  assert.equal(portfolio.includes("OrganizationMemberClientAssignments"), false);
  assert.equal(registry.includes("/organization/[organizationId]/members/["), false);
  const flags = { };
  assert.equal(
    authorizeRoute({
      pathname: "/organization/metz/members",
      role: null,
      sessionScope: "organization",
      featureFlags: flags,
    }).outcome,
    "ALLOW",
  );
});

test("person-first list classifies current clients and omits ended plus owned facilities", async () => {
  const world = createWorld();
  await prepareAssignable(world, "partnership", "fac", "PARTNER_MANAGER");
  addPartnership(world, {
    id: "hp",
    facilityId: "hp",
    delegated: true,
    ceiling: "PARTNER_OPERATOR",
  });
  addPartnership(world, {
    id: "site_c",
    facilityId: "site_c",
    delegated: false,
    ceiling: "PARTNER_MANAGER",
  });
  addPartnership(world, {
    id: "pending",
    facilityId: "pending",
    lifecycle: "PENDING",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "suspended",
    facilityId: "suspended",
    lifecycle: "SUSPENDED",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "ended",
    facilityId: "ended",
    lifecycle: "ENDED",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "empty",
    facilityId: "empty",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
    emptyScope: true,
  });
  addPartnership(world, {
    id: "no_ceil",
    facilityId: "no_ceil",
    delegated: true,
    ceiling: null,
  });

  await assignOrganizationClientMember(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "partnership",
    targetUserId: "jane",
    partnerRole: "PARTNER_MANAGER",
    at: NOW,
  });
  await blockPartnerUser(world.db, {
    actorUserId: "actor",
    partnershipId: "hp",
    facilityId: "hp",
    userId: "jane",
    note: "private facility note",
    at: NOW,
  });

  const listed = await listOrganizationMemberClientAssignments(world.db, {
    organizationId: "metz",
    userId: "jane",
    now: NOW,
  });
  assert.equal(listed.member?.userId, "jane");
  assert.equal(listed.member?.organizationRole, "ORG_MEMBER");
  const byId = Object.fromEntries(listed.clients.map((row) => [row.facilityId, row]));
  assert.equal(listed.clients.some((row) => row.lifecycle === "ENDED" as never), false);
  assert.equal(byId.ended, undefined);
  assert.equal(listed.clients.some((row) => row.facilityId === "owned"), false);
  assert.equal(byId.fac?.assignable, false);
  assert.equal(byId.fac?.currentAssignment?.partnerRole, "PARTNER_MANAGER");
  assert.equal(byId.hp?.assignable, false);
  assert.equal(byId.hp?.restricted, true);
  assert.equal(byId.hp?.unavailableReason, "Restricted by facility");
  assert.equal(JSON.stringify(listed).includes("private facility note"), false);
  assert.equal(byId.site_c?.assignable, false);
  assert.equal(byId.site_c?.unavailableReason, "Managed by Site C");
  assert.equal(byId.pending?.lifecycle, "PENDING");
  assert.equal(byId.pending?.assignable, false);
  assert.equal(byId.suspended?.lifecycle, "SUSPENDED");
  assert.equal(byId.suspended?.assignable, false);
  assert.equal(byId.empty?.assignable, false);
  assert.match(byId.empty?.unavailableReason ?? "", /department scope/);
  assert.equal(byId.no_ceil?.assignable, false);
  assert.match(byId.no_ceil?.unavailableReason ?? "", /not currently enabled/);
});

test("ORG_ADMIN assigns, changes, ends, and reassigns from person-first services", async () => {
  const world = createWorld();
  await prepareAssignable(world, "partnership", "fac", "PARTNER_OPERATOR");
  addPartnership(world, {
    id: "hp",
    facilityId: "hp",
    delegated: true,
    ceiling: "PARTNER_MANAGER",
  });
  addPartnership(world, {
    id: "site_c",
    facilityId: "site_c",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });

  const terrace = await assignOrganizationClientMember(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "partnership",
    targetUserId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: NOW,
  });
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-10-11T17:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ALREADY_ASSIGNED",
  );
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "jane",
        partnerRole: "PARTNER_MANAGER",
        at: NOW,
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ROLE_ABOVE_CEILING",
  );
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "jane",
        sessionOrganizationId: "metz",
        partnershipId: "hp",
        targetUserId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: NOW,
      }),
    (error: unknown) =>
      error instanceof PartnerUserAccessError && error.code === "NOT_ORGANIZATION_ADMINISTRATOR",
  );
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "otherco",
        partnershipId: "partnership",
        targetUserId: "jane",
        partnerRole: "PARTNER_VIEWER",
        at: NOW,
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "PARTNERSHIP_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "stranger",
        partnerRole: "PARTNER_VIEWER",
        at: NOW,
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
  );

  const changed = await changeOrganizationClientMemberRole(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "partnership",
    targetUserId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: at("2026-10-11T18:00:00.000Z"),
  });
  assert.equal(changed.createdByAuthorityKind, "partner_org_admin");
  assert.equal(
    world.rolePeriods.find((period) => period.id === terrace.rolePeriod.id)?.endReason,
    "ROLE_CHANGED",
  );
  await assert.rejects(
    () =>
      changeOrganizationClientMemberRole(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "jane",
        partnerRole: "PARTNER_MANAGER",
        at: at("2026-10-11T18:30:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "ROLE_ABOVE_CEILING",
  );

  await assignOrganizationClientMember(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "hp",
    targetUserId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: NOW,
  });
  await assignOrganizationClientMember(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "site_c",
    targetUserId: "jane",
    partnerRole: "PARTNER_VIEWER",
    at: NOW,
  });
  const independent = await listOrganizationMemberClientAssignments(world.db, {
    organizationId: "metz",
    userId: "jane",
    now: at("2026-10-11T19:00:00.000Z"),
  });
  assert.equal(
    independent.clients.find((row) => row.facilityId === "fac")?.currentAssignment?.partnerRole,
    "PARTNER_VIEWER",
  );
  assert.equal(
    independent.clients.find((row) => row.facilityId === "hp")?.currentAssignment?.partnerRole,
    "PARTNER_OPERATOR",
  );
  assert.equal(
    independent.clients.find((row) => row.facilityId === "site_c")?.currentAssignment?.partnerRole,
    "PARTNER_VIEWER",
  );

  const beforeEnd = await listAuthorizedPartnerFacilitiesForUser(world.db, {
    userId: "jane",
    now: at("2026-10-11T19:00:00.000Z"),
  });
  assert.ok(beforeEnd.some((row) => row.facilityId === "fac"));
  await endOrganizationClientMemberAccess(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "partnership",
    targetUserId: "jane",
    at: at("2026-10-11T20:00:00.000Z"),
  });
  assert.equal(
    world.rolePeriods.filter((period) => period.partnerUserFacilityAccessId === terrace.assignmentId).length >= 2,
    true,
  );
  const afterEnd = await listAuthorizedPartnerFacilitiesForUser(world.db, {
    userId: "jane",
    now: at("2026-10-11T20:00:00.000Z"),
  });
  assert.equal(afterEnd.some((row) => row.facilityId === "fac"), false);
  const reassigned = await assignOrganizationClientMember(world.db, {
    actorUserId: "john",
    sessionOrganizationId: "metz",
    partnershipId: "partnership",
    targetUserId: "jane",
    partnerRole: "PARTNER_OPERATOR",
    at: at("2026-10-11T21:00:00.000Z"),
  });
  assert.equal(reassigned.assignmentId, terrace.assignmentId);
});

test("membership and partnership lifecycle deny person-first assignment", async () => {
  const world = createWorld();
  await prepareAssignable(world, "partnership", "fac", "PARTNER_VIEWER");
  addPartnership(world, {
    id: "pending",
    facilityId: "pending",
    lifecycle: "PENDING",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "suspended",
    facilityId: "suspended",
    lifecycle: "SUSPENDED",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "ended",
    facilityId: "ended",
    lifecycle: "ENDED",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "managed",
    facilityId: "site_c",
    delegated: false,
    ceiling: "PARTNER_VIEWER",
  });
  addPartnership(world, {
    id: "empty",
    facilityId: "empty",
    delegated: true,
    ceiling: "PARTNER_VIEWER",
    emptyScope: true,
  });
  addPartnership(world, {
    id: "no_ceil",
    facilityId: "no_ceil",
    delegated: true,
    ceiling: null,
  });

  for (const partnershipId of ["pending", "suspended", "ended", "managed", "empty", "no_ceil"]) {
    await assert.rejects(
      () =>
        assignOrganizationClientMember(world.db, {
          actorUserId: "john",
          sessionOrganizationId: "metz",
          partnershipId,
          targetUserId: "jane",
          partnerRole: "PARTNER_VIEWER",
          at: NOW,
        }),
      (error: unknown) => error instanceof PartnerUserAccessError,
    );
  }

  world.users.find((user) => user.id === "inactive")!.isActive = false;
  const inactiveView = await listOrganizationMemberClientAssignments(world.db, {
    organizationId: "metz",
    userId: "inactive",
    now: NOW,
  });
  assert.equal(inactiveView.clients.every((row) => row.assignable === false), true);
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "inactive",
        partnerRole: "PARTNER_VIEWER",
        at: NOW,
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "USER_INACTIVE",
  );

  world.memberships.find((row) => row.userId === "former")!.rolePeriods[0]!.endsAt = NOW;
  const endedMembership = await listOrganizationMemberClientAssignments(world.db, {
    organizationId: "metz",
    userId: "former",
    now: at("2026-10-11T17:00:00.000Z"),
  });
  assert.equal(endedMembership.member, null);
  assert.equal(endedMembership.clients.every((row) => row.assignable === false), true);
  await assert.rejects(
    () =>
      assignOrganizationClientMember(world.db, {
        actorUserId: "john",
        sessionOrganizationId: "metz",
        partnershipId: "partnership",
        targetUserId: "former",
        partnerRole: "PARTNER_VIEWER",
        at: at("2026-10-11T17:00:00.000Z"),
      }),
    (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
  );
});

function at(iso: string) {
  return new Date(iso);
}

function matchesPartnershipId(
  value: string,
  filter: string | { in?: string[] } | undefined,
) {
  if (filter == null) return true;
  if (typeof filter === "string") return value === filter;
  return !filter.in || filter.in.includes(value);
}

function facilityName(facilityId: string) {
  switch (facilityId) {
    case "fac":
      return "Terrace View";
    case "hp":
      return "HighPointe";
    case "site_c":
      return "Site C";
    case "pending":
      return "Pending Site";
    case "suspended":
      return "Suspended Site";
    case "ended":
      return "Ended Site";
    case "empty":
      return "Empty Scope";
    case "no_ceil":
      return "No Ceiling";
    case "owned":
      return "Owned Kitchen";
    default:
      return facilityId;
  }
}

function departmentName(departmentId: string) {
  if (departmentId.startsWith("dietary")) return "Food & Nutrition";
  return departmentId;
}

async function prepareAssignable(
  world: ReturnType<typeof createWorld>,
  partnershipId: string,
  facilityId: string,
  ceiling: OrganizationPartnerRole,
) {
  await setFacilityPartnerRoleCeiling(world.db, {
    actorUserId: "actor",
    partnershipId,
    facilityId,
    maxPartnerRole: ceiling,
    at: at("2026-01-01T00:00:00.000Z"),
  });
  await enablePartnerStaffingDelegation(world.db, {
    actorUserId: "actor",
    partnershipId,
    facilityId,
    at: at("2026-01-01T00:00:00.000Z"),
  });
}

function addPartnership(
  world: ReturnType<typeof createWorld>,
  input: {
    id: string;
    facilityId: string;
    lifecycle?: "ACTIVE" | "PENDING" | "SUSPENDED" | "ENDED";
    delegated: boolean;
    ceiling: OrganizationPartnerRole | null;
    emptyScope?: boolean;
  },
) {
  const lifecycle = input.lifecycle ?? "ACTIVE";
  world.partnerships.push({
    id: input.id,
    facilityId: input.facilityId,
    organizationId: "metz",
    endedAt: lifecycle === "ENDED" ? NOW : null,
    createdAt: NOW,
  });
  if (lifecycle === "ACTIVE") {
    world.accessPeriods.push({
      id: `${input.id}_access`,
      facilityPartnerOrganizationId: input.id,
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null,
    });
  } else if (lifecycle === "PENDING") {
    world.accessPeriods.push({
      id: `${input.id}_access`,
      facilityPartnerOrganizationId: input.id,
      startsAt: at("2027-01-01T00:00:00.000Z"),
      endsAt: null,
    });
  } else {
    world.accessPeriods.push({
      id: `${input.id}_access`,
      facilityPartnerOrganizationId: input.id,
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: at("2026-09-01T00:00:00.000Z"),
    });
  }
  world.departments.push({ id: `dietary_${input.facilityId}`, facilityId: input.facilityId, isActive: true });
  if (!input.emptyScope) {
    world.scopes.push({
      id: `${input.id}_scope`,
      facilityPartnerOrganizationId: input.id,
      departmentId: `dietary_${input.facilityId}`,
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null,
    });
  }
  if (input.ceiling) {
    world.ceilings.push({
      id: `${input.id}_ceiling`,
      facilityPartnerOrganizationId: input.id,
      maxPartnerRole: input.ceiling,
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null,
      createdByUserId: "actor",
      endedByUserId: null,
    });
  }
  if (input.delegated) {
    world.policies.push({
      id: `${input.id}_policy`,
      facilityPartnerOrganizationId: input.id,
      startsAt: at("2020-01-01T00:00:00.000Z"),
      endsAt: null,
      createdByUserId: "actor",
      endedByUserId: null,
      createdByAuthorityKind: "facility_admin",
      createdByOrganizationId: null,
      endedByAuthorityKind: null,
      endedByOrganizationId: null,
    });
  }
  world.facilityAccesses.push({
    id: `fa_actor_${input.facilityId}`,
    userId: "actor",
    facilityId: input.facilityId,
    isActive: true,
    revokedAt: null,
    rolePeriods: [
      {
        id: `fa_actor_${input.facilityId}_role`,
        roleKey: "FACILITY_ADMINISTRATOR",
        startsAt: at("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      },
    ],
  });
}

function createWorld() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const organizations = [{ id: "metz", isActive: true }];
  const partnerships = [
    {
      id: "partnership",
      facilityId: "fac",
      organizationId: "metz",
      endedAt: null as Date | null,
      createdAt: at("2020-01-01T00:00:00.000Z"),
    },
  ];
  const users = [
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
      id: "inactive",
      email: "inactive@metz.example",
      displayName: "Inactive",
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
  const memberships = [
    {
      id: "mem_jane",
      userId: "jane",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_jane_period", role: "ORG_MEMBER" as const, startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null as Date | null },
      ],
    },
    {
      id: "mem_john",
      userId: "john",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_john_period", role: "ORG_ADMIN" as const, startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null as Date | null },
      ],
    },
    {
      id: "mem_former",
      userId: "former",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_former_period", role: "ORG_MEMBER" as const, startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null as Date | null },
      ],
    },
    {
      id: "mem_inactive",
      userId: "inactive",
      organizationId: "metz",
      createdAt: at("2020-01-01T00:00:00.000Z"),
      rolePeriods: [
        { id: "mem_inactive_period", role: "ORG_MEMBER" as const, startsAt: at("2020-01-01T00:00:00.000Z"), endsAt: null as Date | null },
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
    endReason:
      | "ROLE_CHANGED"
      | "ASSIGNMENT_ENDED"
      | "FACILITY_BLOCKED"
      | "ORGANIZATION_MEMBERSHIP_ENDED"
      | null;
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
  const facilityAccesses: Array<{
    id: string;
    userId: string;
    facilityId: string;
    isActive: boolean;
    revokedAt: Date | null;
    rolePeriods?: Array<{ id: string; roleKey: string; startsAt: Date; endsAt: Date | null }>;
  }> = [
    {
      id: "fa_actor",
      userId: "actor",
      facilityId: "fac",
      isActive: true,
      revokedAt: null,
      rolePeriods: [
        {
          id: "fa_actor_role",
          roleKey: "FACILITY_ADMINISTRATOR",
          startsAt: at("2020-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ],
    },
  ];

  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    $queryRaw: async (query: { strings?: string[]; values?: unknown[] }) => {
      const text = (query.strings ?? []).join(" ");
      const id = String(query.values?.[0] ?? "");
      if (text.includes('"Organization"')) {
        return organizations.some((row) => row.id === id) ? [{ id }] : [];
      }
      if (text.includes('"organizationId"')) {
        return partnerships.filter((row) => row.organizationId === id).map((row) => ({ id: row.id }));
      }
      return partnerships.some((row) => row.id === id) ? [{ id }] : [];
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.find((row) => row.id === where.id);
        if (!user) return null;
        return {
          ...user,
          sessionVersion: 0,
          facilityAccesses: facilityAccesses.filter(
            (grant) => grant.userId === user.id && grant.isActive && grant.revokedAt === null,
          ),
        };
      },
    },
    userFacilityAccess: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; facilityId: string; isActive: boolean; revokedAt: null };
      }) => {
        const row = facilityAccesses.find(
          (grant) =>
            grant.userId === where.userId &&
            grant.facilityId === where.facilityId &&
            grant.isActive === where.isActive &&
            grant.revokedAt === null,
        );
        return row ? { id: row.id, facilityId: row.facilityId, rolePeriods: row.rolePeriods ?? [] } : null;
      },
    },
    role: {
      findFirst: async ({ where }: { where: { key: string; isActive: boolean } }) =>
        where.isActive ? { id: `role_${where.key}` } : null,
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
          .map((row) => ({
            id: row.id,
            sortOrder: row.sortOrder ?? 10,
            name: departmentName(row.id),
          })),
    },
    employee: { findFirst: async () => null },
    facilityPartnerOrganization: {
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) => {
        const row = partnerships.find((item) => item.id === where.id && item.facilityId === where.facilityId);
        if (!row) return null;
        const organization = organizations.find((item) => item.id === row.organizationId);
        return { ...row, organization: { id: organization?.id, isActive: organization?.isActive } };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        partnerships.find((item) => item.id === where.id) ?? null,
      findMany: async ({ where }: { where?: { organizationId?: string } }) =>
        partnerships
          .filter((row) => !where?.organizationId || row.organizationId === where.organizationId)
          .map((row) => ({
            ...row,
            facility: { id: row.facilityId, displayName: facilityName(row.facilityId) },
            organization: {
              id: row.organizationId,
              name: "Metz Culinary Management",
              displayName: "Metz",
              isActive: organizations.find((item) => item.id === row.organizationId)?.isActive ?? true,
            },
          })),
    },
    facilityPartnerRoleCeilingPeriod: {
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId?: string | { in?: string[] } };
      }) =>
        ceilings
          .filter((row) => matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId))
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({
        data,
      }: {
        data: Omit<(typeof ceilings)[number], "id" | "endsAt" | "endedByUserId"> & {
          endsAt?: Date | null;
          endedByUserId?: string | null;
        };
      }) => {
        const row = { id: nextId("ceiling"), endedByUserId: null, endsAt: null, ...data };
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
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId?: string | { in?: string[] } };
      }) =>
        accessPeriods.filter((row) =>
          matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId),
        ),
    },
    facilityPartnerDepartmentScope: {
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId?: string | { in?: string[] } };
      }) =>
        scopes
          .filter((row) => matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId))
          .map((row) => ({
            ...row,
            department: {
              ...(departments.find((department) => department.id === row.departmentId) ?? {
                id: row.departmentId,
                facilityId: "missing",
                isActive: false,
              }),
              name: departmentName(row.departmentId),
            },
          })),
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
        const organization = organizations.find((item) => item.id === row.organizationId);
        const user = users.find((item) => item.id === row.userId);
        return {
          ...row,
          organization: { isActive: organization?.isActive ?? false },
          user: {
            id: user?.id ?? row.userId,
            email: user?.email ?? "",
            displayName: user?.displayName ?? row.userId,
            isActive: user?.isActive ?? false,
          },
        };
      },
      findMany: async ({ where }: { where?: { organizationId?: string } }) =>
        memberships
          .filter((row) => !where?.organizationId || row.organizationId === where.organizationId)
          .map((row) => {
            const user = users.find((item) => item.id === row.userId);
            return {
              ...row,
              organization: {
                isActive: organizations.find((item) => item.id === row.organizationId)?.isActive ?? false,
              },
              user: {
                id: user?.id ?? row.userId,
                email: user?.email ?? "",
                displayName: user?.displayName ?? row.userId,
                isActive: user?.isActive ?? false,
              },
              rolePeriods: row.rolePeriods,
            };
          }),
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const organization = organizations.find((item) => item.id === where.id);
        if (!organization) return null;
        return {
          id: organization.id,
          name: organization.id,
          displayName: null,
          legalName: null,
          organizationType: null,
          isActive: organization.isActive,
        };
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
          createdByUserId: string | null;
        };
      }) => {
        const membership = memberships.find((item) => item.id === data.membershipId);
        if (!membership) throw new Error("missing membership");
        const created = {
          id: nextId("mem_period"),
          role: data.role,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          membershipId: data.membershipId,
          createdByUserId: data.createdByUserId,
          endedByUserId: null as string | null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        membership.rolePeriods.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { endsAt?: Date; endedByUserId?: string | null };
      }) => {
        for (const membership of memberships) {
          const period = membership.rolePeriods.find((item) => item.id === where.id);
          if (!period) continue;
          Object.assign(period, data);
          return period;
        }
        throw new Error("missing membership period");
      },
      findMany: async ({ where }: { where: { membershipId: string } }) => {
        const membership = memberships.find((item) => item.id === where.membershipId);
        return membership?.rolePeriods ?? [];
      },
    },
    partnerUserFacilityAccess: {
      findUnique: async ({
        where,
      }: {
        where: { userId_facilityPartnerOrganizationId: { userId: string; facilityPartnerOrganizationId: string } };
      }) => {
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
      findMany: async ({
        where,
      }: {
        where: {
          userId?: string;
          facilityPartnerOrganizationId?: string | { in?: string[] };
          facilityPartnerOrganization?: { facilityId?: string; organizationId?: string };
        };
      }) =>
        assignments
          .filter((row) => {
            if (where.userId && row.userId !== where.userId) return false;
            if (!matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId)) {
              return false;
            }
            if (where.facilityPartnerOrganization) {
              const partnership = partnerships.find((item) => item.id === row.facilityPartnerOrganizationId);
              if (
                where.facilityPartnerOrganization.facilityId &&
                partnership?.facilityId !== where.facilityPartnerOrganization.facilityId
              ) {
                return false;
              }
              if (
                where.facilityPartnerOrganization.organizationId &&
                partnership?.organizationId !== where.facilityPartnerOrganization.organizationId
              ) {
                return false;
              }
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
                organization: {
                  isActive: organization?.isActive ?? false,
                  name: "Metz Culinary Management",
                  displayName: "Metz",
                },
                facility: { displayName: facilityName(partnership.facilityId) },
              },
            };
          }),
      create: async ({
        data,
      }: {
        data: { userId: string; facilityPartnerOrganizationId: string; createdByUserId: string | null };
      }) => {
        const row = { id: nextId("assignment"), ...data };
        assignments.push(row);
        return { ...row, rolePeriods: [] };
      },
    },
    partnerUserRolePeriod: {
      create: async ({
        data,
      }: {
        data: Omit<
          (typeof rolePeriods)[number],
          "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId" | "endReason"
        >;
      }) => {
        const row = {
          id: nextId("role"),
          endsAt: null,
          endedByUserId: null,
          endedByAuthorityKind: null,
          endedByOrganizationId: null,
          endReason: null,
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
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId?: string | { in?: string[] } };
      }) =>
        policies
          .filter((row) => matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId))
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({
        data,
      }: {
        data: Omit<
          (typeof policies)[number],
          "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId"
        >;
      }) => {
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
        where: { facilityPartnerOrganizationId?: string | { in?: string[] }; userId?: string };
      }) =>
        restrictions
          .filter((row) => matchesPartnershipId(row.facilityPartnerOrganizationId, where.facilityPartnerOrganizationId))
          .filter((row) => !where.userId || row.userId === where.userId)
          .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
      create: async ({
        data,
      }: {
        data: Omit<
          (typeof restrictions)[number],
          "id" | "endsAt" | "endedByUserId" | "endedByAuthorityKind" | "endedByOrganizationId" | "note"
        > & { note?: string | null };
      }) => {
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
    users,
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
