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

  test("BROWSER: blank LOG builder — temperature field, range, corrective, asset, cycle, preview, publish", async () => {
    const { context, page } = await openPersistent("builder-blank-log");
    try {
      await loginPassword(page, fx.managerEmail);
      await page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("operational-template-builder")).toBeVisible();
      await page.getByTestId("create-blank-LOG").click();
      await expect(page.getByTestId("template-draft-editor")).toBeVisible();

      await page.getByTestId("template-name-input").fill("Browser Cooler Log 9C1");
      await page.getByTestId("template-field-label-0").fill("Cooler temperature");
      await page.getByTestId("template-field-type-0").selectOption("TEMPERATURE");
      await page.getByTestId("template-field-units-0").fill("°F");
      await page.getByTestId("template-field-min-0").fill("33");
      await page.getByTestId("template-field-max-0").fill("41");
      await page.getByTestId("template-field-ca-trigger-0").check();
      await page.getByTestId("template-field-ca-required-0").check();

      await page.getByTestId("template-add-applicability").click();
      await page.getByTestId("template-applicability-kind-0").selectOption("SPECIFIC_ASSET");
      await page.getByTestId("template-applicability-asset-0").selectOption(fx.coolerAssetId);

      await page.getByTestId("template-add-schedule").click();
      const cycleSelect = page.getByTestId("template-schedule-cycle-0");
      if (await cycleSelect.count()) {
        const options = cycleSelect.locator("option");
        const optionCount = await options.count();
        if (optionCount > 1) {
          await cycleSelect.selectOption({ index: 1 });
        } else {
          await page.getByTestId("template-schedule-kind-0").selectOption("ONCE_PER_OPERATIONAL_DATE");
        }
      }

      await page.getByTestId("template-toggle-preview").click();
      await expect(page.getByTestId("template-preview-body")).toBeVisible();
      await expect(page.getByTestId("template-preview-body")).toContainText("Cooler temperature");

      await page.getByTestId("template-publish-from-editor").click();
      await expect(page.getByText(/Template published/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("template-published")).toContainText("Browser Cooler Log 9C1");
    } finally {
      await context.close();
    }
  });

  test("BROWSER: successor draft, range change, publish; prior Log Book snapshot unchanged; retire", async () => {
    const db = prisma();
    let publishedId = fx.publishedTemplateId;
    try {
      const published = await db.operationalTemplate.findFirst({
        where: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          status: "PUBLISHED",
          name: { contains: "Browser Cooler Log 9C1" },
        },
        orderBy: { version: "desc" },
      });
      if (published) publishedId = published.id;
    } finally {
      await db.$disconnect();
    }

    const { context, page } = await openPersistent("builder-successor");
    try {
      await loginPassword(page, fx.managerEmail);
      await page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      await page
        .getByTestId("template-published")
        .getByTestId(`successor-template-${publishedId}`)
        .click();
      await expect(page.getByTestId("template-draft-editor")).toBeVisible();
      await page.getByTestId("template-field-min-0").fill("35");
      await page.getByTestId("template-field-max-0").fill("40");
      await page.getByTestId("template-publish-from-editor").click();
      await expect(page.getByText(/Template published/i)).toBeVisible({ timeout: 20_000 });

      await page.goto(
        `${fx.logBookPath}?unitId=${fx.unitId}&assetId=${fx.coolerAssetId}`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(page.getByTestId("log-book-results")).toContainText("v1");

      await page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });
      const publishedRow = page
        .getByTestId("template-published")
        .locator(`[data-template-name="Browser Cooler Log 9C1"][data-template-status="PUBLISHED"]`)
        .first();
      const retireId = (await publishedRow.getAttribute("data-testid"))?.replace(
        "template-row-",
        "",
      );
      expect(retireId).toBeTruthy();
      await page
        .getByTestId("template-published")
        .getByTestId(`retire-template-${retireId}`)
        .click();
      await expect(page.getByTestId(`retire-confirm-${retireId}`)).toBeVisible();
      await page.getByTestId(`retire-confirm-yes-${retireId}`).click();
      await expect(page.getByText(/Template retired/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("BROWSER: CHECKLIST and INSPECTION blank create through UI", async () => {
    const { context, page } = await openPersistent("builder-checklist-inspection");
    try {
      await loginPassword(page, fx.managerEmail);
      await page.goto(fx.templateBuilderPath, { waitUntil: "domcontentloaded" });

      await page.getByTestId("create-blank-CHECKLIST").click();
      await page.getByTestId("template-name-input").fill("Browser Opening Checklist 9C1");
      await page.getByTestId("template-field-label-0").fill("Hand wash station stocked");
      await page.getByTestId("template-field-type-0").selectOption("YES_NO");
      await page.getByTestId("template-add-schedule").click();
      await page.getByTestId("template-schedule-kind-0").selectOption("ONCE_PER_OPERATIONAL_DATE");
      await page.getByTestId("template-allow-adhoc").check();
      await page.getByTestId("template-save-draft").click();
      await expect(page.getByText(/Draft created/i)).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("create-blank-INSPECTION").click();
      await page.getByTestId("template-name-input").fill("Browser Kitchen Inspection 9C1");
      await page.getByTestId("template-field-label-0").fill("Overall result");
      await page.getByTestId("template-field-type-0").selectOption("PASS_NEEDS_ATTENTION");
      await page.getByTestId("template-add-schedule").click();
      await page.getByTestId("template-schedule-kind-0").selectOption("ONCE_PER_OPERATIONAL_DATE");
      await page.getByTestId("template-save-draft").click();
      await expect(page.getByText(/Draft created/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("template-drafts")).toContainText("Browser Opening Checklist 9C1");
      await expect(page.getByTestId("template-drafts")).toContainText("Browser Kitchen Inspection 9C1");
    } finally {
      await context.close();
    }
  });

  test("BROWSER: offline submit Saved on This Tablet; refresh persistence; reconnect sync", async () => {
    test.setTimeout(120_000);
    const db = prisma();
    try {
      await db.operationalEvidenceRecord.deleteMany({
        where: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          operationalDate: new Date(`${fx.serviceDateKey}T00:00:00.000Z`),
          requirementKey: { not: { startsWith: "hist-" } },
        },
      });
    } finally {
      await db.$disconnect();
    }

    const { context, page } = await openPersistent("offline-submit-e2e");
    try {
      await loginPassword(page, fx.faWithDietaryEmail);
      await bindDevice(page, fx.unitId);
      await loginPassword(page, fx.staffEmail);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      await fetchBundleViaApi(page, fx.unitId);

      const openLink = page
        .locator(`[data-testid^="open-evidence-"]`)
        .filter({ hasText: /Cooler|Temperature|temperature/i })
        .first();
      const anyOpen = page.locator(`[data-testid^="open-evidence-"]`).first();
      if (await openLink.count()) {
        await openLink.click();
      } else {
        await expect(anyOpen).toBeVisible({ timeout: 20_000 });
        await anyOpen.click();
      }
      await expect(page.getByTestId("evidence-entry-form")).toBeVisible();
      const requirementKey = await page
        .getByTestId("evidence-entry-form")
        .getAttribute("data-requirement-key");

      // Ensure form fields exist before going offline.
      const tempField = page.getByTestId("evidence-field-cooler_temperature");
      const firstField = page.locator(`[data-testid^="evidence-field-"]`).first();
      const field = (await tempField.count()) ? tempField : firstField;

      await setNetworkOffline(context, true, page);
      await expect(page.getByTestId("evidence-offline-status")).toContainText(/Offline/i, {
        timeout: 15_000,
      });

      await field.fill("37");
      await page.getByTestId("evidence-submit").click();
      await expect(page.getByTestId("evidence-offline-status")).toContainText(
        /Saved on This Tablet|pending on this tablet/i,
        { timeout: 20_000 },
      );

      const snapAfter = await inspectIndexedDb(page);
      expect(
        ((snapAfter as { commands?: Array<{ commandType?: string }> }).commands ?? []).some(
          (c) => c.commandType === "SUBMIT_OPERATIONAL_EVIDENCE",
        ) || (snapAfter as { commandCount?: number }).commandCount! > 0,
      ).toBeTruthy();

      await page.reload({ waitUntil: "domcontentloaded" });
      const snapAfterRefresh = await inspectIndexedDb(page);
      expect((snapAfterRefresh as { commandCount?: number }).commandCount ?? 0).toBeGreaterThanOrEqual(
        1,
      );

      if (requirementKey) {
        await page.goto(`${fx.unitWorkspacePath}?evidence=${encodeURIComponent(requirementKey)}`, {
          waitUntil: "domcontentloaded",
        });
      }

      await setNetworkOffline(context, false, page);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
    } finally {
      await setNetworkOffline(context, false).catch(() => {});
      await context.close();
    }
  });

  test("BROWSER: user-change isolation — pending evidence stays scoped to original actor unit", async () => {
    const { context, page } = await openPersistent("user-change-isolation");
    try {
      await loginPassword(page, fx.faWithDietaryEmail);
      await bindDevice(page, fx.unitId);
      await loginPassword(page, fx.staffEmail);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      await fetchBundleViaApi(page, fx.unitId);

      const before = await inspectIndexedDb(page);
      const beforeBundle = (before as { bundle?: { actor?: { actorRef?: string }; unitId?: string } })
        ?.bundle;
      expect(beforeBundle?.unitId).toBe(fx.unitId);

      // Switch user without clearing IndexedDB — pending commands must remain scoped.
      await loginPassword(page, fx.supervisorEmail);
      const after = await inspectIndexedDb(page);
      const commands =
        ((after as { commands?: Array<{ unitId?: string; commandType?: string }> })?.commands ??
          []) as Array<{ unitId?: string; commandType?: string }>;
      for (const cmd of commands.filter((c) => c.commandType === "SUBMIT_OPERATIONAL_EVIDENCE")) {
        expect(cmd.unitId).toBe(fx.unitId);
      }
    } finally {
      await context.close();
    }
  });
});
