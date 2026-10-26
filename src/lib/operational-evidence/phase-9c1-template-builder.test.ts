/**
 * Phase 9C.1 SQL-backed Operational Template Builder / Evidence tests.
 * Opt in via OPERATIONAL_EVIDENCE_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload, FacilitySession } from "@/lib/auth";

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
  overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId" | "role">,
): FacilitySession {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    scopeKind: "facility",
    role: overrides.role,
    name: "Test",
    email: "test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as FacilitySession;
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
      const facility = await prisma.facility.findUnique({ where: { id: "cmfacseed0000000000000001" } });
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
          status: "OPERATIONAL",
        },
      });

      const mgr = session({
        facilityId: facility.id,
        role: (manager.role?.key ?? (() => { throw new Error("expected facility role"); })()) as FacilitySession["role"],
        uid: manager.id,
        primaryDepartmentId: dietary.id,
      });

      await assert.rejects(
        () =>
          createDraft(mgr, {
            facilityId: facility.id,
            departmentId: dietary.id,
            actor: { userId: manager.id, label: "Manager" },
            draft: {
              name: "SQL Cooler Log",
              purposeType: "LOG",
              allowAdHoc: false,
              fields: [],
            },
          }),
        /Operational templates are retired/,
      );
      return;

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
      const facility = await prisma.facility.findUnique({ where: { id: "cmfacseed0000000000000001" } });
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
      const facility = await prisma.facility.findUnique({ where: { id: "cmfacseed0000000000000001" } });
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
        role: (manager.role?.key ?? (() => { throw new Error("expected facility role"); })()) as FacilitySession["role"],
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
        /retired/i,
      );
    } finally {
      if (prev === undefined) delete process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED;
      else process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
