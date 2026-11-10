/**
 * Phase 2C R4 — focused release-critical online browser / HTTP certification.
 * Disposable VERIFY_DATABASE_URL only. Reuses offline canonical fixture people.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { prepareCanonicalResponsibility } from "../offline-browser/canonical-journey";

type Fixtures = {
  adminEmail: string;
  facilityId: string;
  dietaryDepartmentId: string;
  facilityTimezone?: string;
  canonical: {
    facilityId: string;
    departmentId: string;
    unitId: string;
    spaceId: string;
    workLabel: string;
    workPlanId: string;
    oneOffOccurrenceIds?: string[];
    people: Record<"manager" | "worker" | "secondWorker", { email: string; employeeId: string; userId: string }>;
  };
};

function loadFixtures(): Fixtures {
  const path =
    process.env.R4_RELEASE_BROWSER_FIXTURE_PATH ||
    process.env.OFFLINE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "r4-release-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

function prisma() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL required");
  return new PrismaClient({ datasources: { db: { url } } });
}

function serviceDateKey(timezone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

async function login(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `login ${email} HTTP ${res.status()}`).toBeTruthy();
}

async function ensureAssignment(page: Page, fx: Fixtures) {
  await prepareCanonicalResponsibility(page, fx.canonical as never, serviceDateKey(fx.facilityTimezone));
}

test.describe.configure({ mode: "serial" });

test("employee Job Flow SPACE shows ONE_OFF and no plan-derived Work @r4-gate", async ({ page }) => {
  const fx = loadFixtures();
  await ensureAssignment(page, fx);
  await login(page, fx.canonical.people.worker.email);
  await page.goto(`/unit/${fx.canonical.unitId}?space=${fx.canonical.spaceId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("employee-runtime-experience")).toHaveAttribute("data-grain", "space");
  await expect(page.getByTestId("employee-runtime-assignment")).not.toContainText("No confirmed assignment");
  const work = page
    .getByTestId("employee-runtime-work-item")
    .filter({ hasText: fx.canonical.workLabel })
    .first();
  await expect(work).toBeVisible();
  // No duplicate cards for the same ONE_OFF label.
  expect(
    await page.getByTestId("employee-runtime-work-item").filter({ hasText: fx.canonical.workLabel }).count(),
  ).toBe(1);
  await work.getByRole("link").click();
  await expect(page.getByTestId("work-completion-panel")).toContainText(fx.canonical.workLabel);
  await expect(page.locator("body")).not.toContainText("Work Plan configuration");
  // Neighborhood grain should not invent plan-derived copy.
  await page.goto(`/unit/${fx.canonical.unitId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("employee-runtime-experience")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Location Function");
  await expect(page.locator("body")).not.toContainText("Work Plan configuration");
});

test("supervisor creates ONE_OFF and employee sees it; retired Work Plan UI is read-only @r4-gate", async ({
  page,
}) => {
  const fx = loadFixtures();
  await ensureAssignment(page, fx);
  await login(page, fx.canonical.people.manager.email);
  await page.goto("/staffing/operations", { waitUntil: "domcontentloaded" });
  const form = page.getByTestId("supervisor-one-off-work-form");
  const panelCreate = page.getByTestId("create-one-off-work");
  if (await form.count()) {
    await form.locator('[data-testid="one-off-unit"]').selectOption(fx.canonical.unitId);
    await form.locator('[data-testid="one-off-title"]').fill("R4 supervisor one-off");
    await form.locator('[data-testid="one-off-instructions"]').fill("R4 release certification");
    if (await form.locator('[data-testid="one-off-employee"]').count()) {
      await form.locator('[data-testid="one-off-employee"]').selectOption(fx.canonical.people.worker.employeeId);
    }
    await form.getByTestId("one-off-submit").click();
    await expect(page.getByTestId("one-off-message")).toContainText(/Created one-off/i, {
      timeout: 20_000,
    });
  } else {
    await expect(panelCreate).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("one-off-work-unit").selectOption(fx.canonical.unitId);
    await page.getByTestId("one-off-work-title").fill("R4 supervisor one-off");
    await page.getByTestId("one-off-work-instructions").fill("R4 release certification");
    await panelCreate.click();
    await expect(page.getByText(/One-off Work created/i)).toBeVisible({ timeout: 20_000 });
  }

  const db = prisma();
  try {
    const created = await db.departmentWorkOccurrence.findFirst({
      where: {
        facilityId: fx.facilityId,
        sourceKind: "ONE_OFF",
        workItemLabelSnapshot: "R4 supervisor one-off",
        status: "OPEN",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(created).toBeTruthy();
  } finally {
    await db.$disconnect();
  }

  await login(page, fx.canonical.people.worker.email);
  await page.goto(`/unit/${fx.canonical.unitId}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("employee-runtime-work-item").filter({ hasText: "R4 supervisor one-off" }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await login(page, fx.canonical.people.manager.email);
  await page.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("work-plan-builder-retired")).toBeVisible();
  await expect(page.getByTestId("create-work-plan")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("WORK_PLAN exception");
});

test("Dashboard has no work.expected card and no Work Plan setup prompt @r4-gate", async ({ page }) => {
  const fx = loadFixtures();
  await login(page, fx.adminEmail);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dashboard-v2")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading…")).toHaveCount(0);
  const ids = await page.locator("[data-testid^='dashboard-card-']").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-testid") ?? ""),
  );
  expect(ids.some((id) => id.includes("work.expected") || id.includes("expected_work"))).toBe(false);
  await expect(page.locator("body")).not.toContainText("Configure Work Plans");
  await expect(page.locator("body")).not.toContainText("Publish a Work Plan");
});

test("Harbor Marketplace browse omits WORK family; partner Work retired; Build does not promote Work @r4-gate", async ({
  page,
}) => {
  const fx = loadFixtures();
  await login(page, fx.adminEmail);

  await page.goto("/admin/departments?marketplace=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText("WORK_PRESET");
  await expect(page.getByRole("tab", { name: /^Work$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Work presets/i })).toHaveCount(0);
  // Records / Department discovery remains present on Marketplace (no Work family tab).
  await expect(page.locator("body")).not.toContainText("Configure Work Plans");

  await page.goto("/partner/work", { waitUntil: "domcontentloaded" });
  // Facility admin may be redirected away from partner desk; when the retired page loads, assert it.
  if (page.url().includes("/partner/work")) {
    await expect(page.getByTestId("partner-work-page-retired")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("create-work-plan")).toHaveCount(0);
  }

  // Manager Build/staffing surface: retired Work Plan builder (no authoring).
  await login(page, fx.canonical.people.manager.email);
  await page.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("work-plan-builder-retired")).toBeVisible();
  await expect(page.getByTestId("create-work-plan")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Publish Work Plan");
});

test("HTTP surfaces: staff denied ONE_OFF authoring UI; retired writers absent; facility unit gate @r4-gate", async ({
  page,
}) => {
  const fx = loadFixtures();
  await login(page, fx.canonical.people.worker.email);

  const ops = await page.request.get("/staffing/operations", { failOnStatusCode: false });
  expect([200, 302, 303, 307, 403].includes(ops.status())).toBeTruthy();
  if (ops.status() === 200) {
    const html = await ops.text();
    expect(html).not.toContain('data-testid="supervisor-one-off-work-form"');
    expect(html).not.toContain('data-testid="create-one-off-work"');
  }

  await login(page, fx.canonical.people.manager.email);
  await page.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("work-plan-builder-retired")).toBeVisible();

  await page.goto(`/admin/departments/${fx.dietaryDepartmentId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Publish Location Functions/i })).toHaveCount(0);

  const foreign = await page.request.get(`/unit/not-a-real-unit-id`, { failOnStatusCode: false });
  // App may 404/403/redirect, or render a soft not-found page (200) without the runtime shell.
  expect([200, 302, 303, 307, 308, 403, 404].includes(foreign.status())).toBeTruthy();
  if (foreign.status() === 200) {
    const html = await foreign.text();
    expect(html).not.toContain('data-testid="employee-runtime-experience"');
  }

  const own = await page.request.get(`/unit/${fx.canonical.unitId}`, { failOnStatusCode: false });
  expect([200, 302, 303, 307, 308].includes(own.status())).toBeTruthy();
});
