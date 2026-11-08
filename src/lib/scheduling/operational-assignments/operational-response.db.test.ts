/**
 * Operational response responsibility.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import { parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";
import { RECIPIENT_UNRESOLVED_CAUSE, resolveNotificationRecipients } from "@/lib/notifications/recipient-resolver";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { resolveOnDutySupervisorResponsibility } from "./resolve-on-duty-supervisor";
import { resolveOperationalResponseResponsibility } from "./resolve-operational-response";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("on-call coverage names the responder, not the supervisor or the department head", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const zone = "America/New_York";
  const day = "2026-10-29";
  const at = parseFacilityLocalScheduledStartOnDate("11:30", day, zone)!;
  const serviceDate = new Date("2026-10-29T00:00:00.000Z");
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Response ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Response Terrace ${suffix}`, timezone: zone },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Response Other ${suffix}`, timezone: zone },
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
      data: { facilityId: facility.id, name: `Floor ${suffix}`, unitType: "RESIDENT_AREA", hierarchyRole: "FLOOR" },
    });

    async function employee(input: { label: string; user: boolean; departmentId: string; role?: RoleKey }) {
      let userId: string | null = null;
      if (input.user) {
        const user = await db.user.create({
          data: {
            email: `response-${input.label}-${suffix}@example.test`,
            displayName: `Response ${input.label}`,
            facilityId: facility.id,
            roleId: staffRole.id,
            passwordHash: "hash",
            emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
        userIds.push(user.id);
        userId = user.id;
        const access = await db.userFacilityAccess.create({
          data: { userId: user.id, facilityId: facility.id, isActive: true },
        });
        await db.userFacilityRolePeriod.create({
          data: {
            userFacilityAccessId: access.id,
            roleKey: input.role ?? RoleKey.STAFF,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      return db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Response",
          lastName: input.label,
          roleType: input.role ?? RoleKey.STAFF,
          primaryDepartmentId: input.departmentId,
        },
      });
    }

    const primary = await employee({ label: "primary", user: true, departmentId: dietary.id });
    const second = await employee({ label: "second", user: true, departmentId: dietary.id });
    const located = await employee({ label: "located", user: true, departmentId: dietary.id });
    const unlinked = await employee({ label: "unlinked", user: false, departmentId: dietary.id });
    const absent = await employee({ label: "absent", user: true, departmentId: dietary.id });
    const night = await employee({ label: "night", user: true, departmentId: dietary.id });
    const decoy = await employee({ label: "decoy", user: true, departmentId: dietary.id });
    const cancelled = await employee({ label: "cancelled", user: true, departmentId: dietary.id });
    const manager = await employee({ label: "manager", user: true, departmentId: dietary.id, role: RoleKey.SUPERVISOR });
    const rounding = await employee({ label: "rounding", user: true, departmentId: dietary.id, role: RoleKey.SUPERVISOR });
    const evsResponder = await employee({ label: "evs", user: true, departmentId: evs.id });
    const plantResponder = await employee({ label: "plant", user: true, departmentId: plant.id });
    const plantWork = await employee({ label: "plant-work", user: true, departmentId: plant.id });
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: manager.id } });

    const window = {
      startsAt: parseFacilityLocalScheduledStartOnDate("07:00", day, zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("19:00", day, zone),
    };
    async function cover(input: {
      employeeId: string;
      departmentId: string;
      roleKey: string;
      roleLabel: string;
      unitId?: string | null;
      status?: "PLANNED" | "CANCELLED";
      startsAt?: Date | null;
      endsAt?: Date | null;
      serviceDate?: Date;
    }) {
      return db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: input.departmentId,
          employeeId: input.employeeId,
          serviceDate: input.serviceDate ?? serviceDate,
          roleKey: input.roleKey,
          roleLabel: input.roleLabel,
          unitId: input.unitId ?? null,
          status: input.status ?? "PLANNED",
          startsAt: input.startsAt === undefined ? window.startsAt : input.startsAt,
          endsAt: input.endsAt === undefined ? window.endsAt : input.endsAt,
        },
      });
    }

    const first = await cover({
      employeeId: primary.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
    });
    const paired = await cover({
      employeeId: second.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
    });
    const unlinkedAssignment = await cover({
      employeeId: unlinked.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
    });
    await cover({
      employeeId: located.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      unitId: floor.id,
    });
    await cover({
      employeeId: absent.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      startsAt: parseFacilityLocalScheduledStartOnDate("19:00", day, zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("21:00", day, zone),
    });
    await cover({
      employeeId: cancelled.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      status: "CANCELLED",
    });
    await cover({
      employeeId: night.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      serviceDate: new Date("2026-10-30T00:00:00.000Z"),
      startsAt: parseFacilityLocalScheduledStartOnDate("19:00", "2026-10-30", zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("07:00", "2026-10-31", zone),
    });
    await cover({
      employeeId: decoy.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      serviceDate: new Date("2026-10-30T00:00:00.000Z"),
      startsAt: null,
      endsAt: null,
    });
    await cover({
      employeeId: primary.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_SUPERVISOR_ROUNDING",
      roleLabel: "Supervisor Rounding",
    });
    await cover({
      employeeId: rounding.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_SUPERVISOR_ROUNDING",
      roleLabel: "Supervisor Rounding",
    });
    await cover({
      employeeId: evsResponder.id,
      departmentId: evs.id,
      roleKey: "EVS_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
    });
    await cover({
      employeeId: plantResponder.id,
      departmentId: plant.id,
      roleKey: "ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
    });
    await cover({
      employeeId: plantWork.id,
      departmentId: plant.id,
      roleKey: "WORK_ORDER_RESPONSE",
      roleLabel: "Work Order Response",
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: absent.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "FULL_DAY",
        calledOffAt: at,
        callOffReason: "Called off",
        plannedStart: "19:00",
        plannedEnd: "21:00",
      },
    });

    const query = {
      facilityId: facility.id,
      departmentId: dietary.id,
      at,
    };
    const open = await resolveOperationalResponseResponsibility(db, query);
    assert.equal(open.status, "resolved");
    if (open.status === "resolved") {
      const expected = [first, paired, unlinkedAssignment]
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .map((row) => row.employeeId);
      assert.deepEqual(
        open.assignments.map((row) => row.employeeId),
        expected,
      );
      assert.equal(open.assignments.some((row) => row.employeeId === manager.id), false);
      assert.equal(open.assignments.some((row) => row.employeeId === rounding.id), false);
      assert.equal(open.assignments.some((row) => row.employeeId === cancelled.id), false);
    }

    const locatedResult = await resolveOperationalResponseResponsibility(db, { ...query, unitId: floor.id });
    assert.equal(locatedResult.status, "resolved");
    if (locatedResult.status === "resolved") {
      assert.deepEqual(locatedResult.assignments.map((row) => row.employeeId), [located.id]);
    }

    const otherDepartment = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: evs.id,
      at,
    });
    assert.equal(otherDepartment.status, "resolved");
    if (otherDepartment.status === "resolved") {
      assert.deepEqual(otherDepartment.assignments.map((row) => row.employeeId), [evsResponder.id]);
    }

    const plantResult = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: plant.id,
      at,
    });
    assert.equal(plantResult.status, "resolved");
    if (plantResult.status === "resolved") {
      assert.deepEqual(plantResult.assignments.map((row) => row.employeeId), [plantResponder.id]);
    }

    const wrongFacility = await resolveOperationalResponseResponsibility(db, {
      facilityId: otherFacility.id,
      departmentId: dietary.id,
      at,
    });
    assert.deepEqual(wrongFacility, { status: "not_applicable", reason: "department_not_in_facility" });
    const otherDepartmentInFacility = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: otherDietary.id,
      at,
    });
    assert.deepEqual(otherDepartmentInFacility, { status: "not_applicable", reason: "department_not_in_facility" });

    const late = await resolveOperationalResponseResponsibility(db, {
      ...query,
      at: parseFacilityLocalScheduledStartOnDate("20:30", day, zone)!,
    });
    assert.deepEqual(late, { status: "uncovered", reason: "called_off" });

    const overnight = await resolveOperationalResponseResponsibility(db, {
      ...query,
      at: parseFacilityLocalScheduledStartOnDate("02:00", "2026-10-31", zone)!,
    });
    assert.equal(overnight.status, "resolved");
    if (overnight.status === "resolved") {
      assert.deepEqual(overnight.assignments.map((row) => row.employeeId), [night.id]);
    }

    const empty = await resolveOperationalResponseResponsibility(db, {
      ...query,
      at: parseFacilityLocalScheduledStartOnDate("11:30", "2026-11-02", zone)!,
    });
    assert.deepEqual(empty, { status: "uncovered", reason: "no_assignment" });

    const duty = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: day,
      at,
    });
    assert.equal(duty.status, "resolved");
    if (duty.status === "resolved") {
      const dutyIds = duty.assignments.map((row) => row.employeeId);
      assert.equal(dutyIds.includes(primary.id), true);
      assert.equal(dutyIds.includes(rounding.id), true);
      assert.equal(dutyIds.includes(second.id), false);
    }

    const delivered = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_CALL_RESPONDER"],
      onCall: { at },
    });
    const deliveredIds = delivered.resolved.map((row) => row.userId).sort();
    assert.deepEqual(deliveredIds, [primary.userId, second.userId].sort());
    assert.equal(delivered.resolved.every((row) => row.reason === "ON_CALL_RESPONDER"), true);
    assert.equal(
      delivered.resolved[0]?.explanation,
      "You received this because you are assigned On-Call Coverage for this Department.",
    );
    assert.equal(delivered.resolved.some((row) => row.userId === manager.userId), false);
    assert.equal(delivered.resolved.some((row) => row.userId === rounding.userId), false);
    assert.equal(
      delivered.unresolved.some((row) => row.cause === RECIPIENT_UNRESOLVED_CAUSE.employeeNotLinked),
      true,
    );

    const missing = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_CALL_RESPONDER"],
    });
    assert.equal(missing.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityNotAvailable);
    assert.equal(missing.resolved.some((row) => row.userId === manager.userId), false);
  } finally {
    await db.scheduleEntry.deleteMany({ where: { employee: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalAssignment.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.unit.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.department.updateMany({
      where: { facility: { displayName: { contains: suffix } } },
      data: { headEmployeeId: null },
    });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
