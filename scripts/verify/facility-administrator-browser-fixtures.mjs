#!/usr/bin/env node
/**
 * Synthetic fixtures for CDA-02 Facility Administrator transfer and recovery, and CDA-03
 * Facility Administrator view, browser certification.
 * Disposable VERIFY_DATABASE_URL only. Never prints credentials.
 *
 * Every run gets fresh accounts and facilities, so a reused database never inherits an earlier
 * run's transfer.
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
  process.env.FACILITY_ADMINISTRATOR_BROWSER_FIXTURE_PATH ||
  join(ROOT, "tmp", "facility-administrator-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("facility-administrator-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

async function createFacilityUser(db, { email, displayName, roleKey, facilityId, passwordHash }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await db.user.create({
    data: { email, displayName, facilityId, roleId: role.id, passwordHash, isActive: true },
    select: { id: true, email: true },
  });
  return activateFixtureAccount(db, user, { facilityId, roleKey });
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`facility-administrator-browser-fixtures: target ${target.databaseName}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tag = randomBytes(3).toString("hex");
    const email = (label) => `${label}.${tag}@cda02.local`;
    const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);

    const organization = await db.organization.create({
      data: { name: `CDA02 Browser Org ${tag}`, displayName: `CDA02 Browser Org ${tag}`, isActive: true },
      select: { id: true },
    });
    const transferFacility = await db.facility.create({
      data: { organizationId: organization.id, displayName: `Transfer Facility ${tag}`, timezone: "America/New_York" },
      select: { id: true, displayName: true },
    });
    const recoveryFacility = await db.facility.create({
      data: { organizationId: organization.id, displayName: `Recovery Facility ${tag}`, timezone: "America/New_York" },
      select: { id: true, displayName: true },
    });

    const holder = await createFacilityUser(db, {
      email: email("fa.holder"),
      displayName: `Holder ${tag}`,
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: transferFacility.id,
      passwordHash,
    });
    const successor = await createFacilityUser(db, {
      email: email("manager.successor"),
      displayName: `Successor ${tag}`,
      roleKey: "MANAGER",
      facilityId: transferFacility.id,
      passwordHash,
    });

    // The recovery facility's holder has left: their account is deactivated with the role still open.
    const departed = await createFacilityUser(db, {
      email: email("fa.departed"),
      displayName: `Departed ${tag}`,
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: recoveryFacility.id,
      passwordHash,
    });
    await db.user.update({ where: { id: departed.id }, data: { isActive: false } });
    const appointee = await createFacilityUser(db, {
      email: email("manager.appointee"),
      displayName: `Appointee ${tag}`,
      roleKey: "MANAGER",
      facilityId: recoveryFacility.id,
      passwordHash,
    });

    const orgAdmin = await db.user.create({
      data: {
        email: email("org.admin"),
        displayName: `Org Admin ${tag}`,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const membership = await db.userOrganizationMembership.create({
      data: { userId: orgAdmin.id, organizationId: organization.id },
      select: { id: true },
    });
    await db.userOrganizationRolePeriod.create({
      data: { membershipId: membership.id, role: "ORG_ADMIN", startsAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    // CDA-03: a facility whose Facility Administrator belongs to no Department. Food & Nutrition and
    // Plant are self-operated.
    const viewFacility = await db.facility.create({
      data: { organizationId: organization.id, displayName: `View Facility ${tag}`, timezone: "America/New_York" },
      select: { id: true },
    });
    const createDepartment = (key, name, sortOrder) =>
      db.department.create({
        data: { facilityId: viewFacility.id, key, name, sortOrder },
        select: { id: true, name: true },
      });
    const foodAndNutrition = await createDepartment("DIETARY", "Food & Nutrition", 10);
    const plant = await createDepartment("PLANT", "Plant Operations", 20);
    const effectiveFrom = new Date("2020-01-01T00:00:00.000Z");
    await db.departmentOperatorRelationship.createMany({
      data: [
        { departmentId: foodAndNutrition.id, organizationId: organization.id, effectiveFrom },
        { departmentId: plant.id, organizationId: organization.id, effectiveFrom },
      ],
    });

    const viewAdministrator = await createFacilityUser(db, {
      email: email("fa.view"),
      displayName: `Viewer ${tag}`,
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: viewFacility.id,
      passwordHash,
    });
    // Facility bootstrap creates the administrator's roster record already linked; People cannot
    // assign the Facility Administrator role.
    const viewAdministratorEmployee = await db.employee.create({
      data: {
        facilityId: viewFacility.id,
        firstName: "Viewer",
        lastName: tag,
        email: viewAdministrator.email,
        userId: viewAdministrator.id,
        roleType: "FACILITY_ADMINISTRATOR",
      },
      select: { id: true },
    });
    const plantManager = await db.employee.create({
      data: {
        facilityId: viewFacility.id,
        firstName: "Morgan",
        lastName: `Plant ${tag}`,
        roleType: "MANAGER",
        primaryDepartmentId: plant.id,
      },
      select: { id: true },
    });

    const unit = await db.unit.create({
      data: { facilityId: viewFacility.id, name: `Main Building ${tag}`, unitType: "OTHER" },
      select: { id: true },
    });
    const asset = await db.asset.create({
      data: { assetCode: `CDA03-${tag}`, name: `Boiler ${tag}`, equipmentType: "Boiler", unitId: unit.id },
      select: { id: true },
    });
    await db.preventiveMaintenancePlan.create({
      data: { facilityId: viewFacility.id, departmentId: plant.id, assetId: asset.id, status: "PUBLISHED" },
    });
    const plantRequest = await db.operationalRequest.create({
      data: {
        requestCode: `REQ-CDA03-${tag}`,
        facilityId: viewFacility.id,
        requestingDepartmentId: foodAndNutrition.id,
        responsibleDepartmentId: plant.id,
        unitId: unit.id,
        summary: `Walk-in door will not latch ${tag}`,
        description: "The walk-in cooler door does not latch.",
        observedAt: new Date(),
      },
      select: { requestCode: true },
    });

    const fixtures = {
      organizationId: organization.id,
      view: {
        facilityId: viewFacility.id,
        administrator: { userId: viewAdministrator.id, email: viewAdministrator.email, employeeId: viewAdministratorEmployee.id },
        plantManagerEmployeeId: plantManager.id,
        foodAndNutritionId: foodAndNutrition.id,
        plantId: plant.id,
        plantRequestCode: plantRequest.requestCode,
      },
      transferFacilityId: transferFacility.id,
      transferFacilityName: transferFacility.displayName,
      recoveryFacilityId: recoveryFacility.id,
      recoveryFacilityName: recoveryFacility.displayName,
      holder: { userId: holder.id, email: holder.email, displayName: `Holder ${tag}` },
      successor: { userId: successor.id, email: successor.email, displayName: `Successor ${tag}` },
      departed: { userId: departed.id, email: departed.email, displayName: `Departed ${tag}` },
      appointee: { userId: appointee.id, email: appointee.email, displayName: `Appointee ${tag}` },
      orgAdmin: { userId: orgAdmin.id, email: orgAdmin.email },
    };

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
    console.log(`facility-administrator-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`facility-administrator-browser-fixtures: FAIL — ${String(err?.message || err)}`);
  process.exit(1);
});
