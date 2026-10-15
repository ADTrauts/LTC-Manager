/**
 * Phase 1 Cooler Temperature Log — SQL-backed write path.
 * Opt in via CANONICAL_LOGS_TEST_DATABASE_URL, OPERATIONAL_EVIDENCE_TEST_DATABASE_URL,
 * or VERIFY_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { auditOperationalRecords, auditRecordsToCsv } from "@/lib/audit/audit-records";
import type { FacilitySession } from "@/lib/auth";
import { toServiceDateKey } from "@/lib/operational-time";

import { createLogAttachment } from "./attachment-service";
import { upsertPublishedCatalogSeeds } from "./catalog-seed";
import { installPublishedCatalog } from "./facility-catalog-install";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import { performCanonicalLogSubmission } from "./submit-canonical-log";

const databaseUrl =
  process.env.CANONICAL_LOGS_TEST_DATABASE_URL ||
  process.env.OPERATIONAL_EVIDENCE_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set CANONICAL_LOGS_TEST_DATABASE_URL (or VERIFY_DATABASE_URL) to a disposable migrated database";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId" | "role">,
): FacilitySession {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    scopeKind: "facility",
    role: overrides.role,
    name: overrides.name ?? "Phase 1 Staff",
    email: "phase1-staff@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test(
  "phase1 sql: install → attach cooler → 38°F Morning → 55°F Afternoon with CA → no legacy rows",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.CANONICAL_LOGS_ENABLED;
    process.env.CANONICAL_LOGS_ENABLED = "true";

    try {
      await upsertPublishedCatalogSeeds(prisma);

      const org = await prisma.organization.create({
        data: { id: cuidLike(), name: `Org ${cuidLike()}`, isActive: true },
      });
      const facility = await prisma.facility.create({
        data: {
          id: cuidLike(),
          organizationId: org.id,
          displayName: `Facility ${cuidLike()}`,
          timezone: "America/New_York",
        },
      });
      const department = await prisma.department.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          key: "DIETARY",
          name: "Dietary",
        },
      });
      const staffRole = await prisma.role.findUniqueOrThrow({ where: { key: "STAFF" } });
      const recordingUser = await prisma.user.create({
        data: {
          id: cuidLike(),
          email: `phase1-cooler-${cuidLike()}@example.com`,
          displayName: "Phase 1 Staff",
          passwordHash: "not-a-usable-hash",
          facilityId: facility.id,
          roleId: staffRole.id,
          primaryDepartmentId: department.id,
        },
      });
      const unit = await prisma.unit.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          name: "2B Cazenovia Park",
          unitType: "SERVERY",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });
      const asset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `AST-${cuidLike().slice(0, 8)}`,
          departmentId: department.id,
          unitId: unit.id,
          name: "Reach-In Cooler #1",
          equipmentType: "COOLER",
          status: "OPERATIONAL",
        },
      });

      const firstInstall = await installPublishedCatalog(prisma, {
        facilityId: facility.id,
        catalogStableKey: "cooler_temperature_log",
      });
      const secondInstall = await installPublishedCatalog(prisma, {
        facilityId: facility.id,
        catalogStableKey: "cooler_temperature_log",
      });
      assert.equal(firstInstall.created, true);
      assert.equal(secondInstall.created, false);
      assert.equal(firstInstall.id, secondInstall.id);

      const catalog = await prisma.catalogLogDefinition.findUnique({
        where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } },
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      });
      assert.ok(catalog);

      const attachment = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: department.id,
        catalogDefinitionId: catalog.id,
        target: { kind: "ASSET", assetId: asset.id },
        effectiveFromKey: "2026-10-14",
      });
      assert.equal(attachment.targetKind, "ASSET");
      assert.equal(attachment.assetId, asset.id);
      assert.equal(attachment.timingMode, "DAILY_WINDOWS");
      assert.equal(attachment.dailyWindows.length, 2);
      assert.equal(attachment.dailyWindows[0]?.label, "Morning");
      assert.equal(attachment.dailyWindows[1]?.label, "Afternoon");

      const reqs = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          catalogDefinition: {
            id: catalog.id,
            name: catalog.name,
            purposeType: catalog.purposeType,
            instructions: catalog.instructions,
            status: catalog.status,
            fields: catalog.fields.map((field) => ({
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
        operationalDateKey: "2026-10-14",
        now: new Date("2026-10-14T14:00:00.000Z"),
        facilityTimezone: "America/New_York",
        publishedCycles: [],
        existingRecords: [],
      });
      assert.equal(reqs.length, 2);
      const morning = reqs.find((row) => row.cycleLabel === "Morning")!;
      const afternoon = reqs.find((row) => row.cycleLabel === "Afternoon")!;

      const sess = session({
        facilityId: facility.id,
        role: "STAFF",
        uid: recordingUser.id,
        primaryDepartmentId: department.id,
        name: "Phase 1 Staff",
      });

      const commandId = `phase1-38-${cuidLike()}`;
      const actor = {
        userId: recordingUser.id,
        label: sess.name ?? "Phase 1 Staff",
        employeeId: null,
      };
      const record38 = await performCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: department.id,
        logAttachmentId: attachment.id,
        requirementKey: morning.requirementKey,
        operationalDateKey: "2026-10-14",
        windowStartLocal: morning.windowStartLocal,
        windowEndLocal: morning.windowEndLocal,
        cycleLabel: morning.cycleLabel,
        occurredAt: new Date("2026-10-14T14:05:00.000Z"),
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        clientCommandId: commandId,
        client: prisma,
      });

      const replay = await performCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: department.id,
        logAttachmentId: attachment.id,
        requirementKey: morning.requirementKey,
        operationalDateKey: "2026-10-14",
        windowStartLocal: morning.windowStartLocal,
        windowEndLocal: morning.windowEndLocal,
        cycleLabel: morning.cycleLabel,
        occurredAt: new Date("2026-10-14T14:06:00.000Z"),
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        clientCommandId: commandId,
        client: prisma,
      });
      assert.equal(replay.id, record38.id);

      await assert.rejects(
        () =>
          performCanonicalLogSubmission(actor, {
            facilityId: facility.id,
            departmentId: department.id,
            logAttachmentId: attachment.id,
            requirementKey: morning.requirementKey,
            operationalDateKey: "2026-10-14",
            windowStartLocal: morning.windowStartLocal,
            windowEndLocal: morning.windowEndLocal,
            cycleLabel: morning.cycleLabel,
            occurredAt: new Date("2026-10-14T14:07:00.000Z"),
            values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
            clientCommandId: `phase1-dup-${cuidLike()}`,
            client: prisma,
          }),
        /already been completed/,
      );

      assert.equal(record38.templateId, null);
      assert.equal(record38.logAttachmentId, attachment.id);
      assert.equal(record38.templateStableKey, "cooler_temperature_log");
      assert.equal(record38.templateVersion, 1);
      assert.equal(record38.logRequirementKey, morning.requirementKey);
      assert.equal(record38.assetId, asset.id);
      assert.equal(record38.status, "COMPLETED");
      assert.equal(record38.outOfStandard, false);
      assert.equal(record38.correctiveActionText, null);
      assert.equal(toServiceDateKey(record38.operationalDate), "2026-10-14");
      const value38 = record38.values.find((row) => row.fieldKey === "cooler_temperature");
      assert.equal(value38?.fieldType, "TEMPERATURE");
      assert.equal(value38?.valueNumber, 38);
      assert.equal(value38?.outOfStandard, false);

      await assert.rejects(
        () =>
          performCanonicalLogSubmission(actor, {
            facilityId: facility.id,
            departmentId: department.id,
            logAttachmentId: attachment.id,
            requirementKey: afternoon.requirementKey,
            operationalDateKey: "2026-10-14",
            windowStartLocal: afternoon.windowStartLocal,
            windowEndLocal: afternoon.windowEndLocal,
            cycleLabel: afternoon.cycleLabel,
            occurredAt: new Date("2026-10-14T16:10:00.000Z"),
            values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
            client: prisma,
          }),
        /Corrective action is required/,
      );

      const record55 = await performCanonicalLogSubmission(actor, {
        facilityId: facility.id,
        departmentId: department.id,
        logAttachmentId: attachment.id,
        requirementKey: afternoon.requirementKey,
        operationalDateKey: "2026-10-14",
        windowStartLocal: afternoon.windowStartLocal,
        windowEndLocal: afternoon.windowEndLocal,
        cycleLabel: afternoon.cycleLabel,
        occurredAt: new Date("2026-10-14T16:10:00.000Z"),
        values: [{ fieldKey: "cooler_temperature", valueNumber: 55 }],
        correctiveActionText: "Moved food to backup cooler and called maintenance.",
        client: prisma,
      });
      assert.equal(record55.outOfStandard, true);
      assert.equal(record55.status, "COMPLETED_WITH_CORRECTIVE_ACTION");
      assert.equal(record55.values.find((row) => row.fieldKey === "cooler_temperature")?.valueNumber, 55);

      const [logSubmissions, inspectionSubmissions, templateRows] = await Promise.all([
        prisma.logSubmission.count({ where: { assignment: { unit: { facilityId: facility.id } } } }),
        prisma.inspectionSubmission.count({
          where: { definition: { facilityId: facility.id } },
        }),
        prisma.operationalTemplate.count({ where: { facilityId: facility.id } }),
      ]);
      assert.equal(logSubmissions, 0);
      assert.equal(inspectionSubmissions, 0);
      assert.equal(templateRows, 0);

      const book = await prisma.operationalEvidenceRecord.findMany({
        where: { facilityId: facility.id, departmentId: department.id },
        include: { values: true },
        orderBy: { recordedAt: "asc" },
      });
      assert.equal(book.length, 2);
      assert.equal(book[0]!.id, record38.id);
      assert.equal(book[1]!.id, record55.id);

      const audit = auditOperationalRecords({
        fromDateKey: "2026-10-14",
        toDateKey: "2026-10-14",
        todayKey: "2026-10-15",
        now: new Date("2026-10-15T16:00:00.000Z"),
        facilityTimezone: "America/New_York",
        departmentId: department.id,
        catalogStableKey: "cooler_temperature_log",
        segments: [
          {
            ...attachment,
            catalogDefinition: {
              id: catalog.id,
              name: catalog.name,
              purposeType: catalog.purposeType,
              instructions: catalog.instructions,
              status: catalog.status,
              fields: catalog.fields.map((field) => ({
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
        ],
        profiles: [],
        bindings: [],
        spaces: [],
        placeNames: [],
        records: book.map((row) => ({
          id: row.id,
          requirementKey: row.requirementKey,
          logRequirementKey: row.logRequirementKey,
          followsRecordId: row.followsRecordId,
          operationalDateKey: toServiceDateKey(row.operationalDate),
          spaceId: row.spaceId,
          templateVersion: row.templateVersion,
          outOfStandard: row.outOfStandard,
          valueNumber: row.values.find((value) => value.fieldKey === "cooler_temperature")?.valueNumber ?? null,
          valueText: null,
          correctiveActionText: row.correctiveActionText,
          occurredAt: row.occurredAt.toISOString(),
          recordedAt: row.recordedAt.toISOString(),
          recordedByLabel: row.recordedByLabel,
          placeLabelSnapshot: row.placeLabelSnapshot,
          status: row.status,
          corrections: [],
        })),
        waivers: [],
      });
      assert.equal(audit.slots.filter((slot) => slot.record).length, 2);
      const csv = auditRecordsToCsv(audit.slots);
      assert.match(csv, /,38,/);
      assert.match(csv, /,55,/);
      assert.match(csv, /CANONICAL_RECORD/);
    } finally {
      if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
      else process.env.CANONICAL_LOGS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
