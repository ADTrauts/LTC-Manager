/**
 * Dashboard layout storage (DSH-03).
 * Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  loadFacilityDashboardDefault,
  loadPersonalDashboardLayout,
  resetPersonalDashboardLayout,
  saveFacilityDashboardDefault,
  savePersonalDashboardLayout,
} from "./store";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

const attention = { card: "attention" as const, size: "M" as const, rows: 2 as const };
const glance = { card: "departments_glance" as const, size: "L" as const, rows: 1 as const };

test("dashboard layouts stay with their owner and facility", { skip: skipReason }, async () => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomBytes(6).toString("hex");
  try {
    const organization = await prisma.organization.create({ data: { name: `DSH Layout ${suffix}` } });
    const facility = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `DSH Layout ${suffix}`, timezone: "America/New_York" },
    });
    const other = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `DSH Other ${suffix}`, timezone: "America/New_York" },
    });
    const user = await prisma.user.create({
      data: { email: `dsh-layout-${suffix}@example.com`, displayName: "Layout User" },
    });
    const employee = await prisma.employee.create({
      data: { facilityId: facility.id, firstName: "Sam", lastName: suffix, roleType: "SUPERVISOR" },
    });
    const userOwner = { kind: "USER" as const, userId: user.id };
    const employeeOwner = { kind: "EMPLOYEE" as const, employeeId: employee.id };

    await savePersonalDashboardLayout(prisma, {
      facilityId: facility.id,
      owner: userOwner,
      scopeKind: "FACILITY",
      items: [attention],
    });
    await savePersonalDashboardLayout(prisma, {
      facilityId: facility.id,
      owner: userOwner,
      scopeKind: "FACILITY",
      items: [attention, glance],
    });
    await savePersonalDashboardLayout(prisma, {
      facilityId: facility.id,
      owner: employeeOwner,
      scopeKind: "DEPARTMENT",
      items: [glance],
    });

    assert.deepEqual(
      await loadPersonalDashboardLayout(prisma, { facilityId: facility.id, owner: userOwner, scopeKind: "FACILITY" }),
      [attention, glance],
    );
    assert.equal(
      await loadPersonalDashboardLayout(prisma, { facilityId: other.id, owner: userOwner, scopeKind: "FACILITY" }),
      null,
    );
    assert.deepEqual(
      await loadPersonalDashboardLayout(prisma, {
        facilityId: facility.id,
        owner: employeeOwner,
        scopeKind: "DEPARTMENT",
      }),
      [glance],
    );
    assert.equal(
      await loadPersonalDashboardLayout(prisma, { facilityId: facility.id, owner: userOwner, scopeKind: "DEPARTMENT" }),
      null,
    );

    await assert.rejects(() =>
      prisma.dashboardLayout.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          employeeId: employee.id,
          scopeKind: "FACILITY",
          items: [],
        },
      }),
    );
    await assert.rejects(() =>
      prisma.dashboardLayout.create({
        data: { facilityId: facility.id, scopeKind: "TEAM", items: [] },
      }),
    );

    await resetPersonalDashboardLayout(prisma, { facilityId: facility.id, owner: userOwner, scopeKind: "FACILITY" });
    await resetPersonalDashboardLayout(prisma, { facilityId: facility.id, owner: userOwner, scopeKind: "FACILITY" });
    assert.equal(
      await loadPersonalDashboardLayout(prisma, { facilityId: facility.id, owner: userOwner, scopeKind: "FACILITY" }),
      null,
    );
    assert.deepEqual(
      await loadPersonalDashboardLayout(prisma, {
        facilityId: facility.id,
        owner: employeeOwner,
        scopeKind: "DEPARTMENT",
      }),
      [glance],
    );
  } finally {
    await prisma.dashboardLayout.deleteMany({ where: { facility: { organization: { name: { contains: suffix } } } } });
    await prisma.employee.deleteMany({ where: { facility: { organization: { name: { contains: suffix } } } } });
    await prisma.user.deleteMany({ where: { email: `dsh-layout-${suffix}@example.com` } });
    await prisma.facility.deleteMany({ where: { organization: { name: { contains: suffix } } } });
    await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.$disconnect();
  }
});

test("a facility default stays with its facility, band, and scope", { skip: skipReason }, async () => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomBytes(6).toString("hex");
  try {
    const organization = await prisma.organization.create({ data: { name: `DSH Default ${suffix}` } });
    const facility = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `DSH Default ${suffix}`, timezone: "America/New_York" },
    });
    const other = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `DSH Default Other ${suffix}`, timezone: "America/New_York" },
    });
    const user = await prisma.user.create({
      data: { email: `dsh-default-${suffix}@example.com`, displayName: "Default User" },
    });
    await saveFacilityDashboardDefault(prisma, {
      facilityId: facility.id,
      authority: "SUPERVISOR",
      scopeKind: "DEPARTMENT",
      items: [attention],
    });
    await savePersonalDashboardLayout(prisma, {
      facilityId: facility.id,
      owner: { kind: "USER", userId: user.id },
      scopeKind: "DEPARTMENT",
      items: [glance],
    });
    await resetPersonalDashboardLayout(prisma, {
      facilityId: facility.id,
      owner: { kind: "USER", userId: user.id },
      scopeKind: "DEPARTMENT",
    });
    assert.deepEqual(
      await loadFacilityDashboardDefault(prisma, {
        facilityId: facility.id,
        authority: "SUPERVISOR",
        scopeKind: "DEPARTMENT",
      }),
      [attention],
    );
    assert.equal(
      await loadFacilityDashboardDefault(prisma, {
        facilityId: other.id,
        authority: "SUPERVISOR",
        scopeKind: "DEPARTMENT",
      }),
      null,
    );
    assert.equal(
      await loadFacilityDashboardDefault(prisma, {
        facilityId: facility.id,
        authority: "MANAGER",
        scopeKind: "DEPARTMENT",
      }),
      null,
    );
  } finally {
    await prisma.user.deleteMany({ where: { email: `dsh-default-${suffix}@example.com` } });
    await prisma.facility.deleteMany({ where: { organization: { name: { contains: suffix } } } });
    await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.$disconnect();
  }
});
