/**
 * SQL-backed One Facility Administrator tests (CDA-02).
 * Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { Prisma, PrismaClient, RoleKey } from "@prisma/client";

import { EmployeeIdentityError, issueEmployeeUserLinkInvitation, onboardFacilityEmployee } from "@/lib/employee-identity";
import {
  changeInternalFacilityRole,
  ensureCurrentInternalFacilityRole,
  ensureUserFacilityAccessGrant,
  InternalFacilityRoleError,
  resolveCurrentInternalFacilityRole,
} from "@/lib/facility-access";
import { createOrganizationMembership } from "@/lib/organization-membership";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import {
  acceptFacilityAdministratorInvitation,
  appointFacilityAdministratorByOrganization,
  cancelFacilityAdministratorInvitation,
  declineFacilityAdministratorInvitation,
  FacilityAdministratorInvitationError,
  inviteFacilityAdministratorSuccessor,
  listFacilityAdministratorConflicts,
  loadFacilityAdministratorSeat,
} from "./index";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(5).toString("hex");
}

type Db = PrismaClient;

async function ensureRoles(db: Db) {
  for (const key of Object.values(RoleKey)) {
    await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
  }
}

async function makeFacility(db: Db, organizationId: string, name: string) {
  return db.facility.create({ data: { organizationId, displayName: name, timezone: "America/New_York" } });
}

/** An activated account homed at `facilityId` with an active grant and, unless `roleKey` is null, an open role period. */
async function member(
  db: Db,
  input: { facilityId: string; label: string; roleKey: RoleKey | null; homeRole?: RoleKey; employee?: boolean },
) {
  const homeRole = await db.role.findUniqueOrThrow({ where: { key: input.homeRole ?? input.roleKey ?? RoleKey.MANAGER } });
  const user = await db.user.create({
    data: {
      email: `cda02-${input.label}-${tag()}@example.test`,
      displayName: `CDA02 ${input.label}`,
      facilityId: input.facilityId,
      roleId: homeRole.id,
      passwordHash: "hash",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
  const access = await db.userFacilityAccess.create({
    data: { userId: user.id, facilityId: input.facilityId, isActive: true },
  });
  if (input.roleKey) {
    await db.userFacilityRolePeriod.create({
      data: {
        userFacilityAccessId: access.id,
        roleKey: input.roleKey,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
  }
  const employee = input.employee
    ? await db.employee.create({
        data: {
          facilityId: input.facilityId,
          userId: user.id,
          firstName: "CDA02",
          lastName: input.label,
          email: user.email,
          roleType: input.roleKey ?? RoleKey.MANAGER,
        },
      })
    : null;
  return { user, access, employee };
}

async function openAdministratorCount(db: Db, facilityId: string) {
  return db.userFacilityRolePeriod.count({
    where: { roleKey: RoleKey.FACILITY_ADMINISTRATOR, endsAt: null, userFacilityAccess: { facilityId } },
  });
}

async function currentRole(db: Db, userId: string, facilityId: string) {
  return (await resolveCurrentInternalFacilityRole(db, { userId, facilityId }))?.roleKey ?? null;
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof FacilityAdministratorInvitationError || error instanceof InternalFacilityRoleError,
      `expected ${code}, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return true;
  });
}

test("one administrator: the database refuses a second open Facility Administrator period", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await ensureRoles(db);
    const organization = await db.organization.create({ data: { name: `CDA02 trigger ${tag()}` } });
    const facility = await makeFacility(db, organization.id, `CDA02 Trigger ${tag()}`);
    const sister = await makeFacility(db, organization.id, `CDA02 Sister ${tag()}`);
    const holder = await member(db, { facilityId: facility.id, label: "holder", roleKey: RoleKey.FACILITY_ADMINISTRATOR });
    const manager = await member(db, { facilityId: facility.id, label: "manager", roleKey: RoleKey.MANAGER });
    const unassigned = await member(db, { facilityId: facility.id, label: "unassigned", roleKey: null });
    // Each target access has no other open period, so only the one-administrator trigger can raise this.
    const refused = (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

    await assert.rejects(
      db.userFacilityRolePeriod.create({
        data: {
          userFacilityAccessId: unassigned.access.id,
          roleKey: RoleKey.FACILITY_ADMINISTRATOR,
          startsAt: new Date("2026-02-01T00:00:00Z"),
          endsAt: null,
        },
      }),
      refused,
    );
    const managerPeriod = await db.userFacilityRolePeriod.findFirstOrThrow({
      where: { userFacilityAccessId: manager.access.id, endsAt: null },
    });
    await assert.rejects(
      db.userFacilityRolePeriod.update({ where: { id: managerPeriod.id }, data: { roleKey: RoleKey.FACILITY_ADMINISTRATOR } }),
      refused,
    );
    // Moving an open administrator period onto another facility's access is refused too.
    const holderPeriodToMove = await db.userFacilityRolePeriod.findFirstOrThrow({
      where: { userFacilityAccessId: holder.access.id, endsAt: null },
    });
    await member(db, { facilityId: sister.id, label: "sister", roleKey: RoleKey.FACILITY_ADMINISTRATOR });
    const sisterSpare = await member(db, { facilityId: sister.id, label: "spare", roleKey: null });
    await assert.rejects(
      db.userFacilityRolePeriod.update({
        where: { id: holderPeriodToMove.id },
        data: { userFacilityAccessId: sisterSpare.access.id },
      }),
      refused,
    );

    // A sister facility keeps its own seat, and closed periods never count.
    const holderPeriod = await db.userFacilityRolePeriod.findFirstOrThrow({
      where: { userFacilityAccessId: holder.access.id, endsAt: null },
    });
    await db.userFacilityRolePeriod.update({
      where: { id: holderPeriod.id },
      data: { endsAt: new Date("2026-03-01T00:00:00Z") },
    });
    await db.userFacilityRolePeriod.update({
      where: { id: managerPeriod.id },
      data: { endsAt: new Date("2026-03-01T00:00:00Z") },
    });
    await db.userFacilityRolePeriod.create({
      data: {
        userFacilityAccessId: manager.access.id,
        roleKey: RoleKey.FACILITY_ADMINISTRATOR,
        startsAt: new Date("2026-03-01T00:00:00Z"),
      },
    });
    assert.equal(await openAdministratorCount(db, facility.id), 1);
    assert.equal(await openAdministratorCount(db, sister.id), 1);
  } finally {
    await db.$disconnect();
  }
});

test("one administrator: grants and role repair cannot add a second holder", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await ensureRoles(db);
    const organization = await db.organization.create({ data: { name: `CDA02 guard ${tag()}` } });
    const facility = await makeFacility(db, organization.id, `CDA02 Guard ${tag()}`);
    const holder = await member(db, { facilityId: facility.id, label: "holder", roleKey: RoleKey.FACILITY_ADMINISTRATOR });
    const manager = await member(db, { facilityId: facility.id, label: "manager", roleKey: RoleKey.MANAGER });

    await rejectsWith(
      changeInternalFacilityRole(db, {
        userId: manager.user.id,
        facilityId: facility.id,
        roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      }),
      "FACILITY_ADMINISTRATOR_TAKEN",
    );
    assert.equal(await currentRole(db, manager.user.id, facility.id), RoleKey.MANAGER);
    // The holder may still be "changed" to the role they already hold.
    assert.equal(
      (await changeInternalFacilityRole(db, {
        userId: holder.user.id,
        facilityId: facility.id,
        roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      })).roleKey,
      RoleKey.FACILITY_ADMINISTRATOR,
    );

    // Home role says Facility Administrator, but no period: role repair opens nothing.
    const stale = await member(db, {
      facilityId: facility.id,
      label: "stale",
      roleKey: null,
      homeRole: RoleKey.FACILITY_ADMINISTRATOR,
    });
    assert.equal(await ensureCurrentInternalFacilityRole(db, { userId: stale.user.id, facilityId: facility.id }), null);
    await rejectsWith(
      ensureCurrentInternalFacilityRole(db, {
        userId: stale.user.id,
        facilityId: facility.id,
        roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      }),
      "FACILITY_ADMINISTRATOR_TAKEN",
    );
    // The report flags it as a home-role claim.
    const conflict = (await listFacilityAdministratorConflicts(db)).find((row) => row.facilityId === facility.id);
    assert.deepEqual(
      conflict?.claims.map((claim) => [claim.userId, claim.kind]),
      [
        [holder.user.id, "current"],
        [stale.user.id, "home_role"],
      ],
    );
    // Once their employment here has ended, the home role claims nothing.
    await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: stale.user.id,
        firstName: "CDA02",
        lastName: "stale",
        email: stale.user.email,
        roleType: RoleKey.FACILITY_ADMINISTRATOR,
        status: "TERMINATED",
      },
    });
    assert.equal(
      (await listFacilityAdministratorConflicts(db)).some((row) => row.facilityId === facility.id),
      false,
    );

    // A new grant that would open a second administrator writes nothing.
    const outsider = await db.user.create({
      data: { email: `cda02-outsider-${tag()}@example.test`, displayName: "Outsider", facilityId: facility.id },
    });
    await rejectsWith(
      ensureUserFacilityAccessGrant(db, {
        userId: outsider.id,
        facilityId: facility.id,
        roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      }),
      "FACILITY_ADMINISTRATOR_TAKEN",
    );
    assert.equal(await db.userFacilityAccess.count({ where: { userId: outsider.id } }), 0);

    // People, imports and link invitations never assign the role.
    await assert.rejects(
      db.$transaction((tx) =>
        onboardFacilityEmployee(tx, {
          facilityId: facility.id,
          actorUserId: holder.user.id,
          firstName: "New",
          lastName: "Admin",
          email: `cda02-new-${tag()}@example.test`,
          roleType: RoleKey.FACILITY_ADMINISTRATOR,
          employmentType: "FULL_TIME",
          status: "ACTIVE",
          confirmExistingUser: true,
        }),
      ),
      (error: unknown) => error instanceof EmployeeIdentityError && /not assigned in People/.test(error.message),
    );
    const unlinked = await db.employee.create({
      data: { facilityId: facility.id, firstName: "Un", lastName: "Linked", roleType: RoleKey.MANAGER },
    });
    await assert.rejects(
      issueEmployeeUserLinkInvitation(db, {
        employeeId: unlinked.id,
        facilityId: facility.id,
        targetEmail: manager.user.email,
        intendedRoleKey: RoleKey.FACILITY_ADMINISTRATOR,
        invitedByUserId: holder.user.id,
      }),
      (error: unknown) => error instanceof EmployeeIdentityError && /not assigned in People/.test(error.message),
    );
  } finally {
    await db.$disconnect();
  }
});

test("one administrator: simultaneous promotions into an empty seat leave exactly one holder", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await ensureRoles(db);
    const organization = await db.organization.create({ data: { name: `CDA02 race ${tag()}` } });
    const facility = await makeFacility(db, organization.id, `CDA02 Race ${tag()}`);
    const people = await Promise.all(
      ["a", "b", "c"].map((label) => member(db, { facilityId: facility.id, label, roleKey: RoleKey.MANAGER })),
    );
    const results = await Promise.allSettled(
      people.map((person) =>
        changeInternalFacilityRole(db, {
          userId: person.user.id,
          facilityId: facility.id,
          roleKey: RoleKey.FACILITY_ADMINISTRATOR,
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of results) {
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof InternalFacilityRoleError);
        assert.equal(result.reason.code, "FACILITY_ADMINISTRATOR_TAKEN");
      }
    }
    assert.equal(await openAdministratorCount(db, facility.id), 1);
  } finally {
    await db.$disconnect();
  }
});

test("transfer: the holder invites, the successor accepts, and both roles change together", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await ensureRoles(db);
    const organization = await db.organization.create({ data: { name: `CDA02 transfer ${tag()}` } });
    const facility = await makeFacility(db, organization.id, `CDA02 Transfer ${tag()}`);
    const holder = await member(db, {
      facilityId: facility.id,
      label: "holder",
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      employee: true,
    });
    const successor = await member(db, { facilityId: facility.id, label: "successor", roleKey: RoleKey.GM, employee: true });
    const bystander = await member(db, { facilityId: facility.id, label: "bystander", roleKey: RoleKey.MANAGER });
    const inactivated = await member(db, { facilityId: facility.id, label: "unactivated", roleKey: RoleKey.MANAGER });
    await db.user.update({ where: { id: inactivated.user.id }, data: { passwordHash: null } });
    const now = new Date();

    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: bystander.user.id,
        facilityId: facility.id,
        invitedUserId: successor.user.id,
        outgoingRoleKey: RoleKey.MANAGER,
      }),
      "NOT_ADMINISTRATOR",
    );
    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: holder.user.id,
        facilityId: facility.id,
        invitedUserId: holder.user.id,
        outgoingRoleKey: RoleKey.MANAGER,
      }),
      "INVALID_SUCCESSOR",
    );
    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: holder.user.id,
        facilityId: facility.id,
        invitedUserId: inactivated.user.id,
        outgoingRoleKey: RoleKey.MANAGER,
      }),
      "INVALID_SUCCESSOR",
    );
    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: holder.user.id,
        facilityId: facility.id,
        invitedUserId: successor.user.id,
        outgoingRoleKey: RoleKey.FACILITY_ADMINISTRATOR,
      }),
      "INVALID_ROLE",
    );

    // Decline, then cancel, then let one expire: none of them change anyone's role.
    const declined = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: holder.user.id,
      facilityId: facility.id,
      invitedUserId: successor.user.id,
      outgoingRoleKey: RoleKey.MANAGER,
    });
    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: holder.user.id,
        facilityId: facility.id,
        invitedUserId: bystander.user.id,
        outgoingRoleKey: RoleKey.MANAGER,
      }),
      "PENDING_EXISTS",
    );
    await rejectsWith(
      declineFacilityAdministratorInvitation(db, { actorUserId: bystander.user.id, invitationId: declined.id }),
      "NOT_INVITEE",
    );
    await declineFacilityAdministratorInvitation(db, { actorUserId: successor.user.id, invitationId: declined.id });
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: successor.user.id, invitationId: declined.id }),
      "CLOSED",
    );

    const cancelled = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: holder.user.id,
      facilityId: facility.id,
      invitedUserId: successor.user.id,
      outgoingRoleKey: RoleKey.MANAGER,
    });
    await rejectsWith(
      cancelFacilityAdministratorInvitation(db, { actorUserId: bystander.user.id, invitationId: cancelled.id }),
      "NOT_ALLOWED",
    );
    await cancelFacilityAdministratorInvitation(db, { actorUserId: holder.user.id, invitationId: cancelled.id });

    const expiring = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: holder.user.id,
      facilityId: facility.id,
      invitedUserId: successor.user.id,
      outgoingRoleKey: RoleKey.MANAGER,
      now: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
    });
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: successor.user.id, invitationId: expiring.id }),
      "EXPIRED",
    );
    assert.equal(await currentRole(db, holder.user.id, facility.id), RoleKey.FACILITY_ADMINISTRATOR);
    assert.equal(await currentRole(db, successor.user.id, facility.id), RoleKey.GM);

    // A fresh invitation replaces the expired one; the holder chooses Supervisor.
    const invitation = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: holder.user.id,
      facilityId: facility.id,
      invitedUserId: successor.user.id,
      outgoingRoleKey: RoleKey.SUPERVISOR,
    });
    assert.equal(
      (await db.facilityAdministratorInvitation.findUniqueOrThrow({ where: { id: expiring.id } })).status,
      "EXPIRED",
    );
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: bystander.user.id, invitationId: invitation.id }),
      "NOT_INVITEE",
    );
    const result = await acceptFacilityAdministratorInvitation(db, {
      actorUserId: successor.user.id,
      invitationId: invitation.id,
    });
    assert.deepEqual(result, { facilityId: facility.id, kind: "TRANSFER", previousHolderUserId: holder.user.id });

    assert.equal(await currentRole(db, holder.user.id, facility.id), RoleKey.SUPERVISOR);
    assert.equal(await currentRole(db, successor.user.id, facility.id), RoleKey.FACILITY_ADMINISTRATOR);
    assert.equal(await openAdministratorCount(db, facility.id), 1);
    const [holderUser, successorUser] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: holder.user.id }, select: { role: { select: { key: true } } } }),
      db.user.findUniqueOrThrow({ where: { id: successor.user.id }, select: { role: { select: { key: true } } } }),
    ]);
    assert.equal(holderUser.role?.key, RoleKey.SUPERVISOR);
    assert.equal(successorUser.role?.key, RoleKey.FACILITY_ADMINISTRATOR);
    const [holderEmployee, successorEmployee] = await Promise.all([
      db.employee.findUniqueOrThrow({ where: { id: holder.employee!.id } }),
      db.employee.findUniqueOrThrow({ where: { id: successor.employee!.id } }),
    ]);
    assert.equal(holderEmployee.roleType, RoleKey.SUPERVISOR);
    assert.equal(successorEmployee.roleType, RoleKey.FACILITY_ADMINISTRATOR);
    assert.equal(holderEmployee.sessionVersion, holder.employee!.sessionVersion + 1);
    const audit = await db.employeeHrAuditLog.findMany({
      where: { facilityId: facility.id, fieldKey: "profile.roleType" },
      orderBy: { createdAt: "asc" },
      select: { employeeId: true, oldValue: true, newValue: true, userId: true },
    });
    assert.deepEqual(
      audit.map((row) => [row.employeeId, row.oldValue, row.newValue, row.userId]),
      [
        [holder.employee!.id, RoleKey.FACILITY_ADMINISTRATOR, RoleKey.SUPERVISOR, successor.user.id],
        [successor.employee!.id, RoleKey.GM, RoleKey.FACILITY_ADMINISTRATOR, successor.user.id],
      ],
    );
    const closed = await db.facilityAdministratorInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assert.equal(closed.status, "ACCEPTED");
    assert.equal(closed.closedByUserId, successor.user.id);
    assert.ok(closed.closedAt);

    // The former holder can no longer transfer; the new holder can.
    await rejectsWith(
      inviteFacilityAdministratorSuccessor(db, {
        actorUserId: holder.user.id,
        facilityId: facility.id,
        invitedUserId: bystander.user.id,
        outgoingRoleKey: RoleKey.MANAGER,
      }),
      "NOT_ADMINISTRATOR",
    );
    const next = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: successor.user.id,
      facilityId: facility.id,
      invitedUserId: bystander.user.id,
      outgoingRoleKey: RoleKey.GM,
    });
    // If the sender leaves before acceptance, the transfer is stale.
    await db.userFacilityAccess.update({
      where: { id: successor.access.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: bystander.user.id, invitationId: next.id }),
      "STALE",
    );
    assert.equal(await currentRole(db, bystander.user.id, facility.id), RoleKey.MANAGER);
  } finally {
    await db.$disconnect();
  }
});

test("recovery: the parent organization appoints only when the seat is empty or its holder has left", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await ensureRoles(db);
    const organization = await db.organization.create({ data: { name: `CDA02 recovery ${tag()}` } });
    const otherOrganization = await db.organization.create({ data: { name: `CDA02 other ${tag()}` } });
    const facility = await makeFacility(db, organization.id, `CDA02 Recovery ${tag()}`);
    const emptyFacility = await makeFacility(db, organization.id, `CDA02 Empty ${tag()}`);
    const orgAdmin = await db.user.create({
      data: { email: `cda02-orgadmin-${tag()}@example.test`, displayName: "Org Admin", emailVerifiedAt: new Date() },
    });
    const orgMember = await db.user.create({
      data: { email: `cda02-orgmember-${tag()}@example.test`, displayName: "Org Member", emailVerifiedAt: new Date() },
    });
    const foreignAdmin = await db.user.create({
      data: { email: `cda02-foreign-${tag()}@example.test`, displayName: "Foreign Admin", emailVerifiedAt: new Date() },
    });
    await createOrganizationMembership(db, { userId: orgAdmin.id, organizationId: organization.id, role: "ORG_ADMIN" });
    await createOrganizationMembership(db, { userId: orgMember.id, organizationId: organization.id, role: "ORG_MEMBER" });
    await createOrganizationMembership(db, {
      userId: foreignAdmin.id,
      organizationId: otherOrganization.id,
      role: "ORG_ADMIN",
    });

    const holder = await member(db, { facilityId: facility.id, label: "holder", roleKey: RoleKey.FACILITY_ADMINISTRATOR });
    const successor = await member(db, { facilityId: facility.id, label: "successor", roleKey: RoleKey.MANAGER });
    const appoint = (actorUserId: string, invitedEmail: string, facilityId = facility.id) =>
      appointFacilityAdministratorByOrganization(db, { actorUserId, facilityId, invitedEmail });

    await rejectsWith(appoint(orgAdmin.id, successor.user.email), "SEAT_HELD");
    await rejectsWith(appoint(orgMember.id, successor.user.email), "NOT_ORGANIZATION_ADMIN");
    await rejectsWith(appoint(foreignAdmin.id, successor.user.email), "NOT_ORGANIZATION_ADMIN");

    // The holder had started a transfer, then their account was deactivated.
    const strandedTransfer = await inviteFacilityAdministratorSuccessor(db, {
      actorUserId: holder.user.id,
      facilityId: facility.id,
      invitedUserId: successor.user.id,
      outgoingRoleKey: RoleKey.MANAGER,
    });
    await db.user.update({ where: { id: holder.user.id }, data: { isActive: false } });
    const seat = await loadFacilityAdministratorSeat(db, facility.id);
    assert.equal(seat.kind, "GONE");
    assert.equal(seat.kind === "GONE" ? seat.reason : null, "ACCOUNT_INACTIVE");

    await rejectsWith(appoint(orgAdmin.id, `nobody-${tag()}@example.test`), "INVALID_SUCCESSOR");
    await rejectsWith(appoint(orgAdmin.id, holder.user.email), "INVALID_SUCCESSOR");
    const recovery = await appoint(orgAdmin.id, successor.user.email.toUpperCase());
    assert.equal(recovery.kind, "RECOVERY");
    assert.equal(recovery.outgoing?.userId, holder.user.id);
    assert.equal(
      (await db.facilityAdministratorInvitation.findUniqueOrThrow({ where: { id: strandedTransfer.id } })).status,
      "CANCELLED",
    );
    // The organization cannot accept on the successor's behalf.
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: orgAdmin.id, invitationId: recovery.id }),
      "NOT_INVITEE",
    );
    const holderBefore = await db.user.findUniqueOrThrow({ where: { id: holder.user.id }, select: { sessionVersion: true } });
    const result = await acceptFacilityAdministratorInvitation(db, {
      actorUserId: successor.user.id,
      invitationId: recovery.id,
    });
    assert.deepEqual(result, { facilityId: facility.id, kind: "RECOVERY", previousHolderUserId: holder.user.id });
    assert.equal(await currentRole(db, successor.user.id, facility.id), RoleKey.FACILITY_ADMINISTRATOR);
    assert.equal(await openAdministratorCount(db, facility.id), 1);
    const holderAfter = await db.user.findUniqueOrThrow({ where: { id: holder.user.id }, select: { sessionVersion: true } });
    assert.equal(holderAfter.sessionVersion, holderBefore.sessionVersion + 1);
    await rejectsWith(appoint(orgAdmin.id, holder.user.email), "SEAT_HELD");

    // Empty seat: recovery works, and the organization admin can cancel its own invitation.
    const first = await member(db, { facilityId: emptyFacility.id, label: "first", roleKey: RoleKey.MANAGER });
    const second = await member(db, { facilityId: emptyFacility.id, label: "second", roleKey: RoleKey.SUPERVISOR });
    const cancelled = await appoint(orgAdmin.id, first.user.email, emptyFacility.id);
    await rejectsWith(appoint(orgAdmin.id, second.user.email, emptyFacility.id), "PENDING_EXISTS");
    await rejectsWith(
      cancelFacilityAdministratorInvitation(db, { actorUserId: orgMember.id, invitationId: cancelled.id }),
      "NOT_ALLOWED",
    );
    await cancelFacilityAdministratorInvitation(db, { actorUserId: orgAdmin.id, invitationId: cancelled.id });
    const appointed = await appoint(orgAdmin.id, second.user.email, emptyFacility.id);
    // Someone fills the seat first: the recovery can no longer complete.
    await changeInternalFacilityRole(db, {
      userId: first.user.id,
      facilityId: emptyFacility.id,
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
    });
    await rejectsWith(
      acceptFacilityAdministratorInvitation(db, { actorUserId: second.user.id, invitationId: appointed.id }),
      "SEAT_HELD",
    );
    assert.equal(await currentRole(db, second.user.id, emptyFacility.id), RoleKey.SUPERVISOR);
    assert.equal(await openAdministratorCount(db, emptyFacility.id), 1);

    const conflicts = await listFacilityAdministratorConflicts(db);
    assert.equal(conflicts.some((row) => row.facilityId === facility.id || row.facilityId === emptyFacility.id), false);
  } finally {
    await db.$disconnect();
  }
});
