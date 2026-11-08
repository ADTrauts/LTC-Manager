import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { getDepartmentProduct } from "@/lib/department-products/registry";

const databaseUrl =
  process.env.CONSOLE_BROWSER_DATABASE_URL ||
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const harborOwnerEmail = "phase6c-harbor@example.com";
const harborMemberEmail = "marketplace-v1-member@example.com";
const facilityEmail = "phase6c-facility@example.com";
const password = "Phase6c-browser";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function prismaClient() {
  if (!databaseUrl) throw new Error("CONSOLE_BROWSER_DATABASE_URL is required");
  if (databaseUrl.includes("/ltc_manager")) throw new Error("Refusing to seed ltc_manager");
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function signInHarbor(page: Page, email = harborOwnerEmail) {
  await page.goto("/console/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/console/login"), { timeout: 30_000 });
}

function row(page: Page, stableKey: string) {
  return page.locator(`[data-testid="marketplace-row"][data-stable-key="${stableKey}"]`);
}

test.beforeAll(async () => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  const prisma = prismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.platformStaff.upsert({
      where: { email: harborOwnerEmail },
      update: { passwordHash, isActive: true, role: "OWNER" },
      create: {
        email: harborOwnerEmail,
        displayName: "Phase 6C Harbor",
        passwordHash,
        role: "OWNER",
        isActive: true,
      },
    });
    await prisma.platformStaff.upsert({
      where: { email: harborMemberEmail },
      update: { passwordHash, isActive: true, role: "MEMBER" },
      create: {
        email: harborMemberEmail,
        displayName: "Marketplace V1 Member",
        passwordHash,
        role: "MEMBER",
        isActive: true,
      },
    });
    const staffRole = await prisma.role.upsert({
      where: { key: "STAFF" },
      update: {},
      create: { id: cuidLike(), key: "STAFF", name: "Staff" },
    });
    if (!(await prisma.user.findUnique({ where: { email: facilityEmail } }))) {
      const org = await prisma.organization.create({ data: { name: "Phase 6C facility org" } });
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
          roleId: staffRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    }
    if (
      !(await prisma.catalogLogDefinition.findUnique({
        where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } },
      }))
    ) {
      await prisma.catalogLogDefinition.create({
        data: {
          stableKey: "cooler_temperature_log",
          version: 1,
          status: "PUBLISHED",
          name: "Cooler Temperature Log",
          purposeType: "LOG",
          category: "TEMPERATURE",
          publishedAt: new Date(),
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test.describe("@console-marketplace-release @ci-gate Console Marketplace V1", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
    await signInHarbor(page);
  });

  test("browse families, subtypes, search, and filters", async ({ page }) => {
    await page.goto("/console/catalog");
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Marketplace families" })).not.toContainText(
      "Procedures",
    );
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(page.getByTestId("marketplace-create")).toHaveText("New catalog record");

    const plantBrowse = row(page, "PLANT");
    await expect(plantBrowse).toContainText("Department");
    await expect(plantBrowse).toContainText("Healthcare");
    await expect(plantBrowse).toContainText("1.0");
    await expect(plantBrowse).toContainText("AVAILABLE");
    await expect(plantBrowse).toContainText(/None yet|1 facility|\d+ facilities/);
    await expect(plantBrowse).toContainText(/\d+ users?/);
    await expect(plantBrowse).not.toContainText(/\d+ installed/);

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Departments" }).click();
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "cooler_temperature_log")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-create")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Records" }).click();
    await expect(page.getByRole("navigation", { name: "Record types" })).toBeVisible();
    await page.getByRole("navigation", { name: "Record types" }).getByRole("link", { name: "Logs" }).click();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await expect(row(page, "PLANT")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Marketplace families" }).getByRole("link", { name: "Work" }).click();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toContainText("Facility Plant Operations");
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toContainText("—");
    await expect(page.getByLabel("Status")).toHaveCount(0);

    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("plant");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "PLANT")).toBeVisible();
    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("cooler");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "cooler_temperature_log")).toBeVisible();
    await page.goto("/console/catalog");
    await page.getByLabel("Search Marketplace").fill("mechanical");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "MECHANICAL_ROOM_ROUND")).toBeVisible();

    await page.goto("/console/catalog?family=departments");
    await page.getByLabel("Status").selectOption("AVAILABLE");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(row(page, "PLANT")).toBeVisible();
    await expect(row(page, "EVS")).toHaveCount(0);
  });

  test("Department Product detail matches browse counts", async ({ page }) => {
    const plant = getDepartmentProduct("PLANT");
    if (!plant) throw new Error("PLANT missing");
    await page.goto("/console/catalog?family=departments");
    const browseInstall = (await row(page, "PLANT").locator("td").nth(5).innerText()).trim();
    const browseUsers = (await row(page, "PLANT").locator("td").nth(6).innerText()).trim();
    await row(page, "PLANT").locator("a").click();
    await expect(page).toHaveURL(/\/console\/catalog\/products\/PLANT$/);
    await expect(page.getByRole("heading", { name: "Facility Plant Operations" })).toBeVisible();
    await expect(page.getByTestId("product-version")).toHaveText("1.0");
    await expect(page.getByTestId("product-status")).toHaveText("AVAILABLE");
    await expect(page.getByTestId("product-released")).toHaveText("October 7, 2026");
    const detailInstall = Number(await page.getByTestId("product-install-count").innerText());
    const detailUsers = Number(await page.getByTestId("product-user-count").innerText());
    if (browseInstall === "None yet") expect(detailInstall).toBe(0);
    else expect(browseInstall).toContain(String(detailInstall));
    expect(browseUsers).toContain(String(detailUsers));
    if (detailInstall > 0) {
      await expect(page.getByTestId("installed-facility-row").first()).toBeVisible();
    }
    let roleSum = 0;
    for (const role of [
      "generalManagers",
      "managers",
      "supervisors",
      "staff",
      "facilityAdministrators",
    ]) {
      roleSum += Number(await page.locator(`[data-testid="role-count"][data-role="${role}"]`).innerText());
    }
    expect(roleSum).toBe(detailUsers);
    for (const capability of plant.customerCapabilities ?? []) {
      await expect(page.getByTestId("product-capability").filter({ hasText: capability })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /edit product/i })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Marketplace" }).click();
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  });

  test("Record detail keeps adoption and authoring", async ({ page }) => {
    await page.goto("/console/catalog?family=records&type=log");
    const browseInstall = (
      await row(page, "cooler_temperature_log").locator("td").nth(5).innerText()
    ).trim();
    const browseUsage = (
      await row(page, "cooler_temperature_log").locator("td").nth(6).innerText()
    ).trim();
    await row(page, "cooler_temperature_log").getByRole("link", { name: "Cooler Temperature Log" }).click();
    await expect(page).toHaveURL(/\/console\/catalog\/cooler_temperature_log$/);
    await expect(page.getByTestId("record-published-version")).toHaveText("v1");
    await expect(page.getByText("Facilities installed")).toBeVisible();
    await expect(page.getByText("Active placements")).toBeVisible();
    const detailInstall = Number(await page.getByTestId("record-install-count").innerText());
    const detailPlacements = Number(await page.getByTestId("record-placement-count").innerText());
    if (browseInstall === "None yet") expect(detailInstall).toBe(0);
    else expect(browseInstall).toContain(String(detailInstall));
    expect(browseUsage).toContain(String(detailPlacements));
    await expect(
      page.getByRole("button", { name: "New version" }).or(page.getByRole("heading", { name: /Draft v/ })),
    ).toBeVisible();
    await page.goto("/console/catalog/new");
    await expect(page.getByRole("heading", { name: "New catalog record" })).toBeVisible();
  });

  test("Work preset detail matches browse counts", async ({ page }) => {
    await page.goto("/console/catalog?family=work");
    const browseInstall = (
      await row(page, "MECHANICAL_ROOM_ROUND").locator("td").nth(5).innerText()
    ).trim();
    const browseUsage = (
      await row(page, "MECHANICAL_ROOM_ROUND").locator("td").nth(6).innerText()
    ).trim();
    await row(page, "MECHANICAL_ROOM_ROUND").locator("a").click();
    await expect(page).toHaveURL(/\/console\/catalog\/work\/MECHANICAL_ROOM_ROUND$/);
    await expect(page.getByRole("heading", { name: "Mechanical Room Round" })).toBeVisible();
    await expect(page.getByTestId("work-version")).toHaveText("—");
    await expect(page.getByTestId("work-status")).toHaveText("—");
    await expect(page.getByRole("link", { name: "Facility Plant Operations" })).toBeVisible();
    const detailInstall = Number(await page.getByTestId("work-install-count").innerText());
    const detailPublished = Number(await page.getByTestId("work-published-count").innerText());
    if (browseInstall === "None yet") expect(detailInstall).toBe(0);
    else expect(browseInstall).toContain(String(detailInstall));
    expect(browseUsage).toContain(String(detailPublished));
    if (detailInstall > 0) {
      await expect(page.getByTestId("work-plan-row").first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /new work preset/i })).toHaveCount(0);
  });

  test("Harbor MEMBER can open Marketplace and routes coexist", async ({ page }) => {
    await page.context().clearCookies();
    await signInHarbor(page, harborMemberEmail);
    await page.goto("/console/catalog");
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await page.goto("/console/catalog/products/PLANT");
    await expect(page.getByRole("heading", { name: "Facility Plant Operations" })).toBeVisible();
    await page.goto("/console/catalog/work/MECHANICAL_ROOM_ROUND");
    await expect(page.getByRole("heading", { name: "Mechanical Room Round" })).toBeVisible();
    await page.goto("/console/catalog/cooler_temperature_log");
    await expect(page.getByRole("heading", { name: "Cooler Temperature Log" })).toBeVisible();
    await page.goto("/console/catalog/new");
    await expect(page.getByRole("heading", { name: "New catalog record" })).toBeVisible();
    const missingProduct = await page.goto("/console/catalog/products/NOT_REAL");
    expect(missingProduct?.status()).toBe(404);
    const missingWork = await page.goto("/console/catalog/work/NOT_REAL");
    expect(missingWork?.status()).toBe(404);
  });
});

test("@console-marketplace-release @ci-gate facility session cannot open Marketplace", async ({
  page,
}) => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  await page.goto("/login");
  await page.getByLabel("Email").fill(facilityEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  for (const path of [
    "/console/catalog",
    "/console/catalog/products/PLANT",
    "/console/catalog/work/MECHANICAL_ROOM_ROUND",
    "/console/catalog/cooler_temperature_log",
  ]) {
    await page.goto(path);
    await page.waitForURL(/\/console\/login/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
    await expect(page.locator("[data-testid='marketplace-row']")).toHaveCount(0);
  }
});
