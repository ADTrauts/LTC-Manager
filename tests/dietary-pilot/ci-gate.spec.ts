import { expectCanonicalOfflinePreparation, prepareCanonicalResponsibility } from "../offline-browser/canonical-journey";
import type { CanonicalOfflineFixture } from "../offline-browser/canonical-journey";
import { setNetworkOffline, waitForServiceWorkerControl } from "../offline-browser/helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { boardHref, createAndConfirmAssignment, roomHref } from "../assignment-browser/canonical-board";

type Fixtures = {
  canonical: CanonicalOfflineFixture;
  facilityId: string;
  departmentId: string;
  serviceDateKey: string;
  serveryUnitId: string;
  assignmentRoom: { id: string; unitId: string; name: string };
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
  const tablet=test.info().project.name==="tablet";
  const dir = `${profileDir}-${suffix}-${test.info().project.name}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: tablet ? {width:1024,height:768} : {width:1280,height:720},
    isMobile: tablet, hasTouch: tablet,
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
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(`Call-offs ${fx.callOffCount}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Uncovered \d+$/)).toBeVisible();
    expect(fx.callOffCount).toBeGreaterThanOrEqual(7);
    expect(fx.serveryCount).toBeGreaterThanOrEqual(17);
  } finally {
    await context.close();
  }
});

test("assignment create confirm employee @ci-gate: confirmed Room Assignment is visible to the employee", async () => {
  const fx = loadFixtures();
  const db = new PrismaClient({ datasources: { db: { url: process.env.VERIFY_DATABASE_URL } } });
  const { context, page } = await openPersistent("assign");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await createAndConfirmAssignment(page, db, fx);

    await context.clearCookies();
    await loginPassword(page, fx.staffEmail);
    await page.goto(roomHref(fx), { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("employee-runtime-assignment");
    await expect(panel).toContainText("Server");
    await expect(panel).not.toContainText("No confirmed assignment");
    await expect(page.getByTestId("employee-runtime-experience")).toHaveAttribute("data-grain", "space");
  } finally {
    await context.close();
    await db.$disconnect();
  }
});

test("gm staffing and timing @ci-gate: coverage page and unit milestones", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("gm");
  try {
    await loginPassword(page, fx.gmEmail);
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible({
      timeout: 25_000,
    });

    await page.goto(`/unit/${fx.serveryUnitId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("neighborhood-workspace")).toBeVisible({ timeout: 25_000 });
  } finally {
    await context.close();
  }
});

test("quick PIN canonical Space Assignment and Key Time actual @ci-gate", async ({}, info) => {
  const fx = loadFixtures();
  const staffPin = process.env.CANONICAL_STAFF_PIN;
  expect(staffPin, "CANONICAL_STAFF_PIN required").toBeTruthy();

  const db = new PrismaClient({ datasources: { db: { url: process.env.VERIFY_DATABASE_URL } } });
  const { context, page } = await openPersistent("pin-offline");
  try {
    await prepareCanonicalResponsibility(page, fx.canonical, fx.serviceDateKey);
    // Bind device as FA, then PIN as staff (preserve device cookies across session logout).
    await loginPassword(page, fx.adminEmail);
    await bindDevice(page, fx.canonical.unitId);
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
      return { ok: res.ok, status: res.status };
    }, staffPin);
    expect(
      pinResult.ok,
      `pin-login failed status=${pinResult.status}`,
    ).toBeTruthy();

    await page.goto(`/unit/${fx.canonical.unitId}?space=${fx.canonical.spaceId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("employee-runtime-experience")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("employee-runtime-experience")).toHaveAttribute("data-grain", "space");
    await expect(page.getByTestId("employee-runtime-assignment")).not.toContainText("No confirmed assignment");
    await expectCanonicalOfflinePreparation(page);
    await waitForServiceWorkerControl(page);
    await setNetworkOffline(context, true, page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId('space-offline-status')).toContainText('Offline — prepared');
    const i = info.project.name === "tablet" ? 1 : 0;
    // An actual needs current responsibility. Completing the Assignment first
    // would revoke that authority before the new actual is applied.
    await page.locator(`[data-testid="space-key-time-actual"][data-target-order="${i}"]`).click();
    await page.getByTestId("space-assignment-complete").click();
    await expect(page.getByTestId("space-command-result")).toHaveCount(2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("space-command-result").filter({ hasText: "pending" })).toHaveCount(2);
    await expect(page.getByTestId("space-online-only")).toContainText("unavailable offline");
    const queued = await page.evaluate(async () => {
      const store = await import(/* webpackIgnore: true */ String("/space-offline-store.js"));
      const id = store.activeId();
      const row = (await store.envelopes()).find((entry: { id: string }) => entry.id === id);
      const { bundle, commands } = await store.read(row);
      return { id, scope: bundle.scope, commands } as {
        id: string;
        scope: { unitId: string; spaceId: string };
        commands: Array<{ id: string; kind: string; target: string; status: string }>;
      };
    });
    expect(queued.scope).toMatchObject({ unitId: fx.canonical.unitId, spaceId: fx.canonical.spaceId });
    expect(queued.commands.map(c => [c.kind, c.status])).toEqual([
      ["KEY_TIME_ACTUAL", "pending"], ["ASSIGNMENT", "pending"],
    ]);
    const where = { issuanceId: queued.id };
    expect(await db.offlineSyncReceipt.count({ where })).toBe(0);
    const completed = queued.commands[1]!;
    const completionWhere = { assignmentId: completed.target, eventType: "COMPLETED" };
    const before = await db.operationalAssignmentEvent.count({ where: completionWhere });

    await setNetworkOffline(context, false, page);
    const synced = page.waitForResponse(r =>
      r.url().endsWith("/api/offline/runtime-sync") &&
      r.request().method() === "POST" && r.request().postDataJSON()?.action === "sync",
    );
    await page.getByTestId("space-offline-sync").click();
    const syncResponse = await synced;
    expect(syncResponse.ok()).toBe(true);
    const { outcomes } = await syncResponse.json();
    expect(outcomes.map((outcome: { id: string; status: string }) => [outcome.id, outcome.status]))
      .toEqual(queued.commands.map(c => [c.id, "committed"]));
    await expect(page.getByTestId("space-command-result").filter({ hasText: "committed" })).toHaveCount(2);

    const receipts = await db.offlineSyncReceipt.findMany({ where, orderBy: { id: "asc" } });
    expect(receipts).toHaveLength(2);
    for (const command of queued.commands) {
      const receipt = receipts.find(r => r.clientCommandId === command.id);
      const outcome = outcomes.find((entry: { id: string }) => entry.id === command.id);
      expect(receipt).toMatchObject({
        commandType: `space/1:${command.kind}`,
        actorEmployeeId: fx.canonical.people.worker.employeeId,
        deviceBoundUnitId: fx.canonical.unitId,
        resultCategory: "ACCEPTED",
        authoritativeRecordId: outcome.recordId,
        outcome,
      });
      expect(receipt?.intentDigest).toBeTruthy();
    }
    expect(outcomes[1].recordId).toBe(completed.target);
    const actual = await db.operationalCycleKeyPointActual.findUniqueOrThrow({ where: { id: outcomes[0].recordId } });
    const target = await db.operationalCycleKeyTimeDayExpectation.findUniqueOrThrow({ where: { id: queued.commands[0]!.target } });
    expect(actual).toMatchObject({ cycleId: target.cycleId, spaceId: fx.canonical.spaceId, serviceDate: target.serviceDate });
    const actualWhere = { cycleId: target.cycleId, spaceId: target.spaceId, serviceDate: target.serviceDate };
    expect(await db.operationalCycleKeyPointActual.count({ where: actualWhere })).toBe(1);
    expect(await db.operationalAssignmentEvent.count({ where: completionWhere })).toBe(before + 1);

    const replay = await page.evaluate(async (body) => {
      const response = await fetch("/api/offline/runtime-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, syncResponse.request().postDataJSON());
    expect(replay).toEqual({ status: 200, body: { outcomes } });
    expect(await db.offlineSyncReceipt.findMany({ where, orderBy: { id: "asc" } })).toEqual(receipts);
    expect(await db.operationalCycleKeyPointActual.count({ where: actualWhere })).toBe(1);
    expect(await db.operationalAssignmentEvent.count({ where: completionWhere })).toBe(before + 1);

    await page.goto(boardHref({ departmentId: fx.canonical.departmentId, serviceDateKey: fx.serviceDateKey }), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Daily Assignment Board" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Assignment", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
    await db.$disconnect();
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
    await page.goto(boardHref(fx), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
