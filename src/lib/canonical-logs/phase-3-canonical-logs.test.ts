/**
 * Phase 3 Canonical Logs — SQL-backed Catalog / Attachment / Evidence tests.
 * Opt in via CANONICAL_LOGS_TEST_DATABASE_URL or OPERATIONAL_EVIDENCE_TEST_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";

import { upsertPublishedCatalogSeeds } from "./catalog-seed";
import { createLogAttachment, setLogAttachmentStatus, updateLogAttachment } from "./attachment-service";
import { createCatalogDraftSuccessor, publishCatalogDefinition } from "./catalog-service";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import { submitCanonicalLogSubmission } from "./submit-canonical-log";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

const databaseUrl =
  process.env.CANONICAL_LOGS_TEST_DATABASE_URL ||
  process.env.OPERATIONAL_EVIDENCE_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set CANONICAL_LOGS_TEST_DATABASE_URL (or OPERATIONAL_EVIDENCE_TEST_DATABASE_URL) to a disposable migrated database";

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
    name: "Test",
    email: "test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

test(
  "phase3 sql: catalog seed idempotent; attachment twice-daily; submit satisfies requirement",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.CANONICAL_LOGS_ENABLED;
    process.env.CANONICAL_LOGS_ENABLED = "true";

    try {
      const first = await upsertPublishedCatalogSeeds(prisma);
      const second = await upsertPublishedCatalogSeeds(prisma);
      assert.ok(first.created + first.skipped >= 4);
      assert.equal(second.created, 0);

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
          email: `canonical-log-staff-${cuidLike()}@example.com`,
          displayName: "Canonical Log Staff",
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
          name: `Unit ${cuidLike()}`,
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

      const catalog = await prisma.catalogLogDefinition.findUnique({
        where: {
          stableKey_version: { stableKey: "cooler_temperature_log", version: 1 },
        },
      });
      assert.ok(catalog);

      const attachment = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: department.id,
        catalogDefinitionId: catalog!.id,
        target: { kind: "ASSET", assetId: asset.id },
        effectiveFromKey: "2026-09-13",
      });
      assert.equal(attachment.timingMode, "DAILY_WINDOWS");
      assert.equal(attachment.dailyWindows.length, 2);

      await assert.rejects(
        () =>
          createLogAttachment(prisma, {
            facilityId: facility.id,
            departmentId: department.id,
            catalogDefinitionId: catalog!.id,
            target: { kind: "ASSET", assetId: asset.id },
            effectiveFromKey: "2026-09-13",
          }),
        /already exists/,
      );

      const reqs = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          catalogDefinition: {
            id: catalog!.id,
            name: catalog!.name,
            purposeType: "LOG",
            instructions: catalog!.instructions,
            status: "PUBLISHED",
            fields: (
              await prisma.catalogLogField.findMany({
                where: { definitionId: catalog!.id },
                orderBy: { displaySequence: "asc" },
              })
            ).map((f) => ({
              fieldKey: f.fieldKey,
              label: f.label,
              fieldType: f.fieldType,
              isRequired: f.isRequired,
              displaySequence: f.displaySequence,
              helpText: f.helpText,
              unitLabel: f.unitLabel,
              minNumber: f.minNumber,
              maxNumber: f.maxNumber,
              allowedSelections: f.allowedSelections,
              correctiveActionTrigger: f.correctiveActionTrigger,
              correctiveActionRequired: f.correctiveActionRequired,
            })),
          },
        },
        operationalDateKey: "2026-09-13",
        now: new Date("2026-09-13T14:00:00.000Z"),
        facilityTimezone: "America/New_York",
        publishedCycles: [],
        existingRecords: [],
      });
      assert.equal(reqs.length, 2);

      const sess = session({
        facilityId: facility.id,
        role: "STAFF",
        uid: recordingUser.id,
        primaryDepartmentId: department.id,
      });
      const record = await submitCanonicalLogSubmission(sess, {
        facilityId: facility.id,
        departmentId: department.id,
        logAttachmentId: attachment.id,
        requirementKey: reqs[0]!.requirementKey,
        operationalDateKey: "2026-09-13",
        windowStartLocal: reqs[0]!.windowStartLocal,
        windowEndLocal: reqs[0]!.windowEndLocal,
        cycleLabel: reqs[0]!.cycleLabel,
        occurredAt: new Date("2026-09-13T14:05:00.000Z"),
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
        client: prisma,
      });
      assert.equal(record.logAttachmentId, attachment.id);
      assert.equal(record.attachmentStableKey, attachment.stableKey);
      assert.equal(record.templateId, null);
      assert.equal(record.status, "COMPLETED");
      const snap = record.templateSnapshotJson as { snapshotSchemaVersion?: number; kind?: string };
      assert.equal(snap.snapshotSchemaVersion, 2);
      assert.equal(snap.kind, "CANONICAL_LOG");

      await setLogAttachmentStatus(prisma, {
        facilityId: facility.id,
        attachmentId: attachment.id,
        status: "RETIRED",
        todayKey: "2026-09-13",
      });
      const retired = await prisma.logAttachment.findUnique({ where: { id: attachment.id } });
      assert.equal(retired?.status, "RETIRED");
      assert.ok(retired?.effectiveTo);
    } finally {
      if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
      else process.env.CANONICAL_LOGS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase3 sql: published catalog immutable; successor draft allowed; cycle needs setup",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.CANONICAL_LOGS_ENABLED;
    process.env.CANONICAL_LOGS_ENABLED = "true";

    try {
      await upsertPublishedCatalogSeeds(prisma);
      const published = await prisma.catalogLogDefinition.findUnique({
        where: {
          stableKey_version: { stableKey: "low_temp_chemical_dishwasher_log", version: 1 },
        },
      });
      assert.ok(published);
      assert.equal(published!.status, "PUBLISHED");

      const draft = await createCatalogDraftSuccessor(prisma, published!.id);
      assert.equal(draft.status, "DRAFT");
      assert.equal(draft.version, 2);
      assert.equal(draft.stableKey, published!.stableKey);

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
      const unit = await prisma.unit.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          name: `Unit ${cuidLike()}`,
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
          name: "Dishwasher #1",
          equipmentType: "DISHWASHER",
          status: "OPERATIONAL",
        },
      });

      const attachment = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: department.id,
        catalogDefinitionId: published!.id,
        target: { kind: "ASSET", assetId: asset.id },
        timingMode: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["breakfast", "ghost"],
        effectiveFromKey: "2026-09-13",
      });

      const breakfast = resolveCycleWindowInstants({
        operationalDateKey: "2026-09-13",
        startLocal: "05:30",
        endLocal: "10:00",
        facilityTimezone: "America/New_York",
      });
      assert.ok(breakfast);

      const reqs = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          catalogDefinition: {
            id: published!.id,
            name: published!.name,
            purposeType: "LOG",
            instructions: published!.instructions,
            status: "PUBLISHED",
            fields: [],
          },
        },
        operationalDateKey: "2026-09-13",
        now: new Date("2026-09-13T12:00:00.000Z"),
        facilityTimezone: "America/New_York",
        publishedCycles: [
          {
            stableKey: "breakfast",
            label: "Breakfast",
            startLocal: "05:30",
            endLocal: "10:00",
            overnight: false,
            startsAt: breakfast!.startsAt,
            endsAt: breakfast!.endsAt,
          },
        ],
        existingRecords: [],
      });
      assert.equal(reqs.length, 2);
      assert.ok(reqs.some((r) => r.cycleStableKey === "ghost" && r.productState === "NEEDS_SETUP"));
      assert.ok(reqs.some((r) => r.cycleStableKey === "breakfast" && r.productState !== "NEEDS_SETUP"));

      await publishCatalogDefinition(prisma, draft.id);
    } finally {
      if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
      else process.env.CANONICAL_LOGS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase3 sql: prospective timing successor does not rewrite historical windows",
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
      const unit = await prisma.unit.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          name: "Naval Park",
          unitType: "SERVERY",
          hierarchyRole: "NEIGHBORHOOD",
        },
      });
      const asset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          unitId: unit.id,
          departmentId: department.id,
          name: "Reach-In Cooler",
          assetCode: `CL-${cuidLike().slice(0, 8)}`,
          equipmentType: "COOLER",
          status: "OPERATIONAL",
        },
      });
      const catalog = await prisma.catalogLogDefinition.findUnique({
        where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } },
      });
      assert.ok(catalog);

      const original = await createLogAttachment(prisma, {
        facilityId: facility.id,
        departmentId: department.id,
        catalogDefinitionId: catalog!.id,
        target: { kind: "ASSET", assetId: asset.id },
        effectiveFromKey: "2026-09-01",
      });
      assert.equal(original.dailyWindows.length, 2);

      const successor = await updateLogAttachment(prisma, {
        facilityId: facility.id,
        attachmentId: original.id,
        dailyWindows: [
          { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
          { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
          { label: "Evening", startLocal: "16:00", endLocal: "21:00" },
        ],
        todayKey: "2026-09-10",
      });
      assert.notEqual(successor.id, original.id);
      assert.equal(successor.dailyWindows.length, 3);

      const closed = await prisma.logAttachment.findUnique({
        where: { id: original.id },
        include: { dailyWindows: true },
      });
      assert.equal(closed?.status, "INACTIVE");
      assert.equal(closed?.dailyWindows.length, 2);
      assert.equal(closed?.effectiveTo?.toISOString().slice(0, 10), "2026-09-10");
      assert.equal(successor.effectiveFrom.toISOString().slice(0, 10), "2026-09-11");
    } finally {
      if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
      else process.env.CANONICAL_LOGS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

