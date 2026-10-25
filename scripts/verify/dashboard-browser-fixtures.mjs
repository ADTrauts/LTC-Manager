#!/usr/bin/env node
/**
 * Synthetic Dashboard personas for the DSH-02 browser check.
 * Disposable VERIFY_DATABASE_URL only. Never prints the password.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { activateFixtureAccount } from "./fixture-account.mjs";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH =
  process.env.DASHBOARD_BROWSER_FIXTURE_PATH || join(ROOT, "tmp", "dashboard-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("dashboard-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

async function createUser(db, { email, displayName, roleKey, facilityId, primaryDepartmentId, passwordHash }) {
  const role = await db.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey },
  });
  const user = await db.user.create({
    data: {
      email,
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
    },
    select: { id: true, email: true },
  });
  await activateFixtureAccount(db, user, { facilityId, roleKey });
  return user;
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`dashboard-browser-fixtures: target ${target.databaseName}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tag = randomBytes(3).toString("hex");
    const email = (label) => `${label}.${tag}@dsh02.local`;
    const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);

    const organization = await db.organization.create({
      data: { name: `DSH02 Browser Org ${tag}`, displayName: `DSH02 Browser Org ${tag}`, isActive: true },
      select: { id: true },
    });
    const facility = await db.facility.create({
      data: {
        organizationId: organization.id,
        displayName: `DSH02 Facility ${tag}`,
        timezone: "America/New_York",
      },
      select: { id: true },
    });

    const dietary = await db.department.create({
      data: {
        facilityId: facility.id,
        key: "DIETARY",
        name: "Food & Nutrition",
        isActive: true,
        sortOrder: 1,
        showInEmployeeApp: true,
      },
      select: { id: true },
    });
    const plant = await db.department.create({
      data: {
        facilityId: facility.id,
        key: "PLANT",
        name: "Plant Operations",
        isActive: true,
        sortOrder: 2,
        showInEmployeeApp: true,
      },
      select: { id: true },
    });
    const evs = await db.department.create({
      data: {
        facilityId: facility.id,
        key: "EVS",
        name: "Environmental Services",
        isActive: true,
        sortOrder: 3,
        showInEmployeeApp: true,
      },
      select: { id: true },
    });

    const unit = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: `Servery ${tag}`,
        unitType: "SERVERY",
        hierarchyRole: "NEIGHBORHOOD",
        isActive: true,
      },
      select: { id: true },
    });
    const space = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: unit.id,
        name: `Servery room ${tag}`,
        spaceType: "SERVICE_AREA",
        isActive: true,
      },
      select: { id: true },
    });
    await db.unitSpaceResponsibility.create({
      data: { spaceId: space.id, departmentId: dietary.id },
    });

    await db.departmentOperationalCycle.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: `breakfast-${tag}`,
        label: "Breakfast",
        nodeKind: "PERIOD",
        cycleType: "SERVICE",
        status: "PUBLISHED",
        startLocal: "07:00",
        endLocal: "09:00",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: new Date("2020-01-01"),
        locationMode: "ALL_DEPARTMENT_UNITS",
        expectedMilestones: [],
        publishedAt: new Date(),
      },
    });

    const menu = await db.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "House menu",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    await db.menuLocationApplicability.create({
      data: { menuId: menu.id, spaceId: space.id },
    });

    const fa = await createUser(db, {
      email: email("fa"),
      displayName: `Facility Administrator ${tag}`,
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
      passwordHash,
    });
    const faEmployee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: fa.id,
        email: fa.email,
        firstName: "Facility",
        lastName: "Administrator",
        status: "ACTIVE",
        roleType: "MANAGER",
        primaryDepartmentId: null,
      },
      select: { id: true },
    });
    const metz = await db.organization.create({
      data: { name: `Metz ${tag}`, displayName: "Metz Culinary", isActive: true },
      select: { id: true },
    });
    const metzPeriod = await db.departmentOperatorRelationship.create({
      data: {
        departmentId: dietary.id,
        organizationId: metz.id,
        effectiveFrom: new Date("2020-01-01"),
      },
      select: { id: true },
    });
    const vendorAccount = await db.user.create({
      data: {
        email: email("vendor"),
        displayName: `Metz GM ${tag}`,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const partnership = await db.facilityPartnerOrganization.create({
      data: { facilityId: facility.id, organizationId: metz.id, createdByUserId: fa.id },
      select: { id: true },
    });
    const openedAt = new Date("2020-01-01T00:00:00.000Z");
    await db.facilityPartnerAccessPeriod.create({
      data: { facilityPartnerOrganizationId: partnership.id, startsAt: openedAt },
    });
    await db.facilityPartnerDepartmentScope.create({
      data: { facilityPartnerOrganizationId: partnership.id, departmentId: dietary.id, startsAt: openedAt },
    });
    await db.facilityPartnerRoleCeilingPeriod.create({
      data: {
        facilityPartnerOrganizationId: partnership.id,
        maxPartnerRole: "PARTNER_MANAGER",
        startsAt: openedAt,
      },
    });
    const membership = await db.userOrganizationMembership.create({
      data: { userId: vendorAccount.id, organizationId: metz.id },
      select: { id: true },
    });
    await db.userOrganizationRolePeriod.create({
      data: { membershipId: membership.id, role: "ORG_MEMBER", startsAt: openedAt },
    });
    const partnerAccess = await db.partnerUserFacilityAccess.create({
      data: { userId: vendorAccount.id, facilityPartnerOrganizationId: partnership.id, createdByUserId: fa.id },
      select: { id: true },
    });
    await db.partnerUserRolePeriod.create({
      data: {
        partnerUserFacilityAccessId: partnerAccess.id,
        partnerRole: "PARTNER_MANAGER",
        startsAt: openedAt,
        createdByAuthorityKind: "facility_admin",
      },
    });
    await db.departmentVendorHeadAssignment.create({
      data: {
        departmentId: dietary.id,
        operatorRelationshipId: metzPeriod.id,
        assigneeUserId: vendorAccount.id,
        assignedByUserId: fa.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
    const leaderUser = await createUser(db, {
      email: email("leader"),
      displayName: `Food Leader ${tag}`,
      roleKey: "GM",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
      passwordHash,
    });
    const leaderEmployee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: leaderUser.id,
        email: leaderUser.email,
        firstName: "Food",
        lastName: "Leader",
        status: "ACTIVE",
        roleType: "GM",
        primaryDepartmentId: dietary.id,
      },
      select: { id: true },
    });
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: leaderEmployee.id } });

    const manager = await createUser(db, {
      email: email("manager"),
      displayName: `Food Manager ${tag}`,
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
      passwordHash,
    });
    await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: manager.id,
        email: manager.email,
        firstName: "Food",
        lastName: "Manager",
        status: "ACTIVE",
        roleType: "MANAGER",
        primaryDepartmentId: dietary.id,
      },
    });
    const supervisor = await createUser(db, {
      email: email("supervisor"),
      displayName: `Food Supervisor ${tag}`,
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
      passwordHash,
    });
    await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: supervisor.id,
        email: supervisor.email,
        firstName: "Food",
        lastName: "Supervisor",
        status: "ACTIVE",
        roleType: "SUPERVISOR",
        primaryDepartmentId: dietary.id,
      },
    });
    const plantUser = await createUser(db, {
      email: email("plant"),
      displayName: `Plant Leader ${tag}`,
      roleKey: "GM",
      facilityId: facility.id,
      primaryDepartmentId: plant.id,
      passwordHash,
    });
    const plantEmployee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: plantUser.id,
        email: plantUser.email,
        firstName: "Plant",
        lastName: "Leader",
        status: "ACTIVE",
        roleType: "GM",
        primaryDepartmentId: plant.id,
      },
      select: { id: true },
    });
    await db.department.update({ where: { id: plant.id }, data: { headEmployeeId: plantEmployee.id } });

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          dietaryId: dietary.id,
          plantId: plant.id,
          evsId: evs.id,
          fa: { email: fa.email, employeeId: faEmployee.id },
          leader: { email: leaderUser.email },
          manager: { email: manager.email },
          supervisor: { email: supervisor.email },
          plantLeader: { email: plantUser.email },
          vendorGm: { email: vendorAccount.email, partnershipId: partnership.id },
        },
        null,
        2,
      ),
    );
    console.log(`dashboard-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
