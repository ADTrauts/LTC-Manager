/**
 * SQL-backed Department Team persistence tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL / VERIFY_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import {
  archiveDepartmentTeam,
  createDepartmentTeam,
  loadTeamsForDepartment,
  pruneTeamRoomsAfterResponsibilityRemoved,
  updateDepartmentTeam,
} from "./service";

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
    name: "Team Test",
    email: "team-test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "department teams: create, overlap, validate, rename, archive, manager, prune",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = cuidLike().slice(-8);

    try {
      const org = await prisma.organization.create({
        data: { name: `Team Test Org ${suffix}` },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Team Test Facility ${suffix}`,
        },
      });
      const otherFacility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Team Test Other Facility ${suffix}`,
        },
      });
      const dietary = await prisma.department.create({
        data: {
          facilityId: facility.id,
          key: `DIETARY_${suffix}`,
          name: "Dietary",
        },
      });
      const evs = await prisma.department.create({
        data: {
          facilityId: facility.id,
          key: `EVS_${suffix}`,
          name: "Environmental Services",
        },
      });
      const plant = await prisma.department.create({
        data: {
          facilityId: facility.id,
          key: `PLANT_${suffix}`,
          name: "Plant Operations",
        },
      });
      const otherDept = await prisma.department.create({
        data: {
          facilityId: otherFacility.id,
          key: `DIETARY_${suffix}`,
          name: "Dietary",
        },
      });

      const floor = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Floor 1 ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const neighborhood = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Naval Park ${suffix}`,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "NEIGHBORHOOD",
          parentUnitId: floor.id,
        },
      });
      const plantUnit = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Plant Wing ${suffix}`,
          unitType: "MECHANICAL",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });
      const otherUnit = await prisma.unit.create({
        data: {
          facilityId: otherFacility.id,
          name: `Other Nbhd ${suffix}`,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });

      const naval = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "Naval Park Servery",
          spaceType: "SERVICE_AREA",
        },
      });
      const lighthouse = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "Lighthouse Servery",
          spaceType: "SERVICE_AREA",
        },
      });
      const evsRoom = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "EVS Closet",
          spaceType: "UTILITY",
        },
      });
      const boiler = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: plantUnit.id,
          name: "Boiler Room",
          spaceType: "MECHANICAL",
        },
      });
      const otherRoom = await prisma.unitSpace.create({
        data: {
          facilityId: otherFacility.id,
          unitId: otherUnit.id,
          name: "Foreign Room",
          spaceType: "SERVICE_AREA",
        },
      });

      await prisma.unitSpaceResponsibility.createMany({
        data: [
          { spaceId: naval.id, departmentId: dietary.id, capabilities: [] },
          { spaceId: lighthouse.id, departmentId: dietary.id, capabilities: [] },
          { spaceId: evsRoom.id, departmentId: evs.id, capabilities: [] },
          { spaceId: boiler.id, departmentId: plant.id, capabilities: [] },
          { spaceId: otherRoom.id, departmentId: otherDept.id, capabilities: [] },
        ],
      });

      const employee = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Sarah",
          lastName: "Smith",
          roleType: "STAFF",
          primaryDepartmentId: dietary.id,
        },
      });

      const mgr = session({
        facilityId: facility.id,
        role: "MANAGER",
        primaryDepartmentId: dietary.id,
      });

      const empty = await loadTeamsForDepartment(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
      });
      assert.equal(empty.length, 0);

      const residentServices = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: "Resident Services",
        spaceIds: [naval.id, lighthouse.id],
        managerEmployeeId: employee.id,
      });
      assert.equal(residentServices.displayName, "Resident Services");
      assert.equal(residentServices.roomCount, 2);
      assert.equal(residentServices.managerEmployeeId, employee.id);
      assert.ok(residentServices.rooms.every((room) => room.spaceId !== floor.id));
      assert.deepEqual(
        residentServices.rooms.map((room) => room.spaceId).sort(),
        [naval.id, lighthouse.id].sort(),
      );

      const afterCreate = await prisma.employee.findUniqueOrThrow({
        where: { id: employee.id },
        select: { roleType: true },
      });
      assert.equal(afterCreate.roleType, "STAFF");

      const clinical = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: "Clinical Nutrition",
        spaceIds: [naval.id],
      });
      assert.ok(clinical.rooms.some((room) => room.spaceId === naval.id));

      await assert.rejects(
        () =>
          createDepartmentTeam(mgr, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "resident services",
            spaceIds: [naval.id],
          }),
        /already exists/i,
      );

      await assert.rejects(
        () =>
          createDepartmentTeam(mgr, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "Bad Scope",
            spaceIds: [evsRoom.id],
          }),
        /assigned to this Department/i,
      );

      await assert.rejects(
        () =>
          createDepartmentTeam(mgr, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "Cross Facility",
            spaceIds: [otherRoom.id],
          }),
        /assigned to this Department/i,
      );

      await assert.rejects(
        () =>
          createDepartmentTeam(mgr, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "Floor Member",
            spaceIds: [floor.id],
          }),
        /assigned to this Department/i,
      );

      const staffSession = session({
        facilityId: facility.id,
        role: "STAFF",
        primaryDepartmentId: dietary.id,
      });
      await assert.rejects(
        () =>
          createDepartmentTeam(staffSession, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "Unauthorized",
            spaceIds: [naval.id],
          }),
        /Manager or above/i,
      );

      const pinSession = session({
        facilityId: facility.id,
        role: "MANAGER",
        authMethod: "QUICK_PIN",
        primaryDepartmentId: dietary.id,
      });
      await assert.rejects(
        () =>
          createDepartmentTeam(pinSession, {
            facilityId: facility.id,
            departmentId: dietary.id,
            displayName: "Pin Team",
            spaceIds: [naval.id],
          }),
        /Quick PIN/i,
      );

      const unassigned = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "No",
          lastName: "Department",
          roleType: "STAFF",
        },
      });
      await assert.rejects(
        () =>
          updateDepartmentTeam(mgr, {
            facilityId: facility.id,
            teamId: residentServices.id,
            managerEmployeeId: unassigned.id,
          }),
        /belong to this Department/i,
      );

      const renamed = await updateDepartmentTeam(mgr, {
        facilityId: facility.id,
        teamId: residentServices.id,
        displayName: "Neighborhood Services",
      });
      assert.equal(renamed.id, residentServices.id);
      assert.equal(renamed.displayName, "Neighborhood Services");
      assert.equal(renamed.managerEmployeeId, employee.id);
      assert.equal(renamed.roomCount, 2);

      const cleared = await updateDepartmentTeam(mgr, {
        facilityId: facility.id,
        teamId: residentServices.id,
        managerEmployeeId: null,
      });
      assert.equal(cleared.managerEmployeeId, null);

      await archiveDepartmentTeam(mgr, {
        facilityId: facility.id,
        teamId: clinical.id,
      });
      const activeAfterArchive = await loadTeamsForDepartment(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
      });
      assert.equal(activeAfterArchive.some((team) => team.id === clinical.id), false);
      assert.equal(activeAfterArchive.some((team) => team.id === residentServices.id), true);
      const archivedRow = await prisma.departmentTeam.findUniqueOrThrow({
        where: { id: clinical.id },
      });
      assert.equal(archivedRow.status, "ARCHIVED");
      assert.ok(archivedRow.archivedAt);

      const reused = await createDepartmentTeam(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        displayName: "Clinical Nutrition",
        spaceIds: [naval.id],
      });
      assert.notEqual(reused.id, clinical.id);

      const plantMgr = session({
        facilityId: facility.id,
        role: "MANAGER",
        primaryDepartmentId: plant.id,
      });
      const mechanical = await createDepartmentTeam(plantMgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        displayName: "Mechanical",
        spaceIds: [boiler.id],
      });
      assert.equal(mechanical.displayName, "Mechanical");
      assert.equal(mechanical.roomCount, 1);

      await pruneTeamRoomsAfterResponsibilityRemoved(prisma, {
        spaceId: naval.id,
        departmentId: dietary.id,
      });
      const afterPrune = await loadTeamsForDepartment(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
      });
      const resident = afterPrune.find((team) => team.id === residentServices.id);
      assert.ok(resident);
      assert.equal(resident.rooms.some((room) => room.spaceId === naval.id), false);
      assert.equal(resident.rooms.some((room) => room.spaceId === lighthouse.id), true);

      const zoneCount = await prisma.departmentOperationalZone.count({
        where: { departmentId: dietary.id },
      });
      assert.equal(zoneCount, 0);
      const cycleCount = await prisma.departmentOperationalCycle.count({
        where: { departmentId: dietary.id },
      });
      assert.equal(cycleCount, 0);
    } finally {
      await prisma.departmentTeam.deleteMany({
        where: {
          OR: [
            { facility: { organization: { name: { contains: suffix } } } },
          ],
        },
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
