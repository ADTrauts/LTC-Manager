import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type CatalogLogCategory, type CatalogLogPurposeType, type CatalogLogStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Phase 6C Marketplace browse certification.
 * Runs against a disposable database and a Console dev server pointed at that database.
 */

const databaseUrl =
  process.env.CONSOLE_BROWSER_DATABASE_URL ||
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const harborEmail = "phase6c-harbor@example.com";
const facilityEmail = "phase6c-facility@example.com";
const password = "Phase6c-browser";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function prismaClient() {
  if (!databaseUrl) throw new Error("CONSOLE_BROWSER_DATABASE_URL is required");
  if (databaseUrl.includes("/ltc_manager")) {
    throw new Error("Refusing to seed ltc_manager");
  }
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function ensureCatalog(
  prisma: PrismaClient,
  input: {
    stableKey: string;
    name: string;
    purposeType: CatalogLogPurposeType;
    category: CatalogLogCategory;
    status?: CatalogLogStatus;
    version?: number;
  },
) {
  const version = input.version ?? 1;
  const existing = await prisma.catalogLogDefinition.findUnique({
    where: { stableKey_version: { stableKey: input.stableKey, version } },
  });
  if (existing) return existing;
  return prisma.catalogLogDefinition.create({
    data: {
      stableKey: input.stableKey,
      version,
      status: input.status ?? "PUBLISHED",
      name: input.name,
      purposeType: input.purposeType,
      category: input.category,
      publishedAt: input.status === "DRAFT" ? null : new Date(),
    },
  });
}

async function seed() {
  const prisma = prismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.platformStaff.upsert({
      where: { email: harborEmail },
      update: { passwordHash, isActive: true, role: "OWNER" },
      create: {
        email: harborEmail,
        displayName: "Phase 6C Harbor",
        passwordHash,
        role: "OWNER",
        isActive: true,
      },
    });

    const role = await prisma.role.upsert({
      where: { key: "STAFF" },
      update: {},
      create: { id: cuidLike(), key: "STAFF", name: "Staff" },
    });
    const existingUser = await prisma.user.findUnique({ where: { email: facilityEmail } });
    if (!existingUser) {
      const org = await prisma.organization.create({
        data: { name: "Phase 6C facility org" },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: "Phase 6C Facility",
          timezone: "America/New_York",
          onboardingCompletedAt: new Date(),
        },
      });
      await prisma.user.create({
        data: {
          email: facilityEmail,
          displayName: "Phase 6C Facility User",
          passwordHash,
          facilityId: facility.id,
          roleId: role.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    await ensureCatalog(prisma, {
      stableKey: "cooler_temperature_log",
      name: "Cooler Temperature Log",
      purposeType: "LOG",
      category: "TEMPERATURE",
    });
    await ensureCatalog(prisma, {
      stableKey: "opening_checklist",
      name: "Opening Checklist",
      purposeType: "CHECKLIST",
      category: "OPENING_CLOSING",
    });
    await ensureCatalog(prisma, {
      stableKey: "dishwasher_sanitation_log",
      name: "Dishwasher Sanitation Log",
      purposeType: "LOG",
      category: "SANITATION",
    });
    await ensureCatalog(prisma, {
      stableKey: "boiler_inspection",
      name: "Boiler Inspection",
      purposeType: "INSPECTION",
      category: "EQUIPMENT",
    });
    await ensureCatalog(prisma, {
      stableKey: "unpublished_pantry_log",
      name: "Unpublished Pantry Log",
      purposeType: "LOG",
      category: "FOOD_SAFETY",
      status: "DRAFT",
    });
    await ensureCatalog(prisma, {
      stableKey: "phase6c_procedure",
      name: "Phase 6C Procedure",
      purposeType: "PROCEDURE",
      category: "COMPLIANCE",
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function signInHarbor(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Email").fill(harborEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/console/login"), { timeout: 30_000 });
}

function row(page: Page, stableKey: string) {
  return page.locator(`[data-testid="marketplace-row"][data-stable-key="${stableKey}"]`);
}

test.beforeAll(async () => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  await seed();
});

test.describe("Harbor Marketplace", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
    await signInHarbor(page);
  });

  test("unified families share one table", async ({ page }) => {
    await page.goto("/console/catalog");
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(page.getByText("Manage Vssyl Department Products, catalog Records, and Work presets from one place.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Marketplace families" })).not.toContainText("Procedures");
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "HEALTHCARE_FOOD_NUTRITION")).toBeVisible();
    await expect(row(page, "EVS")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "opening_checklist")).toBeVisible();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(row(page, "phase6c_procedure")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveText("New catalog record");

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Departments" }).click();
    await expect(page).toHaveURL(/family=departments/);
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toHaveCount(0);
    const plant = row(page, "PLANT");
    await expect(plant).toContainText("Department");
    await expect(plant).toContainText("Healthcare");
    await expect(plant).toContainText("1.0");
    await expect(plant).toContainText("AVAILABLE");
    await expect(plant).toContainText(/None yet|1 facility|\d+ facilities/);
    await expect(plant).toContainText(/\d+ users?/);
    await expect(plant).not.toContainText("installed");
    await expect(plant.locator("a")).toHaveAttribute("href", "/console/catalog/products/PLANT");
    await expect(page.getByTestId("marketplace-create")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Records" }).click();
    await expect(page.getByRole("navigation", { name: "Record types" })).toBeVisible();
    await expect(row(page, "PLANT")).toHaveCount(0);
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toHaveCount(0);
    await expect(row(page, "cooler_temperature_log")).toBeVisible();

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Work" }).click();
    await expect(page).toHaveURL(/family=work/);
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(row(page, "PLANT")).toHaveCount(0);
    const round = row(page, "MECHANICAL_ROOM_ROUND");
    await expect(round).toContainText("Work");
    await expect(round).toContainText("Facility Plant Operations");
    await expect(round).toContainText("—");
    await expect(round).toContainText(/None yet|1 facility|\d+ facilities/);
    await expect(round).toContainText(/\d+ published plans?/);
    await expect(round.locator("a")).toHaveAttribute("href", "/console/catalog/work/MECHANICAL_ROOM_ROUND");
    await expect(page.getByLabel("Status")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveCount(0);
  });

  test("record subtypes, detail, and create", async ({ page }) => {
    await page.goto("/console/catalog?family=records");
    await page.getByRole("navigation", { name: "Record types" }).getByRole("link", { name: "Logs" }).click();
    await expect(page).toHaveURL(/type=log/);
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "opening_checklist")).toHaveCount(0);
    await expect(row(page, "boiler_inspection")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveText("New catalog log");

    await page.getByRole("navigation", { name: "Record types" }).getByRole("link", { name: "Checklists" }).click();
    await expect(row(page, "opening_checklist")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveText("New catalog checklist");

    await page.getByRole("navigation", { name: "Record types" }).getByRole("link", { name: "Inspections" }).click();
    await expect(row(page, "boiler_inspection")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveText("New catalog inspection");

    await page.goto("/console/catalog?family=records&type=log");
    await row(page, "cooler_temperature_log").getByRole("link", { name: "Cooler Temperature Log" }).click();
    await expect(page).toHaveURL(/\/console\/catalog\/cooler_temperature_log$/);
    await expect(page.getByRole("heading", { name: "Cooler Temperature Log" })).toBeVisible();

    const draftName = `Phase 6C Browser Draft ${Date.now()}`;
    await page.goto("/console/catalog");
    await page.getByTestId("marketplace-create").click();
    await expect(page.getByRole("heading", { name: "New catalog record" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(draftName);
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.waitForURL(/\/console\/catalog\/(?!new$)[^/?#]+$/);
    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill(draftName);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("link", { name: draftName })).toBeVisible();
    await expect(row(page, "PLANT")).toHaveCount(0);
  });

  test("search and family-scoped filters", async ({ page }) => {
    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("cooler");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "opening_checklist")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-clear")).toBeVisible();

    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("PLANT");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);

    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("Mechanical");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(row(page, "PLANT")).toHaveCount(0);

    await page.goto("/console/catalog?family=records&type=log");
    await page.getByLabel("Category").selectOption({ label: "Sanitation" });
    await page.getByLabel("Search Marketplace").fill("dishwasher");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/family=records/);
    await expect(page).toHaveURL(/type=log/);
    await expect(page).toHaveURL(/category=SANITATION/);
    await expect(row(page, "dishwasher_sanitation_log")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(row(page, "opening_checklist")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Departments" }).click();
    await expect(page).toHaveURL(/family=departments/);
    await expect(page).not.toHaveURL(/type=/);
    await expect(page).not.toHaveURL(/category=/);
    await expect(page).toHaveURL(/q=dishwasher/);

    await page.goto("/console/catalog?family=departments");
    await expect(page.getByLabel("Category")).toBeVisible();
    await page.getByLabel("Status").selectOption("AVAILABLE");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "HEALTHCARE_FOOD_NUTRITION")).toBeVisible();
    await expect(row(page, "EVS")).toHaveCount(0);

    await page.goto("/console/catalog?family=records");
    await page.getByLabel("Status").selectOption("Published");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "unpublished_pantry_log")).toHaveCount(0);

    await page.goto("/console/catalog?family=work");
    await expect(page.getByLabel("Status")).toHaveCount(0);
    await page.goto("/console/catalog?q=not-a-real-marketplace-item");
    await expect(page.getByTestId("marketplace-empty")).toContainText("not-a-real-marketplace-item");
    await expect(page.getByTestId("marketplace-empty")).not.toContainText("No Marketplace items are available.");
  });
});

test("facility session cannot open Marketplace", async ({ page }) => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  await page.goto("/login");
  await page.getByLabel("Email").fill(facilityEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  await page.goto("/console/catalog");
  await page.waitForURL(/\/console\/login/);
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marketplace" })).toHaveCount(0);
  await expect(page.locator("[data-testid='marketplace-row']")).toHaveCount(0);
});
