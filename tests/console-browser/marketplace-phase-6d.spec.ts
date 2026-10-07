import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { getDepartmentProduct } from "@/lib/department-products/registry";

const databaseUrl =
  process.env.CONSOLE_BROWSER_DATABASE_URL ||
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const harborEmail = "phase6c-harbor@example.com";
const facilityEmail = "phase6c-facility@example.com";
const password = "Phase6c-browser";
const plantAName = "Phase 6D Plant Operable";
const plantBName = "Phase 6D Plant Disabled";
const decoyName = "Phase 6D Named Plant Decoy";
const dietaryName = "Phase 6D Dietary Facility";
const foodName = "Phase 6D Food Canonical Facility";
const workName = "Phase 6D Mechanical Facility";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function prismaClient() {
  if (!databaseUrl) throw new Error("CONSOLE_BROWSER_DATABASE_URL is required");
  if (databaseUrl.includes("/ltc_manager")) throw new Error("Refusing to seed ltc_manager");
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function signInHarbor(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Email").fill(harborEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/console/login"), { timeout: 30_000 });
}

test.beforeAll(async () => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
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
    const staffRole = await prisma.role.upsert({
      where: { key: "STAFF" },
      update: {},
      create: { id: cuidLike(), key: "STAFF", name: "Staff" },
    });
    const adminRole = await prisma.role.upsert({
      where: { key: "FACILITY_ADMINISTRATOR" },
      update: {},
      create: { id: cuidLike(), key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
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

    async function facility(label: string) {
      const existing = await prisma.facility.findFirst({ where: { displayName: label } });
      if (existing) return existing;
      const org = await prisma.organization.create({ data: { name: label } });
      return prisma.facility.create({
        data: { organizationId: org.id, displayName: label, timezone: "America/New_York" },
      });
    }

    const plantA = await facility(plantAName);
    const plantB = await facility(plantBName);
    const decoy = await facility(decoyName);
    const dietary = await facility(dietaryName);
    const food = await facility(foodName);
    const work = await facility(workName);

    async function department(facilityId: string, key: string, name: string, isActive: boolean) {
      const existing = await prisma.department.findFirst({ where: { facilityId, key } });
      if (existing) return existing;
      return prisma.department.create({ data: { facilityId, key, name, isActive } });
    }

    const plantDepartment = await department(plantA.id, "PLANT", "Plant Operations", true);
    await department(plantB.id, "PLANT", "Plant Operations", false);
    await department(decoy.id, "PHASE6D_DECOY", "Plant Operations", true);
    await department(dietary.id, "DIETARY", "Dietary", true);
    await department(food.id, "HEALTHCARE_FOOD_NUTRITION", "Food Services", true);
    const workDepartment = await department(work.id, "PLANT", "Plant Operations", true);

    if (!(await prisma.facilityBilling.findUnique({ where: { facilityId: plantA.id } }))) {
      const billing = await prisma.facilityBilling.create({
        data: { facilityId: plantA.id, status: "ACTIVE" },
      });
      await prisma.facilityDepartmentEntitlement.create({
        data: {
          facilityBillingId: billing.id,
          facilityId: plantA.id,
          departmentId: plantDepartment.id,
          departmentKey: "PLANT",
          status: "ACTIVE",
        },
      });
    }

    const people = [
      ["gm", "GM"],
      ["manager", "MANAGER"],
      ["lead", "LEAD_TEAM_MEMBER"],
      ["staff", "STAFF"],
    ] as const;
    for (const [key, roleType] of people) {
      const email = `phase6d-${key}@example.com`;
      if (await prisma.employee.findFirst({ where: { email, facilityId: plantA.id } })) continue;
      await prisma.employee.create({
        data: {
          facilityId: plantA.id,
          firstName: key,
          lastName: "Phase6D",
          email,
          roleType,
          status: "ACTIVE",
          primaryDepartmentId: plantDepartment.id,
        },
      });
    }
    if (!(await prisma.employee.findFirst({ where: { email: "phase6d-supervisor@example.com" } }))) {
      const supervisor = await prisma.employee.create({
        data: {
          facilityId: plantA.id,
          firstName: "supervisor",
          lastName: "Phase6D",
          email: "phase6d-supervisor@example.com",
          roleType: "SUPERVISOR",
          status: "ACTIVE",
        },
      });
      await prisma.employeeDepartment.create({
        data: { employeeId: supervisor.id, departmentId: plantDepartment.id },
      });
    }
    if (!(await prisma.user.findUnique({ where: { email: "phase6d-admin@example.com" } }))) {
      await prisma.user.create({
        data: {
          email: "phase6d-admin@example.com",
          displayName: "Phase 6D Admin",
          facilityId: plantA.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    }
    if (!(await prisma.user.findUnique({ where: { email: "phase6d-manager@example.com" } }))) {
      await prisma.user.create({
        data: {
          email: "phase6d-manager@example.com",
          displayName: "Phase 6D Manager Duplicate",
          facilityId: plantA.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    const plans = await prisma.departmentWorkPlan.count({
      where: { facilityId: work.id, presetKey: "MECHANICAL_ROOM_ROUND" },
    });
    if (plans === 0) {
      for (const version of [
        { version: 1, status: "DRAFT" as const, name: "Phase 6D Mechanical Draft" },
        { version: 2, status: "PUBLISHED" as const, name: "Phase 6D Mechanical Published" },
        { version: 3, status: "DRAFT" as const, name: "Phase 6D Mechanical Successor" },
      ]) {
        await prisma.departmentWorkPlan.create({
          data: {
            facilityId: work.id,
            departmentId: workDepartment.id,
            stableKey: "phase6d_mechanical_round",
            presetKey: "MECHANICAL_ROOM_ROUND",
            version: version.version,
            name: version.name,
            status: version.status,
          },
        });
      }
    }

    if (!(await prisma.catalogLogDefinition.findUnique({ where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } } }))) {
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

test.describe("Harbor Marketplace detail", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
    await signInHarbor(page);
  });

  test("Department Product detail opens from Marketplace", async ({ page }) => {
    const plant = getDepartmentProduct("PLANT");
    assertPlant(plant);
    await page.goto("/console/catalog?family=departments");
    await page.locator('[data-stable-key="PLANT"] a').click();
    await expect(page).toHaveURL(/\/console\/catalog\/products\/PLANT$/);
    await expect(page.getByRole("heading", { name: "Facility Plant Operations" })).toBeVisible();
    await expect(page.getByText("Department Product")).toBeVisible();
    await expect(page.getByTestId("product-version")).toHaveText("1.0");
    await expect(page.getByTestId("product-status")).toHaveText("AVAILABLE");
    await expect(page.getByTestId("product-released")).toHaveText("October 7, 2026");
    await expect(page.getByText("PLANT").first()).toBeVisible();
    for (const capability of plant.customerCapabilities ?? []) {
      await expect(page.getByText(capability, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /edit product/i })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Marketplace" }).click();
    await expect(page).toHaveURL(/\/console\/catalog$/);
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  });

  test("installed Facilities and roles stay on the product", async ({ page }) => {
    await page.goto("/console/catalog/products/PLANT");
    const operable = page.locator('[data-testid="installed-facility-row"][data-facility-name="Phase 6D Plant Operable"]');
    const disabled = page.locator('[data-testid="installed-facility-row"][data-facility-name="Phase 6D Plant Disabled"]');
    await expect(operable).toHaveAttribute("data-users", "6");
    await expect(operable).toContainText("Enabled");
    await expect(operable).toContainText("Active");
    await expect(disabled).toHaveAttribute("data-users", "0");
    await expect(disabled).toContainText("Disabled");
    await expect(page.getByText(decoyName)).toHaveCount(0);

    const userCount = Number(await page.getByTestId("product-user-count").innerText());
    let roleSum = 0;
    for (const role of ["generalManagers", "managers", "supervisors", "staff", "facilityAdministrators"]) {
      roleSum += Number(await page.locator(`[data-testid="role-count"][data-role="${role}"]`).innerText());
    }
    expect(roleSum).toBe(userCount);
    await expect(page.getByText("General Managers")).toBeVisible();
    await expect(page.getByText("Facility Administrators")).toBeVisible();

    await page.goto("/console/catalog/products/HEALTHCARE_FOOD_NUTRITION");
    await expect(
      page.locator('[data-testid="installed-facility-row"][data-facility-name="Phase 6D Dietary Facility"][data-department-key="DIETARY"]'),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-testid="installed-facility-row"][data-facility-name="Phase 6D Food Canonical Facility"][data-department-key="HEALTHCARE_FOOD_NUTRITION"]',
      ),
    ).toHaveCount(1);
    await expect(page.getByTestId("product-version")).toHaveText("—");
    await expect(page.getByTestId("product-released")).toHaveText("—");

    await page.goto("/console/catalog/products/EVS");
    await expect(page.getByTestId("product-status")).toHaveText("DEVELOPMENT");
    await expect(page.getByTestId("product-version")).toHaveText("—");
    await expect(page.getByTestId("product-user-count")).toHaveText("0");
  });

  test("record adoption stays on the existing editor", async ({ page }) => {
    await page.goto("/console/catalog/cooler_temperature_log");
    await expect(page.getByRole("heading", { name: "Cooler Temperature Log" })).toBeVisible();
    await expect(page.getByTestId("record-published-version")).toHaveText("v1");
    await expect(page.getByText("Facilities installed")).toBeVisible();
    await expect(page.getByText("Active placements")).toBeVisible();
    await expect(page.getByTestId("record-install-count")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("record-placement-count")).toHaveText(/^\d+$/);
    await expect(
      page.getByRole("button", { name: "New version" }).or(page.getByRole("heading", { name: /Draft v/ })),
    ).toBeVisible();

    await page.goto("/console/catalog/new");
    await expect(page.getByRole("heading", { name: "New catalog record" })).toBeVisible();
  });

  test("Work preset detail lists facility plan versions", async ({ page }) => {
    await page.goto("/console/catalog?family=work");
    await page.locator('[data-stable-key="MECHANICAL_ROOM_ROUND"] a').click();
    await expect(page).toHaveURL(/\/console\/catalog\/work\/MECHANICAL_ROOM_ROUND$/);
    await expect(page.getByRole("heading", { name: "Mechanical Room Round" })).toBeVisible();
    await expect(page.getByTestId("work-version")).toHaveText("—");
    await expect(page.getByTestId("work-status")).toHaveText("—");
    await expect(page.getByRole("link", { name: "Facility Plant Operations" })).toBeVisible();
    const rows = page.locator('[data-testid="work-plan-row"][data-facility-name="Phase 6D Mechanical Facility"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: "Phase 6D Mechanical Published" })).toContainText("PUBLISHED");
    await expect(rows.filter({ hasText: "Phase 6D Mechanical Draft" })).toContainText("DRAFT");
    await expect(page.getByRole("button", { name: /new work preset/i })).toHaveCount(0);
  });
});

test("facility session cannot open Marketplace detail", async ({ page }) => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  await page.goto("/login");
  await page.getByLabel("Email").fill(facilityEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
  for (const path of [
    "/console/catalog/products/PLANT",
    "/console/catalog/work/MECHANICAL_ROOM_ROUND",
    "/console/catalog/cooler_temperature_log",
  ]) {
    await page.goto(path);
    await page.waitForURL(/\/console\/login/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  }
});

test("catalog routes coexist", async ({ page }) => {
  test.skip(!databaseUrl, "Set CONSOLE_BROWSER_DATABASE_URL to a disposable database");
  await signInHarbor(page);
  await page.goto("/console/catalog/new");
  await expect(page.getByRole("heading", { name: "New catalog record" })).toBeVisible();
  await page.goto("/console/catalog/products/PLANT");
  await expect(page.getByRole("heading", { name: "Facility Plant Operations" })).toBeVisible();
  await page.goto("/console/catalog/work/MECHANICAL_ROOM_ROUND");
  await expect(page.getByRole("heading", { name: "Mechanical Room Round" })).toBeVisible();
  await page.goto("/console/catalog/cooler_temperature_log");
  await expect(page.getByRole("heading", { name: "Cooler Temperature Log" })).toBeVisible();
  const missingProduct = await page.goto("/console/catalog/products/NOT_REAL");
  expect(missingProduct?.status()).toBe(404);
  const missingWork = await page.goto("/console/catalog/work/NOT_REAL");
  expect(missingWork?.status()).toBe(404);
});

function assertPlant(plant: ReturnType<typeof getDepartmentProduct>): asserts plant is NonNullable<typeof plant> {
  if (!plant) throw new Error("PLANT registry product is missing");
}
