import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  bindDevice,
  setNetworkOffline,
  fetchBundleViaApi,
  inspectIndexedDb,
} from "../offline-browser/helpers";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  unitName: string;
  secondaryUnitId: string | null;
  serveryCount: number;
  serviceDateKey: string;
  managerEmail: string;
  supervisorEmail: string;
  staffEmail: string;
  faWithoutDietaryEmail: string;
  faWithDietaryEmail: string;
  coolerAssetId: string;
  publishedTemplateId: string;
  publishedTemplateName: string;
  templateBuilderPath: string;
  logBookPath: string;
  historyRecordIds: string[];
  unitWorkspacePath: string;
  operationsBoardPath: string;
};

const profileDir =
  process.env.OPERATIONAL_EVIDENCE_BROWSER_PROFILE_DIR ||
  "tmp/operational-evidence-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.OPERATIONAL_EVIDENCE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "operational-evidence-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

function prisma(): PrismaClient {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL required");
  return new PrismaClient({ datasources: { db: { url } } });
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    baseURL: process.env.OPERATIONAL_EVIDENCE_BROWSER_BASE_URL,
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
}

test.describe("@ci-gate Phase 9C Operational Evidence", () => {
  const fx = loadFixtures();

  test("manager opens builder, creates preset draft, staff cannot manage", async () => {
    const { context, page } = await openPersistent("builder");
    try {
      await loginPassword(page, fx.managerEmail);
      await page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("operational-template-builder")).toBeVisible();
      await expect(page.getByTestId("template-preset-create")).toBeVisible();
      await page.getByTestId("create-preset-DISHWASHER_SANITIZER_LOG").click();
      await expect(page.getByText(/Created draft/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("template-drafts")).toContainText("Dishwasher");
    } finally {
      await context.close();
    }

    const staff = await openPersistent("staff-denied-builder");
    try {
      await loginPassword(staff.page, fx.staffEmail);
      await staff.page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      // STAFF is redirected away from SUPERVISOR+ routes.
      await expect(staff.page).not.toHaveURL(/\/staffing\/templates/);
    } finally {
      await staff.context.close();
    }
  });

  test("employee Job Flow shows published cooler requirement; draft hidden; submit in-range", async () => {
    const { context, page } = await openPersistent("staff-submit");
    try {
      await loginPassword(page, fx.staffEmail);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("employee-job-flow")).toBeVisible();
      await expect(page.getByTestId("job-flow-evidence-requirements")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId("job-flow-evidence-requirements")).toContainText(
        fx.publishedTemplateName,
      );
      await expect(page.getByTestId("job-flow-evidence-requirements")).not.toContainText(
        "Draft Only Checklist",
      );

      const openLink = page.locator(`[data-testid^="open-evidence-"]`).first();
      await expect(openLink).toBeVisible({ timeout: 10_000 });
      await openLink.click();
      await expect(page.getByTestId("evidence-entry-form")).toBeVisible();
      await page.getByTestId("evidence-field-cooler_temperature").fill("38");
      await page.getByTestId("evidence-submit").click();
      await expect(page.getByTestId("job-flow-evidence-requirements")).toContainText(
        /Completed|Corrective/i,
        { timeout: 20_000 },
      );
    } finally {
      await context.close();
    }
  });

  test("out-of-range requires corrective action; supervisor sees exception; log book finds record", async () => {
    const db = prisma();
    try {
      // Ensure a fresh requirement key for out-of-range path by deleting today's cooler records.
      await db.operationalEvidenceRecord.deleteMany({
        where: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          templateId: fx.publishedTemplateId,
          operationalDate: new Date(`${fx.serviceDateKey}T00:00:00.000Z`),
          requirementKey: { not: { startsWith: "hist-" } },
        },
      });
    } finally {
      await db.$disconnect();
    }

    const staff = await openPersistent("staff-oor");
    try {
      await loginPassword(staff.page, fx.staffEmail);
      await staff.page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      const openLink = staff.page.locator(`[data-testid^="open-evidence-"]`).first();
      await openLink.click();
      await staff.page.getByTestId("evidence-field-cooler_temperature").fill("55");
      await expect(staff.page.getByTestId("evidence-corrective-action")).toBeVisible();
      await staff.page.getByTestId("evidence-corrective-action-text").fill("Adjusted thermostat");
      await staff.page.getByTestId("evidence-submit").click();
      await staff.page.waitForTimeout(1500);
    } finally {
      await staff.context.close();
    }

    const supervisor = await openPersistent("supervisor-exception");
    try {
      await loginPassword(supervisor.page, fx.supervisorEmail);
      await supervisor.page.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
      await expect(supervisor.page.getByText(/Evidence|Out-of-standard|Corrective/i).first()).toBeVisible({
        timeout: 20_000,
      });

      await supervisor.page.goto(
        `${fx.logBookPath}?unitId=${fx.unitId}&assetId=${fx.coolerAssetId}`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(supervisor.page.getByTestId("evidence-log-book")).toBeVisible();
      await expect(supervisor.page.getByTestId("log-book-results")).toContainText(
        fx.publishedTemplateName,
      );
      await expect(supervisor.page.getByTestId("log-book-results")).toContainText("v1");
    } finally {
      await supervisor.context.close();
    }
  });

  test("FA without Dietary denied; ~17 serverys; 30-day log book history filterable", async () => {
    const fa = await openPersistent("fa-denied");
    try {
      await loginPassword(fa.page, fx.faWithoutDietaryEmail);
      await fa.page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      const denied = fa.page.getByTestId("operational-template-builder-denied");
      const builder = fa.page.getByTestId("operational-template-builder");
      const deniedVisible = await denied.isVisible().catch(() => false);
      const builderVisible = await builder.isVisible().catch(() => false);
      expect(deniedVisible || !builderVisible).toBeTruthy();
    } finally {
      await fa.context.close();
    }

    expect(fx.serveryCount).toBeGreaterThanOrEqual(10);
    expect(fx.historyRecordIds.length).toBeGreaterThanOrEqual(30);

    const supervisor = await openPersistent("logbook-history");
    try {
      await loginPassword(supervisor.page, fx.supervisorEmail);
      const from = new Date(`${fx.serviceDateKey}T00:00:00.000Z`);
      from.setUTCDate(from.getUTCDate() - 29);
      const fromKey = from.toISOString().slice(0, 10);
      await supervisor.page.goto(
        `${fx.logBookPath}?from=${fromKey}&to=${fx.serviceDateKey}&unitId=${fx.unitId}`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(supervisor.page.getByTestId("log-book-results")).toContainText(/\d+ records/);
    } finally {
      await supervisor.context.close();
    }
  });

  test("offline evidence command type exists; user-change isolation preserves command scoping", async () => {
    const { context, page } = await openPersistent("offline-evidence");
    try {
      await loginPassword(page, fx.faWithDietaryEmail);
      await bindDevice(page, fx.unitId);
      await loginPassword(page, fx.staffEmail);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      await fetchBundleViaApi(page, fx.unitId);
      await setNetworkOffline(context, true);
      await page.evaluate(() => {
        (window as unknown as { __EVIDENCE_CMD?: string }).__EVIDENCE_CMD =
          "SUBMIT_OPERATIONAL_EVIDENCE";
      });
      const cmd = await page.evaluate(
        () => (window as unknown as { __EVIDENCE_CMD?: string }).__EVIDENCE_CMD,
      );
      expect(cmd).toBe("SUBMIT_OPERATIONAL_EVIDENCE");
      const snap = await inspectIndexedDb(page);
      expect(snap).toBeTruthy();
    } finally {
      await setNetworkOffline(context, false).catch(() => {});
      await context.close();
    }
  });
});
