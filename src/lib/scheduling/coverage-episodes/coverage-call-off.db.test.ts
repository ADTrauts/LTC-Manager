/**
 * A call-off changes Coverage. It does not publish shift.called_off.
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
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { markShiftsCalledOff } from "@/lib/scheduling/people-coverage";

import { loadCoverageSlotSnapshot } from "./observe";
import { recordCoverageEpisodeTransitions } from "./record";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("a call-off opens Coverage attention and a replacement closes the same episode", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const serviceDate = facilityLocalDateToServiceDate("2026-10-29");
  const duringService = parseFacilityLocalScheduledStartOnDate("08:00", "2026-10-29", zone)!;
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Calloff ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Calloff Terrace ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const plant = await db.department.create({
      data: { facilityId: facility.id, key: "PLANT", name: "Plant" },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Neighborhood ${suffix}`, unitType: "RESIDENT_AREA", hierarchyRole: "NEIGHBORHOOD" },
    });
    const space = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: unit.id, name: `Dining ${suffix}`, spaceType: "SERVICE_AREA" },
    });
    const otherSpace = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: unit.id, name: `Other ${suffix}`, spaceType: "SERVICE_AREA" },
    });
    await db.unitSpaceResponsibility.create({ data: { spaceId: space.id, departmentId: dietary.id } });
    await db.unitSpaceResponsibility.create({ data: { spaceId: otherSpace.id, departmentId: dietary.id } });
    const profile = await db.departmentOperationalProfile.create({
      data: { facilityId: facility.id, departmentId: dietary.id, name: "Food", version: 1, status: "ACTIVE" },
    });
    const archetype = await db.departmentRoomArchetype.create({
      data: { profileId: profile.id, key: "SERVERY", name: "Servery" },
    });
    await db.departmentRoomArchetypeBinding.create({
      data: { profileId: profile.id, archetypeId: archetype.id, unitSpaceId: space.id },
    });
    await db.departmentRoomArchetypeBinding.create({
      data: { profileId: profile.id, archetypeId: archetype.id, unitSpaceId: otherSpace.id },
    });
    await db.departmentOperationalCycle.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: "breakfast",
        label: "Breakfast",
        cycleType: "SERVICE",
        startLocal: "07:00",
        endLocal: "10:00",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: facilityLocalDateToServiceDate("2026-01-01"),
        status: "PUBLISHED",
      },
    });
    const template = await db.operationalAssignmentTemplate.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: `calloff-${suffix}`,
        name: "Breakfast coverage",
        status: "PUBLISHED",
        isActive: true,
        items: {
          create: [
            {
              roleKey: "SERVER",
              roleLabel: "Server",
              requiredCount: 1,
              spaceId: space.id,
              sortOrder: 0,
              applicableOperationalCycleStableKeys: ["breakfast"],
            },
            {
              roleKey: "SERVER",
              roleLabel: "Server",
              requiredCount: 1,
              spaceId: otherSpace.id,
              sortOrder: 1,
              applicableOperationalCycleStableKeys: ["breakfast"],
            },
          ],
        },
      },
    });
    const plan = await db.operationalAssignmentPlan.create({
      data: { facilityId: facility.id, departmentId: dietary.id, serviceDate, status: "CONFIRMED" },
    });

    async function person(label: string) {
      const user = await db.user.create({
        data: {
          email: `calloff-${label}-${suffix}@example.test`,
          displayName: label,
          facilityId: facility.id,
          roleId: staffRole.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: facility.id, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: { userFacilityAccessId: access.id, roleKey: RoleKey.STAFF, startsAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      return db.employee.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          firstName: "Call",
          lastName: label,
          roleType: RoleKey.STAFF,
          primaryDepartmentId: dietary.id,
        },
      });
    }

    async function assign(employeeId: string, spaceId: string, startsAt?: Date | null, endsAt?: Date | null) {
      const row = await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          planId: plan.id,
          employeeId,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "PLANNED",
          unitId: unit.id,
          startsAt: startsAt ?? null,
          endsAt: endsAt ?? null,
        },
      });
      await db.operationalAssignmentLocation.create({
        data: { assignmentId: row.id, unitSpaceId: spaceId, unitId: unit.id, labelSnapshot: "Dining" },
      });
      return row;
    }

    const server = await person("server");
    const replacement = await person("replacement");
    const supervisor = await person("supervisor");
    const otherRoom = await person("other-room");
    const outside = await person("outside");
    const plantPerson = await person("plant");
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        planId: plan.id,
        employeeId: supervisor.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor rounding",
        status: "PLANNED",
        unitId: unit.id,
      },
    });
    await assign(server.id, space.id);
    await assign(
      outside.id,
      space.id,
      parseFacilityLocalScheduledStartOnDate("14:00", "2026-10-29", zone),
      parseFacilityLocalScheduledStartOnDate("15:00", "2026-10-29", zone),
    );
    await assign(otherRoom.id, otherSpace.id);
    await db.scheduleEntry.create({
      data: {
        employeeId: server.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "BREAKFAST",
        plannedStart: "07:00",
        plannedEnd: "15:00",
      },
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: outside.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "DINNER",
        plannedStart: "14:00",
        plannedEnd: "15:00",
      },
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: plantPerson.id,
        departmentId: plant.id,
        date: serviceDate,
        shift: "FULL_DAY",
        plannedStart: "07:00",
        plannedEnd: "15:00",
      },
    });

    const scope = { facilityId: facility.id, departmentId: dietary.id, serviceDateKey: "2026-10-29" };
    const before = await loadCoverageSlotSnapshot(db, scope);
    const slot = [...before.values()].find((row) => row.spaceId === space.id && row.responsibility === "SERVER");
    assert.ok(slot);
    assert.equal(slot.state, "COVERED");

    const first = await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: server.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.equal(first.marked, 1);
    assert.equal(first.attentionOutboxIds.length, 1);
    const opened = await db.notificationOutbox.findUniqueOrThrow({ where: { id: first.attentionOutboxIds[0] } });
    assert.equal(opened.eventType, "coverage.became_uncovered");
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "shift.called_off" } }),
      0,
    );
    const afterCallOff = await loadCoverageSlotSnapshot(db, scope);
    assert.equal(afterCallOff.get(slot.key)?.state, "UNCOVERED");
    const otherSlot = [...afterCallOff.values()].find(
      (row) => row.spaceId === otherSpace.id && row.responsibility === "SERVER",
    );
    assert.equal(otherSlot?.state, "COVERED");
    const episode = await db.coverageEpisode.findFirstOrThrow({
      where: { facilityId: facility.id, spaceId: space.id, responsibility: "SERVER", closedAt: null },
    });

    const repeat = await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: server.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.deepEqual(repeat.attentionOutboxIds, []);
    assert.equal(
      await db.coverageEpisodeTransition.count({ where: { episodeId: episode.id } }),
      1,
    );

    await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: outside.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.equal((await loadCoverageSlotSnapshot(db, scope)).get(slot.key)?.state, "UNCOVERED");
    assert.equal(await db.coverageEpisode.count({ where: { facilityId: facility.id, closedAt: null } }), 1);

    const restoredIds = await db.$transaction(async (tx) => {
      const coverageBefore = await loadCoverageSlotSnapshot(tx, scope);
      const row = await tx.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          planId: plan.id,
          employeeId: replacement.id,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "PLANNED",
          unitId: unit.id,
        },
      });
      await tx.operationalAssignmentLocation.create({
        data: { assignmentId: row.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: "Dining" },
      });
      return recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: coverageBefore,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: row.id,
      });
    });
    assert.equal(restoredIds.length, 1);
    const restoredEvent = await db.notificationOutbox.findUniqueOrThrow({ where: { id: restoredIds[0] } });
    assert.equal(restoredEvent.eventType, "coverage.restored");
    await processNotificationOutboxRow(db, { outboxId: restoredIds[0]! });
    const closed = await db.coverageEpisode.findUniqueOrThrow({ where: { id: episode.id } });
    assert.equal(closed.closeReason, "RESTORED");
    assert.equal((await loadCoverageSlotSnapshot(db, scope)).get(slot.key)?.state, "COVERED");

    const item = await db.operationalAssignmentTemplateItem.findFirstOrThrow({
      where: { templateId: template.id },
    });
    await db.operationalAssignmentTemplateItem.update({
      where: { id: item.id },
      data: { requiredCount: 2 },
    });
    const second = await person("second");
    await assign(second.id, space.id);
    const twoBefore = await loadCoverageSlotSnapshot(db, scope);
    assert.equal(twoBefore.get(slot.key)?.state, "COVERED");
    await db.scheduleEntry.create({
      data: {
        employeeId: second.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "BREAKFAST",
        plannedStart: "07:00",
        plannedEnd: "15:00",
      },
    });
    const droppedOne = await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: second.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.equal(droppedOne.attentionOutboxIds.length, 1);
    const atRisk = await db.notificationOutbox.findUniqueOrThrow({ where: { id: droppedOne.attentionOutboxIds[0] } });
    assert.equal(atRisk.eventType, "coverage.became_at_risk");
    assert.equal((await loadCoverageSlotSnapshot(db, scope)).get(slot.key)?.state, "AT_RISK");
    const sameEpisode = await db.coverageEpisode.findFirstOrThrow({
      where: { facilityId: facility.id, spaceId: space.id, responsibility: "SERVER", closedAt: null },
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: replacement.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "BREAKFAST",
        plannedStart: "07:00",
        plannedEnd: "15:00",
      },
    });
    const droppedBoth = await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: replacement.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.equal(droppedBoth.attentionOutboxIds.length, 1);
    const uncovered = await db.notificationOutbox.findUniqueOrThrow({ where: { id: droppedBoth.attentionOutboxIds[0] } });
    assert.equal(uncovered.eventType, "coverage.became_uncovered");
    assert.equal((await loadCoverageSlotSnapshot(db, scope)).get(slot.key)?.state, "UNCOVERED");
    assert.equal(
      await db.coverageEpisode.count({
        where: { facilityId: facility.id, spaceId: space.id, responsibility: "SERVER" },
      }),
      2,
    );
    const stillOpen = await db.coverageEpisode.findUniqueOrThrow({ where: { id: sameEpisode.id } });
    assert.equal(stillOpen.closedAt, null);
    assert.equal(
      await db.coverageEpisodeTransition.count({ where: { episodeId: sameEpisode.id } }),
      2,
    );

    await db.operationalAssignmentTemplateItem.update({
      where: { id: item.id },
      data: { requiredCount: 1 },
    });
    await assign(plantPerson.id, space.id);
    await db.scheduleEntry.create({
      data: {
        employeeId: plantPerson.id,
        departmentId: plant.id,
        date: serviceDate,
        shift: "FULL_DAY",
        plannedStart: "07:00",
        plannedEnd: "15:00",
      },
    });
    const plantCallOff = await markShiftsCalledOff({
      facilityId: facility.id,
      employeeId: plantPerson.id,
      serviceDate: "2026-10-29",
      reason: "Sick",
      now: duringService,
    });
    assert.deepEqual(plantCallOff.attentionOutboxIds, []);
    assert.equal((await loadCoverageSlotSnapshot(db, scope)).get(slot.key)?.state, "COVERED");
  } finally {
    const facilities = await db.facility.findMany({
      where: { displayName: { contains: suffix } },
      select: { id: true },
    });
    const facilityIds = facilities.map((row) => row.id);
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
    });
    await db.notificationRecipient.deleteMany({ where: { notification: { facilityId: { in: facilityIds } } } });
    await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.coverageEpisodeTransition.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.coverageEpisode.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.scheduleEntry.deleteMany({ where: { employee: { facilityId: { in: facilityIds } } } });
    await db.operationalAssignmentLocation.deleteMany({
      where: { assignment: { facilityId: { in: facilityIds } } },
    });
    await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentTemplate.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalCycle.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalProfile.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unitSpace.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
    if (userIds.length > 0) {
      await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
      await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await db.organization.deleteMany({ where: { name: `Calloff ${suffix}` } });
    await db.$disconnect();
  }
});
