import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type DashboardFixtures = {
  dietaryId: string;
  plantId: string;
  fa: { email: string; employeeId: string };
  leader: { email: string };
  manager: { email: string };
  supervisor: { email: string };
  plantLeader: { email: string };
  vendorGm: { email: string; partnershipId: string };
};

function loadFixtures(): DashboardFixtures {
  const path =
    process.env.DASHBOARD_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "dashboard-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as DashboardFixtures;
}

async function signIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const baseURL = process.env.DASHBOARD_BROWSER_BASE_URL;
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

async function cardIds(page: Page): Promise<string[]> {
  await expect(page.getByTestId("dashboard-v2")).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  const ids = await page.locator("[data-testid^='dashboard-card-']").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-testid") ?? ""),
  );
  return ids;
}

test.describe.configure({ mode: "serial" });

test("personas @ci-gate: each role opens its default Dashboard", async ({ browser }) => {
  const fx = loadFixtures();

  const fa = await signIn(browser, fx.fa.email);
  try {
    await fa.page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await expect(fa.page).toHaveURL(/\/dashboard/);
    await fa.page.goto("/dashboard?onboarding=complete", { waitUntil: "domcontentloaded" });
    await expect(fa.page.getByText("Setup complete")).toBeVisible();
    const faCards = await cardIds(fa.page);
    expect(faCards.slice(0, 3)).toEqual([
      "dashboard-card-attention",
      "dashboard-card-departments_glance",
      "dashboard-card-facility_setup",
    ]);
    expect(faCards).not.toContain("dashboard-card-department_setup");
    expect(faCards).not.toContain("dashboard-card-shift_now");
    await expect(fa.page.getByTestId("dashboard-lens")).toBeVisible();
    await expect(fa.page.getByTestId("dashboard-lens")).not.toContainText("Environmental Services");

    const glance = fa.page.getByTestId("dashboard-card-departments_glance");
    const foodRow = glance.getByRole("listitem").filter({ hasText: "Food & Nutrition" });
    await expect(foodRow).toContainText("Vendor-run");
    await expect(foodRow).not.toContainText("Metz");
    await expect(foodRow.getByRole("link")).toHaveCount(0);

    await fa.page.getByTestId(`dashboard-lens-department:${fx.dietaryId}`).click();
    await expect(fa.page.getByTestId("dashboard-card-timeline")).toBeVisible();
    await expect(fa.page.getByTestId("dashboard-card-menu_today")).toHaveCount(0);
    await expect(fa.page.getByTestId("dashboard-card-shortcuts")).toHaveCount(0);
    await expect(fa.page.getByRole("link", { name: "Open" })).toHaveCount(0);
    const setup = fa.page.getByTestId("dashboard-card-department_setup");
    await expect(setup).toContainText(/Complete|Not complete/);
    await expect(setup).not.toContainText("Operating Rhythm");

    await fa.page.getByTestId(`dashboard-lens-department:${fx.plantId}`).click();
    const plantMaintenance = fa.page.getByTestId("dashboard-card-pm_due");
    await expect(plantMaintenance).toBeVisible();
    await expect(plantMaintenance.getByRole("link", { name: "Open" })).toHaveCount(0);

    const db = new PrismaClient();
    await db.department.update({
      where: { id: fx.plantId },
      data: { headEmployeeId: fx.fa.employeeId },
    });
    await db.$disconnect();
    await fa.page.goto(`/dashboard?scope=department:${fx.plantId}`, { waitUntil: "domcontentloaded" });
    await expect(fa.page.getByTestId("dashboard-card-pm_due").getByRole("link", { name: "Open" })).toBeVisible();
  } finally {
    await fa.context.close();
  }

  const leader = await signIn(browser, fx.leader.email);
  try {
    await leader.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const ids = await cardIds(leader.page);
    expect(ids).toContain("dashboard-card-timeline");
    expect(ids).toContain("dashboard-card-department_setup");
    expect(ids).toContain("dashboard-card-menu_today");
    expect(ids.indexOf("dashboard-card-department_setup")).toBe(ids.indexOf("dashboard-card-timeline") + 1);
    expect(ids).not.toContain("dashboard-card-shift_now");
    expect(ids).not.toContain("dashboard-card-departments_glance");
    await leader.page.getByTestId("dashboard-card-menu_today").getByRole("link", { name: "Open" }).click();
    await expect(leader.page).toHaveURL(/\/menus/);
    await expect(leader.page.getByRole("heading", { name: "Menus" })).toBeVisible();

    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const started = Date.now();
      await leader.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await cardIds(leader.page);
      await expect(leader.page.getByTestId("dashboard-v2")).toHaveAttribute("data-settle-ms", /^\d+$/);
      samples.push(Date.now() - started);
    }
    console.log(`dashboard settle ms ${samples.join(",")}`);

    await leader.page.goto("/dashboard?fault=timeline", { waitUntil: "domcontentloaded" });
    await expect(leader.page.getByTestId("dashboard-v2")).toBeVisible();
    await expect(leader.page.getByTestId("dashboard-card-timeline")).toHaveAttribute("data-state", "unavailable");
    await expect(leader.page.getByTestId("dashboard-card-menu_today")).toBeVisible();
    await expect(leader.page.getByTestId("dashboard-card-menu_today")).not.toHaveAttribute("data-state", "unavailable");
    await expect(leader.page.getByTestId("dashboard-card-department_setup")).toBeVisible();
  } finally {
    await leader.context.close();
  }

  const manager = await signIn(browser, fx.manager.email);
  try {
    await manager.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const ids = await cardIds(manager.page);
    expect(ids).toContain("dashboard-card-timeline");
    expect(ids).toContain("dashboard-card-menu_today");
    expect(ids).not.toContain("dashboard-card-department_setup");
    expect(ids).not.toContain("dashboard-card-shift_now");

    const baseURL = process.env.DASHBOARD_BROWSER_BASE_URL;
    if (!baseURL) throw new Error("DASHBOARD_BROWSER_BASE_URL required");
    await manager.context.addCookies([
      { name: "ltc_active_department", value: fx.plantId, url: baseURL },
    ]);
    await manager.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      manager.page.getByText("That view isn't available to you. Your Dashboard shows Food & Nutrition."),
    ).toBeVisible();
    await expect(manager.page.getByTestId("dashboard-scope")).toContainText("Food & Nutrition");
    await expect(manager.page.getByTestId("dashboard-card-timeline")).toBeVisible();
    await expect(manager.page.getByTestId("dashboard-card-pm_due")).toHaveCount(0);
  } finally {
    await manager.context.close();
  }

  const supervisor = await signIn(browser, fx.supervisor.email);
  try {
    await supervisor.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(supervisor.page.getByText("No team assigned")).toBeVisible();
    const ids = await cardIds(supervisor.page);
    expect(ids[0]).toBe("dashboard-card-shift_now");
    expect(ids).toContain("dashboard-card-menu_today");
    expect(ids).not.toContain("dashboard-card-timeline");
    expect(ids).not.toContain("dashboard-card-department_setup");
  } finally {
    await supervisor.context.close();
  }

  const plant = await signIn(browser, fx.plantLeader.email);
  try {
    await plant.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const ids = await cardIds(plant.page);
    expect(ids).toContain("dashboard-card-pm_due");
    expect(ids).toContain("dashboard-card-maintenance_open");
    expect(ids).not.toContain("dashboard-card-shift_now");
    expect(ids).not.toContain("dashboard-card-timeline");
    expect(ids).not.toContain("dashboard-card-menu_today");
  } finally {
    await plant.context.close();
  }

  const vendor = await signIn(browser, fx.vendorGm.email);
  try {
    await vendor.page.goto("/access", { waitUntil: "domcontentloaded" });
    const openPartner = vendor.page
      .locator(`form:has([name="contextKey"][value="facility_partner:${fx.vendorGm.partnershipId}"])`)
      .getByRole("button", { name: "Open" });
    await Promise.all([
      vendor.page.waitForURL((url) => url.pathname === "/partner", { timeout: 45_000 }),
      openPartner.click(),
    ]);
    const cards = vendor.page.getByTestId("dashboard-v2");
    await expect(cards).toBeVisible();
    await expect(vendor.page.getByTestId("dashboard-scope")).toContainText("Food & Nutrition");
    await expect(cards).toContainText("Today's timeline");
    await expect(cards).toContainText("Today's menu");
    await expect(cards).toContainText("Department setup");
    await expect(cards).not.toContainText("Departments at a glance");
    await expect(cards).not.toContainText("Plant Operations");
    await expect(cards).not.toContainText("Environmental Services");
  } finally {
    await vendor.context.close();
  }
});
