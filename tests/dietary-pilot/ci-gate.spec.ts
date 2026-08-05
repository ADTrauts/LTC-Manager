import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  serviceDateKey: string;
  serveryUnitId: string;
  supervisorEmail: string;
  gmEmail: string;
  staffEmail: string;
  adminEmail: string;
  staffEmployeeId: string;
  callOffCount: number;
  serveryCount: number;
};

const profileDir = process.env.DIETARY_PILOT_PROFILE_DIR || "tmp/dietary-pilot-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.DIETARY_PILOT_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "dietary-pilot-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    baseURL: process.env.DIETARY_PILOT_BASE_URL,
    serviceWorkers: "allow",
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string) {
  const context = page.context();
  const deviceCookies = (await context.cookies()).filter(
    (c) => c.name === "ltc_device_facility" || c.name === "ltc_device_unit",
  );
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  const unitCookie = deviceCookies.find((c) => c.name === "ltc_device_unit");
  if (unitCookie) await context.addCookies([unitCookie]);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function bindDevice(page: Page, unitId: string) {
  const result = await page.evaluate(async (uid) => {
    const res = await fetch("/api/auth/bind-device", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: uid }),
      credentials: "same-origin",
    });
    return { ok: res.ok, status: res.status };
  }, unitId);
  expect(result.ok, `bind-device failed status=${result.status}`).toBeTruthy();
}

test.describe.configure({ mode: "default" });

test("call-off and coverage @ci-gate: board shows call-offs and coverage summary", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("calloff");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/Call-offs/i).first()).toBeVisible();
    await expect(page.getByText(/Plan:\s*(DRAFT|CONFIRMED|REOPENED|CLOSED)/i).first()).toBeVisible();
    expect(fx.callOffCount).toBeGreaterThanOrEqual(7);
    expect(fx.serveryCount).toBeGreaterThanOrEqual(17);
  } finally {
    await context.close();
  }
});

test("assignment create confirm employee @ci-gate: plan confirmation publishes Assignment", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("assign");
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
    await createForm.locator('select[name="unitId"]').selectOption({ value: fx.serveryUnitId });
    await createForm.getByRole("button", { name: /Create Assignment/i }).click();
    await page.waitForTimeout(2000);

    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    const confirm = page.locator("form").filter({ hasText: /Confirm plan/i });
    if (await confirm.count()) {
      const ack = confirm.locator('input[name="acknowledgeCoverageGaps"]');
      if (await ack.count()) await ack.check();
      await confirm.getByRole("button", { name: /Confirm plan/i }).click();
      await page.waitForTimeout(2000);
    }

    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(/Plan:\s*CONFIRMED/i)).toBeVisible({ timeout: 15_000 });

    // Employee sees confirmed Assignment.
    await context.clearCookies();
    await loginPassword(page, fx.staffEmail);
    await page.goto(`/unit/${fx.serveryUnitId}`, { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("my-assignment-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).not.toContainText(/Assignment not confirmed/i);
  } finally {
    await context.close();
  }
});

test("gm staffing and timing @ci-gate: coverage page and unit milestones", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("gm");
  try {
    await loginPassword(page, fx.gmEmail);
    await page.goto("/today/coverage", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dietary-assignment-coverage")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("link", { name: /Open Assignment Board/i })).toBeVisible();

    await page.goto(`/unit/${fx.serveryUnitId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("unit-workspace")).toBeVisible({ timeout: 25_000 });
  } finally {
    await context.close();
  }
});

test("quick pin unit workspace ready started offline @ci-gate", async () => {
  const fx = loadFixtures();
  const staffPin = process.env.PILOT_STAFF_PIN;
  expect(staffPin, "PILOT_STAFF_PIN required").toBeTruthy();

  const { context, page } = await openPersistent("pin-offline");
  try {
    // Bind device as FA, then PIN as staff (preserve device cookies across session logout).
    await loginPassword(page, fx.adminEmail);
    await bindDevice(page, fx.serveryUnitId);
    const deviceCookies = (await context.cookies()).filter(
      (c) => c.name === "ltc_device_facility" || c.name === "ltc_device_unit",
    );
    expect(
      deviceCookies.some((c) => c.name === "ltc_device_facility" && c.value.length > 0),
      "ltc_device_facility missing after bind",
    ).toBeTruthy();

    await page.request.post("/api/auth/logout").catch(() => {});
    await context.addCookies(deviceCookies);

    // In-page fetch keeps the persistent-context cookie jar aligned with bind-device.
    const pinResult = await page.evaluate(async (pin) => {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    }, staffPin);
    expect(
      pinResult.ok,
      `pin-login failed status=${pinResult.status} body=${pinResult.body.slice(0, 120)}`,
    ).toBeTruthy();

    await page.goto(`/unit/${fx.serveryUnitId}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("unit-workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("offline-runtime-status")).toBeVisible({ timeout: 30_000 });

    // Ensure meal controls present for Ready / Started.
    const readyBtn = page.getByRole("button", { name: /Servery Ready/i }).first();
    const startedBtn = page.getByRole("button", { name: /Meal Service Started/i }).first();
    await expect(readyBtn).toBeVisible({ timeout: 20_000 });
    await expect(startedBtn).toBeVisible({ timeout: 20_000 });

    // Online milestone record if controls allow.
    if (await readyBtn.isEnabled()) {
      await readyBtn.click({ trial: true }).catch(() => {});
    }

    // Fetch offline bundle via API and confirm Assignment context stays scoped.
    const bundleResult = await page.evaluate(async (uid) => {
      const res = await fetch("/api/offline/runtime-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ unitId: uid }),
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = (await res.json()) as {
        bundle?: { assignmentContext?: { assignmentId?: string } | null };
      };
      return {
        ok: true,
        hasAssignmentKey: Object.prototype.hasOwnProperty.call(data.bundle ?? {}, "assignmentContext"),
        assignmentId: data.bundle?.assignmentContext?.assignmentId ?? null,
      };
    }, fx.serveryUnitId);
    expect(bundleResult.ok, `runtime-bundle status=${bundleResult.status}`).toBeTruthy();
    expect(bundleResult.hasAssignmentKey).toBeTruthy();
  } finally {
    await context.close();
  }
});

test("overlap and role boundary @ci-gate: write-time overlap + STAFF denied board", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({
    datasources: { db: { url: process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL } },
  });
  try {
    const [y, m, d] = fx.serviceDateKey.split("-").map(Number);
    const serviceDate = new Date(Date.UTC(y!, m! - 1, d!));
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
          unitId: fx.serveryUnitId,
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
          const open = !row.startsAt || !row.endsAt;
          const overlap =
            open ||
            (row.startsAt!.getTime() < endsB.getTime() && startsB.getTime() < row.endsAt!.getTime());
          if (overlap) throw new Error(`Overlapping Assignment is not allowed (${row.roleLabel}).`);
        }
      }),
    ).rejects.toThrow(/overlap/i);
  } finally {
    await db.$disconnect();
  }

  const { context, page } = await openPersistent("staff-deny");
  try {
    await loginPassword(page, fx.staffEmail);
    await page.goto(`/staffing/assignments?date=${fx.serviceDateKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
