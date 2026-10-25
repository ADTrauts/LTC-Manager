/**
 * Idempotent Supervisor accounts for the DSH-04 checklist on Terrace View.
 * Refuses every database except the Neon staging database. Never prints a password.
 *
 *   DSH04_CHECKLIST_SETUP=1 npx tsx scripts/verify/dsh04-checklist-supervisors.mts
 */
import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";

const FACILITY_NAME = "Terrace View";
const NOTEAM_EMAIL = "supervisor.noteam@cda07.staging.test";
const TEAM_EMAIL = "supervisor.team@cda07.staging.test";
const UNIT_NAME = "Checklist Floor";
const SPACE_NAME = "Checklist Room";
const TEAM_NAME = "Checklist Team";

function fail(message: string): never {
  console.error(`dsh04-checklist: ${message}`);
  process.exit(1);
}

function stagingUrl(): string {
  if (process.env.DSH04_CHECKLIST_SETUP !== "1") fail("set DSH04_CHECKLIST_SETUP=1");
  const raw = execSync("ps eww -p 91210", { encoding: "utf8", maxBuffer: 20e6 });
  const match = raw.match(/(?:^| )DATABASE_URL=([^ ]+)/);
  if (!match) fail("the staging server has no database URL");
  return match[1];
}

function assertStaging(url: string) {
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

async function main() {
  const url = stagingUrl();
  assertStaging(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const facility = await db.facility.findFirst({
      where: { displayName: FACILITY_NAME },
      select: { id: true },
    });
    if (!facility) fail("Terrace View is missing");
    const plant = await db.department.findFirst({
      where: { facilityId: facility.id, key: "PLANT" },
      select: { id: true },
    });
    if (!plant) fail("Plant Operations is missing");
    const role = await db.role.findUnique({ where: { key: "SUPERVISOR" }, select: { id: true } });
    if (!role) fail("SUPERVISOR role is missing");
    const donor = await db.user.findUnique({
      where: { email: "fa.terrace@cda07.staging.test" },
      select: { id: true, passwordHash: true },
    });
    if (!donor?.passwordHash) fail("Terrace View administrator is missing");

    const unit = await db.unit.upsert({
      where: { id: await existingUnitId(db, facility.id) },
      update: { isActive: true },
      create: {
        facilityId: facility.id,
        name: UNIT_NAME,
        unitType: "OTHER",
        hierarchyRole: "FLOOR",
        isActive: true,
      },
      select: { id: true },
    });

    let space = await db.unitSpace.findFirst({
      where: { facilityId: facility.id, unitId: unit.id, name: SPACE_NAME },
      select: { id: true },
    });
    if (!space) {
      space = await db.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: unit.id,
          name: SPACE_NAME,
          spaceType: "OTHER",
          isActive: true,
        },
        select: { id: true },
      });
    }
    await db.unitSpaceResponsibility.upsert({
      where: { spaceId_departmentId: { spaceId: space.id, departmentId: plant.id } },
      update: {},
      create: { spaceId: space.id, departmentId: plant.id },
    });

    let team = await db.departmentTeam.findFirst({
      where: { facilityId: facility.id, departmentId: plant.id, displayName: TEAM_NAME },
      select: { id: true },
    });
    if (!team) {
      team = await db.departmentTeam.create({
        data: {
          facilityId: facility.id,
          departmentId: plant.id,
          displayName: TEAM_NAME,
          status: "ACTIVE",
        },
        select: { id: true },
      });
    }
    await db.departmentTeamRoomMembership.upsert({
      where: { teamId_spaceId: { teamId: team.id, spaceId: space.id } },
      update: {},
      create: { teamId: team.id, spaceId: space.id },
    });

    await ensureSupervisor(db, {
      email: NOTEAM_EMAIL,
      displayName: "Checklist Supervisor",
      firstName: "Checklist",
      lastName: "Supervisor",
      facilityId: facility.id,
      departmentId: plant.id,
      roleId: role.id,
      passwordHash: donor.passwordHash,
      grantedByUserId: donor.id,
      teamId: null,
    });
    await ensureSupervisor(db, {
      email: TEAM_EMAIL,
      displayName: "Team Supervisor",
      firstName: "Team",
      lastName: "Supervisor",
      facilityId: facility.id,
      departmentId: plant.id,
      roleId: role.id,
      passwordHash: donor.passwordHash,
      grantedByUserId: donor.id,
      teamId: team.id,
    });
    console.log("dsh04-checklist: ready");
    console.log(`dsh04-checklist: ${NOTEAM_EMAIL}`);
    console.log(`dsh04-checklist: ${TEAM_EMAIL}`);
  } finally {
    await db.$disconnect();
  }
}

async function existingUnitId(db: PrismaClient, facilityId: string): Promise<string> {
  const unit = await db.unit.findFirst({
    where: { facilityId, name: UNIT_NAME, parentUnitId: null },
    select: { id: true },
  });
  return unit?.id ?? "missing-checklist-floor";
}

async function ensureSupervisor(
  db: PrismaClient,
  input: {
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    facilityId: string;
    departmentId: string;
    roleId: string;
    passwordHash: string;
    grantedByUserId: string;
    teamId: string | null;
  },
) {
  const user = await db.user.upsert({
    where: { email: input.email },
    update: {
      isActive: true,
      roleId: input.roleId,
      facilityId: input.facilityId,
      primaryDepartmentId: input.departmentId,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: input.email,
      displayName: input.displayName,
      facilityId: input.facilityId,
      roleId: input.roleId,
      passwordHash: input.passwordHash,
      isActive: true,
      emailVerifiedAt: new Date(),
      primaryDepartmentId: input.departmentId,
    },
    select: { id: true },
  });
  await ensureUserFacilityAccessGrant(db, {
    userId: user.id,
    facilityId: input.facilityId,
    grantedByUserId: input.grantedByUserId,
    roleKey: "SUPERVISOR",
  });
  const employee = await db.employee.upsert({
    where: { id: await existingEmployeeId(db, input.facilityId, user.id) },
    update: {
      status: "ACTIVE",
      roleType: "SUPERVISOR",
      primaryDepartmentId: input.departmentId,
      userId: user.id,
    },
    create: {
      facilityId: input.facilityId,
      userId: user.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      status: "ACTIVE",
      roleType: "SUPERVISOR",
      primaryDepartmentId: input.departmentId,
    },
    select: { id: true },
  });
  if (!input.teamId) return;
  await db.employeeTeamMembership.upsert({
    where: { employeeId_teamId: { employeeId: employee.id, teamId: input.teamId } },
    update: { isPrimary: true },
    create: { employeeId: employee.id, teamId: input.teamId, isPrimary: true },
  });
}

async function existingEmployeeId(db: PrismaClient, facilityId: string, userId: string): Promise<string> {
  const employee = await db.employee.findFirst({
    where: { facilityId, userId },
    select: { id: true },
  });
  return employee?.id ?? "missing-checklist-employee";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "dsh04-checklist failed");
  process.exit(1);
});
