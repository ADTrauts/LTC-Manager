#!/usr/bin/env node
/**
 * Phase 11A Department Work Plans browser fixtures.
 * Reuses Asset Operations fixtures, then adds a published Work Plan + confirmed assignment.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "tmp", "work-plans-browser-artifacts");
const FIXTURE_PATH =
  process.env.WORK_PLANS_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function fail(message) {
  console.error(`work-plans-browser-fixtures: FAIL — ${message}`);
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
      `work-plans-browser-fixtures: template cleanup warning — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await cleanupDb.$disconnect();
  }

  // Always generate Asset fixtures against the current VERIFY_DATABASE_URL.
  // Do not reuse prior artifact fixtures from a different disposable database.
  const assetResult = spawnSync(
    process.execPath,
    ["scripts/verify/asset-operations-browser-fixtures.mjs"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ASSET_OPERATIONS_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
      },
      stdio: "inherit",
    },
  );
  if (assetResult.status !== 0) {
    fail("asset-operations fixtures exited non-zero");
  }

  if (!existsSync(FIXTURE_PATH)) fail("fixtures.json missing after asset fixture run");
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Confirm department exists in this database before linking KnowledgeArticle.
    const dietary = await db.department.findFirst({
      where: { id: fx.departmentId, facilityId: fx.facilityId },
      select: { id: true },
    });
    if (!dietary) {
      fail(
        `fixture departmentId ${fx.departmentId} missing in VERIFY database — regenerate Asset fixtures for this URL`,
      );
    }

    const article =
      (await db.knowledgeArticle.findFirst({
        where: {
          facilityId: fx.facilityId,
          status: "PUBLISHED",
          OR: [{ departmentId: fx.departmentId }, { departmentId: null }],
        },
        select: { id: true, title: true },
      })) ??
      (await db.knowledgeArticle.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          title: "Browser Work Procedure",
          summary: "Procedure for browser gate",
          body: "Step 1. Confirm stations.\nStep 2. Record completion.",
          status: "PUBLISHED",
          category: "SOP",
          publishedAt: new Date(),
        },
        select: { id: true, title: true },
      }));

    const planId = cuidLike();
    const itemId = cuidLike();
    const itemKey = "browser_verify_stations";
    await db.departmentWorkPlan.create({
      data: {
        id: planId,
        facilityId: fx.facilityId,
        departmentId: fx.departmentId,
        stableKey: `browser_servery_opening_${planId.slice(-6)}`,
        version: 1,
        name: "Browser Servery Opening",
        description: "Published Work Plan for browser gate",
        status: "PUBLISHED",
        publishedAt: new Date(),
        weekdays: [],
        applicabilities: {
          create: [{ id: cuidLike(), kind: "DEPARTMENT_UNIT" }],
        },
        items: {
          create: [
            {
              id: itemId,
              itemKey,
              label: "Verify stations ready",
              instructions: "Confirm stations are stocked.",
              displaySequence: 10,
              priority: "TIME_SENSITIVE",
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
              knowledgeArticleId: article.id,
              procedureTitleSnapshot: article.title,
              supervisorVisible: true,
            },
          ],
        },
      },
    });

    const out = {
      ...fx,
      workPlanId: planId,
      workPlanItemId: itemId,
      workPlanItemKey: itemKey,
      workPlanName: "Browser Servery Opening",
      procedureArticleId: article.id,
      procedureTitle: article.title,
      workPlansPath: "/staffing/work-plans",
      workPlansEnabled: true,
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(out, null, 2));

    const assetPins = join(ROOT, "tmp", "asset-operations-browser-artifacts", "pins.env");
    if (existsSync(assetPins)) {
      writeFileSync(PINS_PATH, readFileSync(assetPins, "utf8"));
    } else if (!existsSync(PINS_PATH)) {
      writeFileSync(PINS_PATH, "");
    }
    console.log(`work-plans-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
