#!/usr/bin/env node
/**
 * Phase 10A Asset Operations browser fixtures.
 * Reuses Operational Evidence fixtures, then adds Asset Ops–specific IDs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "tmp", "asset-operations-browser-artifacts");
const FIXTURE_PATH =
  process.env.ASSET_OPERATIONS_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function fail(message) {
  console.error(`asset-operations-browser-fixtures: FAIL — ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  assertDisposableDatabaseUrl(url);

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Sequential gates re-seed then re-run fixtures on the same VERIFY DB.
  // Clear prior browser fixture templates so OperationalTemplate unique keys do not collide.
  const cleanupDb = new PrismaClient({ datasources: { db: { url } } });
  try {
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalEvidenceFieldValue"
      WHERE "recordId" IN (
        SELECT id FROM "OperationalEvidenceRecord"
        WHERE "templateStableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
           OR "templateId" IN (
             SELECT id FROM "OperationalTemplate"
             WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
           )
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "AssetIssueEvidenceLink"
      WHERE "evidenceRecordId" IN (
        SELECT id FROM "OperationalEvidenceRecord"
        WHERE "templateStableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
           OR "templateId" IN (
             SELECT id FROM "OperationalTemplate"
             WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
           )
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalEvidenceRecord"
      WHERE "templateStableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
         OR "templateId" IN (
           SELECT id FROM "OperationalTemplate"
           WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
         )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalTemplateApplicability"
      WHERE "templateId" IN (
        SELECT id FROM "OperationalTemplate"
        WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalTemplateField"
      WHERE "templateId" IN (
        SELECT id FROM "OperationalTemplate"
        WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalTemplateSchedule"
      WHERE "templateId" IN (
        SELECT id FROM "OperationalTemplate"
        WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalTemplateEvent"
      WHERE "templateId" IN (
        SELECT id FROM "OperationalTemplate"
        WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')
      )`);
    await cleanupDb.$executeRawUnsafe(`
      DELETE FROM "OperationalTemplate"
      WHERE "stableKey" IN ('cooler_temperature_log', 'draft_only_checklist')`);
  } catch (err) {
    console.warn(
      `asset-operations-browser-fixtures: template cleanup warning — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await cleanupDb.$disconnect();
  }

  // Reuse Phase 9C fixtures for evidence regression coverage (39–42).
  const evidenceResult = spawnSync(
    process.execPath,
    ["scripts/verify/operational-evidence-browser-fixtures.mjs"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        OPERATIONAL_EVIDENCE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
      },
      stdio: "inherit",
    },
  );
  if (evidenceResult.status !== 0) {
    fail("operational-evidence fixtures exited non-zero");
  }

  if (!existsSync(FIXTURE_PATH)) fail("fixtures.json missing after evidence fixture run");
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const dietary = await db.department.findFirstOrThrow({
      where: { id: fx.departmentId },
      select: { id: true },
    });
    const vendor =
      (await db.vendor.findFirst({
        where: { facilityId: fx.facilityId },
        select: { id: true, name: true },
      })) ??
      (await db.vendor.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facilityId,
          name: "Asset Ops Browser Vendor",
        },
        select: { id: true, name: true },
      }));

    const fridge = await db.asset.create({
      data: {
        id: cuidLike(),
        assetCode: `FRIDGE-${cuidLike().slice(1, 7).toUpperCase()}`,
        name: "Browser Refrigerator 10A",
        equipmentType: "Refrigerator",
        unitId: fx.unitId,
        departmentId: dietary.id,
        status: "OPERATIONAL",
        manufacturer: "ColdCo",
        model: "R-100",
        serialNumber: "SN-10A-001",
        vendorId: vendor.id,
        statusHistory: {
          create: {
            id: cuidLike(),
            fromStatus: null,
            toStatus: "OPERATIONAL",
            reason: "INITIAL",
            note: "Browser fixture",
          },
        },
      },
      select: { id: true, assetCode: true, name: true },
    });

    // Bind published cooler template to fridge as well when present.
    if (fx.publishedTemplateId) {
      const already = await db.operationalTemplateApplicability.findFirst({
        where: { templateId: fx.publishedTemplateId, assetId: fridge.id },
      });
      if (!already) {
        await db.operationalTemplateApplicability.create({
          data: {
            id: cuidLike(),
            templateId: fx.publishedTemplateId,
            kind: "SPECIFIC_ASSET",
            assetId: fridge.id,
          },
        });
      }
    }

    const out = {
      ...fx,
      fridgeAssetId: fridge.id,
      fridgeAssetCode: fridge.assetCode,
      fridgeAssetName: fridge.name,
      vendorId: vendor.id,
      vendorName: vendor.name,
      assetsPath: "/assets",
      assetOpsEnabled: true,
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(out, null, 2));

    const evidencePins = join(
      ROOT,
      "tmp",
      "operational-evidence-browser-artifacts",
      "pins.env",
    );
    if (existsSync(evidencePins)) {
      writeFileSync(PINS_PATH, readFileSync(evidencePins, "utf8"));
    } else if (!existsSync(PINS_PATH)) {
      writeFileSync(PINS_PATH, "");
    }
    console.log(`asset-operations-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
