/**
 * Organization membership end closes partner assignments and serializes with partnership creation.
 * Skips unless DATABASE_URL points at localhost.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { createFacilityPartner } from "@/lib/partner-access";
import {
  changeOrganizationRole,
  endOrganizationMembership,
  OrganizationMembershipError,
  rejoinOrganizationMembership,
} from "@/lib/organization-membership";
import {
  assignPartnerUser,
  changePartnerUserRole,
  listAuthorizedPartnerFacilities,
  PartnerUserAccessError,
  setFacilityPartnerRoleCeiling,
} from "@/lib/partner-user-access";

const databaseUrl = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
const skip = local
  ? false
  : "set DATABASE_URL to local PostgreSQL to certify membership-end assignment revocation";

function suffix() {
  return randomBytes(4).toString("hex");
}

async function waitFor(predicate: () => Promise<boolean>, label: string) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for ${label}`);
}

test(
  "membership end closes every current assignment through that organization",
  { skip },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const parentId = `org_parent_${tag}`;
    const metzId = `org_metz_${tag}`;
    const otherId = `org_other_${tag}`;
    const terraceId = `fac_terrace_${tag}`;
    const highpointeId = `fac_high_${tag}`;
    const otherFacilityId = `fac_other_${tag}`;
    const actorId = `user_fa_${tag}`;
    const janeId = `user_jane_${tag}`;
    const adminId = `user_admin_${tag}`;
    const dietary = `dept_terrace_${tag}`;
    const dietaryHp = `dept_high_${tag}`;
    const dietaryOther = `dept_other_${tag}`;
    const partnershipIds: string[] = [];
    let roleId = "";
    try {
      const role = await prisma.role.upsert({
        where: { key: "FACILITY_ADMINISTRATOR" },
        update: {},
        create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
      });
      roleId = role.id;
      await prisma.organization.createMany({
        data: [
          { id: parentId, name: `Parent ${tag}` },
          { id: metzId, name: `Metz ${tag}` },
          { id: otherId, name: `Other ${tag}` },
        ],
      });
      await prisma.facility.createMany({
        data: [
          { id: terraceId, organizationId: parentId, displayName: `Terrace ${tag}` },
          { id: highpointeId, organizationId: parentId, displayName: `HighPointe ${tag}` },
          { id: otherFacilityId, organizationId: parentId, displayName: `Other Facility ${tag}` },
        ],
      });
      await prisma.user.createMany({
        data: [
          {
            id: actorId,
            email: `fa-${tag}@membership-end.example`,
            displayName: "Facility Admin",
            facilityId: terraceId,
            roleId,
            emailVerifiedAt: new Date(),
          },
          {
            id: janeId,
            email: `jane-${tag}@membership-end.example`,
            displayName: "Jane",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
          {
            id: adminId,
            email: `admin-${tag}@membership-end.example`,
            displayName: "Metz Admin",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: janeId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_MEMBER", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: janeId,
          organizationId: otherId,
          rolePeriods: { create: { role: "ORG_MEMBER", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: adminId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.userFacilityAccess.createMany({
        data: [
          { userId: actorId, facilityId: highpointeId },
          { userId: actorId, facilityId: otherFacilityId },
        ],
      });
      await prisma.department.createMany({
        data: [
          { id: dietary, facilityId: terraceId, key: `DIETARY_${tag}`, name: "Food & Nutrition" },
          { id: dietaryHp, facilityId: highpointeId, key: `DIETARY_HP_${tag}`, name: "Food & Nutrition" },
          { id: dietaryOther, facilityId: otherFacilityId, key: `DIETARY_OTHER_${tag}`, name: "Food & Nutrition" },
        ],
      });

      async function partnerUp(facilityId: string, organizationId: string, departmentId: string) {
        const partnership = await prisma.facilityPartnerOrganization.create({
          data: {
            facilityId,
            organizationId,
            accessPeriods: { create: { startsAt: new Date("2020-01-01T00:00:00.000Z") } },
            departmentScopes: { create: { departmentId, startsAt: new Date("2020-01-01T00:00:00.000Z") } },
          },
        });
        partnershipIds.push(partnership.id);
        await setFacilityPartnerRoleCeiling(prisma, {
          actorUserId: actorId,
          partnershipId: partnership.id,
          facilityId,
          maxPartnerRole: "PARTNER_MANAGER",
        });
        await assignPartnerUser(prisma, {
          actorUserId: actorId,
          partnershipId: partnership.id,
          facilityId,
          userId: janeId,
          partnerRole: "PARTNER_OPERATOR",
        });
        return partnership.id;
      }

      const terracePartnership = await partnerUp(terraceId, metzId, dietary);
      const highpointePartnership = await partnerUp(highpointeId, metzId, dietaryHp);
      const otherPartnership = await partnerUp(otherFacilityId, otherId, dietaryOther);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: janeId },
        select: { sessionVersion: true },
      });

      await endOrganizationMembership(prisma, {
        userId: janeId,
        organizationId: metzId,
        actorUserId: adminId,
        revokeSessions: true,
      });

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: janeId },
        select: { sessionVersion: true },
      });
      assert.equal(after.sessionVersion, before.sessionVersion + 1);
      const accessRows = await prisma.partnerUserFacilityAccess.findMany({
        where: { userId: janeId },
        include: { rolePeriods: true },
      });
      for (const access of accessRows) {
        const open = access.rolePeriods.filter((period) => period.endsAt === null);
        if (access.facilityPartnerOrganizationId === otherPartnership) {
          assert.equal(open.length, 1);
          continue;
        }
        assert.equal(open.length, 0);
        assert.ok(
          access.rolePeriods.some(
            (period) =>
              period.endReason === "ORGANIZATION_MEMBERSHIP_ENDED" &&
              period.endedByUserId === adminId &&
              period.endedByAuthorityKind === "partner_org_admin" &&
              period.endedByOrganizationId === metzId,
          ),
        );
      }
      assert.equal(
        accessRows.filter((row) => row.facilityPartnerOrganizationId === terracePartnership || row.facilityPartnerOrganizationId === highpointePartnership).length,
        2,
      );

      await rejoinOrganizationMembership(prisma, {
        userId: janeId,
        organizationId: metzId,
        role: "ORG_MEMBER",
        actorUserId: adminId,
      });
      const clients = await listAuthorizedPartnerFacilities(prisma, {
        userId: janeId,
        organizationId: metzId,
      });
      assert.deepEqual(clients, []);
      const rejoined = await assignPartnerUser(prisma, {
        actorUserId: actorId,
        partnershipId: terracePartnership,
        facilityId: terraceId,
        userId: janeId,
        partnerRole: "PARTNER_VIEWER",
      });
      const terraceAccess = accessRows.find((row) => row.facilityPartnerOrganizationId === terracePartnership)!;
      assert.equal(rejoined.assignmentId, terraceAccess.id);
      assert.equal(rejoined.rolePeriod.endReason, null);
    } finally {
      for (const partnershipId of partnershipIds) {
        await prisma.partnerUserRolePeriod.deleteMany({
          where: { partnerUserFacilityAccess: { facilityPartnerOrganizationId: partnershipId } },
        });
        await prisma.partnerUserFacilityAccess.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerRoleCeilingPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerDepartmentScope.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerAccessPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerOrganization.deleteMany({ where: { id: partnershipId } });
      }
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: { in: [metzId, otherId] } } },
      });
      await prisma.userOrganizationMembership.deleteMany({
        where: { organizationId: { in: [metzId, otherId] } },
      });
      await prisma.department.deleteMany({ where: { id: { in: [dietary, dietaryHp, dietaryOther] } } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, janeId, adminId] } } });
      await prisma.facility.deleteMany({ where: { id: { in: [terraceId, highpointeId, otherFacilityId] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentId, metzId, otherId] } } });
      void roleId;
      await prisma.$disconnect();
    }
  },
);

test(
  "assignment and role-change races leave no current assignment after membership end",
  { skip },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const parentId = `org_parent_${tag}`;
    const metzId = `org_metz_${tag}`;
    const facilityId = `fac_${tag}`;
    const actorId = `user_fa_${tag}`;
    const janeId = `user_jane_${tag}`;
    const adminId = `user_admin_${tag}`;
    const departmentId = `dept_${tag}`;
    let partnershipId = "";
    try {
      const role = await prisma.role.upsert({
        where: { key: "FACILITY_ADMINISTRATOR" },
        update: {},
        create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
      });
      await prisma.organization.createMany({
        data: [
          { id: parentId, name: `Parent ${tag}` },
          { id: metzId, name: `Metz ${tag}` },
        ],
      });
      await prisma.facility.create({
        data: { id: facilityId, organizationId: parentId, displayName: `Facility ${tag}` },
      });
      await prisma.user.createMany({
        data: [
          {
            id: actorId,
            email: `fa-${tag}@race.example`,
            displayName: "Facility Admin",
            facilityId,
            roleId: role.id,
            emailVerifiedAt: new Date(),
          },
          {
            id: janeId,
            email: `jane-${tag}@race.example`,
            displayName: "Jane",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
          {
            id: adminId,
            email: `admin-${tag}@race.example`,
            displayName: "Admin",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: janeId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_MEMBER", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: adminId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.department.create({
        data: { id: departmentId, facilityId, key: `DIETARY_${tag}`, name: "Food & Nutrition" },
      });
      const partnership = await prisma.facilityPartnerOrganization.create({
        data: {
          facilityId,
          organizationId: metzId,
          accessPeriods: { create: { startsAt: new Date("2020-01-01T00:00:00.000Z") } },
          departmentScopes: { create: { departmentId, startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      partnershipId = partnership.id;
      await setFacilityPartnerRoleCeiling(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        maxPartnerRole: "PARTNER_MANAGER",
      });

      await Promise.allSettled([
        assignPartnerUser(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: janeId,
          partnerRole: "PARTNER_VIEWER",
        }),
        endOrganizationMembership(prisma, {
          userId: janeId,
          organizationId: metzId,
          actorUserId: adminId,
          revokeSessions: false,
        }),
      ]);

      const membership = await prisma.userOrganizationRolePeriod.findFirst({
        where: { membership: { userId: janeId, organizationId: metzId }, endsAt: null },
      });
      assert.equal(membership, null);
      const open = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(open, 0);

      await rejoinOrganizationMembership(prisma, {
        userId: janeId,
        organizationId: metzId,
        role: "ORG_MEMBER",
        actorUserId: adminId,
      });
      await assignPartnerUser(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        userId: janeId,
        partnerRole: "PARTNER_VIEWER",
      });
      await Promise.allSettled([
        changeOrganizationRole(prisma, {
          userId: janeId,
          organizationId: metzId,
          role: "ORG_ADMIN",
          actorUserId: adminId,
          revokeSessions: false,
        }),
        endOrganizationMembership(prisma, {
          userId: janeId,
          organizationId: metzId,
          actorUserId: adminId,
          revokeSessions: false,
        }),
      ]);
      const openAfterOrgRole = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(openAfterOrgRole, 0);
      await rejoinOrganizationMembership(prisma, {
        userId: janeId,
        organizationId: metzId,
        role: "ORG_MEMBER",
        actorUserId: adminId,
      });
      await assignPartnerUser(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        userId: janeId,
        partnerRole: "PARTNER_VIEWER",
      });
      await Promise.allSettled([
        changePartnerUserRole(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: janeId,
          partnerRole: "PARTNER_OPERATOR",
        }),
        endOrganizationMembership(prisma, {
          userId: janeId,
          organizationId: metzId,
          actorUserId: adminId,
          revokeSessions: false,
        }),
      ]);
      const openAfterRoleChange = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(openAfterRoleChange, 0);
      const membershipAfter = await prisma.userOrganizationRolePeriod.findFirst({
        where: { membership: { userId: janeId, organizationId: metzId }, endsAt: null },
      });
      assert.equal(membershipAfter, null);
    } finally {
      if (partnershipId) {
        await prisma.partnerUserRolePeriod.deleteMany({
          where: { partnerUserFacilityAccess: { facilityPartnerOrganizationId: partnershipId } },
        });
        await prisma.partnerUserFacilityAccess.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerRoleCeilingPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerDepartmentScope.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerAccessPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerOrganization.deleteMany({ where: { id: partnershipId } });
      }
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: metzId } },
      });
      await prisma.userOrganizationMembership.deleteMany({ where: { organizationId: metzId } });
      await prisma.department.deleteMany({ where: { id: departmentId } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, janeId, adminId] } } });
      await prisma.facility.deleteMany({ where: { id: facilityId } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentId, metzId] } } });
      await prisma.$disconnect();
    }
  },
);

test(
  "last-admin denial and injected failure commit no assignment changes",
  { skip },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const parentId = `org_parent_${tag}`;
    const metzId = `org_metz_${tag}`;
    const facilityId = `fac_${tag}`;
    const actorId = `user_fa_${tag}`;
    const janeId = `user_jane_${tag}`;
    const departmentId = `dept_${tag}`;
    let partnershipId = "";
    try {
      const role = await prisma.role.upsert({
        where: { key: "FACILITY_ADMINISTRATOR" },
        update: {},
        create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
      });
      await prisma.organization.createMany({
        data: [
          { id: parentId, name: `Parent ${tag}` },
          { id: metzId, name: `Metz ${tag}` },
        ],
      });
      await prisma.facility.create({
        data: { id: facilityId, organizationId: parentId, displayName: `Facility ${tag}` },
      });
      await prisma.user.createMany({
        data: [
          {
            id: actorId,
            email: `fa-${tag}@last.example`,
            displayName: "Facility Admin",
            facilityId,
            roleId: role.id,
            emailVerifiedAt: new Date(),
          },
          {
            id: janeId,
            email: `jane-${tag}@last.example`,
            displayName: "Jane",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: janeId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.department.create({
        data: { id: departmentId, facilityId, key: `DIETARY_${tag}`, name: "Food & Nutrition" },
      });
      const partnership = await prisma.facilityPartnerOrganization.create({
        data: {
          facilityId,
          organizationId: metzId,
          accessPeriods: { create: { startsAt: new Date("2020-01-01T00:00:00.000Z") } },
          departmentScopes: { create: { departmentId, startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      partnershipId = partnership.id;
      await setFacilityPartnerRoleCeiling(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        maxPartnerRole: "PARTNER_MANAGER",
      });
      await assignPartnerUser(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        userId: janeId,
        partnerRole: "PARTNER_OPERATOR",
      });

      await assert.rejects(
        () =>
          endOrganizationMembership(prisma, {
            userId: janeId,
            organizationId: metzId,
            actorUserId: janeId,
            revokeSessions: false,
          }),
        (error: unknown) => error instanceof OrganizationMembershipError && error.code === "LAST_ORG_ADMIN",
      );
      const stillOpen = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(stillOpen, 1);
      const stillMember = await prisma.userOrganizationRolePeriod.count({
        where: { membership: { userId: janeId, organizationId: metzId }, endsAt: null },
      });
      assert.equal(stillMember, 1);

      await assert.rejects(
        () =>
          prisma.$transaction(async (tx) => {
            await endOrganizationMembership(tx, {
              userId: janeId,
              organizationId: metzId,
              actorUserId: janeId,
              revokeSessions: false,
            });
            throw new Error("injected cleanup failure");
          }),
        (error: unknown) => error instanceof OrganizationMembershipError && error.code === "LAST_ORG_ADMIN",
      );

      const keeperId = `user_keeper_${tag}`;
      await prisma.user.create({
        data: {
          id: keeperId,
          email: `keeper-${tag}@last.example`,
          displayName: "Keeper",
          facilityId: null,
          roleId: null,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: keeperId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await changeOrganizationRole(prisma, {
        userId: janeId,
        organizationId: metzId,
        role: "ORG_MEMBER",
        actorUserId: keeperId,
        revokeSessions: false,
      });
      const openAfterDemotion = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          endReason: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(openAfterDemotion, 1);

      await assert.rejects(() =>
        prisma.$transaction(async (tx) => {
          await endOrganizationMembership(tx, {
            userId: janeId,
            organizationId: metzId,
            actorUserId: keeperId,
            revokeSessions: false,
          });
          throw new Error("injected cleanup failure");
        }),
      );
      const openAfterAbort = await prisma.partnerUserRolePeriod.count({
        where: {
          endsAt: null,
          partnerUserFacilityAccess: { userId: janeId, facilityPartnerOrganizationId: partnershipId },
        },
      });
      assert.equal(openAfterAbort, 1);
      const memberAfterAbort = await prisma.userOrganizationRolePeriod.count({
        where: { membership: { userId: janeId, organizationId: metzId }, endsAt: null },
      });
      assert.equal(memberAfterAbort, 1);

      await prisma.userOrganizationRolePeriod.deleteMany({ where: { membership: { userId: keeperId } } });
      await prisma.userOrganizationMembership.deleteMany({ where: { userId: keeperId } });
      await prisma.user.deleteMany({ where: { id: keeperId } });
    } finally {
      if (partnershipId) {
        await prisma.partnerUserRolePeriod.deleteMany({
          where: { partnerUserFacilityAccess: { facilityPartnerOrganizationId: partnershipId } },
        });
        await prisma.partnerUserFacilityAccess.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerRoleCeilingPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerDepartmentScope.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerAccessPeriod.deleteMany({ where: { facilityPartnerOrganizationId: partnershipId } });
        await prisma.facilityPartnerOrganization.deleteMany({ where: { id: partnershipId } });
      }
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: metzId } },
      });
      await prisma.userOrganizationMembership.deleteMany({ where: { organizationId: metzId } });
      await prisma.department.deleteMany({ where: { id: departmentId } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, janeId] } } });
      await prisma.facility.deleteMany({ where: { id: facilityId } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentId, metzId] } } });
      await prisma.$disconnect();
    }
  },
);

test(
  "partnership creation waits on the organization lock held by membership end",
  { skip },
  async () => {
    const transactionOptions = { maxWait: 20000, timeout: 20000 };
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, transactionOptions });
    const other = new PrismaClient({ datasources: { db: { url: databaseUrl } }, transactionOptions });
    const tag = suffix();
    const parentId = `org_parent_${tag}`;
    const metzId = `org_metz_${tag}`;
    const facilityId = `fac_${tag}`;
    const nextFacilityId = `fac_next_${tag}`;
    const actorId = `user_fa_${tag}`;
    const janeId = `user_jane_${tag}`;
    const adminId = `user_admin_${tag}`;
    const departmentId = `dept_${tag}`;
    const nextDepartmentId = `dept_next_${tag}`;
    let createdPartnershipId = "";
    try {
      const role = await prisma.role.upsert({
        where: { key: "FACILITY_ADMINISTRATOR" },
        update: {},
        create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
      });
      await prisma.organization.createMany({
        data: [
          { id: parentId, name: `Parent ${tag}` },
          { id: metzId, name: `Metz ${tag}` },
        ],
      });
      await prisma.facility.createMany({
        data: [
          { id: facilityId, organizationId: parentId, displayName: `Facility ${tag}` },
          { id: nextFacilityId, organizationId: parentId, displayName: `Next ${tag}` },
        ],
      });
      await prisma.user.createMany({
        data: [
          {
            id: actorId,
            email: `fa-${tag}@topo.example`,
            displayName: "Facility Admin",
            facilityId,
            roleId: role.id,
            emailVerifiedAt: new Date(),
          },
          {
            id: janeId,
            email: `jane-${tag}@topo.example`,
            displayName: "Jane",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
          {
            id: adminId,
            email: `admin-${tag}@topo.example`,
            displayName: "Admin",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: janeId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_MEMBER", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: adminId,
          organizationId: metzId,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") } },
        },
      });
      await prisma.department.create({
        data: { id: departmentId, facilityId, key: `DIETARY_${tag}`, name: "Food & Nutrition" },
      });

      let release: () => void = () => undefined;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      let lockHeld = false;
      const ending = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${metzId} FOR UPDATE`);
          lockHeld = true;
          await hold;
          await endOrganizationMembership(tx, {
            userId: janeId,
            organizationId: metzId,
            actorUserId: adminId,
            revokeSessions: false,
          });
        },
        { timeout: 20000 },
      );
      await waitFor(async () => lockHeld, "membership transaction to lock the Organization");
      const creating = createFacilityPartner(other, {
        facilityId: nextFacilityId,
        organizationId: metzId,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const visibleWhileLocked = await prisma.facilityPartnerOrganization.count({
        where: { facilityId: nextFacilityId, organizationId: metzId },
      });
      assert.equal(visibleWhileLocked, 0);
      release();
      await ending;
      const created = await creating;
      createdPartnershipId = created.id;
      await prisma.userFacilityAccess.create({
        data: { userId: actorId, facilityId: nextFacilityId },
      });
      await prisma.department.create({
        data: { id: nextDepartmentId, facilityId: nextFacilityId, key: `DIETARY_NEXT_${tag}`, name: "Food & Nutrition" },
      });
      await prisma.facilityPartnerAccessPeriod.create({
        data: { facilityPartnerOrganizationId: created.id, startsAt: new Date("2020-01-01T00:00:00.000Z") },
      });
      await prisma.facilityPartnerDepartmentScope.create({
        data: {
          facilityPartnerOrganizationId: created.id,
          departmentId: nextDepartmentId,
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
        },
      });
      await setFacilityPartnerRoleCeiling(prisma, {
        actorUserId: actorId,
        partnershipId: created.id,
        facilityId: nextFacilityId,
        maxPartnerRole: "PARTNER_MANAGER",
      });
      await assert.rejects(
        () =>
          assignPartnerUser(prisma, {
            actorUserId: actorId,
            partnershipId: created.id,
            facilityId: nextFacilityId,
            userId: janeId,
            partnerRole: "PARTNER_OPERATOR",
          }),
        (error: unknown) => error instanceof PartnerUserAccessError && error.code === "NOT_CURRENT_MEMBER",
      );
      const open = await prisma.partnerUserRolePeriod.count({
        where: { endsAt: null, partnerUserFacilityAccess: { userId: janeId } },
      });
      assert.equal(open, 0);
    } finally {
      if (createdPartnershipId) {
        await prisma.partnerUserRolePeriod.deleteMany({
          where: { partnerUserFacilityAccess: { facilityPartnerOrganizationId: createdPartnershipId } },
        });
        await prisma.partnerUserFacilityAccess.deleteMany({
          where: { facilityPartnerOrganizationId: createdPartnershipId },
        });
        await prisma.facilityPartnerRoleCeilingPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: createdPartnershipId },
        });
        await prisma.facilityPartnerDepartmentScope.deleteMany({
          where: { facilityPartnerOrganizationId: createdPartnershipId },
        });
        await prisma.facilityPartnerAccessPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: createdPartnershipId },
        });
        await prisma.facilityPartnerOrganization.deleteMany({ where: { id: createdPartnershipId } });
      }
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: metzId } },
      });
      await prisma.userOrganizationMembership.deleteMany({ where: { organizationId: metzId } });
      await prisma.department.deleteMany({ where: { id: { in: [departmentId, nextDepartmentId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, janeId, adminId] } } });
      await prisma.facility.deleteMany({ where: { id: { in: [facilityId, nextFacilityId] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentId, metzId] } } });
      await prisma.$disconnect();
      await other.$disconnect();
    }
  },
);
