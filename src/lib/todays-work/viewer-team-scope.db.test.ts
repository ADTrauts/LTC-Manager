/**
 * SQL-backed viewer Team scope resolution for Today's Work.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL / VERIFY_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { archiveDepartmentTeam, createDepartmentTeam } from "@/lib/department-teams";
import { resolveViewerTeamScopes } from "./viewer-team-scope";

const databaseUrl =
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL ||
  process.env.OPERATIONAL_CYCLES_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set DEPARTMENT_WORK_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role" | "uid">,
): AppJwtPayload {
  return {
    uid: overrides.uid,
    authKind: overrides.authKind ?? "employee",
    authMethod: overrides.authMethod ?? "QUICK_PIN",
    role: overrides.role,
    name: overrides.name ?? "Scope Test",
    email: overrides.email ?? "scope-test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "resolveViewerTeamScopes: membership, archive, headship, and department isolation",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = cuidLike().slice(-8);

    try {
      const org = await prisma.organization.create({
        data: { name: `Run Scope Org ${suffix}` },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Run Scope Facility ${suffix}`,
        },
      });
      const dietary = await prisma.department.create({
        data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Dietary" },
      });
      const evs = await prisma.department.create({
        data: {
          facilityId: facility.id,
          key: `EVS_${suffix}`,
          name: "Environmental Services",
        },
      });
      const admin = session({
        uid: `admin_${suffix}`,
        facilityId: facility.id,
        role: "FACILITY_ADMINISTRATOR",
        authKind: "user",
        authMethod: "PASSWORD",
      });

      const neighborhood = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Naval Park ${suffix}`,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });
      const servery = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "Naval Park Servery",
          spaceType: "SERVICE_AREA",
        },
      });
      const retailSpace = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "Retail",
          spaceType: "SERVICE_AREA",
        },
      });
      const evsSpace = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "Public Lobby",
          spaceType: "PUBLIC_AREA",
        },
      });

      await prisma.unitSpaceResponsibility.createMany({
        data: [
          { departmentId: dietary.id, spaceId: servery.id },
          { departmentId: dietary.id, spaceId: retailSpace.id },
          { departmentId: evs.id, spaceId: evsSpace.id },
        ],
      });

      const residentServices = await createDepartmentTeam(admin, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: `Resident Services ${suffix}`,
        spaceIds: [servery.id],
      });
      const retail = await createDepartmentTeam(admin, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: `Retail ${suffix}`,
        spaceIds: [retailSpace.id],
      });
      const publicAreas = await createDepartmentTeam(admin, {
        facilityId: facility.id,
        departmentId: evs.id,
        displayName: `Public Areas ${suffix}`,
        spaceIds: [evsSpace.id],
      });
      const emptyTeam = await createDepartmentTeam(admin, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: `Mechanical ${suffix}`,
        spaceIds: [],
      });

      const sharon = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Sharon",
          lastName: "Scope",
          roleType: "SUPERVISOR",
          email: `sharon-${suffix}@example.com`,
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: sharon.id, teamId: residentServices.id, isPrimary: true },
      });

      const scoped = await resolveViewerTeamScopes({
        session: session({
          uid: sharon.id,
          facilityId: facility.id,
          role: "SUPERVISOR",
        }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      const sharonDietary = scoped.get(dietary.id);
      assert.equal(sharonDietary?.mode, "TEAM_SCOPED");
      assert.deepEqual(sharonDietary?.roomIds, [servery.id]);

      await prisma.employeeTeamMembership.create({
        data: { employeeId: sharon.id, teamId: retail.id, isPrimary: false },
      });
      const multi = await resolveViewerTeamScopes({
        session: session({ uid: sharon.id, facilityId: facility.id, role: "SUPERVISOR" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(multi.get(dietary.id)?.mode, "TEAM_SCOPED");
      assert.deepEqual(new Set(multi.get(dietary.id)?.roomIds), new Set([servery.id, retailSpace.id]));

      await prisma.employeeDepartment.create({
        data: { employeeId: sharon.id, departmentId: evs.id, roleType: "STAFF" },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: sharon.id, teamId: publicAreas.id, isPrimary: true },
      });
      const dietaryOnly = await resolveViewerTeamScopes({
        session: session({ uid: sharon.id, facilityId: facility.id, role: "SUPERVISOR" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(dietaryOnly.get(dietary.id)?.roomIds.includes(evsSpace.id), false);

      const head = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Dana",
          lastName: "Head",
          roleType: "MANAGER",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: head.id, teamId: residentServices.id, isPrimary: true },
      });
      await prisma.department.update({
        where: { id: dietary.id },
        data: { headEmployeeId: head.id },
      });
      const headScope = await resolveViewerTeamScopes({
        session: session({ uid: head.id, facilityId: facility.id, role: "MANAGER" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(headScope.get(dietary.id)?.mode, "DEPARTMENT_WIDE");
      assert.equal(headScope.get(dietary.id)?.reason, "DEPARTMENT_MANAGER");

      const notHead = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Morgan",
          lastName: "Manager",
          roleType: "MANAGER",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: notHead.id, teamId: retail.id, isPrimary: true },
      });
      const managerRole = await resolveViewerTeamScopes({
        session: session({ uid: notHead.id, facilityId: facility.id, role: "MANAGER" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(managerRole.get(dietary.id)?.mode, "TEAM_SCOPED");
      assert.deepEqual(managerRole.get(dietary.id)?.roomIds, [retailSpace.id]);

      const emptyMember = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Mel",
          lastName: "Empty",
          roleType: "SUPERVISOR",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: emptyMember.id, teamId: emptyTeam.id, isPrimary: true },
      });
      const emptyScope = await resolveViewerTeamScopes({
        session: session({ uid: emptyMember.id, facilityId: facility.id, role: "SUPERVISOR" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(emptyScope.get(dietary.id)?.mode, "TEAM_WITHOUT_LOCATIONS");

      await archiveDepartmentTeam(admin, {
        facilityId: facility.id,
        teamId: retail.id,
      });
      const archivedOnly = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Archie",
          lastName: "Archive",
          roleType: "SUPERVISOR",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: archivedOnly.id, teamId: retail.id, isPrimary: true },
      });
      const archivedScope = await resolveViewerTeamScopes({
        session: session({ uid: archivedOnly.id, facilityId: facility.id, role: "SUPERVISOR" }),
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
      });
      assert.equal(archivedScope.get(dietary.id)?.mode, "DEPARTMENT_WIDE");
      assert.equal(archivedScope.get(dietary.id)?.reason, "NO_ACTIVE_TEAM_MEMBERSHIP");

      const fa = await resolveViewerTeamScopes({
        session: admin,
        facilityId: facility.id,
        departments: [{ id: dietary.id, label: "Dietary" }],
        db: prisma,
        resolveEmployeeId: async () => null,
      });
      assert.equal(fa.get(dietary.id)?.mode, "DEPARTMENT_WIDE");
      assert.equal(fa.get(dietary.id)?.reason, "FACILITY_ADMINISTRATOR");
    } finally {
      await prisma.employeeTeamMembership.deleteMany({
        where: { employee: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.departmentTeamRoomMembership.deleteMany({
        where: { team: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.departmentTeam.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.unitSpaceResponsibility.deleteMany({
        where: { department: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.unitSpace.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.employeeDepartment.deleteMany({
        where: { employee: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.employee.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.department.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.unit.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.facility.deleteMany({
        where: { organization: { name: { contains: suffix } } },
      });
      await prisma.organization.deleteMany({
        where: { name: { contains: suffix } },
      });
      await prisma.$disconnect();
    }
  },
);
