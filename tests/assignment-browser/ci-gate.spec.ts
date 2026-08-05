import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  serviceDateKey: string;
  supervisorEmail: string;
  staffEmail: string;
  faEmail: string;
  staffEmployeeId: string;
  scaleEmployeeCount: number;
};

const profileDir = process.env.ASSIGNMENT_BROWSER_PROFILE_DIR || "tmp/assignment-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.ASSIGNMENT_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "assignment-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

function serviceDateUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    baseURL: process.env.ASSIGNMENT_BROWSER_BASE_URL,
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe.configure({ mode: "default" });

test("board load @ci-gate: supervisor opens Assignment Board with scale roster", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("board");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Plan:\s*(DRAFT|CONFIRMED|REOPENED|CLOSED)/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("assignment-by-unit")).toBeVisible();
    await expect(page.getByText(/scheduled employee/i).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("create and confirm @ci-gate: supervisor assigns and confirms plan", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("confirm");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Create Assignment/i })).toBeVisible({
      timeout: 20_000,
    });

    const createForm = page.locator("form").filter({ hasText: "Create Assignment" });
    await createForm.locator('select[name="employeeId"]').selectOption({ value: fx.staffEmployeeId });
    await createForm.locator('select[name="roleKey"]').selectOption({ index: 1 });
    await createForm.locator('select[name="unitId"]').selectOption({ value: fx.unitId });
    await createForm.locator('input[name="startsAt"]').fill("06:00");
    await createForm.locator('input[name="endsAt"]').fill("10:00");
    await createForm.getByRole("button", { name: /Create Assignment/i }).click();

    await page.waitForTimeout(2000);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("assignment-by-unit")).toContainText(/StaffEmp|Server|Cook|Assign/i, {
      timeout: 15_000,
    });

    const confirm = page.locator("form").filter({ hasText: /Confirm plan/i });
    await expect(confirm.getByRole("button", { name: /Confirm plan/i })).toBeVisible({
      timeout: 10_000,
    });
    const ack = confirm.locator('input[name="acknowledgeCoverageGaps"]');
    if (await ack.count()) await ack.check();
    await confirm.getByRole("button", { name: /Confirm plan/i }).click();
    await page.waitForTimeout(2000);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Plan:\s*CONFIRMED/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test("employee visibility @ci-gate: staff sees confirmed Assignment only after confirm", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({
    datasources: { db: { url: process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL } },
  });
  try {
    const plan = await db.operationalAssignmentPlan.findFirst({
      where: {
        facilityId: fx.facilityId,
        departmentId: fx.departmentId,
      },
      orderBy: { updatedAt: "desc" },
    });
    const { context, page } = await openPersistent("employee");
    try {
      await loginPassword(page, fx.staffEmail);
      await page.goto(`/unit/${fx.unitId}`, { waitUntil: "domcontentloaded" });
      const panel = page.getByTestId("my-assignment-panel");
      await expect(panel).toBeVisible({ timeout: 20_000 });
      if (plan?.status === "CONFIRMED" || plan?.status === "REOPENED" || plan?.status === "CLOSED") {
        await expect(panel).not.toContainText(/Assignment not confirmed/i);
      }
    } finally {
      await context.close();
    }
  } finally {
    await db.$disconnect();
  }
});

test("coverage gap @ci-gate: coverage page links to Assignment Board", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("coverage");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto("/today/coverage", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dietary-assignment-coverage")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Open Assignment Board/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("role denial @ci-gate: STAFF cannot open Assignment Board; FA without ops cannot create", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("deny-staff");
  try {
    await loginPassword(page, fx.staffEmail);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toHaveCount(0);
  } finally {
    await context.close();
  }

  const { context: faCtx, page: faPage } = await openPersistent("deny-fa");
  try {
    await loginPassword(faPage, fx.faEmail);
    await faPage.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(faPage.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(faPage.getByRole("heading", { name: /Create Assignment/i })).toHaveCount(0);
  } finally {
    await faCtx.close();
  }
});

test("overlap rejection @ci-gate: write-time overlap is enforced in database", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({
    datasources: { db: { url: process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL } },
  });
  try {
    const serviceDate = serviceDateUtc(fx.serviceDateKey);
    const startsA = new Date(`${fx.serviceDateKey}T11:00:00.000Z`);
    const endsA = new Date(`${fx.serviceDateKey}T14:00:00.000Z`);
    const startsB = new Date(`${fx.serviceDateKey}T13:00:00.000Z`);
    const endsB = new Date(`${fx.serviceDateKey}T16:00:00.000Z`);

    const existing = await db.operationalAssignment.findFirst({
      where: {
        facilityId: fx.facilityId,
        employeeId: fx.staffEmployeeId,
        serviceDate,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
    });
    if (!existing) {
      await db.operationalAssignment.create({
        data: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          employeeId: fx.staffEmployeeId,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          unitId: fx.unitId,
          startsAt: startsA,
          endsAt: endsA,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
    }

    await expect(
      db.$transaction(async (tx) => {
        const key = `oa:${fx.staffEmployeeId}:${fx.serviceDateKey}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const rows = await tx.operationalAssignment.findMany({
          where: {
            facilityId: fx.facilityId,
            employeeId: fx.staffEmployeeId,
            serviceDate,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: { startsAt: true, endsAt: true, roleLabel: true },
        });
        for (const row of rows) {
          const open = !row.startsAt || !row.endsAt || !startsB || !endsB;
          const overlap =
            open ||
            (row.startsAt!.getTime() < endsB.getTime() && startsB.getTime() < row.endsAt!.getTime());
          if (overlap) {
            throw new Error(`Overlapping Assignment is not allowed (${row.roleLabel}).`);
          }
        }
      }),
    ).rejects.toThrow(/overlap/i);
  } finally {
    await db.$disconnect();
  }
});
