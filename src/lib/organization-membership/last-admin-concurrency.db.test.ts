/**
 * Concurrent last-admin protection against local PostgreSQL.
 * Skips unless DATABASE_URL points at localhost. Creates and deletes only rows
 * tagged with a unique suffix.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  changeOrganizationRole,
  createOrganizationMembership,
  OrganizationMembershipError,
} from "@/lib/organization-membership";

const databaseUrl = process.env.DATABASE_URL ?? "";
const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
const skip = local
  ? false
  : "set DATABASE_URL to local PostgreSQL to certify concurrent last-admin locking";

test(
  "concurrent demotions cannot leave an organization with zero administrators",
  { skip },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomBytes(4).toString("hex");
    const orgId = `org_lock_${suffix}`;
    const adminA = `user_lock_a_${suffix}`;
    const adminB = `user_lock_b_${suffix}`;
    try {
      await prisma.organization.create({
        data: { id: orgId, name: `Lock Org ${suffix}` },
      });
      await prisma.user.createMany({
        data: [
          {
            id: adminA,
            email: `a-${suffix}@lock.example`,
            displayName: "Admin A",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
          {
            id: adminB,
            email: `b-${suffix}@lock.example`,
            displayName: "Admin B",
            facilityId: null,
            roleId: null,
            emailVerifiedAt: new Date(),
          },
        ],
      });
      await createOrganizationMembership(prisma, {
        userId: adminA,
        organizationId: orgId,
        role: "ORG_ADMIN",
      });
      await createOrganizationMembership(prisma, {
        userId: adminB,
        organizationId: orgId,
        role: "ORG_ADMIN",
      });

      const results = await Promise.allSettled([
        changeOrganizationRole(prisma, {
          userId: adminA,
          organizationId: orgId,
          role: "ORG_MEMBER",
          revokeSessions: false,
        }),
        changeOrganizationRole(prisma, {
          userId: adminB,
          organizationId: orgId,
          role: "ORG_MEMBER",
          revokeSessions: false,
        }),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      const reason = rejected[0]?.status === "rejected" ? rejected[0].reason : null;
      assert.ok(reason instanceof OrganizationMembershipError);
      assert.equal(reason.code, "LAST_ORG_ADMIN");

      const memberships = await prisma.userOrganizationMembership.findMany({
        where: { organizationId: orgId },
        include: { rolePeriods: true },
      });
      const now = new Date();
      const admins = memberships.filter((membership) =>
        membership.rolePeriods.some(
          (period) =>
            period.role === "ORG_ADMIN" &&
            period.startsAt <= now &&
            (period.endsAt == null || period.endsAt > now),
        ),
      );
      assert.equal(admins.length, 1);
    } finally {
      await prisma.userOrganizationRolePeriod.deleteMany({
        where: { membership: { organizationId: orgId } },
      });
      await prisma.userOrganizationMembership.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { id: { in: [adminA, adminB] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.$disconnect();
    }
  },
);
