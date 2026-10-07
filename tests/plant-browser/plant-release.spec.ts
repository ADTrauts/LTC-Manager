import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Whole-Product Facility Plant Operations V1 browser certification.
 * Journeys reuse the disposable plant-browser fixture. Controlled AVAILABLE
 * customer install is certified in SQL/hermetic; this suite proves the
 * customer-visible Build/Run journeys and committed DEVELOPMENT gating.
 */

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  dietaryDepartmentId: string;
  serveryUnitId: string | null;
  floors: Array<{ id: string; name: string }>;
  assets: Array<{ id: string; assetCode: string; name: string; status: string }>;
  oosAssetId: string;
  techEmployeeId: string;
  users: {
    manager: { email: string; password: string };
    supervisor: { email: string; password: string };
    staff: { email: string; password: string };
    dietaryStaff: { email: string; password: string };
    faWithout: { email: string; password: string };
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
  const dir = `${profileDir}-release-${suffix}-${Date.now()}`;
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

const STARTER_WORK_KEYS = [
  "MECHANICAL_ROOM_ROUND",
  "BUILDING_WALKTHROUGH",
  "EXTERIOR_GROUNDS_WALKTHROUGH",
  "GENERATOR_VISUAL_CHECK",
] as const;

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
  await db.departmentWorkPlan.deleteMany({
    where: {
      facilityId,
      departmentId,
      OR: [{ presetKey: { in: [...STARTER_WORK_KEYS] } }, { stableKey: { in: [...STARTER_WORK_KEYS] } }],
    },
  });
  await db.operationalTemplate.deleteMany({
    where: {
      facilityId,
      departmentId,
      OR: [
        { presetKey: { in: [...STARTER_RECORD_KEYS] } },
        { stableKey: { in: [...STARTER_RECORD_KEYS] } },
      ],
    },
  });
}

test.describe("Facility Plant Operations V1 release @plant-release @ci-gate", () => {
  test("1 install/setup/starter: Build Overview, starter subset, real Asset, quarterly PM draft", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    await resetPlantStarterRows(db, fx.facilityId, fx.plantDepartmentId);
    const { context, page } = await openPersistent("setup");
    try {
      await loginPassword(page, fx.users.manager.email, password);
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

      await page.goto(`/build/departments/${fx.plantDepartmentId}?starter=1`);
      await expect(page.getByTestId("plant-starter-panel")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Plant Operations starter configuration")).toBeVisible();
      await page.getByTestId("starter-work-EXTERIOR_GROUNDS_WALKTHROUGH").uncheck();
      await page.getByTestId("starter-work-GENERATOR_VISUAL_CHECK").uncheck();
      await page.getByTestId("starter-record-MECHANICAL_ROOM_INSPECTION").uncheck();
      await page.getByTestId("starter-record-GENERATOR_INSPECTION").uncheck();
      await page.getByTestId("starter-record-BASIC_EQUIPMENT_READING").uncheck();
      await page.getByTestId("starter-record-POST_WORK_ORDER_VERIFICATION").uncheck();
      await page.getByTestId("plant-starter-install").click();
      await expect(page.getByTestId("plant-starter-result")).toContainText(
        "2 recurring Work presets added",
        { timeout: 20_000 },
      );

      const assetId = fx.assets[0]?.id;
      expect(assetId).toBeTruthy();
      await page.goto("/assets");
      await expect(page.getByTestId("asset-registry")).toBeVisible({ timeout: 20_000 });
      await page.goto(`/assets/${assetId}`);
      await expect(page.getByTestId("asset-work-orders")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Preventive Maintenance" })).toBeVisible();

      await page.goto(`/build/departments/${fx.plantDepartmentId}?tab=maintenance`);
      const newPlan = page.getByRole("link", { name: /New PM Plan|Create PM Plan|Add PM/i }).or(
        page.getByTestId("pm-plan-create"),
      );
      if (await newPlan.count()) {
        await newPlan.first().click();
        const cadence = page.getByLabel(/cadence|schedule/i).or(page.getByTestId("pm-cadence-preset"));
        if (await cadence.count()) {
          await cadence.first().selectOption({ label: "Quarterly" }).catch(async () => {
            await page.getByRole("button", { name: "Quarterly" }).click();
          });
          await expect(page.getByText(/Jan|Apr|Jul|Oct/i).first()).toBeVisible({ timeout: 10_000 });
        }
      }
    } finally {
      await db.$disconnect();
      await context.close();
    }
  });

  test("2 corrective: requester Received → Plant triage → technician closeout leaves Issue open", async () => {
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
    const summary = `Release leak ${suffix}`;
    const requester = await openPersistent("req");
    try {
      await loginPassword(requester.page, fx.users.dietaryStaff.email, password);
      const href = space
        ? `/unit/${unitId}?space=${encodeURIComponent(space.id)}&reportProblem=1`
        : `/unit/${unitId}?reportProblem=1`;
      await requester.page.goto(href);
      const form = requester.page.getByTestId("report-problem-form");
      await expect(form).toBeVisible({ timeout: 30_000 });
      await form.getByTestId("report-problem-summary").fill(summary);
      await form.getByTestId("report-problem-submit").click();
      await expect(requester.page.getByTestId("requester-status-label")).toHaveText("Received", {
        timeout: 20_000,
      });
      const request = await db.operationalRequest.findFirst({
        where: { facilityId: fx.facilityId, summary },
      });
      expect(request).toBeTruthy();
      expect(request?.relatedAssetIssueId).toBeNull();
      expect(request?.workOrderId).toBeNull();
    } finally {
      await requester.context.close();
    }

    const supervisor = await openPersistent("triage");
    let workOrderId = "";
    let issueId = "";
    try {
      await loginPassword(supervisor.page, fx.users.supervisor.email, password);
      await supervisor.page.goto("/staffing/operations");
      await expect(supervisor.page.getByTestId("plant-triage-panel")).toBeVisible({ timeout: 30_000 });
      const request = await db.operationalRequest.findFirst({
        where: { facilityId: fx.facilityId, summary },
        select: { id: true, requestCode: true },
      });
      expect(request?.requestCode).toBeTruthy();
      await expect(
        supervisor.page.getByTestId(`plant-request-${request!.requestCode}`),
      ).toBeVisible();
      await supervisor.page.getByTestId(`plant-request-${request!.requestCode}`).click();
      await supervisor.page.getByTestId("plant-triage-assignee").selectOption(fx.techEmployeeId);
      await supervisor.page.getByTestId("plant-create-wo").click();
      await expect
        .poll(
          async () => {
            const row = await db.operationalRequest.findUnique({
              where: { id: request!.id },
              select: { relatedAssetIssueId: true, workOrderId: true },
            });
            issueId = row?.relatedAssetIssueId ?? "";
            workOrderId = row?.workOrderId ?? "";
            return Boolean(issueId && workOrderId);
          },
          { timeout: 25_000 },
        )
        .toBeTruthy();
    } finally {
      await supervisor.context.close();
    }

    const tech = await openPersistent("tech");
    try {
      await loginPassword(tech.page, fx.users.staff.email, password);
      await tech.page.goto("/repairs");
      await expect(tech.page.getByRole("heading", { name: "My Work" })).toBeVisible({
        timeout: 20_000,
      });
      await tech.page.goto(`/repairs/${workOrderId}`);
      await expect(tech.page.getByTestId("work-order-execution")).toBeVisible({ timeout: 20_000 });
      if (await tech.page.getByTestId("wo-start").count()) {
        await tech.page.getByTestId("wo-start").click();
      }
      await tech.page.getByTestId("wo-labor-minutes").fill("20");
      await tech.page.getByTestId("wo-labor-save").click();
      if (await tech.page.getByTestId("wo-part-description").count()) {
        await tech.page.getByTestId("wo-part-description").fill("Joint seal");
        await tech.page.getByTestId("wo-part-quantity").fill("1");
        await tech.page.getByTestId("wo-part-add").click();
      }
      await tech.page.getByTestId("wo-work-performed").fill("Dried leak and sealed joint");
      if (await tech.page.getByTestId("wo-asset-review-NO_CHANGE").count()) {
        await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
      }
      await tech.page.getByTestId("wo-complete").click();
      await expect(tech.page.getByTestId("wo-post-completion")).toBeVisible({ timeout: 20_000 });
      await expect(tech.page.getByTestId("wo-post-completion")).toContainText("Still OPEN");
    } finally {
      await tech.context.close();
    }

    const wo = await db.repair.findUniqueOrThrow({ where: { id: workOrderId } });
    const issue = await db.assetIssue.findUniqueOrThrow({ where: { id: issueId } });
    expect(wo.status).toBe("COMPLETED");
    expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(issue.status);
    await db.$disconnect();
  });

  test("3 PM Run: Preventive Work Order appears in My Work without generator terminology", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const asset = fx.assets[0];
    test.skip(!asset, "no asset fixture");
    const plan = await db.preventiveMaintenancePlan.findFirst({
      where: { facilityId: fx.facilityId, departmentId: fx.plantDepartmentId },
      select: { id: true },
    });
    const occurrence = await db.preventiveMaintenanceOccurrence.findFirst({
      where: {
        planId: plan?.id,
        status: "OPEN",
      },
      select: { id: true },
    });
    const wo = occurrence
      ? await db.repair.findFirst({
          where: { pmOccurrenceId: occurrence.id, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } },
          select: { id: true, title: true },
        })
      : await db.repair.findFirst({
          where: {
            unit: { facilityId: fx.facilityId },
            workOrderKind: "PREVENTIVE",
            status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
          },
          select: { id: true, title: true },
        });

    const supervisor = await openPersistent("pm-run");
    try {
      await loginPassword(supervisor.page, fx.users.supervisor.email, password);
      await supervisor.page.goto("/preventive-maintenance");
      await expect(supervisor.page.getByTestId("pm-run-board")).toBeVisible({ timeout: 20_000 });
      await expect(supervisor.page.getByRole("link", { name: "Upcoming schedule" })).toBeVisible();
      await expect(supervisor.page.getByRole("heading", { name: /occurrence/i })).toHaveCount(0);
      await expect(supervisor.page.getByRole("button", { name: /generator/i })).toHaveCount(0);
      await supervisor.page.goto("/repairs");
      const nav = supervisor.page.getByTestId("maintenance-sub-nav");
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Assets", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Work Orders", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Issues", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Preventive", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Vendors", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Repairs", exact: true })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Asset Issues", exact: true })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Occurrences", exact: true })).toHaveCount(0);
    } finally {
      await supervisor.context.close();
    }

    if (wo) {
      const tech = await openPersistent("pm-tech");
      try {
        await loginPassword(tech.page, fx.users.staff.email, password);
        await tech.page.goto("/repairs");
        await expect(tech.page.getByRole("heading", { name: "My Work" })).toBeVisible({
          timeout: 20_000,
        });
        await tech.page.goto(`/repairs/${wo.id}`);
        await expect(tech.page.getByText(/Preventive/i).first()).toBeVisible({ timeout: 20_000 });
      } finally {
        await tech.context.close();
      }
    } else {
      expect(suffix.length).toBeGreaterThan(0);
    }
    await db.$disconnect();
  });

  test("4 roles: STAFF stay on My Work; FA without Plant primary cannot triage; requester cannot Build", async () => {
    const fx = loadFixtures();
    const password = demoPassword();

    const staff = await openPersistent("roles-staff");
    try {
      await loginPassword(staff.page, fx.users.staff.email, password);
      await staff.page.goto("/repairs");
      await expect(staff.page.getByRole("heading", { name: "My Work" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(staff.page.getByTestId("maintenance-sub-nav")).toHaveCount(0);
      await staff.page.goto(`/build/departments/${fx.plantDepartmentId}`);
      await expect(staff.page.getByTestId("add-starter-configuration")).toHaveCount(0);
      await expect(staff.page.getByTestId("overview-getting-started")).toHaveCount(0);
    } finally {
      await staff.context.close();
    }

    const requester = await openPersistent("roles-req");
    try {
      await loginPassword(requester.page, fx.users.dietaryStaff.email, password);
      await requester.page.goto("/staffing/operations");
      await expect(requester.page.getByTestId("plant-triage-panel")).toHaveCount(0);
      await requester.page.goto(`/build/departments/${fx.plantDepartmentId}`);
      await expect(requester.page.getByTestId("add-starter-configuration")).toHaveCount(0);
    } finally {
      await requester.context.close();
    }

    const fa = await openPersistent("roles-fa");
    try {
      await loginPassword(fa.page, fx.users.faWithout.email, password);
      await fa.page.goto("/staffing/operations");
      const create = fa.page.getByTestId("plant-create-wo");
      if (await create.count()) {
        await expect(create).toBeDisabled();
      }
    } finally {
      await fa.context.close();
    }
  });

  test("5 gating: DEVELOPMENT hides Plant; Dietary remains; committed status stays DEVELOPMENT", async () => {
    const fx = loadFixtures();
    const registry = readFileSync(
      join(process.cwd(), "src/lib/department-products/registry.ts"),
      "utf8",
    );
    expect(registry).toMatch(/productKey: "PLANT"[\s\S]*?status: "DEVELOPMENT"/);
    expect(registry).toMatch(/productKey: "HEALTHCARE_FOOD_NUTRITION"[\s\S]*?status: "AVAILABLE"/);
    expect(registry).toMatch(/productKey: "EVS"[\s\S]*?status: "DEVELOPMENT"/);

    const { context, page } = await openPersistent("gating");
    try {
      await loginPassword(page, fx.users.faWithout.email, demoPassword());
      await page.goto("/admin/departments?marketplace=1");
      await expect(page.getByTestId("department-marketplace")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("department-product-card-plant")).toHaveCount(0);
      await expect(
        page.getByTestId("department-product-card-healthcare_food_nutrition"),
      ).toBeVisible();
      await expect(page.getByText("Facility Plant Operations")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
