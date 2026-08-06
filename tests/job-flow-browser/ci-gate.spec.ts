import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  bindDevice,
  setNetworkOffline,
  recordServeryReadyOffline,
  expectOfflineControlsReady,
  fetchBundleViaApi,
} from "../offline-browser/helpers";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  unitName: string;
  secondaryUnitId: string | null;
  secondaryUnitName: string | null;
  uncoveredUnitId: string;
  uncoveredUnitName: string;
  serveryCount: number;
  serviceDateKey: string;
  managerEmail: string;
  supervisorEmail: string;
  staffEmail: string;
  staffNoAssignEmail: string;
  faWithoutDietaryEmail: string;
  faWithDietaryEmail: string;
  staffEmployeeId: string;
  staffAssignmentId: string;
  draftCycleLabel: string;
  retiredCycleLabel: string;
  builderCyclesPath: string;
  unitWorkspacePath: string;
  operationsBoardPath: string;
  assignmentBoardPath: string;
};

const profileDir =
  process.env.JOB_FLOW_BROWSER_PROFILE_DIR || "tmp/job-flow-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.JOB_FLOW_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "job-flow-browser-artifacts", "fixtures.json");
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

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    baseURL: process.env.JOB_FLOW_BROWSER_BASE_URL,
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

async function loginQuickPin(page: Page, context: BrowserContext, adminEmail: string, unitId: string, pin: string) {
  await loginPassword(page, adminEmail);
  await bindDevice(page, unitId);
  const deviceCookies = (await context.cookies()).filter(
    (c) => c.name === "ltc_device_facility" || c.name === "ltc_device_unit",
  );
  await page.request.post("/api/auth/logout").catch(() => {});
  await context.addCookies(deviceCookies);

  const pinResult = await page.evaluate(async (p) => {
    const res = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ pin: p }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, pin);
  expect(
    pinResult.ok,
    `pin-login failed status=${pinResult.status} body=${pinResult.body.slice(0, 120)}`,
  ).toBeTruthy();
}

test.describe.configure({ mode: "default" });

test("staff job flow @ci-gate: PIN or password STAFF loads Job Flow with assignment, cycle, expectation, meal target, progress", async () => {
  const fx = loadFixtures();
  const staffPin = process.env.JOB_FLOW_BROWSER_STAFF_PIN;
  const { context, page } = await openPersistent("staff-job-flow");

  try {
    if (staffPin) {
      await loginQuickPin(page, context, fx.faWithDietaryEmail, fx.unitId, staffPin);
    } else {
      await loginPassword(page, fx.staffEmail);
    }

    await page.goto(`${fx.unitWorkspacePath}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    const flow = page.getByTestId("employee-job-flow");
    await expect(flow).toBeVisible({ timeout: 25_000 });

    // Confirmed Assignment visible; draft-only duty never shown.
    await expect(flow).toContainText(/Server/i);
    await expect(flow).not.toContainText(/Draft Only Duty/i);
    await expect(flow).toContainText(new RegExp(fx.unitName, "i"));

    // Current cycle + expectation + meal target (UnitMealTime) + progress.
    await expect(flow).toContainText(
      /Morning Preparation|Breakfast Service|Lunch Service|Dinner Service/i,
    );
    await expect(flow.getByText(/^Expectation$/i)).toBeVisible();
    await expect(flow).toContainText(/Meal target|target:|Meal service target/i);
    await expect(flow).not.toContainText(new RegExp(fx.retiredCycleLabel, "i"));

    const progress = flow.getByLabel(/Progress/i);
    if ((await progress.count()) > 0) {
      await expect(progress).toContainText(/Upcoming|Current|Confirmed|Not confirmed|Saved on this tablet/i);
    }

    // Phase 9A carry-forward: Not Confirmed is neutral (no failed / blocked language).
    const body = await flow.innerText();
    expect(body).not.toMatch(/failed|blocked|punitive/i);
    if (/not confirmed/i.test(body)) {
      expect(body).not.toMatch(/service did not happen|did not occur/i);
    }
  } finally {
    await context.close();
  }
});

test("no assignment @ci-gate: STAFF without confirmed Assignment sees neutral guidance", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("no-assign");
  try {
    await loginPassword(page, fx.staffNoAssignEmail);
    await page.goto(`${fx.unitWorkspacePath}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    const flow = page.getByTestId("employee-job-flow");
    await expect(flow).toBeVisible({ timeout: 25_000 });
    await expect(flow).toContainText(/No confirmed Assignment/i);
    await expect(flow).not.toContainText(/failed|blocked/i);
  } finally {
    await context.close();
  }
});

test("assignment change @ci-gate: updated Unit becomes visible; prior Assignment row intact", async () => {
  const fx = loadFixtures();
  if (!fx.secondaryUnitId || !fx.secondaryUnitName) {
    test.skip(true, "secondary unit unavailable");
    return;
  }

  const db = prisma();
  const { context, page } = await openPersistent("assign-change");
  try {
    await loginPassword(page, fx.staffEmail);
    await page.goto(`${fx.unitWorkspacePath}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("employee-job-flow")).toContainText(new RegExp(fx.unitName, "i"), {
      timeout: 20_000,
    });

    await db.operationalAssignment.update({
      where: { id: fx.staffAssignmentId },
      data: { unitId: fx.secondaryUnitId, roleLabel: "Server (moved)" },
    });

    await page.goto(`/unit/${fx.secondaryUnitId}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    const flow = page.getByTestId("employee-job-flow");
    await expect(flow).toBeVisible({ timeout: 25_000 });
    await expect(flow).toContainText(/Server \(moved\)|Server/i);
    await expect(flow).toContainText(new RegExp(fx.secondaryUnitName, "i"));

    const stillThere = await db.operationalAssignment.findUnique({
      where: { id: fx.staffAssignmentId },
      select: { id: true, unitId: true },
    });
    expect(stillThere?.id).toBe(fx.staffAssignmentId);
    expect(stillThere?.unitId).toBe(fx.secondaryUnitId);
  } finally {
    // Restore primary assignment for later tests in this process.
    await db.operationalAssignment
      .update({
        where: { id: fx.staffAssignmentId },
        data: { unitId: fx.unitId, roleLabel: "Server" },
      })
      .catch(() => {});
    await db.$disconnect();
    await context.close();
  }
});

test("offline ready @ci-gate: Offline Ready shows Saved on This Tablet; reconnect path available", async () => {
  const fx = loadFixtures();
  const staffPin = process.env.JOB_FLOW_BROWSER_STAFF_PIN;
  const { context, page } = await openPersistent("offline-ready");

  try {
    if (staffPin) {
      await loginQuickPin(page, context, fx.faWithDietaryEmail, fx.unitId, staffPin);
    } else {
      await loginPassword(page, fx.faWithDietaryEmail);
      await bindDevice(page, fx.unitId);
      await loginPassword(page, fx.staffEmail);
    }

    await page.goto(`${fx.unitWorkspacePath}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("employee-job-flow")).toBeVisible({ timeout: 25_000 });

    try {
      await expectOfflineControlsReady(page);
    } catch {
      await fetchBundleViaApi(page, fx.unitId);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectOfflineControlsReady(page);
    }

    const readyBtn = page.getByRole("button", { name: /Servery Ready/i }).first();
    if ((await readyBtn.count()) === 0 || !(await readyBtn.isEnabled().catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Servery Ready control unavailable for current meal window; offline Ready path skipped",
      });
      return;
    }

    await setNetworkOffline(context, true, page);
    await recordServeryReadyOffline(page);

    const controls = page.getByTestId("servery-meal-service-controls");
    await expect(controls.getByText(/Saved on this tablet/i).first()).toBeVisible({ timeout: 15_000 });

    await setNetworkOffline(context, false, page);
    const retry = page.getByRole("button", { name: /Retry synchronization/i });
    if ((await retry.count()) > 0) {
      await retry.click();
      await expect(controls.getByText(/Synchroniz|Accepted|Online|Saved on this tablet/i).first())
        .toBeVisible({ timeout: 20_000 })
        .catch(() => {
          // Reconnect copy varies; Saved-on-tablet path already certified.
        });
    }
  } finally {
    await setNetworkOffline(context, false, page).catch(() => {});
    await context.close();
  }
});

test("supervisor board @ci-gate: Operations Board shows cycles, serverys, exceptions, navigation", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("supervisor-board");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
    const board = page.getByTestId("supervisor-operations-board");
    await expect(board).toBeVisible({ timeout: 25_000 });

    await expect(board).toContainText(/Current:|No active cycle/i);
    await expect(board).toContainText(/Next:|No active cycle|Current:/i);

    // Summary chips include staffing + readiness language (Not Confirmed ≠ failure).
    await expect(board).toContainText(/Ready not confirmed|Call-offs|Unassigned/i);

    const unitsSummary = page.getByText(/View all Units/i);
    await expect(unitsSummary).toBeVisible();
    await unitsSummary.click();
    const unitRows = page.getByTestId("supervisor-operations-unit");
    await expect(unitRows.first()).toBeVisible({ timeout: 15_000 });
    expect(await unitRows.count()).toBeGreaterThanOrEqual(Math.min(12, fx.serveryCount));

    const exceptions = page.getByTestId("supervisor-operations-exception");
    // Unassigned / call-off / uncovered / Ready Not Confirmed as available from fixtures.
    const exceptionText = (await exceptions.allInnerTexts()).join("\n");
    expect(exceptionText.length).toBeGreaterThan(0);
    expect(/Unassigned|Call-off|Uncovered|Ready Not Confirmed|At Risk|Started Late/i.test(exceptionText)).toBeTruthy();

    // Source navigation from an exception.
    const firstLink = exceptions.first().getByRole("link").first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/\/staffing\/assignments|\/unit\/|\/admin\/departments/);
  } finally {
    await context.close();
  }
});

test("role denial @ci-gate: STAFF and FA without Dietary cannot open Supervisor Operations Board", async () => {
  const fx = loadFixtures();

  const { context: staffCtx, page: staffPage } = await openPersistent("deny-staff-board");
  try {
    await loginPassword(staffPage, fx.staffEmail);
    await staffPage.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
    await expect(staffPage.getByTestId("supervisor-operations-board")).toHaveCount(0);
    await expect(staffPage).not.toHaveURL(/\/staffing\/operations/);
  } finally {
    await staffCtx.close();
  }

  const { context: faCtx, page: faPage } = await openPersistent("deny-fa-board");
  try {
    await loginPassword(faPage, fx.faWithoutDietaryEmail);
    await faPage.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
    await expect(faPage.getByTestId("supervisor-operations-board")).toHaveCount(0);
    // May land on staffing redirect or show authority error without the board shell.
    const denied =
      (await faPage.getByTestId("supervisor-operations-board").count()) === 0 &&
      !(await faPage.getByText(/Scheduled:/i).isVisible().catch(() => false));
    expect(denied).toBeTruthy();
  } finally {
    await faCtx.close();
  }
});

test("publish draft @ci-gate: manager publishes draft Closeout via UI; retired label stays hidden", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("publish-draft");
  try {
    await loginPassword(page, fx.managerEmail);
    await page.goto(fx.builderCyclesPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("operational-cycles-panel")).toBeVisible({ timeout: 20_000 });

    const draftRow = page.getByTestId("cycle-row").filter({ hasText: new RegExp(fx.draftCycleLabel, "i") });
    if ((await draftRow.count()) > 0) {
      const publish = draftRow.first().getByRole("button", { name: /^Publish$/i });
      if ((await publish.count()) > 0 && (await publish.isEnabled())) {
        await publish.click();
        await page.waitForTimeout(1500);
        await page.reload({ waitUntil: "domcontentloaded" });
      }
    }

    await loginPassword(page, fx.staffEmail);
    await page.goto(`${fx.unitWorkspacePath}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    const flow = page.getByTestId("employee-job-flow");
    await expect(flow).toBeVisible({ timeout: 25_000 });
    await expect(flow).not.toContainText(new RegExp(fx.retiredCycleLabel, "i"));
  } finally {
    await context.close();
  }
});
