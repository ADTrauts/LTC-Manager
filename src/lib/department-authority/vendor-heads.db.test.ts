/**
 * SQL-backed vendor head assignment (CDA-05).
 * Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import type { PartnerFacilitySession } from "@/lib/auth";
import { createOrganizationOnlyUserAccount, createOrganizationMembership } from "@/lib/organization-membership";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";

import { resolveDepartmentAccessMap } from "./resolve";
import {
  acceptVendorHead,
  assignVendorHead,
  declineVendorHead,
  VendorHeadError,
} from "./vendor-heads";
import { createVendorPinWorkforce } from "./vendor-workforce";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";
const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";

function tag() {
  return randomBytes(5).toString("hex");
}

test("vendor head acceptance moves the Facility Administrator to SUMMARY", { skip }, async () => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previous = process.env[FLAG];
  process.env[FLAG] = "true";
  try {
    const parent = await prisma.organization.create({ data: { name: `CDA05 Parent ${suffix}` } });
    const metz = await prisma.organization.create({ data: { name: `CDA05 Metz ${suffix}`, displayName: "Metz Culinary" } });
    const facility = await prisma.facility.create({
      data: { organizationId: parent.id, displayName: `CDA05 Terrace ${suffix}`, timezone: "America/New_York" },
    });
    const department = await prisma.department.create({
      data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Food & Nutrition" },
    });
    await prisma.departmentOperatorRelationship.create({
      data: {
        departmentId: department.id,
        organizationId: metz.id,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const admin = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda05-admin-${suffix}@example.com`,
      displayName: "Metz Admin",
      emailVerifiedAt: new Date(),
    });
    const head = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda05-head-${suffix}@example.com`,
      displayName: "Metz GM",
      emailVerifiedAt: new Date(),
    });
    await createOrganizationMembership(prisma, { userId: admin.id, organizationId: metz.id, role: "ORG_ADMIN" });
    await createOrganizationMembership(prisma, { userId: head.id, organizationId: metz.id, role: "ORG_MEMBER" });

    const fa = {
      uid: "fa-user",
      authKind: "user",
      authMethod: "PASSWORD",
      scopeKind: "facility",
      role: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      name: "FA",
      email: "fa@example.com",
      sessionVersion: 1,
    } as const;

    const before = await resolveDepartmentAccessMap(prisma, fa, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(before.get(department.id)!.mode, "MANAGE");
    assert.equal(before.get(department.id)!.vendorHeadAccepted, false);

    await assert.rejects(
      () =>
        assignVendorHead(prisma, {
          actorUserId: head.id,
          organizationId: metz.id,
          departmentId: department.id,
          assigneeUserId: head.id,
        }),
      (error: unknown) => error instanceof VendorHeadError && error.code === "NOT_ORGANIZATION_ADMIN",
    );

    const pending = await assignVendorHead(prisma, {
      actorUserId: admin.id,
      organizationId: metz.id,
      departmentId: department.id,
      assigneeUserId: head.id,
    });
    assert.equal(pending.status, "PENDING");
    const still = await resolveDepartmentAccessMap(prisma, fa, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(still.get(department.id)!.mode, "MANAGE");

    await acceptVendorHead(prisma, { actorUserId: head.id, assignmentId: pending.id });
    const after = await resolveDepartmentAccessMap(prisma, fa, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(after.get(department.id)!.vendorHeadAccepted, true);
    assert.equal(after.get(department.id)!.mode, "SUMMARY");
    assert.equal(after.get(department.id)!.canReadComplianceRecords, true);

    const partner = {
      uid: head.id,
      authKind: "user",
      authMethod: "PASSWORD",
      scopeKind: "facility",
      accessKind: "partner",
      facilityId: facility.id,
      partnerOrganizationId: metz.id,
      facilityPartnerOrganizationId: "cda05-no-partnership",
      name: "Metz GM",
      email: `cda05-head-${suffix}@example.com`,
      sessionVersion: 1,
    } as PartnerFacilitySession;
    const headAccess = await resolveDepartmentAccessMap(prisma, partner, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(headAccess.get(department.id)!.isHead, true);
    assert.equal(headAccess.get(department.id)!.mode, "MANAGE");
    const leader = await resolveDashboardViewer(partner, {}, { db: prisma });
    assert.equal(leader.kind, "viewer");
    if (leader.kind === "viewer") {
      assert.equal(leader.viewer.authority, "DEPARTMENT_LEADER");
      assert.deepEqual(leader.viewer.ledDepartmentIds, [department.id]);
    }

    process.env.AUTH_SECRET ??= "cda05-vendor-pin-test";
    const pinStaff = await createVendorPinWorkforce(prisma, {
      session: partner,
      departmentId: department.id,
      firstName: "Ada",
      lastName: "Aide",
      pin: "123456",
    });
    const pinRow = await prisma.employee.findUnique({
      where: { id: pinStaff.employeeId },
      select: { userId: true, primaryDepartmentId: true, pinDigest: true },
    });
    assert.equal(pinRow?.userId, null);
    assert.equal(pinRow?.primaryDepartmentId, department.id);
    assert.ok(pinRow?.pinDigest);
    await assert.rejects(
      () =>
        createVendorPinWorkforce(prisma, {
          session: { ...partner, uid: admin.id },
          departmentId: department.id,
          firstName: "No",
          lastName: "Head",
          pin: "654321",
        }),
      (error: unknown) => error instanceof VendorHeadError && error.code === "NOT_HEAD",
    );

    const replaced = await assignVendorHead(prisma, {
      actorUserId: admin.id,
      organizationId: metz.id,
      departmentId: department.id,
      assigneeUserId: admin.id,
    });
    const duringReplace = await resolveDepartmentAccessMap(prisma, fa, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(duringReplace.get(department.id)!.mode, "MANAGE");
    await declineVendorHead(prisma, { actorUserId: admin.id, assignmentId: replaced.id });
    const declined = await resolveDepartmentAccessMap(prisma, fa, {
      facilityId: facility.id,
      departmentIds: [department.id],
    });
    assert.equal(declined.get(department.id)!.vendorHeadAccepted, false);
    assert.equal(declined.get(department.id)!.mode, "MANAGE");

    process.env[FLAG] = "false";
    await assert.rejects(
      () =>
        assignVendorHead(prisma, {
          actorUserId: admin.id,
          organizationId: metz.id,
          departmentId: department.id,
          assigneeUserId: head.id,
        }),
      (error: unknown) => error instanceof VendorHeadError && error.code === "NOT_ENABLED",
    );
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
    await prisma.departmentVendorHeadAssignment.deleteMany({
      where: { department: { facility: { displayName: { contains: suffix } } } },
    });
    await prisma.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await prisma.departmentOperatorRelationship.deleteMany({
      where: { department: { facility: { displayName: { contains: suffix } } } },
    });
    await prisma.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await prisma.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await prisma.userOrganizationRolePeriod.deleteMany({
      where: { membership: { organization: { name: { contains: suffix } } } },
    });
    await prisma.userOrganizationMembership.deleteMany({
      where: { organization: { name: { contains: suffix } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: suffix } } });
    await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.$disconnect();
  }
});
