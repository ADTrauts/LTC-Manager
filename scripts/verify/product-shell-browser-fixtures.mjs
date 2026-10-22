#!/usr/bin/env node
/**
 * Phase 13 Product Shell (Build/Run IA) browser fixtures (synthetic names only, no PHI).
 * Disposable VERIFY_DATABASE_URL only.
 *
 * Seeds users across the authority spectrum so the shell scenarios can assert that RUN / BUILD /
 * ADMIN navigation follows authority (never becomes authorization), and a Quick PIN frontline
 * employee that must remain RUN-only.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(
  ROOT,
  "tmp",
  process.env.PRODUCT_SHELL_BROWSER_ARTIFACT_DIR_NAME || "product-shell-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.PRODUCT_SHELL_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`product-shell-browser-fixtures: FAIL — ${message}`);
  process.exit(1);
}

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
}

async function upsertUser(db, { email, displayName, roleKey, facilityId, primaryDepartmentId }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);
  return db.user.upsert({
    where: { email },
    update: {
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
      sessionVersion: 0,
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true },
  });
}

async function ensureEmployee(db, {
  facilityId,
  email,
  firstName,
  lastName,
  departmentId,
  extraDepartmentIds = [],
  roleType = "STAFF",
  pinDigestValue = null,
}) {
  const existing = await db.employee.findFirst({
    where: { facilityId, email },
    select: { id: true },
  });
  const emp = existing
    ? await db.employee.update({
        where: { id: existing.id },
        data: {
          firstName,
          lastName,
          status: "ACTIVE",
          primaryDepartmentId: departmentId,
          roleType,
          ...(pinDigestValue ? { pinDigest: pinDigestValue, sessionVersion: 0 } : {}),
        },
        select: { id: true },
      })
    : await db.employee.create({
        data: {
          facilityId,
          email,
          firstName,
          lastName,
          status: "ACTIVE",
          primaryDepartmentId: departmentId,
          roleType,
          ...(pinDigestValue ? { pinDigest: pinDigestValue } : {}),
        },
        select: { id: true },
      });

  for (const deptId of [departmentId, ...extraDepartmentIds]) {
    if (!deptId) continue;
    await db.employeeDepartment.upsert({
      where: { employeeId_departmentId: { employeeId: emp.id, departmentId: deptId } },
      update: {},
      create: { employeeId: emp.id, departmentId: deptId },
    });
  }
  return emp;
}

async function ensureOrganization(db, { name, displayName }) {
  const existing = await db.organization.findFirst({
    where: { name },
    select: { id: true, name: true, displayName: true },
  });
  if (existing) {
    if (existing.displayName !== displayName) {
      return db.organization.update({
        where: { id: existing.id },
        data: { displayName, isActive: true },
        select: { id: true, name: true, displayName: true },
      });
    }
    return existing;
  }
  return db.organization.create({
    data: { name, displayName, isActive: true },
    select: { id: true, name: true, displayName: true },
  });
}

async function ensureFacility(db, { organizationId, displayName }) {
  const existing = await db.facility.findFirst({
    where: { organizationId, displayName },
    select: { id: true, displayName: true },
  });
  if (existing) return existing;
  return db.facility.create({
    data: { organizationId, displayName, timezone: "America/New_York" },
    select: { id: true, displayName: true },
  });
}

async function ensureDepartment(db, { facilityId, key, name }) {
  const existing = await db.department.findFirst({
    where: { facilityId, key },
    select: { id: true },
  });
  if (existing) {
    return db.department.update({
      where: { id: existing.id },
      data: { name, isActive: true, showInEmployeeApp: true },
      select: { id: true },
    });
  }
  return db.department.create({
    data: { facilityId, key, name, isActive: true, showInEmployeeApp: true },
    select: { id: true },
  });
}

async function ensureInternalGrant(db, { userId, facilityId, roleKey }) {
  const access = await db.userFacilityAccess.upsert({
    where: { userId_facilityId: { userId, facilityId } },
    update: { isActive: true, revokedAt: null },
    create: { userId, facilityId, isActive: true },
    select: { id: true },
  });
  const current = await db.userFacilityRolePeriod.findFirst({
    where: { userFacilityAccessId: access.id, endsAt: null },
    select: { id: true, roleKey: true },
  });
  if (current?.roleKey === roleKey) return access;
  if (current) {
    await db.userFacilityRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: new Date() },
    });
  }
  await db.userFacilityRolePeriod.create({
    data: { userFacilityAccessId: access.id, roleKey, startsAt: new Date("2020-01-01T00:00:00.000Z") },
  });
  return access;
}

async function ensureOrgMembership(db, { userId, organizationId, role }) {
  const membership = await db.userOrganizationMembership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: {},
    create: { userId, organizationId },
    select: { id: true },
  });
  const current = await db.userOrganizationRolePeriod.findFirst({
    where: { membershipId: membership.id, endsAt: null },
    select: { id: true, role: true },
  });
  if (current?.role === role) return membership;
  if (current) {
    await db.userOrganizationRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: new Date() },
    });
  }
  await db.userOrganizationRolePeriod.create({
    data: { membershipId: membership.id, role, startsAt: new Date("2020-01-01T00:00:00.000Z") },
  });
  return membership;
}

async function ensurePartnership(db, { facilityId, organizationId, departmentId }) {
  const partnership = await db.facilityPartnerOrganization.upsert({
    where: { facilityId_organizationId: { facilityId, organizationId } },
    update: { endedAt: null },
    create: { facilityId, organizationId },
    select: { id: true },
  });
  const nowish = new Date("2020-01-01T00:00:00.000Z");
  const openAccess = await db.facilityPartnerAccessPeriod.findFirst({
    where: { facilityPartnerOrganizationId: partnership.id, endsAt: null },
    select: { id: true },
  });
  if (!openAccess) {
    await db.facilityPartnerAccessPeriod.create({
      data: { facilityPartnerOrganizationId: partnership.id, startsAt: nowish },
    });
  }
  const openScope = await db.facilityPartnerDepartmentScope.findFirst({
    where: { facilityPartnerOrganizationId: partnership.id, departmentId, endsAt: null },
    select: { id: true },
  });
  if (!openScope) {
    await db.facilityPartnerDepartmentScope.create({
      data: { facilityPartnerOrganizationId: partnership.id, departmentId, startsAt: nowish },
    });
  }
  const openCeiling = await db.facilityPartnerRoleCeilingPeriod.findFirst({
    where: { facilityPartnerOrganizationId: partnership.id, endsAt: null },
    select: { id: true },
  });
  if (!openCeiling) {
    await db.facilityPartnerRoleCeilingPeriod.create({
      data: {
        facilityPartnerOrganizationId: partnership.id,
        maxPartnerRole: "PARTNER_MANAGER",
        startsAt: nowish,
      },
    });
  }
  return partnership;
}

async function ensurePartnerAssignment(db, { userId, partnershipId }) {
  const assignment = await db.partnerUserFacilityAccess.upsert({
    where: {
      userId_facilityPartnerOrganizationId: {
        userId,
        facilityPartnerOrganizationId: partnershipId,
      },
    },
    update: {},
    create: { userId, facilityPartnerOrganizationId: partnershipId },
    select: { id: true },
  });
  const current = await db.partnerUserRolePeriod.findFirst({
    where: { partnerUserFacilityAccessId: assignment.id, endsAt: null },
    select: { id: true },
  });
  if (!current) {
    await db.partnerUserRolePeriod.create({
      data: {
        partnerUserFacilityAccessId: assignment.id,
        partnerRole: "PARTNER_MANAGER",
        startsAt: new Date("2020-01-01T00:00:00.000Z"),
        createdByAuthorityKind: "facility_admin",
      },
    });
  }
  return assignment;
}

async function seedWorkspaceSelectorFixtures(db, { terrace, dietary, password }) {
  const metz = await ensureOrganization(db, {
    name: "Metz Culinary Management",
    displayName: "Metz Culinary Management",
  });
  const highpointe = await ensureFacility(db, {
    organizationId: terrace.organizationId,
    displayName: "HighPointe Rehabilitation and Nursing Center",
  });
  const cedar = await ensureFacility(db, {
    organizationId: terrace.organizationId,
    displayName: "Cedar Ridge",
  });
  const highpointeDietary = await ensureDepartment(db, {
    facilityId: highpointe.id,
    key: "DIETARY",
    name: "Dietary",
  });
  await ensureDepartment(db, {
    facilityId: cedar.id,
    key: "DIETARY",
    name: "Dietary",
  });

  const terracePartnership = await ensurePartnership(db, {
    facilityId: terrace.id,
    organizationId: metz.id,
    departmentId: dietary.id,
  });
  const highpointePartnership = await ensurePartnership(db, {
    facilityId: highpointe.id,
    organizationId: metz.id,
    departmentId: highpointeDietary.id,
  });

  // shell.fa holds Terrace View's one Facility Administrator seat (CDA-02).
  const workspace = await upsertUser(db, {
    email: "shell.workspace@ltc.local",
    displayName: "Shell Workspace Selector",
    roleKey: "GM",
    facilityId: terrace.id,
    primaryDepartmentId: dietary.id,
  });
  await db.user.update({
    where: { id: workspace.id },
    data: { emailVerifiedAt: new Date() },
  });

  await ensureInternalGrant(db, {
    userId: workspace.id,
    facilityId: terrace.id,
    roleKey: "GM",
  });
  await ensureInternalGrant(db, {
    userId: workspace.id,
    facilityId: cedar.id,
    roleKey: "MANAGER",
  });
  await ensureOrgMembership(db, {
    userId: workspace.id,
    organizationId: metz.id,
    role: "ORG_ADMIN",
  });
  await ensurePartnerAssignment(db, {
    userId: workspace.id,
    partnershipId: terracePartnership.id,
  });
  await ensurePartnerAssignment(db, {
    userId: workspace.id,
    partnershipId: highpointePartnership.id,
  });

  for (let index = 1; index <= 8; index += 1) {
    const extra = await ensureFacility(db, {
      organizationId: terrace.organizationId,
      displayName: `Selector Site ${String(index).padStart(2, "0")}`,
    });
    await ensureDepartment(db, { facilityId: extra.id, key: "DIETARY", name: "Dietary" });
    await ensureInternalGrant(db, {
      userId: workspace.id,
      facilityId: extra.id,
      roleKey: "MANAGER",
    });
  }

  return {
    user: { email: workspace.email, password },
    terraceInternalKey: `facility_internal:${terrace.id}`,
    terracePartnerKey: `facility_partner:${terracePartnership.id}`,
    highpointePartnerKey: `facility_partner:${highpointePartnership.id}`,
    cedarInternalKey: `facility_internal:${cedar.id}`,
    metzOrgKey: `organization:${metz.id}`,
    terraceFacilityId: terrace.id,
    highpointeFacilityId: highpointe.id,
    cedarFacilityId: cedar.id,
    metzOrganizationId: metz.id,
    terraceName: terrace.displayName,
    highpointeName: highpointe.displayName,
    cedarName: cedar.displayName,
    metzName: metz.displayName,
  };
}

async function main() {
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");

  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`product-shell-browser-fixtures: target ${target.databaseName}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    const terraceCandidates = await db.facility.findMany({
      where: { displayName: "Terrace View Long Term Care" },
      select: {
        id: true,
        displayName: true,
        organizationId: true,
        departments: { where: { key: "DIETARY", isActive: true }, select: { id: true } },
      },
    });
    const facility =
      terraceCandidates.find((row) => row.departments.length > 0) ?? terraceCandidates[0];
    if (!facility) fail('seed facility "Terrace View Long Term Care" is missing');
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    });
    const evs = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true, name: true },
    });

    // Ensure both departments are pickable in the shell department switcher.
    await db.department.updateMany({
      where: { id: { in: [dietary.id, evs.id] } },
      data: { showInEmployeeApp: true },
    });

    const manager = await upsertUser(db, {
      email: "shell.manager@ltc.local",
      displayName: "Shell Browser Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const supervisor = await upsertUser(db, {
      email: "shell.supervisor@ltc.local",
      displayName: "Shell Browser Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const fa = await upsertUser(db, {
      email: "shell.fa@ltc.local",
      displayName: "Shell Browser Facility Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });
    await ensureInternalGrant(db, {
      userId: manager.id,
      facilityId: facility.id,
      roleKey: "MANAGER",
    });
    await ensureInternalGrant(db, {
      userId: supervisor.id,
      facilityId: facility.id,
      roleKey: "SUPERVISOR",
    });
    await ensureInternalGrant(db, {
      userId: fa.id,
      facilityId: facility.id,
      roleKey: "FACILITY_ADMINISTRATOR",
    });

    // Manager is also an employee in Dietary + EVS so the department switch has ≥2 options.
    await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "Shell",
      lastName: "ManagerEmp",
      departmentId: dietary.id,
      extraDepartmentIds: [evs.id],
      roleType: "MANAGER",
    });

    // Quick PIN frontline Dietary staff (must remain RUN-only).
    const staffPin = "531642";
    const staff = await upsertUser(db, {
      email: "shell.staff@ltc.local",
      displayName: "Shell Browser Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    await ensureInternalGrant(db, {
      userId: staff.id,
      facilityId: facility.id,
      roleKey: "STAFF",
    });
    const staffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Shell",
      lastName: "StaffOne",
      departmentId: dietary.id,
      roleType: "STAFF",
      pinDigestValue: pinDigest(facility.id, staffPin),
    });

    // A unit to bind the shared tablet device to (any active dietary/servery unit).
    // Seed currently fails before creating units (`facilityId_name` unique dropped); create one.
    const unit =
      (await db.unit.findFirst({
        where: { facilityId: facility.id, unitType: "SERVERY", isActive: true },
        select: { id: true, name: true },
      })) ??
      (await db.unit.findFirst({
        where: { facilityId: facility.id, isActive: true },
        select: { id: true, name: true },
      })) ??
      (await db.unit.create({
        data: {
          facilityId: facility.id,
          name: "Shell Cert Servery",
          unitType: "SERVERY",
          isActive: true,
          displayOrder: 10,
        },
        select: { id: true, name: true },
      }));

    const workspaceSelector = await seedWorkspaceSelectorFixtures(db, {
      terrace: facility,
      dietary,
      password: SYNTHETIC_PASSWORD,
    });

    const fixtures = {
      facilityId: facility.id,
      facilityName: facility.displayName,
      dietaryDepartmentId: dietary.id,
      evsDepartmentId: evs.id,
      unitId: unit.id,
      unitName: unit.name,
      staffEmployeeId: staffEmp.id,
      users: {
        manager: { email: manager.email, password: SYNTHETIC_PASSWORD },
        supervisor: { email: supervisor.email, password: SYNTHETIC_PASSWORD },
        fa: { email: fa.email, password: SYNTHETIC_PASSWORD },
        staff: { email: staff.email, password: SYNTHETIC_PASSWORD },
        workspace: workspaceSelector.user,
      },
      workspaceSelector,
    };

    writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
    writeFileSync(
      PINS_PATH,
      [`PRODUCT_SHELL_STAFF_PIN=${staffPin}`, `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`].join("\n"),
    );
    console.log(`product-shell-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
