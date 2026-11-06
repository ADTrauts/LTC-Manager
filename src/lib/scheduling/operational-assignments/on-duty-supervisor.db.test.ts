/**
 * On-duty supervisory responsibility.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { RECIPIENT_UNRESOLVED_CAUSE, resolveNotificationRecipients } from "@/lib/notifications/recipient-resolver";

import { resolveOnDutySupervisorResponsibility } from "./resolve-on-duty-supervisor";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("on-duty responsibility follows the assignment, not the supervisor role", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const zone = "America/New_York";
  const serviceDate = facilityLocalDateToServiceDate("2026-10-29");
  const at = parseFacilityLocalScheduledStartOnDate("11:30", "2026-10-29", zone)!;
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Duty ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Duty Terrace ${suffix}`, timezone: zone },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Duty Other ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const evs = await db.department.create({
      data: { facilityId: facility.id, key: "EVS", name: "Environmental Services" },
    });
    const plant = await db.department.create({
      data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
    });
    const otherDietary = await db.department.create({
      data: { facilityId: otherFacility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const floor = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: `Floor 1 ${suffix}`,
        unitType: "RESIDENT_AREA",
        hierarchyRole: "FLOOR",
      },
    });
    const neighborhood = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: `1B ${suffix}`,
        unitType: "RESIDENT_AREA",
        hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: floor.id,
      },
    });
    const space = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: neighborhood.id,
        name: `1B room ${suffix}`,
        spaceType: "PATIENT_ROOM",
      },
    });

    async function employee(input: { label: string; user: boolean; facilityId?: string }) {
      const facilityId = input.facilityId ?? facility.id;
      let userId: string | null = null;
      if (input.user) {
        const user = await db.user.create({
          data: {
            email: `duty-${input.label}-${suffix}@example.test`,
            displayName: `Duty ${input.label}`,
            facilityId,
            roleId: staffRole.id,
            passwordHash: "hash",
            emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
        userIds.push(user.id);
        userId = user.id;
        const access = await db.userFacilityAccess.create({
          data: { userId: user.id, facilityId, isActive: true },
        });
        await db.userFacilityRolePeriod.create({
          data: {
            userFacilityAccessId: access.id,
            roleKey: input.label === "role-only" ? RoleKey.SUPERVISOR : RoleKey.STAFF,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      return db.employee.create({
        data: {
          facilityId,
          userId,
          firstName: "Duty",
          lastName: input.label,
          roleType: input.label === "role-only" ? RoleKey.SUPERVISOR : RoleKey.STAFF,
          primaryDepartmentId: dietary.id,
        },
      });
    }

    const floorSupervisor = await employee({ label: "floor", user: true });
    const roomSupervisor = await employee({ label: "room", user: true });
    const calledOff = await employee({ label: "absent", user: true });
    const replacement = await employee({ label: "replacement", user: true });
    const unlinked = await employee({ label: "unlinked", user: false });
    const roleOnly = await employee({ label: "role-only", user: true });
    const evsSupervisor = await employee({ label: "evs", user: true });
    const plantSupervisor = await employee({ label: "plant", user: true });
    assert.ok(roleOnly.userId);

    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: floorSupervisor.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
        unitId: floor.id,
        startsAt: parseFacilityLocalScheduledStartOnDate("07:00", "2026-10-29", zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("15:30", "2026-10-29", zone),
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: roomSupervisor.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
        startsAt: parseFacilityLocalScheduledStartOnDate("07:00", "2026-10-29", zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("15:30", "2026-10-29", zone),
        locations: { create: { unitSpaceId: space.id, unitId: neighborhood.id, labelSnapshot: "1B" } },
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: calledOff.id,
        serviceDate,
        roleKey: "SERVER",
        roleLabel: "Server",
        unitId: neighborhood.id,
      },
    });
    const morning = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: calledOff.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
        unitId: neighborhood.id,
        startsAt: parseFacilityLocalScheduledStartOnDate("07:00", "2026-10-29", zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("10:30", "2026-10-29", zone),
      },
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: calledOff.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "FULL_DAY",
        calledOffAt: at,
        callOffReason: "Called off",
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: replacement.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
        unitId: neighborhood.id,
        source: "CALL_OFF_REPLACEMENT",
        startsAt: parseFacilityLocalScheduledStartOnDate("10:30", "2026-10-29", zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("15:30", "2026-10-29", zone),
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: evs.id,
        employeeId: evsSupervisor.id,
        serviceDate,
        roleKey: "EVS_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: plant.id,
        employeeId: unlinked.id,
        serviceDate,
        roleKey: "PLANT_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor Rounding",
      },
    });

    const room = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: "2026-10-29",
      at,
      spaceId: space.id,
    });
    assert.equal(room.status, "resolved");
    if (room.status === "resolved") {
      assert.deepEqual(room.assignments.map((item) => item.employeeId), [roomSupervisor.id]);
      assert.equal(room.assignments.some((item) => item.employeeId === roleOnly.id), false);
      assert.equal(room.assignments.some((item) => item.employeeId === floorSupervisor.id), false);
    }

    const before = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: "2026-10-29",
      at: parseFacilityLocalScheduledStartOnDate("09:00", "2026-10-29", zone)!,
      unitId: neighborhood.id,
    });
    assert.equal(before.status, "resolved");
    if (before.status === "resolved") {
      assert.equal(before.assignments[0]?.employeeId, floorSupervisor.id);
      assert.equal(before.assignments.some((item) => item.assignmentId === morning.id), false);
    }

    const after = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: "2026-10-29",
      at,
      unitId: neighborhood.id,
    });
    assert.equal(after.status, "resolved");
    if (after.status === "resolved") {
      assert.deepEqual(after.assignments.map((item) => item.employeeId), [replacement.id]);
    }

    const evsDuty = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: evs.id,
      serviceDate: "2026-10-29",
      at,
    });
    assert.equal(evsDuty.status, "resolved");
    if (evsDuty.status === "resolved") {
      assert.deepEqual(evsDuty.assignments.map((item) => item.employeeId), [evsSupervisor.id]);
    }

    const plantDuty = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: plant.id,
      serviceDate: "2026-10-29",
      at,
    });
    assert.equal(plantDuty.status, "resolved");
    if (plantDuty.status === "resolved") {
      assert.deepEqual(plantDuty.assignments.map((item) => item.employeeId), [unlinked.id]);
    }

    const wrongDepartment = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: evs.id,
      serviceDate: "2026-10-29",
      at,
      unitId: neighborhood.id,
    });
    assert.equal(wrongDepartment.status, "resolved");
    if (wrongDepartment.status === "resolved") {
      assert.equal(wrongDepartment.assignments.some((item) => item.employeeId === floorSupervisor.id), false);
    }

    const other = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: otherFacility.id,
      departmentId: dietary.id,
      serviceDate: "2026-10-29",
      at,
    });
    assert.deepEqual(other, { status: "not_applicable", reason: "department_not_in_facility" });

    const otherDepartment = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: otherFacility.id,
      departmentId: otherDietary.id,
      serviceDate: "2026-10-29",
      at,
    });
    assert.deepEqual(otherDepartment, { status: "uncovered", reason: "no_assignment" });

    const early = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: "2026-10-29",
      at: parseFacilityLocalScheduledStartOnDate("06:00", "2026-10-29", zone)!,
      unitId: floor.id,
    });
    assert.deepEqual(early, { status: "uncovered", reason: "outside_window" });

    const delivered = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_DUTY_SUPERVISOR"],
      onDuty: { serviceDate: "2026-10-29", at, spaceId: space.id },
    });
    assert.equal(delivered.resolved.length, 1);
    assert.equal(delivered.resolved[0]?.userId, roomSupervisor.userId);
    assert.equal(
      delivered.resolved[0]?.explanation,
      "You received this because you are the on-duty supervisor responsible for this location.",
    );
    assert.equal(delivered.resolved.some((row) => row.userId === roleOnly.userId), false);

    const plantNotice = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: plant.id,
      audience: "floor",
      reasons: ["ON_DUTY_SUPERVISOR"],
      onDuty: { serviceDate: "2026-10-29", at },
    });
    assert.deepEqual(plantNotice.resolved, []);
    assert.equal(plantNotice.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.employeeNotLinked);
    assert.equal(plantNotice.resolved.some((row) => row.userId === roleOnly.userId), false);
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.scheduleEntry.deleteMany({ where: { employee: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalAssignment.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.unitSpace.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.unit.updateMany({
      where: { facility: { displayName: { contains: suffix } } },
      data: { parentUnitId: null },
    });
    await db.unit.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.department.updateMany({
      where: { facility: { displayName: { contains: suffix } } },
      data: { headEmployeeId: null },
    });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
