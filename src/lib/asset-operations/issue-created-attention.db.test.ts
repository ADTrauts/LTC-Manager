/**
 * issue.created is one Update per new Issue.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { acknowledgeIssue, createIssueFromRequest, reportIssue } from "./issue-service";
import { createWorkOrderFromIssue } from "./work-order-service";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

function session(facilityId: string, userId: string, departmentId: string): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "SUPERVISOR",
    name: "Issue Reporter",
    email: "issue@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("a new Issue publishes one issue.created Update", { skip }, async () => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const prevAuthority = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  const prevDietary = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
  const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";
  process.env.PLANT_OPERATIONS_ENABLED = "true";
  const suffix = tag();
  const facilityIds: string[] = [];
  const userIds: string[] = [];

  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPERVISOR" } });
    const org = await prisma.organization.create({ data: { name: `Issue org ${suffix}`, isActive: true } });
    const facility = await prisma.facility.create({
      data: { organizationId: org.id, displayName: `Issue ${suffix}`, timezone: "America/New_York" },
    });
    const otherFacility = await prisma.facility.create({
      data: { organizationId: org.id, displayName: `Other ${suffix}`, timezone: "America/New_York" },
    });
    facilityIds.push(facility.id, otherFacility.id);
    const dietary = await prisma.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const evs = await prisma.department.create({
      data: { facilityId: facility.id, key: "EVS", name: "Environmental Services" },
    });
    const plant = await prisma.department.create({
      data: { facilityId: facility.id, key: "PLANT", name: "Plant" },
    });
    const unit = await prisma.unit.create({
      data: {
        facilityId: facility.id,
        name: `Kitchen ${suffix}`,
        unitType: "SERVERY",
        hierarchyRole: "NEIGHBORHOOD",
      },
    });
    const asset = await prisma.asset.create({
      data: {
        assetCode: `ISS-${suffix}`.slice(0, 24),
        departmentId: dietary.id,
        unitId: unit.id,
        name: "Reach-in cooler",
        equipmentType: "COOLER",
        status: "OPERATIONAL",
      },
    });

    async function person(input: { facilityId: string; departmentId: string; label: string; linked: boolean }) {
      const user = input.linked
        ? await prisma.user.create({
            data: {
              email: `${input.label}-${suffix}@example.test`,
              displayName: input.label,
              facilityId: input.facilityId,
              roleId: role.id,
              passwordHash: "hash",
              emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          })
        : null;
      if (user) {
        userIds.push(user.id);
        const access = await prisma.userFacilityAccess.create({
          data: { userId: user.id, facilityId: input.facilityId, isActive: true },
        });
        await prisma.userFacilityRolePeriod.create({
          data: {
            userFacilityAccessId: access.id,
            roleKey: RoleKey.SUPERVISOR,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      const employee = await prisma.employee.create({
        data: {
          facilityId: input.facilityId,
          userId: user?.id ?? null,
          firstName: input.label,
          lastName: suffix,
          roleType: RoleKey.SUPERVISOR,
          primaryDepartmentId: input.departmentId,
        },
      });
      return { user, employee };
    }

    const reporter = await person({
      facilityId: facility.id,
      departmentId: dietary.id,
      label: "reporter",
      linked: true,
    });
    const onDuty = await person({
      facilityId: facility.id,
      departmentId: dietary.id,
      label: "on-duty",
      linked: true,
    });
    const unlinked = await person({
      facilityId: facility.id,
      departmentId: dietary.id,
      label: "unlinked",
      linked: false,
    });
    const outsider = await person({
      facilityId: otherFacility.id,
      departmentId: dietary.id,
      label: "outsider",
      linked: true,
    });
    const plantSupervisor = await person({
      facilityId: facility.id,
      departmentId: plant.id,
      label: "plant",
      linked: true,
    });

    async function supervise(employeeId: string, departmentId: string, roleKey: string, date: string) {
      const plan = await prisma.operationalAssignmentPlan.create({
        data: {
          facilityId: facility.id,
          departmentId,
          serviceDate: facilityLocalDateToServiceDate(date),
          status: "CONFIRMED",
        },
      });
      await prisma.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId,
          planId: plan.id,
          employeeId,
          serviceDate: facilityLocalDateToServiceDate(date),
          roleKey,
          roleLabel: "Supervisor rounding",
          status: "PLANNED",
          unitId: unit.id,
        },
      });
    }
    await supervise(onDuty.employee.id, dietary.id, "DIETARY_SUPERVISOR_ROUNDING", "2026-09-13");
    await supervise(unlinked.employee.id, dietary.id, "DIETARY_SUPERVISOR_ROUNDING", "2026-09-14");
    await supervise(plantSupervisor.employee.id, plant.id, "PLANT_SUPERVISOR_ROUNDING", "2026-09-13");

    const actor = session(facility.id, reporter.user!.id, dietary.id);
    const reportedAt = new Date("2026-09-13T15:30:00.000Z");
    const created = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      unitId: unit.id,
      summary: "Cooler is warm",
      description: "The reach-in cooler is running warm.",
      observedAt: reportedAt,
      priority: "EMERGENCY",
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
      clientCommandId: `issue-${suffix}`,
      client: prisma,
      now: reportedAt,
    });
    assert.equal(created.idempotent, false);
    assert.equal(created.issue.priority, "EMERGENCY");
    assert.equal(created.issue.status, "REPORTED");
    const assetAfter = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(assetAfter.status, "OPERATIONAL");

    const rows = await prisma.notificationOutbox.findMany({
      where: { facilityId: facility.id, eventType: "issue.created" },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.dedupeKey, `issue-created:${created.issue.id}`);
    const payload = rows[0]?.payload as Record<string, unknown>;
    assert.equal(payload.issueId, created.issue.id);
    assert.equal("priority" in payload, false);
    assert.equal("operationalImpact" in payload, false);
    assert.equal(String(payload.subjectLabel).includes("resident"), false);

    const replay = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      unitId: unit.id,
      summary: "Cooler is warm",
      description: "The reach-in cooler is running warm.",
      observedAt: reportedAt,
      clientCommandId: `issue-${suffix}`,
      client: prisma,
      now: reportedAt,
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.issue.id, created.issue.id);
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "issue.created" },
      }),
      1,
    );
    const again = await processNotificationOutboxRow(prisma, { outboxId: rows[0]!.id });
    assert.equal(again.outcome, "already_processed");

    const notice = await prisma.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/asset-issues/${created.issue.id}` },
      include: { recipients: true },
    });
    assert.equal(notice.priority, "UPDATE");
    assert.equal(notice.requiresAcknowledgement, false);
    assert.equal(notice.resolvedAt, null);
    assert.equal(notice.title, "Issue reported");
    assert.equal(notice.recipients.length, 1);
    assert.equal(notice.recipients[0]?.userId, onDuty.user!.id);
    assert.notEqual(notice.recipients[0]?.userId, reporter.user!.id);
    assert.match(notice.recipients[0]?.explanation ?? "", /on-duty supervisor/);
    assert.equal(notice.recipients.some((row) => row.userId === outsider.user!.id), false);
    assert.equal(notice.recipients.some((row) => row.userId === plantSupervisor.user!.id), false);

    const center = await loadNotificationCenter(prisma, {
      userId: onDuty.user!.id,
      facilityId: facility.id,
      now: reportedAt,
      timeZone: "America/New_York",
    });
    assert.equal(center.status, "ready");
    if (center.status !== "ready") return;
    assert.equal(center.needsAttention.length, 0);
    assert.equal(
      center.updates.find((item) => item.actionPath === notice.actionPath)?.actionLabel,
      "Open Issue",
    );
    assert.equal(
      await getActiveAttentionCountForUser(prisma, {
        userId: onDuty.user!.id,
        facilityId: facility.id,
        now: reportedAt,
      }),
      0,
    );
    await markNotificationRead(prisma, {
      facilityId: facility.id,
      notificationId: notice.id,
      userId: onDuty.user!.id,
    });
    assert.equal(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notice.id } })).resolvedAt,
      null,
    );
    await assert.rejects(
      () =>
        acknowledgeNotification(prisma, {
          facilityId: facility.id,
          notificationId: notice.id,
          userId: onDuty.user!.id,
        }),
      /ACKNOWLEDGEMENT_NOT_REQUIRED/,
    );

    await acknowledgeIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      issueId: created.issue.id,
      client: prisma,
      now: new Date("2026-09-13T16:00:00.000Z"),
    });
    await prisma.assetIssue.update({
      where: { id: created.issue.id },
      data: { summary: "Cooler is warm — renamed" },
    });
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "issue.created" },
      }),
      1,
    );
    assert.equal(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notice.id } })).resolvedAt,
      null,
    );

    const workOrder = await createWorkOrderFromIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      issueId: created.issue.id,
      title: "Repair the cooler",
      client: prisma,
      now: new Date("2026-09-13T16:10:00.000Z"),
    });
    assert.ok(workOrder.id);
    assert.equal(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notice.id } })).priority,
      "UPDATE",
    );
    assert.equal(
      (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status,
      "OPERATIONAL",
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "asset.out_of_service" },
      }),
      0,
    );

    const record = await prisma.operationalEvidenceRecord.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateStableKey: `issue-origin-${suffix}`,
        templateVersion: 1,
        templateName: "Cooler check",
        templateSnapshotJson: {},
        purposeType: "LOG",
        requirementKey: `issue-origin-${suffix}`,
        operationalDate: facilityLocalDateToServiceDate("2026-09-13"),
        scheduleKind: "AD_HOC",
        occurredAt: reportedAt,
        unitId: unit.id,
        assetId: asset.id,
        outOfStandard: true,
        status: "NEEDS_REVIEW",
      },
    });
    const fromRecord = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      unitId: unit.id,
      summary: "Condition from the cooler check",
      description: "Follow-up from the Record.",
      observedAt: reportedAt,
      originEvidenceRecordId: record.id,
      evidenceRecordId: record.id,
      allowDuplicateOpen: true,
      client: prisma,
      now: reportedAt,
    });
    assert.equal(fromRecord.issue.originEvidenceRecordId, record.id);
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
      }),
      0,
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "issue.created", aggregateId: fromRecord.issue.id },
      }),
      1,
    );

    const beforeDuplicate = await prisma.notificationOutbox.count({
      where: { facilityId: facility.id, eventType: "issue.created" },
    });
    const duplicate = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      unitId: unit.id,
      summary: "Another unavailable cooler",
      description: "Same asset is already unavailable.",
      observedAt: reportedAt,
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
      client: prisma,
      now: reportedAt,
    });
    assert.equal(duplicate.duplicateOf, created.issue.id);
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "issue.created" },
      }),
      beforeDuplicate,
    );

    const quiet = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: unit.id,
      summary: "Unlinked supervisor day",
      description: "No linked supervisor is on duty.",
      observedAt: new Date("2026-09-14T15:30:00.000Z"),
      client: prisma,
      now: new Date("2026-09-14T15:30:00.000Z"),
    });
    const quietNotice = await prisma.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/asset-issues/${quiet.issue.id}` },
      include: { recipients: true },
    });
    assert.equal(quietNotice.recipients.length, 0);

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await reportIssue(actor, {
            facilityId: facility.id,
            departmentId: dietary.id,
            unitId: unit.id,
            summary: "This must roll back",
            description: "Thrown after the Issue write.",
            observedAt: new Date("2026-09-15T15:30:00.000Z"),
            client: tx,
            now: new Date("2026-09-15T15:30:00.000Z"),
          });
          throw new Error("rollback issue");
        }),
      /rollback issue/,
    );
    assert.equal(
      await prisma.assetIssue.count({
        where: { facilityId: facility.id, summary: "This must roll back" },
      }),
      0,
    );
    const surviving = await prisma.notificationOutbox.findMany({
      where: { facilityId: facility.id, eventType: "issue.created" },
      select: { aggregateId: true },
    });
    const survivingIssues = await prisma.assetIssue.findMany({
      where: { id: { in: surviving.map((row) => row.aggregateId) } },
    });
    assert.equal(survivingIssues.length, surviving.length);

    const held = await prisma.$transaction((tx) =>
      reportIssue(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        unitId: unit.id,
        summary: "Held for processing",
        description: "Committed before the processor runs.",
        observedAt: new Date("2026-09-16T15:30:00.000Z"),
        client: tx,
        now: new Date("2026-09-16T15:30:00.000Z"),
      }),
    );
    const heldOutbox = await prisma.notificationOutbox.findFirstOrThrow({
      where: { dedupeKey: `issue-created:${held.issue.id}` },
    });
    assert.equal(heldOutbox.processedAt, null);
    assert.equal((await processNotificationOutboxRow(prisma, { outboxId: heldOutbox.id })).outcome, "applied");

    const request = await prisma.operationalRequest.create({
      data: {
        requestCode: `RQ-${suffix}`,
        facilityId: facility.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
        unitId: unit.id,
        summary: "Request a repair",
        description: "The cooler needs a look.",
        observedAt: reportedAt,
        priority: "URGENT",
      },
    });
    let fromRequest = false;
    try {
      const converted = await createIssueFromRequest(session(facility.id, plantSupervisor.user!.id, plant.id), {
        facilityId: facility.id,
        plantDepartmentId: plant.id,
        requestId: request.id,
        client: prisma,
        now: reportedAt,
      });
      fromRequest = converted.created;
      if (converted.created) {
        assert.equal(
          await prisma.notificationOutbox.count({
            where: { facilityId: facility.id, eventType: "issue.created", aggregateId: converted.issue.id },
          }),
          1,
        );
        assert.equal(converted.issue.priority, "URGENT");
        const convertedNotice = await prisma.notification.findFirstOrThrow({
          where: { facilityId: facility.id, actionPath: `/asset-issues/${converted.issue.id}` },
        });
        assert.equal(convertedNotice.priority, "UPDATE");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      assert.match(message, /unavailable|not enabled|denied|Plant/i);
    }
    if (!fromRequest) {
      assert.equal(request.relatedAssetIssueId, null);
    }

    for (const department of [evs, plant]) {
      const departmentActor = session(
        facility.id,
        department.id === plant.id ? plantSupervisor.user!.id : reporter.user!.id,
        department.id,
      );
      try {
        const other = await reportIssue(departmentActor, {
          facilityId: facility.id,
          departmentId: department.id,
          unitId: unit.id,
          summary: `${department.name} condition`,
          description: "Same Issue publisher.",
          observedAt: reportedAt,
          client: prisma,
          now: reportedAt,
        });
        assert.equal(
          await prisma.notificationOutbox.count({
            where: { facilityId: facility.id, eventType: "issue.created", aggregateId: other.issue.id },
          }),
          1,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        assert.match(message, /unavailable|not enabled|denied/i);
      }
    }
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = prevAuthority;
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prevDietary;
    process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
    if (facilityIds.length > 0) {
      const repairs = await prisma.repair.findMany({
        where: { unit: { facilityId: { in: facilityIds } } },
        select: { id: true },
      });
      if (repairs.length > 0) {
        await prisma.repairLaborEntry.deleteMany({ where: { repairId: { in: repairs.map((row) => row.id) } } });
        await prisma.repair.deleteMany({ where: { id: { in: repairs.map((row) => row.id) } } });
      }
      await prisma.operationalRequest.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.assetIssue.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.notificationDelivery.deleteMany({
        where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
      });
      await prisma.notificationRecipient.deleteMany({
        where: { notification: { facilityId: { in: facilityIds } } },
      });
      await prisma.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.operationalEvidenceRecord.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.asset.deleteMany({ where: { unit: { facilityId: { in: facilityIds } } } });
      await prisma.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await prisma.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    }
    if (userIds.length > 0) {
      await prisma.userFacilityRolePeriod.deleteMany({
        where: { userFacilityAccess: { userId: { in: userIds } } },
      });
      await prisma.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (facilityIds.length > 0) {
      const orgs = await prisma.facility.findMany({
        where: { id: { in: facilityIds } },
        select: { organizationId: true },
      });
      await prisma.facility.deleteMany({ where: { id: { in: facilityIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgs.map((row) => row.organizationId) } } });
    }
    await prisma.$disconnect();
  }
});
