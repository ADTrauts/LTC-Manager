import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type ViewFixtures = {
  facilityId: string;
  administrator: { userId: string; email: string; employeeId: string };
  plantManagerEmployeeId: string;
  foodAndNutritionId: string;
  plantId: string;
  plantRequestCode: string;
};

const ACTIVE_DEPARTMENT_COOKIE = "ltc_active_department";
const VIEW_REASON = "You can view this Department. Changes are made by its head and team.";

function loadFixtures(): ViewFixtures {
  const path =
    process.env.FACILITY_ADMINISTRATOR_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "facility-administrator-browser-artifacts", "fixtures.json");
  return (JSON.parse(readFileSync(path, "utf8")) as { view: ViewFixtures }).view;
}

async function signIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const baseURL = process.env.FACILITY_ADMINISTRATOR_BROWSER_BASE_URL;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("SEED_DEMO_PASSWORD required");
  const res = await page.request.post("/api/auth/login", {
    data: { email, password },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  return { context, page };
}

async function openDepartment(context: BrowserContext, departmentId: string) {
  const baseURL = process.env.FACILITY_ADMINISTRATOR_BROWSER_BASE_URL || "http://127.0.0.1:3000";
  await context.addCookies([{ name: ACTIVE_DEPARTMENT_COOKIE, value: departmentId, url: baseURL }]);
}

test.describe.configure({ mode: "serial" });

test("view @ci-gate: the Facility Administrator opens Work, Log Book, preventive maintenance and Plant requests in every self-operated Department", async ({ browser }) => {
  const fx = loadFixtures();
  const { context, page } = await signIn(browser, fx.administrator.email);
  try {
    for (const departmentId of [fx.foodAndNutritionId, fx.plantId]) {
      await openDepartment(context, departmentId);

      await page.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("work-plan-builder-page")).toBeVisible();
      await expect(page.getByTestId("work-plan-builder-denied")).toHaveCount(0);

      await page.goto("/staffing/log-book", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("evidence-log-book")).toBeVisible();
      await expect(page.getByTestId("evidence-log-book-denied")).toHaveCount(0);
    }

    await page.goto("/preventive-maintenance", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pm-run-board")).toBeVisible();
    // A denied viewer sees an empty board; the published plan only counts once viewing is allowed.
    await expect(page.getByTestId("pm-run-no-plans")).toHaveCount(0);

    await page.goto("/staffing/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("supervisor-operations-board")).toBeVisible();
    await page.getByTestId(`plant-request-${fx.plantRequestCode}`).click();
    await expect(page.getByTestId("plant-triage-read-only")).toContainText(VIEW_REASON);
    await expect(page.getByTestId("plant-accept-issue")).toHaveCount(0);
    await expect(page.getByTestId("plant-decline")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("heads @ci-gate: Departments without a head are listed, and the head chooses managers who add staff", async ({ browser }) => {
  const fx = loadFixtures();
  const { context, page } = await signIn(browser, fx.administrator.email);
  try {
    await page.goto("/admin/departments", { waitUntil: "domcontentloaded" });
    const needingHead = page.getByTestId("departments-needing-head");
    await expect(needingHead.getByTestId(`department-needs-head-${fx.foodAndNutritionId}`)).toContainText("No head yet");
    await expect(needingHead.getByTestId(`department-needs-head-${fx.plantId}`)).toContainText("No head yet");

    await needingHead.getByTestId(`department-needs-head-${fx.plantId}`).getByRole("link", { name: "Name a head" }).click();
    await page.waitForURL(`**/department/settings/${fx.plantId}`);
    await page.locator('select[name="headEmployeeId"]').selectOption(fx.administrator.employeeId);
    await page.getByRole("button", { name: "Save head" }).click();
    await expect(page.getByText(/Head: .*, Viewer/)).toBeVisible();

    const manager = page.getByTestId(`staff-manager-${fx.plantManagerEmployeeId}`);
    await expect(manager).toContainText("Does not add staff or set roles");
    await manager.getByRole("button", { name: "Allow" }).click();
    await expect(manager.getByRole("status")).toContainText("Allowed to add staff and set roles.");
    await expect(manager).toContainText("May add staff and set roles");

    const db = new PrismaClient({ datasources: { db: { url: process.env.VERIFY_DATABASE_URL } } });
    try {
      const grant = await db.departmentStaffManager.findUnique({
        where: { departmentId_employeeId: { departmentId: fx.plantId, employeeId: fx.plantManagerEmployeeId } },
        select: { grantedByEmployeeId: true },
      });
      expect(grant?.grantedByEmployeeId).toBe(fx.administrator.employeeId);
    } finally {
      await db.$disconnect();
    }

    await page.goto("/admin/departments", { waitUntil: "domcontentloaded" });
    await expect(needingHead.getByTestId(`department-needs-head-${fx.plantId}`)).toHaveCount(0);
    await expect(needingHead.getByTestId(`department-needs-head-${fx.foodAndNutritionId}`)).toBeVisible();
  } finally {
    await context.close();
  }
});
