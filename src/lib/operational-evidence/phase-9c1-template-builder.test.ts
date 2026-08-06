/**
 * Phase 9C.1 SQL-backed Operational Template Builder / Evidence tests.
 * Opt in via OPERATIONAL_EVIDENCE_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";

import {
  createDraft,
  publishTemplate,
  retireTemplate,
  updateDraft,
} from "./template-service";
import { submitEvidenceRecord } from "./submit-evidence";
import { searchEvidenceRecords } from "./log-book";
import { resolveUnitEvidenceRequirements } from "./load-runtime-evidence";
import { validateTemplateForPublish } from "./validate-template";
import { decideEvidenceAuthority } from "./evidence-authority";

const databaseUrl = process.env.OPERATIONAL_EVIDENCE_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set OPERATIONAL_EVIDENCE_TEST_DATABASE_URL to a disposable migrated database to run these";

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
  "phase9c1 sql: blank LOG field editor publish successor retire preserves history",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED;
    process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED = "true";

    try {
      const facility = await prisma.facility.findFirst({});
      assert.ok(facility);
      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary);
      const manager =
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: { in: ["MANAGER", "GM"] } },
          },
          include: { role: { select: { key: true } } },
        })) ??
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: "FACILITY_ADMINISTRATOR" },
            primaryDepartmentId: dietary.id,
          },
          include: { role: { select: { key: true } } },
        }));
      assert.ok(manager, "manager or dietary FA user required");
      const unit = await prisma.unit.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          unitType: "SERVERY",
          departmentResponsibilities: { some: { departmentId: dietary.id } },
        },
      });
      assert.ok(unit);
      const asset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `TMP-${cuidLike().slice(0, 8)}`,
          name: "Temp Cooler",
          equipmentType: "COOLER",
          unitId: unit.id,
          departmentId: dietary.id,
          status: "ACTIVE",
        },
      });

      const mgr = session({
        facilityId: facility.id,
        role: manager.role.key as AppJwtPayload["role"],
        uid: manager.id,
        primaryDepartmentId: dietary.id,
      });

      const draft = await createDraft(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        actor: { userId: manager.id, label: "Manager" },
        draft: {
          name: "SQL Cooler Log",
          purposeType: "LOG",
          allowAdHoc: false,
          fields: [
            {
              fieldKey: "cooler_temperature",
              label: "Cooler temperature",
              fieldType: "TEMPERATURE",
              isRequired: true,
              displaySequence: 10,
              unitLabel: "°F",
              minNumber: 33,
              maxNumber: 41,
              correctiveActionTrigger: true,
              correctiveActionRequired: true,
            },
          ],
          applicabilities: [{ kind: "SPECIFIC_ASSET", assetId: asset.id }],
          schedules: [{ kind: "ONCE_PER_OPERATIONAL_DATE" }],
        },
      });
      assert.equal(draft.status, "DRAFT");

      const publishCheck = validateTemplateForPublish({
        name: draft.name,
        purposeType: draft.purposeType,
        allowAdHoc: draft.allowAdHoc,
        fields: draft.fields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          displaySequence: f.displaySequence,
          unitLabel: f.unitLabel,
          minNumber: f.minNumber,
          maxNumber: f.maxNumber,
          correctiveActionTrigger: f.correctiveActionTrigger,
          correctiveActionRequired: f.correctiveActionRequired,
          allowedSelections: f.allowedSelections,
        })),
        applicabilities: draft.applicabilities.map((a) => ({
          kind: a.kind,
          assetId: a.assetId,
        })),
        schedules: draft.schedules.map((s) => ({ kind: s.kind })),
      });
      assert.equal(publishCheck.valid, true);

      const published = await publishTemplate(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateId: draft.id,
        actor: { userId: manager.id, label: "Manager" },
      });
      assert.equal(published.status, "PUBLISHED");
      assert.equal(published.version, 1);

      const dateKey = new Date().toISOString().slice(0, 10);
      const operationalDate = new Date(`${dateKey}T00:00:00.000Z`);

      const requirements = await resolveUnitEvidenceRequirements({
        facilityId: facility.id,
        departmentId: dietary.id,
        operationalDateKey: dateKey,
        operationalDate,
        now: new Date(`${dateKey}T12:00:00.000Z`),
        facilityTimezone: "America/New_York",
        unitId: unit.id,
        publishedCycles: [],
      });
      const req = requirements.find((r) => r.templateId === published.id);
      assert.ok(req, "published template should resolve a requirement");

      await submitEvidenceRecord(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateId: published.id,
        requirementKey: req.requirementKey,
        operationalDateKey: dateKey,
        scheduleKind: req.scheduleKind,
        unitId: unit.id,
        assetId: asset.id,
        occurredAt: new Date(),
        recordedOnline: true,
        values: [{ fieldKey: "cooler_temperature", valueNumber: 38 }],
      });

      const successor = await updateDraft(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateId: published.id,
        actor: { userId: manager.id, label: "Manager" },
        draft: {
          name: "SQL Cooler Log",
          purposeType: "LOG",
          allowAdHoc: false,
          stableKey: published.stableKey,
          fields: [
            {
              fieldKey: "cooler_temperature",
              label: "Cooler temperature",
              fieldType: "TEMPERATURE",
              isRequired: true,
              displaySequence: 10,
              unitLabel: "°F",
              minNumber: 35,
              maxNumber: 40,
              correctiveActionTrigger: true,
              correctiveActionRequired: true,
            },
          ],
          applicabilities: [{ kind: "SPECIFIC_ASSET", assetId: asset.id }],
          schedules: [{ kind: "ONCE_PER_OPERATIONAL_DATE" }],
        },
      });
      assert.equal(successor.status, "DRAFT");
      assert.equal(successor.version, 2);
      assert.equal(successor.stableKey, published.stableKey);

      const publishedV2 = await publishTemplate(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateId: successor.id,
        actor: { userId: manager.id, label: "Manager" },
      });
      assert.equal(publishedV2.status, "PUBLISHED");

      const prior = await prisma.operationalTemplate.findUnique({ where: { id: published.id } });
      assert.equal(prior?.status, "RETIRED");

      const book = await searchEvidenceRecords(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        unitId: unit.id,
        assetId: asset.id,
      });
      assert.ok(book.records.length >= 1);
      const hist = book.records.find((r) => r.templateVersion === 1);
      assert.ok(hist);
      const snap = hist.templateSnapshotJson as { version?: number; fields?: Array<{ minNumber?: number }> };
      assert.equal(snap.version, 1);
      assert.equal(snap.fields?.[0]?.minNumber, 33);

      await retireTemplate(mgr, {
        facilityId: facility.id,
        departmentId: dietary.id,
        templateId: publishedV2.id,
        actor: { userId: manager.id, label: "Manager" },
      });
      const afterRetire = await resolveUnitEvidenceRequirements({
        facilityId: facility.id,
        departmentId: dietary.id,
        operationalDateKey: dateKey,
        operationalDate,
        now: new Date(`${dateKey}T12:00:00.000Z`),
        facilityTimezone: "America/New_York",
        unitId: unit.id,
        publishedCycles: [],
      });
      assert.equal(
        afterRetire.some((r) => r.templateStableKey === published.stableKey),
        false,
      );
    } finally {
      if (prev === undefined) delete process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED;
      else process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase9c1 sql: STAFF and FA-alone denied manage; Quick PIN cannot manage",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const facility = await prisma.facility.findFirst({});
      assert.ok(facility);
      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary);

      const staffAuth = decideEvidenceAuthority({
        flagEnabled: true,
        role: "STAFF",
        authMethod: "PASSWORD",
        facilityId: facility.id,
        sessionFacilityId: facility.id,
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: dietary.id,
      });
      assert.equal(staffAuth.canManage, false);
      assert.equal(staffAuth.canPublish, false);
      assert.equal(staffAuth.canSubmit, true);

      const faAlone = decideEvidenceAuthority({
        flagEnabled: true,
        role: "FACILITY_ADMINISTRATOR",
        authMethod: "PASSWORD",
        facilityId: facility.id,
        sessionFacilityId: facility.id,
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: null,
      });
      assert.equal(faAlone.canManage, false);

      const pinAuth = decideEvidenceAuthority({
        flagEnabled: true,
        role: "MANAGER",
        authMethod: "QUICK_PIN",
        facilityId: facility.id,
        sessionFacilityId: facility.id,
        departmentId: dietary.id,
        departmentExists: true,
        primaryDepartmentId: dietary.id,
      });
      assert.equal(pinAuth.canManage, false);
      assert.equal(pinAuth.canPublish, false);
      assert.equal(pinAuth.canSubmit, true);
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "phase9c1 sql: cross-facility draft rejected",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED;
    process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED = "true";
    try {
      const facility = await prisma.facility.findFirst({});
      assert.ok(facility);
      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      });
      assert.ok(dietary);
      const manager =
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: { in: ["MANAGER", "GM"] } },
          },
          include: { role: { select: { key: true } } },
        })) ??
        (await prisma.user.findFirst({
          where: {
            facilityId: facility.id,
            isActive: true,
            role: { key: "FACILITY_ADMINISTRATOR" },
            primaryDepartmentId: dietary.id,
          },
          include: { role: { select: { key: true } } },
        }));
      assert.ok(manager, "manager or dietary FA user required");
      const mgr = session({
        facilityId: facility.id,
        role: manager.role.key as AppJwtPayload["role"],
        uid: manager.id,
        primaryDepartmentId: dietary.id,
      });

      await assert.rejects(
        () =>
          createDraft(mgr, {
            facilityId: "foreign-facility",
            departmentId: dietary.id,
            actor: { userId: manager.id },
            draft: {
              name: "Bad",
              purposeType: "LOG",
              fields: [
                {
                  label: "X",
                  fieldType: "SHORT_TEXT",
                  displaySequence: 10,
                  isRequired: true,
                },
              ],
              schedules: [{ kind: "ONCE_PER_OPERATIONAL_DATE" }],
            },
          }),
        /authority|facility|Insufficient|Cross-facility/i,
      );
    } finally {
      if (prev === undefined) delete process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED;
      else process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
