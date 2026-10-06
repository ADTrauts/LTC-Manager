import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  assets: Array<{ id: string; assetCode: string; name: string; status: string }>;
  users: {
    manager: { email: string; password: string };
  };
  techEmployeeId: string;
};

const profileDir = process.env.PLANT_BROWSER_PROFILE_DIR || "tmp/plant-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.PLANT_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "plant-browser-artifacts", "fixtures.json");
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

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-4c-${suffix}-${Date.now()}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1400, height: 960 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("/login")) {
    return;
  }
  await expect(page.getByLabel(/^email$/i)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

test.describe("Phase 4C preventive maintenance builder @phase-4c @ci-gate", () => {
  test("manager configures, publishes, versions, and retires a PM Plan without generator side effects", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const asset = fx.assets.find((row) => row.status !== "OUT_OF_SERVICE" && row.status !== "RETIRED") ?? fx.assets[0];
    expect(asset).toBeTruthy();

    await db.knowledgeArticle.create({
      data: {
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        title: `Quarterly Dishwasher SOP ${suffix}`,
        summary: "PM procedure",
        body: "Inspect spray arms and drain.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
        publishedAt: new Date(),
        versions: {
          create: {
            id: cuidLike(),
            version: 1,
            status: "PUBLISHED",
            title: `Quarterly Dishwasher SOP ${suffix}`,
            summary: "PM procedure",
            body: "Inspect spray arms and drain.",
            publishedAt: new Date(),
          },
        },
      },
    });
    await db.knowledgeArticle.create({
      data: {
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        title: `Annual Dishwasher SOP ${suffix}`,
        summary: "Successor procedure",
        body: "Annual inspect and service.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
        publishedAt: new Date(),
        versions: {
          create: {
            id: cuidLike(),
            version: 1,
            status: "PUBLISHED",
            title: `Annual Dishwasher SOP ${suffix}`,
            summary: "Successor procedure",
            body: "Annual inspect and service.",
            publishedAt: new Date(),
          },
        },
      },
    });
    const template = await db.operationalTemplate.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        name: `Generator inspection ${suffix}`,
        purposeType: "INSPECTION",
        status: "PUBLISHED",
        version: 1,
        stableKey: `pm-4c-${suffix.toLowerCase()}`,
        allowAdHoc: true,
        publishedAt: new Date(),
      },
    });

    const { context, page } = await openPersistent("pm-builder");
    try {
      await loginPassword(page, fx.users.manager.email, password);
      const listHref = `/build/departments/${fx.plantDepartmentId}/preventive-maintenance`;
      await page.goto(listHref);
      await expect(page.getByTestId("pm-plan-list")).toBeVisible({ timeout: 30_000 });

      await page.getByTestId("pm-plan-create").click();
      await expect(page.getByTestId("pm-plan-editor")).toBeVisible({ timeout: 20_000 });

      const planName = `Quarterly Dishwasher PM ${suffix}`;
      await page.getByTestId("pm-field-name").fill(planName);
      await page.getByTestId("pm-field-asset").selectOption(asset!.id);
      await page.getByTestId("pm-field-cadence").selectOption("monthly");
      await page.getByTestId("pm-field-anchor").fill("2027-01-31");
      await page.getByTestId("pm-field-effective").fill("2027-01-01");
      await page.getByTestId("pm-field-lead").fill("7");

      await expect(page.getByTestId("pm-schedule-preview")).toContainText("Projected schedule");
      const preview = page.getByTestId("pm-projected-dates");
      await expect(preview).toContainText("Jan 31, 2027");
      await expect(preview).toContainText("Feb 28, 2027");
      await expect(preview).toContainText("Mar 31, 2027");
      await expect(preview).toContainText("Apr 30, 2027");

      await page.getByTestId("pm-field-cadence").selectOption("quarterly");
      await page.getByTestId("pm-field-anchor").fill("2027-01-15");

      const category = page.getByTestId("pm-field-category");
      const categoryValue = await category.locator("option").nth(1).getAttribute("value");
      expect(categoryValue).toBeTruthy();
      await category.selectOption(categoryValue!);
      await page.getByTestId("pm-field-priority").selectOption("ROUTINE");
      await page.getByTestId("pm-field-procedure").selectOption({ label: `Quarterly Dishwasher SOP ${suffix} v1` });
      await page.getByTestId("pm-field-technician").selectOption(fx.techEmployeeId);
      await page.getByTestId("pm-field-record-add").selectOption(template.id);

      await expect(page.getByTestId("pm-schedule-preview")).toContainText("Projected schedule");
      await expect(preview).toContainText("Jan 15, 2027");
      await expect(preview).toContainText("Apr 15, 2027");
      await expect(preview).toContainText("Jul 15, 2027");
      await expect(preview).toContainText("Oct 15, 2027");

      await page.getByTestId("pm-save-draft").click();
      await expect(page).toHaveURL(new RegExp(`/preventive-maintenance/c`));

      const createdPlan = await db.preventiveMaintenancePlan.findFirst({
        where: {
          departmentId: fx.plantDepartmentId,
          versions: { some: { name: planName } },
        },
      });
      expect(createdPlan).toBeTruthy();
      const draftOccurrences = await db.preventiveMaintenanceOccurrence.count({
        where: { planId: createdPlan!.id },
      });
      expect(draftOccurrences).toBe(0);
      const draftWorkOrders = await db.repair.count({
        where: { workOrderKind: "PREVENTIVE", title: planName },
      });
      expect(draftWorkOrders).toBe(0);

      await expect(page.getByTestId("pm-plan-editor")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("pm-publish").click();
      await expect(page.getByTestId("pm-edit-plan")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("pm-version-history")).toContainText("v1");

      const publishedOccurrences = await db.preventiveMaintenanceOccurrence.count({
        where: { planId: createdPlan!.id },
      });
      expect(publishedOccurrences).toBe(0);

      await page.getByTestId("pm-edit-plan").click();
      await expect(page.getByTestId("pm-successor-banner")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("pm-field-cadence").selectOption("annual");
      await page.getByTestId("pm-field-effective").fill("2027-07-01");
      await expect(page.getByTestId("pm-field-effective")).toHaveValue("2027-07-01");
      await page.getByTestId("pm-field-procedure").selectOption({
        label: `Annual Dishwasher SOP ${suffix} v1`,
      });
      await page.getByTestId("pm-publish").click();
      await expect(page.getByTestId("pm-history-v2")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("pm-history-v1")).toContainText("Superseded");
      await expect(page.getByTestId("pm-edit-plan")).toBeVisible();

      const v1 = await db.preventiveMaintenancePlanVersion.findFirst({
        where: { planId: createdPlan!.id, version: 1 },
      });
      expect(v1?.status).toBe("SUPERSEDED");
      expect(v1?.intervalMonths).toBe(3);

      await page.getByTestId("pm-retire").click();
      await page.getByTestId("pm-retire-confirm").click();
      await expect(page.getByTestId("pm-plan-retired")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("pm-version-history")).toBeVisible();
      const retired = await db.preventiveMaintenancePlan.findUnique({
        where: { id: createdPlan!.id },
      });
      expect(retired?.status).toBe("RETIRED");
      const historyCount = await db.preventiveMaintenancePlanVersion.count({
        where: { planId: createdPlan!.id },
      });
      expect(historyCount).toBeGreaterThanOrEqual(2);
    } finally {
      await context.close();
      await db.$disconnect();
    }
  });
});
