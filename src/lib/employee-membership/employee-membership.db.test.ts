/**
 * SQL-backed Employee organization membership tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL / VERIFY_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { archiveDepartmentTeam, createDepartmentTeam } from "@/lib/department-teams";
import {
  employeeBelongsToDepartment,
  resolveDepartmentMembershipIds,
  syncEmployeeOrganization,
} from "./index";

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
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    role: overrides.role,
    name: "Org Test",
    email: "org-test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "employee organization: department + team membership persistence and reconciliation",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = cuidLike().slice(-8);

    try {
      const org = await prisma.organization.create({
        data: { name: `Emp Org Test ${suffix}` },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Emp Org Facility ${suffix}`,
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
      const plant = await prisma.department.create({
        data: { facilityId: facility.id, key: `PLANT_${suffix}`, name: "Plant Operations" },
      });
      const jobTitle = await prisma.jobTitle.create({
        data: { facilityId: facility.id, name: `Resident Services Supervisor ${suffix}` },
      });

      const floor = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Floor 1 ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const dietaryRoom = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: floor.id,
          name: "1A Naval Park",
          spaceType: "PATIENT_ROOM",
        },
      });
      const evsRoom = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: floor.id,
          name: "Public Corridor",
          spaceType: "PUBLIC_AREA",
        },
      });
      await prisma.unitSpaceResponsibility.createMany({
        data: [
          { spaceId: dietaryRoom.id, departmentId: dietary.id, capabilities: [] },
          { spaceId: evsRoom.id, departmentId: evs.id, capabilities: [] },
        ],
      });

      const mgr = session({
        facilityId: facility.id,
        role: "MANAGER",
        primaryDepartmentId: dietary.id,
      });
      const residentServices = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: "Resident Services",
        spaceIds: [dietaryRoom.id],
      });
      const retail = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: "Retail",
        spaceIds: [dietaryRoom.id],
      });
      const publicAreas = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: evs.id,
        displayName: "Public Areas",
        spaceIds: [evsRoom.id],
      });

      const sarah = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Sarah",
          lastName: "Smith",
          roleType: "SUPERVISOR",
        },
      });

      await syncEmployeeOrganization(prisma, {
        employeeId: sarah.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [],
        jobTitleId: jobTitle.id,
        teamMemberships: [
          { teamId: residentServices.id, isPrimary: true },
          { teamId: retail.id, isPrimary: false },
        ],
      });

      const afterCreate = await prisma.employee.findUniqueOrThrow({
        where: { id: sarah.id },
        include: {
          employeeDepartments: true,
          teamMemberships: true,
          workStations: true,
        },
      });
      assert.equal(afterCreate.primaryDepartmentId, dietary.id);
      assert.equal(afterCreate.employeeDepartments.length, 0);
      assert.equal(afterCreate.jobTitleId, jobTitle.id);
      assert.equal(afterCreate.roleType, "SUPERVISOR");
      assert.equal(afterCreate.workStations.length, 0);
      const teamById = new Map(afterCreate.teamMemberships.map((row) => [row.teamId, row]));
      assert.equal(teamById.get(residentServices.id)?.isPrimary, true);
      assert.equal(teamById.get(retail.id)?.isPrimary, false);

      await syncEmployeeOrganization(prisma, {
        employeeId: sarah.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [evs.id],
        jobTitleId: jobTitle.id,
        teamMemberships: [
          { teamId: residentServices.id, isPrimary: true },
          { teamId: retail.id, isPrimary: false },
        ],
      });
      const withEvs = await prisma.employee.findUniqueOrThrow({
        where: { id: sarah.id },
        include: { employeeDepartments: true, teamMemberships: true },
      });
      assert.deepEqual(
        resolveDepartmentMembershipIds(withEvs).sort(),
        [dietary.id, evs.id].sort(),
      );
      assert.equal(employeeBelongsToDepartment(withEvs, evs.id), true);
      assert.equal(
        withEvs.employeeDepartments.some((row) => row.departmentId === dietary.id),
        false,
      );

      await assert.rejects(
        () =>
          syncEmployeeOrganization(prisma, {
            employeeId: sarah.id,
            facilityId: facility.id,
            primaryDepartmentId: dietary.id,
            additionalDepartmentIds: [],
            jobTitleId: jobTitle.id,
            teamMemberships: [{ teamId: publicAreas.id, isPrimary: true }],
          }),
        /belong to the Team's Department/i,
      );

      await syncEmployeeOrganization(prisma, {
        employeeId: sarah.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [evs.id],
        jobTitleId: jobTitle.id,
        teamMemberships: [
          { teamId: residentServices.id, isPrimary: true },
          { teamId: publicAreas.id, isPrimary: true },
        ],
      });
      const crossDept = await prisma.employeeTeamMembership.findMany({
        where: { employeeId: sarah.id },
      });
      assert.equal(crossDept.filter((row) => row.isPrimary).length, 2);

      await assert.rejects(
        () =>
          syncEmployeeOrganization(prisma, {
            employeeId: sarah.id,
            facilityId: facility.id,
            primaryDepartmentId: dietary.id,
            additionalDepartmentIds: [evs.id],
            jobTitleId: jobTitle.id,
            teamMemberships: [
              { teamId: residentServices.id, isPrimary: true },
              { teamId: retail.id, isPrimary: true },
            ],
          }),
        /one Primary Team per Department/i,
      );

      const plantEmployee = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Pat",
          lastName: "Plant",
          roleType: "STAFF",
        },
      });
      await syncEmployeeOrganization(prisma, {
        employeeId: plantEmployee.id,
        facilityId: facility.id,
        primaryDepartmentId: plant.id,
        additionalDepartmentIds: [],
        jobTitleId: null,
        teamMemberships: [],
      });
      const plantRow = await prisma.employee.findUniqueOrThrow({
        where: { id: plantEmployee.id },
        include: { teamMemberships: true },
      });
      assert.equal(plantRow.primaryDepartmentId, plant.id);
      assert.equal(plantRow.teamMemberships.length, 0);

      await syncEmployeeOrganization(prisma, {
        employeeId: sarah.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [],
        jobTitleId: jobTitle.id,
        teamMemberships: [{ teamId: residentServices.id, isPrimary: true }],
      });
      const afterEvsRemoved = await prisma.employee.findUniqueOrThrow({
        where: { id: sarah.id },
        include: { employeeDepartments: true, teamMemberships: true },
      });
      assert.equal(employeeBelongsToDepartment(afterEvsRemoved, evs.id), false);
      assert.equal(
        afterEvsRemoved.teamMemberships.some((row) => row.teamId === publicAreas.id),
        false,
      );
      assert.equal(
        afterEvsRemoved.teamMemberships.some((row) => row.teamId === residentServices.id),
        true,
      );

      await prisma.employeeWorkStation.create({
        data: { employeeId: sarah.id, station: "SERVER" },
      });
      await syncEmployeeOrganization(prisma, {
        employeeId: sarah.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [],
        jobTitleId: jobTitle.id,
        teamMemberships: [
          { teamId: residentServices.id, isPrimary: true },
          { teamId: retail.id, isPrimary: false },
        ],
      });
      const stations = await prisma.employeeWorkStation.findMany({
        where: { employeeId: sarah.id },
      });
      assert.deepEqual(
        stations.map((row) => row.station),
        ["SERVER"],
      );
      const roleUnchanged = await prisma.employee.findUniqueOrThrow({
        where: { id: sarah.id },
        select: { roleType: true },
      });
      assert.equal(roleUnchanged.roleType, "SUPERVISOR");

      await prisma.employee.update({
        where: { id: sarah.id },
        data: { roleType: "STAFF" },
      });
      const teamsAfterRole = await prisma.employeeTeamMembership.findMany({
        where: { employeeId: sarah.id },
      });
      assert.equal(teamsAfterRole.length, 2);

      await archiveDepartmentTeam(mgr, {
        facilityId: facility.id,
        teamId: retail.id,
      });
      const stillValid = await prisma.employee.findUniqueOrThrow({
        where: { id: sarah.id },
        include: { teamMemberships: { include: { team: { select: { status: true } } } } },
      });
      assert.equal(stillValid.status, "ACTIVE");
      assert.equal(
        stillValid.teamMemberships.some(
          (row) => row.teamId === retail.id && row.team.status === "ARCHIVED",
        ),
        true,
      );

      const terminated = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Terry",
          lastName: "Term",
          roleType: "STAFF",
          status: "TERMINATED",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: terminated.id, teamId: residentServices.id, isPrimary: true },
      });
      const activeCount = await prisma.employeeTeamMembership.count({
        where: {
          teamId: residentServices.id,
          employee: { status: "ACTIVE" },
        },
      });
      const historical = await prisma.employeeTeamMembership.count({
        where: { teamId: residentServices.id },
      });
      assert.equal(activeCount, 1);
      assert.equal(historical, 2);

      const existingNoTeam = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Existing",
          lastName: "Employee",
          roleType: "STAFF",
          primaryDepartmentId: dietary.id,
        },
      });
      await syncEmployeeOrganization(prisma, {
        employeeId: existingNoTeam.id,
        facilityId: facility.id,
        primaryDepartmentId: dietary.id,
        additionalDepartmentIds: [],
        jobTitleId: null,
        teamMemberships: [],
      });
      const stillNoTeam = await prisma.employeeTeamMembership.count({
        where: { employeeId: existingNoTeam.id },
      });
      assert.equal(stillNoTeam, 0);
    } finally {
      await prisma.employeeTeamMembership.deleteMany({
        where: { employee: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.departmentTeam.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.employeeWorkStation.deleteMany({
        where: { employee: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.unitSpaceResponsibility.deleteMany({
        where: { space: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.unitSpace.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.unit.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.employee.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.jobTitle.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.department.deleteMany({
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
