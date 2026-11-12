import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { boardHref, createAndConfirmAssignment, roomHref } from "./canonical-board";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  plantDepartmentId: string;
  unitId: string;
  assignmentRoom: { id: string; unitId: string; name: string };
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
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/40 scheduled employees/)).toBeVisible();
    await expect(page.getByText(/Plan:/)).toHaveCount(0);
    await expect(page.getByTestId("assignment-by-unit")).toBeVisible();
    await expect(page.getByRole("heading", { name: /By Employee/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("create, confirm, complete and reopen an exact Room Assignment @ci-gate", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({ datasources: { db: { url: process.env.VERIFY_DATABASE_URL } } });
  const { context, page } = await openPersistent("confirm");
  try {
    await loginPassword(page, fx.supervisorEmail);
    const assignment = await createAndConfirmAssignment(page, db, fx);

    await context.clearCookies();
    await loginPassword(page, fx.staffEmail);
    await page.goto(roomHref(fx));
    const completion = page.getByTestId("employee-assignment-completion");
    await expect(completion).toContainText("Check the supplies in the assigned Room.");
    await completion.getByLabel("Completion note").fill("Supplies verified.");
    await completion.getByRole("button", { name: "Complete Assignment", exact: true }).click();
    const status = async () => (await db.operationalAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status;
    await expect.poll(status).toBe("COMPLETED");
    await page.reload();
    await expect(page.getByTestId("employee-completed-assignments")).toContainText("Server");

    await context.clearCookies();
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(boardHref(fx));
    const history = page.getByTestId("assignment-completed-list");
    await history.locator("summary").click();
    const row = history.getByTestId(`completed-assignment-${assignment.id}`);
    await row.getByLabel("Reason to reopen Assignment").fill("Recheck the supplies.");
    await row.getByRole("button", { name: "Reopen Assignment", exact: true }).click();
    await expect.poll(status).toBe("ACTIVE");
    await page.reload();
    await expect(page.getByText("Plan: CONFIRMED", { exact: true })).toBeVisible();
    for (const eventType of ["COMPLETED", "REOPENED"]) {
      expect(await db.operationalAssignmentEvent.count({ where: { assignmentId: assignment.id, eventType } })).toBe(1);
    }
  } finally {
    await context.close();
    await db.$disconnect();
  }
});

test("employee visibility @ci-gate: staff sees confirmed Assignment only after confirm", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({
    datasources: { db: { url: process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL } },
  });
  try {
    const serviceDate = serviceDateUtc(fx.serviceDateKey);
    const plan = await db.operationalAssignmentPlan.upsert({
      where: {
        facilityId_departmentId_serviceDate: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          serviceDate,
        },
      },
      update: { status: "DRAFT", confirmedAt: null },
      create: {
        facilityId: fx.facilityId,
        departmentId: fx.departmentId,
        serviceDate,
        status: "DRAFT",
        confirmedAt: null,
      },
    });
    await db.operationalAssignment.deleteMany({
      where: {
        facilityId: fx.facilityId,
        employeeId: fx.staffEmployeeId,
        serviceDate,
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: fx.facilityId,
        departmentId: fx.departmentId,
        planId: plan.id,
        employeeId: fx.staffEmployeeId,
        serviceDate,
        roleKey: "SERVER",
        roleLabel: "Server",
        unitId: fx.unitId,
        // Null bounds = full operational day (always current for resolveCurrentEmployeeAssignment).
        startsAt: null,
        endsAt: null,
        status: "PLANNED",
        source: "SCHEDULED_EMPLOYEE",
      },
    });

    const { context, page } = await openPersistent("employee");
    try {
      await loginPassword(page, fx.staffEmail);
      await page.goto(`/unit/${fx.unitId}`, { waitUntil: "domcontentloaded" });
      const panel = page.getByTestId("employee-runtime-assignment");
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await expect(panel).toContainText(/No confirmed assignment/i);
      await db.operationalAssignmentPlan.update({ where: { id: plan.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(panel).toContainText(/Server/i);
      await expect(panel).not.toContainText(/No confirmed assignment/i);
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
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await context.close();
  }
});

test("role denial @ci-gate: STAFF is denied Dietary board; FA is denied Plant assignments", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("deny-staff");
  try {
    await loginPassword(page, fx.staffEmail);
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/logs(?:[?#]|$)/);
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toHaveCount(0);
  } finally {
    await context.close();
  }

  const { context: faCtx, page: faPage } = await openPersistent("deny-fa");
  try {
    await loginPassword(faPage, fx.faEmail);
    // A Facility Administrator has Dietary authority, but no Plant Assignment authority.
    await faPage.goto(boardHref({ ...fx, departmentId: fx.plantDepartmentId }), {
      waitUntil: "domcontentloaded",
    });
    await expect(faPage.getByText("Department Assignment access is unavailable.")).toBeVisible();
    await expect(faPage.getByRole("heading", { name: /Daily Assignment Board/i })).toHaveCount(0);
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
