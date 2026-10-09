/**
 * Concurrent partner ceiling and assignment changes against local PostgreSQL.
 * Skips unless DATABASE_URL points at localhost.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { periodsOverlap } from "@/lib/partner-access";
import {
  assignPartnerUser,
  blockPartnerUser,
  changePartnerUserRole,
  enablePartnerStaffingDelegation,
  setFacilityPartnerRoleCeiling,
  unblockPartnerUser,
} from "@/lib/partner-user-access";

const databaseUrl = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
const skip = local
  ? false
  : "set DATABASE_URL to local PostgreSQL to certify concurrent partner authorization locking";

test(
  "concurrent ceiling and assignment changes leave one open period each",
  { skip },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomBytes(4).toString("hex");
    const parentId = `org_parent_${suffix}`;
    const partnerId = `org_partner_${suffix}`;
    const facilityId = `fac_partner_${suffix}`;
    const actorId = `user_fa_${suffix}`;
    const memberId = `user_member_${suffix}`;
    const departmentId = `dept_${suffix}`;
    let partnershipId = "";
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
          { id: parentId, name: `Parent ${suffix}` },
          { id: partnerId, name: `Partner ${suffix}` },
        ],
      });
      await prisma.facility.create({
        data: { id: facilityId, organizationId: parentId, displayName: `Facility ${suffix}` },
      });
      await prisma.user.createMany({
        data: [
          {
            id: actorId,
            email: `fa-${suffix}@partner-lock.example`,
            displayName: "Facility Admin",
            facilityId,
            roleId,
            emailVerifiedAt: new Date(),
          },
          {
            id: memberId,
            email: `member-${suffix}@partner-lock.example`,
            displayName: "Member",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await prisma.userOrganizationMembership.create({
        data: {
          userId: memberId,
          organizationId: partnerId,
          rolePeriods: {
            create: { role: "ORG_MEMBER", startsAt: new Date("2020-01-01T00:00:00.000Z") },
          },
        },
      });
      await prisma.department.create({
        data: { id: departmentId, facilityId, key: `DIETARY_${suffix}`, name: "Food & Nutrition" },
      });
      const partnership = await prisma.facilityPartnerOrganization.create({
        data: {
          facilityId,
          organizationId: partnerId,
          accessPeriods: { create: { startsAt: new Date("2020-01-01T00:00:00.000Z") } },
          departmentScopes: {
            create: { departmentId, startsAt: new Date("2020-01-01T00:00:00.000Z") },
          },
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
        userId: memberId,
        partnerRole: "PARTNER_VIEWER",
      });

      await Promise.all([
        setFacilityPartnerRoleCeiling(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          maxPartnerRole: "PARTNER_OPERATOR",
        }),
        setFacilityPartnerRoleCeiling(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          maxPartnerRole: "PARTNER_MANAGER",
        }),
      ]);
      await setFacilityPartnerRoleCeiling(prisma, {
        actorUserId: actorId,
        partnershipId,
        facilityId,
        maxPartnerRole: "PARTNER_MANAGER",
      });
      await Promise.all([
        changePartnerUserRole(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
          partnerRole: "PARTNER_OPERATOR",
        }),
        changePartnerUserRole(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
          partnerRole: "PARTNER_MANAGER",
        }),
      ]);

      const ceilings = await prisma.facilityPartnerRoleCeilingPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnershipId },
        orderBy: { startsAt: "asc" },
      });
      const assignment = await prisma.partnerUserFacilityAccess.findUniqueOrThrow({
        where: {
          userId_facilityPartnerOrganizationId: {
            userId: memberId,
            facilityPartnerOrganizationId: partnershipId,
          },
        },
        include: { rolePeriods: { orderBy: { startsAt: "asc" } } },
      });
      assert.equal(ceilings.filter((period) => period.endsAt === null).length, 1);
      assert.equal(assignment.rolePeriods.filter((period) => period.endsAt === null).length, 1);
      assert.equal(hasOverlap(ceilings), false);
      assert.equal(hasOverlap(assignment.rolePeriods), false);
      const grants = await prisma.userFacilityAccess.count({ where: { userId: memberId } });
      assert.equal(grants, 0);

      const enables = await Promise.allSettled([
        enablePartnerStaffingDelegation(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
        }),
        enablePartnerStaffingDelegation(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
        }),
      ]);
      assert.equal(enables.filter((result) => result.status === "fulfilled").length, 1);
      const policies = await prisma.facilityPartnerStaffingPolicyPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnershipId },
      });
      assert.equal(policies.filter((period) => period.endsAt === null).length, 1);
      assert.equal(hasOverlap(policies), false);

      const blockAndChange = await Promise.allSettled([
        blockPartnerUser(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
          note: "race",
        }),
        changePartnerUserRole(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
          partnerRole: "PARTNER_OPERATOR",
        }),
      ]);
      assert.ok(blockAndChange.some((result) => result.status === "fulfilled"));
      const restrictions = await prisma.facilityPartnerUserRestrictionPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnershipId, userId: memberId },
      });
      assert.ok(restrictions.filter((period) => period.endsAt === null).length <= 1);
      assert.equal(hasOverlap(restrictions), false);

      const unblockAndBlock = await Promise.allSettled([
        unblockPartnerUser(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
        }),
        blockPartnerUser(prisma, {
          actorUserId: actorId,
          partnershipId,
          facilityId,
          userId: memberId,
        }),
      ]);
      assert.equal(unblockAndBlock.length, 2);
      const afterRace = await prisma.facilityPartnerUserRestrictionPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnershipId, userId: memberId },
      });
      assert.ok(afterRace.filter((period) => period.endsAt === null).length <= 1);
      assert.equal(hasOverlap(afterRace), false);
    } finally {
      if (partnershipId) {
        await prisma.facilityPartnerUserRestrictionPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.facilityPartnerStaffingPolicyPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.partnerUserRolePeriod.deleteMany({
          where: { partnerUserFacilityAccess: { facilityPartnerOrganizationId: partnershipId } },
        });
        await prisma.partnerUserFacilityAccess.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.facilityPartnerRoleCeilingPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.facilityPartnerDepartmentScope.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.facilityPartnerAccessPeriod.deleteMany({
          where: { facilityPartnerOrganizationId: partnershipId },
        });
        await prisma.facilityPartnerOrganization.deleteMany({ where: { id: partnershipId } });
      }
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: partnerId } },
      });
      await prisma.userOrganizationMembership.deleteMany({ where: { organizationId: partnerId } });
      await prisma.department.deleteMany({ where: { id: departmentId } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, memberId] } } });
      await prisma.facility.deleteMany({ where: { id: facilityId } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentId, partnerId] } } });
      if (roleId) {
        const stillUsed = await prisma.user.count({ where: { roleId } });
        if (stillUsed === 0) {
          const createdHere = await prisma.role.findUnique({ where: { id: roleId } });
          if (createdHere && createdHere.name === "Facility Administrator") {
            // Leave the shared Facility Administrator role in place.
          }
        }
      }
      await prisma.$disconnect();
    }
  },
);

function hasOverlap(periods: Array<{ startsAt: Date; endsAt: Date | null }>): boolean {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) return true;
    }
  }
  return false;
}
