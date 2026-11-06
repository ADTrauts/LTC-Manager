/**
 * evidence.failed is one Update per submitted Record that is out of standard.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import { createIssueFromRecord } from "@/lib/asset-operations/corrective-maintenance";
import type { FacilitySession } from "@/lib/auth";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { correctEvidenceRecord } from "@/lib/operational-evidence/correct-evidence";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { createLogAttachment } from "./attachment-service";
import { upsertPublishedCatalogSeeds } from "./catalog-seed";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import { performCanonicalLogSubmission, submitCanonicalLogSubmission } from "./submit-canonical-log";

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
    name: "Evidence Supervisor",
    email: "evidence@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test(
  "a submitted out-of-standard Record publishes one evidence.failed Update",
  { skip },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevCanonical = process.env.CANONICAL_LOGS_ENABLED;
    const prevAuthority = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
    process.env.CANONICAL_LOGS_ENABLED = "true";
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
    const suffix = tag();
    const facilityIds: string[] = [];
    const userIds: string[] = [];

    try {
      await upsertPublishedCatalogSeeds(prisma);
      const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { key: "SUPERVISOR" } });
      const org = await prisma.organization.create({
        data: { name: `Evidence org ${suffix}`, isActive: true },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Evidence ${suffix}`,
          timezone: "America/New_York",
        },
      });
      facilityIds.push(facility.id);
      const otherFacility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `Other ${suffix}`,
          timezone: "America/New_York",
        },
      });
      facilityIds.push(otherFacility.id);

      async function department(key: "DIETARY" | "EVS" | "PLANT", name: string) {
        return prisma.department.create({
          data: { facilityId: facility.id, key, name },
        });
      }
      const dietary = await department("DIETARY", "Food and Nutrition");
      const evs = await department("EVS", "Environmental Services");
      const plant = await department("PLANT", "Plant");

      async function person(input: {
        facilityId: string;
        departmentId: string;
        label: string;
        linked: boolean;
      }) {
        const user = input.linked
          ? await prisma.user.create({
              data: {
                email: `${input.label}-${suffix}@example.test`,
                displayName: input.label,
                facilityId: input.facilityId,
                roleId: supervisorRole.id,
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

      const dietarySupervisor = await person({
        facilityId: facility.id,
        departmentId: dietary.id,
        label: "dietary-supervisor",
        linked: true,
      });
      const unlinked = await person({
        facilityId: facility.id,
        departmentId: dietary.id,
        label: "unlinked-supervisor",
        linked: false,
      });
      const evsSupervisor = await person({
        facilityId: facility.id,
        departmentId: evs.id,
        label: "evs-supervisor",
        linked: true,
      });
      const plantSupervisor = await person({
        facilityId: facility.id,
        departmentId: plant.id,
        label: "plant-supervisor",
        linked: true,
      });
      const outsider = await person({
        facilityId: otherFacility.id,
        departmentId: dietary.id,
        label: "outsider",
        linked: true,
      });

      async function place(departmentId: string, name: string) {
        const unit = await prisma.unit.create({
          data: {
            facilityId: facility.id,
            name: `${name} ${suffix}`,
            unitType: "SERVERY",
            hierarchyRole: "NEIGHBORHOOD",
          },
        });
        const asset = await prisma.asset.create({
          data: {
            assetCode: `${name}-${suffix}`.slice(0, 24),
            departmentId,
            unitId: unit.id,
            name,
            equipmentType: "COOLER",
            status: "OPERATIONAL",
          },
        });
        return { unit, asset };
      }
      const dietaryPlace = await place(dietary.id, "Cooler");
      const evsPlace = await place(evs.id, "EVS cooler");
      const plantPlace = await place(plant.id, "Plant cooler");

      const cooler = await prisma.catalogLogDefinition.findUniqueOrThrow({
        where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } },
        include: { fields: true },
      });

      async function attach(departmentId: string, assetId: string) {
        return createLogAttachment(prisma, {
          facilityId: facility.id,
          departmentId,
          catalogDefinitionId: cooler.id,
          target: { kind: "ASSET", assetId },
          effectiveFromKey: "2026-09-01",
        });
      }
      const dietaryAttachment = await attach(dietary.id, dietaryPlace.asset.id);
      const evsAttachment = await attach(evs.id, evsPlace.asset.id);
      const plantAttachment = await attach(plant.id, plantPlace.asset.id);

      function requirements(attachment: typeof dietaryAttachment, date: string) {
        return resolveLogRequirementsForAttachment({
          attachment: {
            ...attachment,
            catalogDefinition: {
              id: cooler.id,
              name: cooler.name,
              purposeType: "LOG",
              instructions: cooler.instructions,
              status: "PUBLISHED",
              fields: cooler.fields.map((field) => ({
                fieldKey: field.fieldKey,
                label: field.label,
                fieldType: field.fieldType,
                isRequired: field.isRequired,
                displaySequence: field.displaySequence,
                helpText: field.helpText,
                unitLabel: field.unitLabel,
                minNumber: field.minNumber,
                maxNumber: field.maxNumber,
                allowedSelections: field.allowedSelections,
                correctiveActionTrigger: field.correctiveActionTrigger,
                correctiveActionRequired: field.correctiveActionRequired,
              })),
            },
          },
          operationalDateKey: date,
          now: new Date(`${date}T16:00:00.000Z`),
          facilityTimezone: "America/New_York",
          publishedCycles: [],
          existingRecords: [],
        });
      }

      async function supervise(input: {
        departmentId: string;
        employeeId: string;
        unitId: string;
        roleKey: string;
        date: string;
      }) {
        const plan = await prisma.operationalAssignmentPlan.create({
          data: {
            facilityId: facility.id,
            departmentId: input.departmentId,
            serviceDate: facilityLocalDateToServiceDate(input.date),
            status: "CONFIRMED",
          },
        });
        await prisma.operationalAssignment.create({
          data: {
            facilityId: facility.id,
            departmentId: input.departmentId,
            planId: plan.id,
            employeeId: input.employeeId,
            serviceDate: facilityLocalDateToServiceDate(input.date),
            roleKey: input.roleKey,
            roleLabel: "Supervisor rounding",
            status: "PLANNED",
            unitId: input.unitId,
          },
        });
      }

      await supervise({
        departmentId: dietary.id,
        employeeId: dietarySupervisor.employee.id,
        unitId: dietaryPlace.unit.id,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        date: "2026-09-13",
      });
      await supervise({
        departmentId: dietary.id,
        employeeId: unlinked.employee.id,
        unitId: dietaryPlace.unit.id,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        date: "2026-09-14",
      });
      await supervise({
        departmentId: evs.id,
        employeeId: evsSupervisor.employee.id,
        unitId: evsPlace.unit.id,
        roleKey: "EVS_SUPERVISOR_ROUNDING",
        date: "2026-09-13",
      });
      await supervise({
        departmentId: plant.id,
        employeeId: plantSupervisor.employee.id,
        unitId: plantPlace.unit.id,
        roleKey: "PLANT_SUPERVISOR_ROUNDING",
        date: "2026-09-13",
      });

      const actor = session(facility.id, dietarySupervisor.user!.id, dietary.id);
      const morning = requirements(dietaryAttachment, "2026-09-13")[0]!;
      const afternoon = requirements(dietaryAttachment, "2026-09-13")[1]!;

      const inRange = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        requirementKey: morning.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: morning.windowStartLocal,
        windowEndLocal: morning.windowEndLocal,
        cycleLabel: morning.cycleLabel,
        occurredAt: new Date("2026-09-13T14:05:00.000Z"),
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        client: prisma,
        now: new Date("2026-09-13T14:05:00.000Z"),
      });
      assert.equal(inRange.outOfStandard, false);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        0,
      );

      const failed = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        requirementKey: afternoon.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: afternoon.windowStartLocal,
        windowEndLocal: afternoon.windowEndLocal,
        cycleLabel: afternoon.cycleLabel,
        occurredAt: new Date("2026-09-13T15:30:00.000Z"),
        correctiveActionText: "Moved product to a working cooler",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
        clientCommandId: `fail-${suffix}`,
        client: prisma,
        now: new Date("2026-09-13T15:30:00.000Z"),
      });
      assert.equal(failed.outOfStandard, true);
      const evidenceRows = await prisma.notificationOutbox.findMany({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
      });
      assert.equal(evidenceRows.length, 1);
      assert.equal(evidenceRows[0]?.dedupeKey, `evidence-failed:${failed.id}`);
      const failedPayload = evidenceRows[0]?.payload as Record<string, unknown>;
      assert.equal("valueNumber" in failedPayload, false);
      assert.equal(failedPayload.recordId, failed.id);
      assert.equal(Object.values(failedPayload).includes(55), false);

      const replay = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        requirementKey: afternoon.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: afternoon.windowStartLocal,
        windowEndLocal: afternoon.windowEndLocal,
        occurredAt: new Date("2026-09-13T15:30:00.000Z"),
        correctiveActionText: "Moved product to a working cooler",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
        clientCommandId: `fail-${suffix}`,
        client: prisma,
      });
      assert.equal(replay.id, failed.id);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        1,
      );

      const again = await processNotificationOutboxRow(prisma, { outboxId: evidenceRows[0]!.id });
      assert.equal(again.outcome, "already_processed");

      const notification = await prisma.notification.findFirstOrThrow({
        where: { facilityId: facility.id, sourceType: "evidence_record" },
        include: { recipients: true },
      });
      assert.equal(notification.priority, "UPDATE");
      assert.equal(notification.requiresAcknowledgement, false);
      assert.equal(notification.resolvedAt, null);
      assert.equal(notification.actionPath, `/staffing/logs/records/${failed.id}`);
      assert.equal(notification.title, "Record submitted out of standard");
      assert.equal(notification.recipients.length, 1);
      assert.equal(notification.recipients[0]?.userId, dietarySupervisor.user!.id);
      assert.match(notification.recipients[0]?.explanation ?? "", /on-duty supervisor/);
      assert.equal(
        notification.recipients.some((row) => row.userId === outsider.user!.id),
        false,
      );

      const center = await loadNotificationCenter(prisma, {
        userId: dietarySupervisor.user!.id,
        facilityId: facility.id,
        now: new Date("2026-09-13T16:00:00.000Z"),
        timeZone: "America/New_York",
      });
      assert.equal(center.status, "ready");
      if (center.status !== "ready") return;
      assert.equal(center.needsAttention.length, 0);
      assert.equal(center.updates.some((item) => item.actionPath === notification.actionPath), true);
      assert.equal(center.updates.find((item) => item.actionPath === notification.actionPath)?.actionLabel, "Review Record");
      assert.equal(
        await getActiveAttentionCountForUser(prisma, {
          userId: dietarySupervisor.user!.id,
          facilityId: facility.id,
          now: new Date("2026-09-13T16:00:00.000Z"),
        }),
        0,
      );
      await markNotificationRead(prisma, {
        facilityId: facility.id,
        notificationId: notification.id,
        userId: dietarySupervisor.user!.id,
      });
      const afterRead = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(afterRead.resolvedAt, null);
      await assert.rejects(
        () =>
          acknowledgeNotification(prisma, {
            facilityId: facility.id,
            notificationId: notification.id,
            userId: dietarySupervisor.user!.id,
          }),
        /ACKNOWLEDGEMENT_NOT_REQUIRED/,
      );

      const passingRecheck = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        operationalDateKey: "2026-09-13",
        occurredAt: new Date("2026-09-13T16:00:00.000Z"),
        followsRecordId: failed.id,
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        client: prisma,
      });
      assert.equal(passingRecheck.outOfStandard, false);
      assert.equal(passingRecheck.followsRecordId, failed.id);
      const stillFailed = await prisma.operationalEvidenceRecord.findUniqueOrThrow({ where: { id: failed.id } });
      assert.equal(stillFailed.outOfStandard, true);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        1,
      );

      const failedRecheck = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        operationalDateKey: "2026-09-13",
        occurredAt: new Date("2026-09-13T16:10:00.000Z"),
        followsRecordId: failed.id,
        correctiveActionText: "Discarded the product",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 60 }],
        client: prisma,
      });
      assert.notEqual(failedRecheck.id, failed.id);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        2,
      );
      const originalNotice = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(originalNotice.resolvedAt, null);
      assert.equal(originalNotice.expiresAt, null);

      const unitAttachment = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        catalogDefinitionId: cooler.id,
        target: { kind: "UNIT", unitId: dietaryPlace.unit.id },
        effectiveFromKey: "2026-09-01",
      });
      const unitMorning = requirements(unitAttachment, "2026-09-13")[0]!;
      const unitFailed = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: unitAttachment.id,
        requirementKey: unitMorning.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: unitMorning.windowStartLocal,
        windowEndLocal: unitMorning.windowEndLocal,
        occurredAt: new Date("2026-09-13T14:05:00.000Z"),
        correctiveActionText: "Reported from the neighborhood",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 47 }],
        client: prisma,
      });
      assert.equal(unitFailed.unitId, dietaryPlace.unit.id);
      const beforeIssue = await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
      });
      const issue = await createIssueFromRecord(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        evidenceRecordId: unitFailed.id,
        createWorkOrder: true,
        client: prisma,
        now: new Date("2026-09-13T16:20:00.000Z"),
      });
      assert.equal(issue.issue.originEvidenceRecordId, unitFailed.id);
      assert.ok(issue.workOrder);
      const assetAfter = await prisma.asset.findUniqueOrThrow({ where: { id: dietaryPlace.asset.id } });
      assert.equal(assetAfter.status, "OPERATIONAL");
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "asset.out_of_service" },
        }),
        0,
      );
      const unitNotice = await prisma.notification.findFirstOrThrow({
        where: { facilityId: facility.id, actionPath: `/staffing/logs/records/${unitFailed.id}` },
      });
      assert.equal(unitNotice.priority, "UPDATE");
      assert.equal(unitNotice.resolvedAt, null);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        beforeIssue,
      );
      const afterFollowUp = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(afterFollowUp.priority, "UPDATE");
      assert.equal(afterFollowUp.resolvedAt, null);

      const beforeCorrection = await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
      });
      await correctEvidenceRecord(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        recordId: failed.id,
        reason: "Thermometer was misread",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        correctiveActionText: "Moved product to a working cooler",
        client: prisma,
      });
      const corrected = await prisma.operationalEvidenceRecord.findUniqueOrThrow({ where: { id: failed.id } });
      assert.equal(corrected.outOfStandard, false);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        beforeCorrection,
      );
      const afterCorrection = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(afterCorrection.resolvedAt, null);

      const nextMorning = requirements(dietaryAttachment, "2026-09-14")[0]!;
      const unlinkedRecord = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: dietaryAttachment.id,
        requirementKey: nextMorning.requirementKey,
        operationalDateKey: "2026-09-14",
        windowStartLocal: nextMorning.windowStartLocal,
        windowEndLocal: nextMorning.windowEndLocal,
        occurredAt: new Date("2026-09-14T14:05:00.000Z"),
        correctiveActionText: "Called maintenance",
        values: [{ fieldKey: "cooler_temperature", valueNumber: 50 }],
        client: prisma,
      });
      const unlinkedNotice = await prisma.notification.findFirstOrThrow({
        where: { facilityId: facility.id, actionPath: `/staffing/logs/records/${unlinkedRecord.id}` },
        include: { recipients: true },
      });
      assert.equal(unlinkedNotice.recipients.length, 0);

      await assert.rejects(
        () =>
          prisma.$transaction(async (tx) => {
            const day = requirements(dietaryAttachment, "2026-09-15")[0]!;
            await submitCanonicalLogSubmission(actor, {
              facilityId: facility.id,
              departmentId: dietary.id,
              logAttachmentId: dietaryAttachment.id,
              requirementKey: day.requirementKey,
              operationalDateKey: "2026-09-15",
              windowStartLocal: day.windowStartLocal,
              windowEndLocal: day.windowEndLocal,
              occurredAt: new Date("2026-09-15T14:05:00.000Z"),
              correctiveActionText: "This must roll back",
              values: [{ fieldKey: "cooler_temperature", valueNumber: 52 }],
              client: tx,
            });
            throw new Error("rollback evidence");
          }),
        /rollback evidence/,
      );
      assert.equal(
        await prisma.operationalEvidenceRecord.count({
          where: { facilityId: facility.id, operationalDate: facilityLocalDateToServiceDate("2026-09-15") },
        }),
        0,
      );
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, dedupeKey: { contains: "2026-09-15" } },
        }),
        0,
      );
      const rolled = await prisma.notificationOutbox.findMany({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
        select: { aggregateId: true },
      });
      const rolledRecords = await prisma.operationalEvidenceRecord.findMany({
        where: { id: { in: rolled.map((row) => row.aggregateId) } },
      });
      assert.equal(rolledRecords.length, rolled.length);

      const held = await prisma.$transaction(async (tx) => {
        const day = requirements(dietaryAttachment, "2026-09-16")[0]!;
        return submitCanonicalLogSubmission(actor, {
          facilityId: facility.id,
          departmentId: dietary.id,
          logAttachmentId: dietaryAttachment.id,
          requirementKey: day.requirementKey,
          operationalDateKey: "2026-09-16",
          windowStartLocal: day.windowStartLocal,
          windowEndLocal: day.windowEndLocal,
          occurredAt: new Date("2026-09-16T14:05:00.000Z"),
          correctiveActionText: "Held for processing",
          values: [{ fieldKey: "cooler_temperature", valueNumber: 49 }],
          client: tx,
        });
      });
      const heldOutbox = await prisma.notificationOutbox.findFirstOrThrow({
        where: { facilityId: facility.id, dedupeKey: `evidence-failed:${held.id}` },
      });
      assert.equal(heldOutbox.processedAt, null);
      const processed = await processNotificationOutboxRow(prisma, { outboxId: heldOutbox.id });
      assert.equal(processed.outcome, "applied");

      const probe = await prisma.catalogLogDefinition.create({
        data: {
          stableKey: `evidence_probe_${suffix}`,
          version: 1,
          status: "PUBLISHED",
          name: "Two temperature checks",
          purposeType: "LOG",
          category: "TEMPERATURE",
          recommendedCadence: "ONCE_DAILY",
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          fields: {
            create: [
              {
                fieldKey: "left",
                label: "Left",
                fieldType: "TEMPERATURE",
                displaySequence: 10,
                minNumber: 33,
                maxNumber: 41,
                correctiveActionTrigger: true,
                correctiveActionRequired: true,
              },
              {
                fieldKey: "right",
                label: "Right",
                fieldType: "TEMPERATURE",
                displaySequence: 20,
                minNumber: 33,
                maxNumber: 41,
                correctiveActionTrigger: true,
                correctiveActionRequired: true,
              },
            ],
          },
        },
        include: { fields: true },
      });
      const probeAttachment = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        catalogDefinitionId: probe.id,
        target: { kind: "ASSET", assetId: dietaryPlace.asset.id },
        effectiveFromKey: "2026-09-01",
      });
      const probeReq = resolveLogRequirementsForAttachment({
        attachment: {
          ...probeAttachment,
          catalogDefinition: {
            id: probe.id,
            name: probe.name,
            purposeType: "LOG",
            instructions: null,
            status: "PUBLISHED",
            fields: probe.fields.map((field) => ({
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              isRequired: field.isRequired,
              displaySequence: field.displaySequence,
              helpText: field.helpText,
              unitLabel: field.unitLabel,
              minNumber: field.minNumber,
              maxNumber: field.maxNumber,
              allowedSelections: field.allowedSelections,
              correctiveActionTrigger: field.correctiveActionTrigger,
              correctiveActionRequired: field.correctiveActionRequired,
            })),
          },
        },
        operationalDateKey: "2026-09-13",
        now: new Date("2026-09-13T16:00:00.000Z"),
        facilityTimezone: "America/New_York",
        publishedCycles: [],
        existingRecords: [],
      })[0]!;
      const beforeProbe = await prisma.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "evidence.failed" },
      });
      const both = await submitCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: probeAttachment.id,
        requirementKey: probeReq.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: probeReq.windowStartLocal,
        windowEndLocal: probeReq.windowEndLocal,
        occurredAt: new Date("2026-09-13T14:05:00.000Z"),
        correctiveActionText: "Both sides were warm",
        values: [
          { fieldKey: "left", valueNumber: 20 },
          { fieldKey: "right", valueNumber: 22 },
        ],
        client: prisma,
      });
      assert.equal(both.values.filter((value) => value.outOfStandard).length, 2);
      assert.equal(
        await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, eventType: "evidence.failed" },
        }),
        beforeProbe + 1,
      );

      async function departmentFailure(input: {
        departmentId: string;
        attachmentId: string;
        userId: string;
      }) {
        const req = requirements(
          input.departmentId === evs.id ? evsAttachment : plantAttachment,
          "2026-09-13",
        )[0]!;
        const before = await prisma.notificationOutbox.count({
          where: { facilityId: facility.id, departmentId: input.departmentId, eventType: "evidence.failed" },
        });
        const record = await performCanonicalLogSubmission(
          { userId: input.userId, label: "Department supervisor", employeeId: null },
          {
            facilityId: facility.id,
            departmentId: input.departmentId,
            logAttachmentId: input.attachmentId,
            requirementKey: req.requirementKey,
            operationalDateKey: "2026-09-13",
            windowStartLocal: req.windowStartLocal,
            windowEndLocal: req.windowEndLocal,
            occurredAt: new Date("2026-09-13T14:05:00.000Z"),
            correctiveActionText: "Documented and moved",
            values: [{ fieldKey: "cooler_temperature", valueNumber: 48 }],
            client: prisma,
          },
        );
        assert.equal(record.outOfStandard, true);
        assert.equal(
          await prisma.notificationOutbox.count({
            where: { facilityId: facility.id, departmentId: input.departmentId, eventType: "evidence.failed" },
          }),
          before + 1,
        );
        const notice = await prisma.notification.findFirstOrThrow({
          where: { facilityId: facility.id, actionPath: `/staffing/logs/records/${record.id}` },
          include: { recipients: true },
        });
        assert.equal(notice.priority, "UPDATE");
        assert.equal(notice.recipients.length, 1);
        assert.equal(notice.recipients[0]?.userId, input.userId);
      }
      await departmentFailure({
        departmentId: evs.id,
        attachmentId: evsAttachment.id,
        userId: evsSupervisor.user!.id,
      });
      await departmentFailure({
        departmentId: plant.id,
        attachmentId: plantAttachment.id,
        userId: plantSupervisor.user!.id,
      });
    } finally {
      process.env.CANONICAL_LOGS_ENABLED = prevCanonical;
      process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = prevAuthority;
      if (facilityIds.length > 0) {
        const repairs = await prisma.repair.findMany({
          where: { unit: { facilityId: { in: facilityIds } } },
          select: { id: true },
        });
        if (repairs.length > 0) {
          await prisma.repairLaborEntry.deleteMany({ where: { repairId: { in: repairs.map((row) => row.id) } } });
          await prisma.repair.deleteMany({ where: { id: { in: repairs.map((row) => row.id) } } });
        }
        await prisma.assetIssue.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.notificationDelivery.deleteMany({
          where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
        });
        await prisma.notificationRecipient.deleteMany({
          where: { notification: { facilityId: { in: facilityIds } } },
        });
        await prisma.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.operationalEvidenceCorrection.deleteMany({
          where: { record: { facilityId: { in: facilityIds } } },
        });
        await prisma.operationalEvidenceRecord.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.logAttachment.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.asset.deleteMany({ where: { unit: { facilityId: { in: facilityIds } } } });
        await prisma.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.facilityCatalogInstall.deleteMany({ where: { facilityId: { in: facilityIds } } });
        await prisma.catalogLogDefinition.deleteMany({ where: { stableKey: { startsWith: `evidence_probe_${suffix}` } } });
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
        await prisma.organization.deleteMany({
          where: { id: { in: orgs.map((row) => row.organizationId) } },
        });
      }
      await prisma.$disconnect();
    }
  },
);
