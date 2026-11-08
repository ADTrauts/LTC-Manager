/**
 * One-time Terrace View acceptance data for the staging database.
 * Refuses every database except the Neon staging database. Never prints the password.
 *
 *   CDA07_STAGING_SETUP=1 npx tsx scripts/verify/cda07-terrace-staging-setup.mts
 */
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { operatorPeriodIdForCreate } from "@/lib/department-authority/operator-period";
import { acceptVendorHead, assignVendorHead } from "@/lib/department-authority/vendor-heads";
import { assignDepartmentOperator, ensureInitialDepartmentOperator } from "@/lib/department-operators/service";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";
import { createOrganizationOnlyUserAccount } from "@/lib/organization-membership/account";
import { createOrganizationMembership } from "@/lib/organization-membership/service";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time/service-date";

const FACILITY_NAME = "Terrace View";
const LOGIN_PATH = process.env.CDA07_LOGIN_PATH || "/tmp/cda07-terrace-logins.json";

function fail(message: string): never {
  console.error(`cda07-terrace-setup: ${message}`);
  process.exit(1);
}

function assertStagingUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL is not a URL");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
  if (name === "ltc_manager" || name.startsWith("ltc_verify_") || name.startsWith("ltc_test_")) {
    fail(`refusing database ${name}`);
  }
  if (!parsed.hostname.endsWith(".neon.tech") || name !== "neondb") {
    fail("this setup runs only against the Neon staging database");
  }
}

function day(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

async function main() {
  if (process.env.CDA07_STAGING_SETUP !== "1") fail("set CDA07_STAGING_SETUP=1");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is required");
  assertStagingUrl(url);
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "true";

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const existing = await db.facility.findFirst({
      where: { displayName: FACILITY_NAME },
      select: { id: true },
    });
    if (existing) fail("Terrace View already exists; leaving it in place");

    const password = randomBytes(18).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);
    const today = toServiceDateKey(getFacilityServiceDate("America/New_York"));
    const openedAt = day("2020-01-01");

    const parent = await db.organization.create({
      data: { name: "Terrace View Healthcare", displayName: "Terrace View Healthcare", isActive: true },
    });
    const metz = await db.organization.create({
      data: { name: "Metz Culinary", displayName: "Metz Culinary", isActive: true },
    });
    const sodexo = await db.organization.create({
      data: { name: "Sodexo", displayName: "Sodexo", isActive: true },
    });
    const facility = await db.facility.create({
      data: { organizationId: parent.id, displayName: FACILITY_NAME, timezone: "America/New_York" },
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
    });

    const faRole = await db.role.upsert({
      where: { key: "FACILITY_ADMINISTRATOR" },
      update: {},
      create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
    });
    const gmRole = await db.role.upsert({
      where: { key: "GM" },
      update: {},
      create: { key: "GM", name: "GM" },
    });
    const fa = await db.user.create({
      data: {
        email: "fa.terrace@cda07.staging.test",
        displayName: "Terrace View Administrator",
        facilityId: facility.id,
        roleId: faRole.id,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    await ensureUserFacilityAccessGrant(db, {
      userId: fa.id,
      facilityId: facility.id,
      roleKey: "FACILITY_ADMINISTRATOR",
    });
    await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: fa.id,
        email: fa.email,
        firstName: "Terrace",
        lastName: "Administrator",
        status: "ACTIVE",
        roleType: "MANAGER",
      },
    });
    const plantUser = await db.user.create({
      data: {
        email: "plant.head@cda07.staging.test",
        displayName: "Plant Head",
        facilityId: facility.id,
        roleId: gmRole.id,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    await ensureUserFacilityAccessGrant(db, {
      userId: plantUser.id,
      facilityId: facility.id,
      roleKey: "GM",
    });
    const plantEmployee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: plantUser.id,
        email: plantUser.email,
        firstName: "Plant",
        lastName: "Head",
        status: "ACTIVE",
        roleType: "GM",
        primaryDepartmentId: plant.id,
      },
    });
    await db.user.update({ where: { id: plantUser.id }, data: { primaryDepartmentId: plant.id } });
    await db.department.update({ where: { id: plant.id }, data: { headEmployeeId: plantEmployee.id } });

    await ensureInitialDepartmentOperator(db, {
      departmentId: dietary.id,
      facilityId: facility.id,
      createdByUserId: fa.id,
      effectiveFrom: openedAt,
    });
    await ensureInitialDepartmentOperator(db, {
      departmentId: plant.id,
      facilityId: facility.id,
      createdByUserId: fa.id,
      effectiveFrom: openedAt,
    });
    await assignDepartmentOperator(db, {
      departmentId: dietary.id,
      facilityId: facility.id,
      organizationId: sodexo.id,
      effectiveFromKey: "2024-01-01",
      createdByUserId: fa.id,
    });

    const sodexoPeriodId = await operatorPeriodIdForCreate(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
    });
    if (!sodexoPeriodId) fail("Sodexo period was not in force");

    const record = async (name: string, periodId: string) => {
      const stableKey = `${name.toLowerCase().replace(/\s+/g, "-")}-terrace`;
      await db.operationalEvidenceRecord.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          operatorPeriodId: periodId,
          templateStableKey: stableKey,
          templateVersion: 1,
          templateName: name,
          purposeType: "LOG",
          requirementKey: `${stableKey}-req`,
          operationalDate: day(today),
          scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
          occurredAt: new Date(),
          templateSnapshotJson: { name },
        },
      });
    };

    await db.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Sodexo menu",
        operatorPeriodId: sodexoPeriodId,
      },
    });
    await db.departmentWorkPlan.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: "sodexo-plan-terrace",
        name: "Sodexo plan",
        status: "PUBLISHED",
        operatorPeriodId: sodexoPeriodId,
      },
    });
    await db.departmentOperationalCycle.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: "sodexo-cycle-terrace",
        label: "Sodexo breakfast",
        cycleType: "CUSTOM",
        status: "PUBLISHED",
        startLocal: "07:00",
        endLocal: "09:00",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: openedAt,
        operatorPeriodId: sodexoPeriodId,
      },
    });
    await db.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Mina",
        lastName: "Sodexo",
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        operatorPeriodId: sodexoPeriodId,
      },
    });
    await record("Sodexo cooler", sodexoPeriodId);

    await assignDepartmentOperator(db, {
      departmentId: dietary.id,
      facilityId: facility.id,
      organizationId: metz.id,
      effectiveFromKey: "2026-01-01",
      createdByUserId: fa.id,
    });
    const metzPeriodId = await operatorPeriodIdForCreate(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
    });
    if (!metzPeriodId || metzPeriodId === sodexoPeriodId) fail("Metz period was not in force");

    await db.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Metz menu",
        operatorPeriodId: metzPeriodId,
      },
    });
    await db.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Sara",
        lastName: "Metz",
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        operatorPeriodId: metzPeriodId,
      },
    });
    await record("Metz cooler", metzPeriodId);

    const metzAdmin = await createOrganizationOnlyUserAccount(db, {
      email: "metz.admin@cda07.staging.test",
      displayName: "Metz Administrator",
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    const metzGm = await createOrganizationOnlyUserAccount(db, {
      email: "metz.gm@cda07.staging.test",
      displayName: "Metz GM",
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    const sodexoAdmin = await createOrganizationOnlyUserAccount(db, {
      email: "sodexo.admin@cda07.staging.test",
      displayName: "Sodexo Administrator",
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    await createOrganizationMembership(db, {
      userId: metzAdmin.id,
      organizationId: metz.id,
      role: "ORG_ADMIN",
      startsAt: openedAt,
    });
    await createOrganizationMembership(db, {
      userId: metzGm.id,
      organizationId: metz.id,
      role: "ORG_MEMBER",
      startsAt: openedAt,
    });
    await createOrganizationMembership(db, {
      userId: sodexoAdmin.id,
      organizationId: sodexo.id,
      role: "ORG_ADMIN",
      startsAt: openedAt,
    });
    const assignment = await assignVendorHead(db, {
      actorUserId: metzAdmin.id,
      organizationId: metz.id,
      departmentId: dietary.id,
      assigneeUserId: metzGm.id,
    });
    const entry = await acceptVendorHead(db, { actorUserId: metzGm.id, assignmentId: assignment.id });
    if (!entry.opened) fail(entry.reason ?? "vendor access did not open");

    const partnership = await db.facilityPartnerOrganization.findUnique({
      where: { facilityId_organizationId: { facilityId: facility.id, organizationId: metz.id } },
      select: { id: true },
    });
    if (!partnership) fail("Metz partnership was not created");

    const retired = await db.menu.findFirst({
      where: { name: "Sodexo menu", facilityId: facility.id },
      select: { status: true },
    });
    if (retired?.status !== "INACTIVE") fail("Sodexo menu was not retired");

    writeFileSync(
      LOGIN_PATH,
      JSON.stringify(
        {
          password,
          facilityId: facility.id,
          dietaryId: dietary.id,
          plantId: plant.id,
          sodexoOrganizationId: sodexo.id,
          partnershipId: partnership.id,
          fa: "fa.terrace@cda07.staging.test",
          plantHead: "plant.head@cda07.staging.test",
          metzAdmin: "metz.admin@cda07.staging.test",
          metzGm: "metz.gm@cda07.staging.test",
          sodexoAdmin: "sodexo.admin@cda07.staging.test",
        },
        null,
        2,
      ),
    );
    chmodSync(LOGIN_PATH, 0o600);
    console.log(`cda07-terrace-setup: ready facility ${facility.id}`);
    console.log(`cda07-terrace-setup: logins ${LOGIN_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "setup failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exit(1);
});
