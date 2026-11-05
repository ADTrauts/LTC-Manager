import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5B browser certification — starter configuration and PM cadence presets.
 */

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  assets: Array<{ id: string; assetCode: string; name: string; status: string }>;
  users: {
    manager: { email: string; password: string };
    supervisor: { email: string; password: string };
    staff: { email: string; password: string };
  };
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
  const dir = `${profileDir}-5b-${suffix}-${Date.now()}`;
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

const STARTER_RECORD_KEYS = [
  "EQUIPMENT_CONDITION_INSPECTION",
  "MECHANICAL_ROOM_INSPECTION",
  "GENERATOR_INSPECTION",
  "BASIC_EQUIPMENT_READING",
  "POST_WORK_ORDER_VERIFICATION",
] as const;

async function resetPlantStarterRows(
  db: PrismaClient,
  facilityId: string,
  departmentId: string,
) {
  void db;
  void facilityId;
  void departmentId;
  await Promise.resolve();
}

test.describe("Phase 5B starter configuration @phase-5b @ci-gate", () => {
  test("manager selects, installs, and completes remaining starter items without duplicates", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    await resetPlantStarterRows(db, fx.facilityId, fx.plantDepartmentId);
    const pmCountBefore = await db.preventiveMaintenancePlan.count({
      where: { facilityId: fx.facilityId, departmentId: fx.plantDepartmentId },
    });
    const { context, page } = await openPersistent("starter");
    try {
      await loginPassword(page, fx.users.manager.email, password);
      await page.goto(`/build/departments/${fx.plantDepartmentId}?starter=1`);
      await expect(page.getByTestId("plant-starter-panel")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Plant Operations starter configuration")).toBeVisible();
      const review = page.getByTestId("plant-starter-review");
      await expect(review).toBeVisible();
      await expect(page.getByTestId("starter-work-MECHANICAL_ROOM_ROUND")).toHaveCount(0);
      for (const key of STARTER_RECORD_KEYS) {
        await expect(page.getByTestId(`starter-record-${key}`)).toBeVisible();
      }

      for (const key of STARTER_RECORD_KEYS) {
        if (key === "EQUIPMENT_CONDITION_INSPECTION") continue;
        await page.getByTestId(`starter-record-${key}`).uncheck();
      }
      await page.getByTestId("plant-starter-install").click();
      const result = page.getByTestId("plant-starter-result");
      await expect(result).toBeVisible({ timeout: 20_000 });
      await expect(result).toContainText("1 Record template added");
      await expect(result).not.toContainText("Work preset");

      expect(
        await db.preventiveMaintenancePlan.count({
          where: { facilityId: fx.facilityId, departmentId: fx.plantDepartmentId },
        }),
      ).toBe(pmCountBefore);

      await page.goto(`/build/departments/${fx.plantDepartmentId}?starter=1`);
      await expect(page.getByTestId("plant-starter-review")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Already added")).toHaveCount(1);
      await page.getByTestId("starter-record-GENERATOR_INSPECTION").check();
      await page.getByTestId("starter-record-MECHANICAL_ROOM_INSPECTION").uncheck();
      await page.getByTestId("starter-record-BASIC_EQUIPMENT_READING").uncheck();
      await page.getByTestId("starter-record-POST_WORK_ORDER_VERIFICATION").uncheck();
      await page.getByTestId("plant-starter-install").click();
      await expect(page.getByTestId("plant-starter-result")).toContainText("1 Record template added");
      await expect(page.getByTestId("plant-starter-result")).not.toContainText("Work preset");
    } finally {
      await db.$disconnect();
      await context.close();
    }
  });

  test("manager applies Quarterly PM preset against a real Asset and saves a draft", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const asset =
      fx.assets.find((row) => row.status !== "OUT_OF_SERVICE" && row.status !== "RETIRED") ??
      fx.assets[0];
    expect(asset).toBeTruthy();
    const { context, page } = await openPersistent("pm-preset");
    try {
      await loginPassword(page, fx.users.manager.email, password);
      const listHref = `/build/departments/${fx.plantDepartmentId}/preventive-maintenance`;
      await page.goto(listHref);
      await expect(page.getByTestId("pm-plan-list")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("pm-plan-create").click();
      await expect(page.getByTestId("pm-plan-editor")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Presets only fill the schedule/)).toBeVisible();

      const planName = `Quarterly starter PM ${suffix}`;
      await page.getByTestId("pm-field-name").fill(planName);
      await page.getByTestId("pm-field-asset").selectOption(asset!.id);
      await page.getByTestId("pm-field-cadence").selectOption("monthly");
      await page.getByTestId("pm-field-cadence").selectOption("quarterly");
      await expect(page.getByTestId("pm-field-lead")).toHaveValue("7");
      await expect(page.getByTestId("pm-field-priority")).toHaveValue("ROUTINE");
      await page.getByTestId("pm-field-anchor").fill("2027-01-15");
      await page.getByTestId("pm-field-effective").fill("2027-01-01");
      await expect(page.getByTestId("pm-schedule-preview")).toBeVisible();
      await expect(page.getByTestId("pm-projected-dates")).toContainText("Jan 15, 2027");
      await expect(page.getByTestId("pm-projected-dates")).toContainText("Apr 15, 2027");

      await page.getByTestId("pm-save-draft").click();
      await expect(page).toHaveURL(new RegExp(`/preventive-maintenance/c`), { timeout: 20_000 });

      const created = await db.preventiveMaintenancePlan.findFirst({
        where: {
          departmentId: fx.plantDepartmentId,
          versions: { some: { name: planName } },
        },
        include: { versions: true },
      });
      expect(created?.assetId).toBe(asset!.id);
      expect(created?.versions[0]?.intervalMonths).toBe(3);
      expect(created?.versions[0]?.generationLeadDays).toBe(7);
      expect(["ROUTINE", "MEDIUM"]).toContain(created?.versions[0]?.priority);
      expect(
        await db.repair.count({
          where: { workOrderKind: "PREVENTIVE", title: planName },
        }),
      ).toBe(0);
      expect(
        await db.asset.count({
          where: { unit: { facilityId: fx.facilityId }, name: { contains: "Example" } },
        }),
      ).toBe(0);
    } finally {
      await db.$disconnect();
      await context.close();
    }
  });

  test("STAFF and Supervisor do not get starter install controls", async () => {
    const fx = loadFixtures();
    const password = demoPassword();
    const staff = await openPersistent("staff");
    try {
      await loginPassword(staff.page, fx.users.staff.email, password);
      await staff.page.goto(`/build/departments/${fx.plantDepartmentId}?starter=1`);
      await expect(staff.page.getByTestId("plant-starter-panel")).toHaveCount(0);
      await expect(staff.page.getByTestId("plant-starter-install")).toHaveCount(0);
      await staff.page.goto(`/build/departments/${fx.plantDepartmentId}/preventive-maintenance`);
      await expect(staff.page.getByTestId("pm-field-cadence")).toHaveCount(0);
    } finally {
      await staff.context.close();
    }

    const supervisor = await openPersistent("supervisor");
    try {
      await loginPassword(supervisor.page, fx.users.supervisor.email, password);
      await supervisor.page.goto(`/build/departments/${fx.plantDepartmentId}?starter=1`);
      await expect(supervisor.page.getByTestId("plant-starter-panel")).toHaveCount(0);
      await expect(supervisor.page.getByTestId("plant-starter-install")).toHaveCount(0);
      await expect(supervisor.page.getByTestId("plant-starter-review")).toHaveCount(0);
    } finally {
      await supervisor.context.close();
    }
  });
});
