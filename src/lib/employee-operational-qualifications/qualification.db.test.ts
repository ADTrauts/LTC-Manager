/**
 * SQL proof for operational eligibility.
 * Opt in with VERIFY_DATABASE_URL or DEPARTMENT_WORK_TEST_DATABASE_URL.
 * A skipped run is not SQL certification.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { replaceEmployeeOperationalQualifications } from "./replace";

const databaseUrl =
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run this";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

test(
  "eligibility is per department, does not change authority or teams, and does not rewrite assignment history",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = cuidLike().slice(-8);

    try {
      const org = await prisma.organization.create({ data: { name: `Qual Org ${suffix}` } });
      const facility = await prisma.facility.create({
        data: { organizationId: org.id, displayName: `Qual Facility ${suffix}` },
      });
      const dietary = await prisma.department.create({
        data: { facilityId: facility.id, key: "DIETARY", name: "Dietary" },
      });
      const evs = await prisma.department.create({
        data: { facilityId: facility.id, key: "EVS", name: "Environmental Services" },
      });
      const employee = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Ada",
          lastName: "Lane",
          roleType: "STAFF",
          primaryDepartmentId: dietary.id,
        },
      });
      await prisma.employeeDepartment.create({
        data: { employeeId: employee.id, departmentId: evs.id },
      });
      const culinary = await prisma.departmentTeam.create({
        data: { facilityId: facility.id, departmentId: dietary.id, displayName: "Culinary" },
      });
      const retail = await prisma.departmentTeam.create({
        data: { facilityId: facility.id, departmentId: dietary.id, displayName: "Retail" },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: employee.id, teamId: culinary.id, isPrimary: true },
      });
      await prisma.employeeTeamMembership.create({
        data: { employeeId: employee.id, teamId: retail.id, isPrimary: false },
      });

      await replaceEmployeeOperationalQualifications(prisma, {
        facilityId: facility.id,
        employeeId: employee.id,
        departmentId: dietary.id,
        roleKeys: ["SERVER", "HOT_PREP"],
      });
      await replaceEmployeeOperationalQualifications(prisma, {
        facilityId: facility.id,
        employeeId: employee.id,
        departmentId: evs.id,
        roleKeys: ["CLEANING_ROUND"],
      });

      const after = await prisma.employee.findFirstOrThrow({
        where: { id: employee.id },
        select: {
          roleType: true,
          teamMemberships: { select: { teamId: true, isPrimary: true } },
          operationalRoleQualifications: { select: { departmentId: true, roleKey: true, status: true } },
        },
      });
      assert.equal(after.roleType, "STAFF");
      assert.deepEqual(
        after.teamMemberships.map((row) => `${row.teamId}:${row.isPrimary}`).sort(),
        [`${culinary.id}:true`, `${retail.id}:false`].sort(),
      );
      assert.equal(
        after.operationalRoleQualifications.filter((row) => row.status === "ACTIVE").length,
        3,
      );

      const assignment = await prisma.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId: employee.id,
          serviceDate: new Date("2026-11-04T00:00:00.000Z"),
          roleKey: "SERVER",
          roleLabel: "Server",
          source: "MANUAL",
        },
      });
      await replaceEmployeeOperationalQualifications(prisma, {
        facilityId: facility.id,
        employeeId: employee.id,
        departmentId: dietary.id,
        roleKeys: ["HOT_PREP"],
      });
      const historical = await prisma.operationalAssignment.findFirstOrThrow({
        where: { id: assignment.id },
        select: { roleKey: true, roleLabel: true },
      });
      assert.equal(historical.roleKey, "SERVER");
      assert.equal(historical.roleLabel, "Server");

      const exceptionAssignment = await prisma.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId: employee.id,
          serviceDate: new Date("2026-11-05T00:00:00.000Z"),
          roleKey: "COOK",
          roleLabel: "Cook",
          source: "SUPERVISOR_OVERRIDE",
        },
      });
      await prisma.operationalAssignmentEligibilityException.create({
        data: {
          assignmentId: exceptionAssignment.id,
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId: employee.id,
          roleKey: "COOK",
          reason: "Only closer on the floor",
        },
      });
      await prisma.operationalAssignment.update({
        where: { id: exceptionAssignment.id },
        data: { roleKey: "DISHWASHING", roleLabel: "Dishwashing" },
      });
      await prisma.operationalAssignmentEligibilityException.create({
        data: {
          assignmentId: exceptionAssignment.id,
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId: employee.id,
          roleKey: "DISHWASHING",
          reason: "Moved to dish for the close",
        },
      });
      const events = await prisma.operationalAssignmentEligibilityException.findMany({
        where: { assignmentId: exceptionAssignment.id },
        orderBy: { createdAt: "asc" },
        select: { roleKey: true, reason: true },
      });
      assert.deepEqual(
        events.map((event) => `${event.roleKey}:${event.reason}`),
        [
          "COOK:Only closer on the floor",
          "DISHWASHING:Moved to dish for the close",
        ],
      );
      const cookQualification = await prisma.employeeOperationalRoleQualification.count({
        where: { employeeId: employee.id, departmentId: dietary.id, roleKey: "COOK", status: "ACTIVE" },
      });
      assert.equal(cookQualification, 0);
      const dishwashingQualification = await prisma.employeeOperationalRoleQualification.count({
        where: {
          employeeId: employee.id,
          departmentId: dietary.id,
          roleKey: "DISHWASHING",
          status: "ACTIVE",
        },
      });
      assert.equal(dishwashingQualification, 0);
      const stillStaff = await prisma.employee.findFirstOrThrow({
        where: { id: employee.id },
        select: { roleType: true },
      });
      assert.equal(stillStaff.roleType, "STAFF");
    } finally {
      await prisma.operationalAssignmentEligibilityException.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.operationalAssignment.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.employeeOperationalRoleQualification.deleteMany({
        where: { facility: { organization: { name: { contains: suffix } } } },
      });
      await prisma.employeeTeamMembership.deleteMany({
        where: { employee: { facility: { organization: { name: { contains: suffix } } } } },
      });
      await prisma.departmentTeam.deleteMany({
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
      await prisma.facility.deleteMany({
        where: { organization: { name: { contains: suffix } } },
      });
      await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
      await prisma.$disconnect();
    }
  },
);
