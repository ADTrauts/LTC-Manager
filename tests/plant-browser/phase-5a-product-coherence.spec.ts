import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5A browser certification — product coherence and discoverability.
 */

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  dietaryDepartmentId: string;
  serveryUnitId: string | null;
  floors: Array<{ id: string; name: string }>;
  assets: Array<{ id: string; assetCode: string; name: string; status: string }>;
  users: {
    manager: { email: string; password: string };
    supervisor: { email: string; password: string };
    staff: { email: string; password: string };
    dietaryStaff: { email: string; password: string };
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
  const dir = `${profileDir}-5a-${suffix}-${Date.now()}`;
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

test.describe("Phase 5A product coherence @phase-5a @ci-gate", () => {
  test("supervisor Maintenance nav teaches Work Orders and Issues", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("nav");
    try {
      await loginPassword(page, fx.users.supervisor.email, demoPassword());
      await page.goto("/repairs");
      await expect(page.getByTestId("maintenance-sub-nav")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: "Work Orders", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Issues", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "New Work Order" })).toBeVisible();
      await page.getByRole("button", { name: "New Work Order" }).click();
      await expect(page.getByTestId("repairs-create-modal")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create Work Order" })).toBeVisible();
      await expect(page.getByText("New repair")).toHaveCount(0);

      await page.goto("/preventive-maintenance");
      await expect(page.getByTestId("pm-run-board")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: "Upcoming schedule" })).toBeVisible();
      await expect(page.getByRole("link", { name: /occurrence/i })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /occurrence/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /occurrence/i })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("supervisor creates a location-only Issue from Maintenance", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const { context, page } = await openPersistent("issue");
    try {
      await loginPassword(page, fx.users.supervisor.email, demoPassword());
      await page.goto("/asset-issues");
      await expect(page.getByRole("heading", { name: "Issues", exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Asset Issue")).toHaveCount(0);
      await page.getByTestId("direct-issue-create").locator("summary").click();
      const summary = `Ceiling stain ${suffix}`;
      const create = page.getByTestId("direct-issue-create");
      await create.locator('input[name=summary]').fill(summary);
      await create.locator("textarea[name=description]").fill(
        "Stain on ceiling, no asset identified",
      );
      await create.getByRole("button", { name: "Create Issue", exact: true }).click();
      const created = page.getByRole("listitem").filter({ hasText: summary });
      await expect(created).toBeVisible({ timeout: 20_000 });
      await expect(created.getByText(" · Location-only")).toBeVisible();

      const row = await db.assetIssue.findFirst({
        where: { facilityId: fx.facilityId, summary },
      });
      expect(row?.assetId).toBeNull();
    } finally {
      await db.$disconnect();
      await context.close();
    }
  });

  test("requester reports a location-only Request; Plant sees it in triage", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const unitId = fx.serveryUnitId ?? fx.floors[0]?.id;
    test.skip(!unitId, "no unit for request intake");

    const space = await db.unitSpace.findFirst({
      where: { unitId, isActive: true },
      select: { id: true },
    });
    const summary = `Ceiling leak near window ${suffix}`;
    const { context, page } = await openPersistent("request");
    try {
      await loginPassword(page, fx.users.dietaryStaff.email, password);
      const href = space
        ? `/unit/${unitId}?space=${encodeURIComponent(space.id)}&reportProblem=1`
        : `/unit/${unitId}?reportProblem=1`;
      await page.goto(href);
      const form = page.getByTestId("report-problem-form");
      const noRoutes = page.getByTestId("report-problem-no-routes");
      await expect(form.or(noRoutes)).toBeVisible({ timeout: 30_000 });
      await expect(noRoutes).toHaveCount(0);
      await expect(form).toBeVisible();
      await expect(page.getByText(/Plant Operations will review/i)).toBeVisible();
      await form.getByTestId("report-problem-summary").fill(summary);
      await form.locator("label").filter({ hasText: "Priority" }).locator("select").selectOption("HIGH");
      const assetSelect = form.getByTestId("report-problem-asset");
      if (await assetSelect.count()) {
        await assetSelect.selectOption("");
      }
      await form.getByTestId("report-problem-submit").click();
      await expect(page.getByTestId("report-problem-notice")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("requester-status-panel")).toBeVisible();
      await expect(page.getByTestId("requester-status-label")).toHaveText("Received");

      const request = await db.operationalRequest.findFirst({
        where: { facilityId: fx.facilityId, summary },
      });
      expect(request).toBeTruthy();
      expect(request?.relatedAssetIssueId).toBeNull();
      expect(request?.workOrderId).toBeNull();
      expect(request?.assetId).toBeNull();
    } finally {
      await context.close();
    }

    const manager = await openPersistent("triage");
    try {
      await loginPassword(manager.page, fx.users.manager.email, password);
      await manager.page.goto("/staffing/operations");
      await expect(manager.page.getByTestId("plant-triage-panel")).toBeVisible({ timeout: 30_000 });
      const request = await db.operationalRequest.findFirst({
        where: { facilityId: fx.facilityId, summary },
        select: { requestCode: true },
      });
      expect(request?.requestCode).toBeTruthy();
      await expect(
        manager.page.getByTestId(`plant-request-${request!.requestCode}`),
      ).toBeVisible();
    } finally {
      await manager.context.close();
      await db.$disconnect();
    }
  });

  test("Plant Asset profile shows Work Orders and Preventive Maintenance", async () => {
    const fx = loadFixtures();
    const assetId = fx.assets[0]?.id;
    test.skip(!assetId, "no asset fixture");
    const { context, page } = await openPersistent("asset");
    try {
      await loginPassword(page, fx.users.manager.email, demoPassword());
      await page.goto("/assets");
      await expect(page.getByTestId("asset-registry")).toBeVisible({ timeout: 20_000 });
      await page.goto(`/assets/${assetId}`);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByTestId("asset-work-orders")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();
      await expect(page.getByTestId("asset-preventive-maintenance")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Preventive Maintenance" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Plant Build shows Work, Getting Started, and no Menus", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("build");
    try {
      await loginPassword(page, fx.users.manager.email, demoPassword());
      await page.goto(`/build/departments/${fx.plantDepartmentId}`);
      await expect(page.getByTestId("department-builder-nav")).toBeVisible({ timeout: 30_000 });
      const nav = page.getByTestId("department-builder-nav");
      await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Locations" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Operating Rhythm" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Work" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Maintenance" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "People & Coverage" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Records" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Menus" })).toHaveCount(0);
      await expect(page.getByTestId("overview-getting-started")).toBeVisible();
      await expect(page.getByTestId("overview-plant-counts")).toBeVisible();
      await expect(page.getByTestId("add-starter-configuration")).toBeVisible();
      await expect(page.getByText("this list does not block Run", { exact: false })).toBeVisible();

      await nav.getByRole("link", { name: "Work", exact: true }).click();
      await expect(page.getByTestId("department-work-panel")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/not every recurring activity is PM/i)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("STAFF stay on My Work without Build or Issue controls", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("staff");
    try {
      await loginPassword(page, fx.users.staff.email, demoPassword());
      await page.goto("/repairs");
      await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("maintenance-sub-nav")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "New Work Order" })).toHaveCount(0);

      await page.goto("/asset-issues");
      await expect(page).toHaveURL(/\/repairs/);

      await page.goto(`/build/departments/${fx.plantDepartmentId}`);
      const url = page.url();
      expect(
        (url.includes("/build/departments/") || url.includes("/admin/departments/")) &&
          (await page.getByTestId("overview-getting-started").count()) > 0,
      ).toBeFalsy();
    } finally {
      await context.close();
    }
  });
});
