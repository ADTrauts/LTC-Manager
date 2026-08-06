import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  unitName: string;
  serveryCount: number;
  serviceDateKey: string;
  managerEmail: string;
  supervisorEmail: string;
  staffEmail: string;
  faWithoutDietaryEmail: string;
  faWithDietaryEmail: string;
  staffEmployeeId: string;
  builderCyclesPath: string;
  unitWorkspacePath: string;
  supervisorCyclesPath: string;
};

const profileDir =
  process.env.OPERATIONAL_CYCLES_BROWSER_PROFILE_DIR ||
  "tmp/operational-cycles-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.OPERATIONAL_CYCLES_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "operational-cycles-browser-artifacts", "fixtures.json");
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
    baseURL: process.env.OPERATIONAL_CYCLES_BROWSER_BASE_URL,
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

async function gotoCyclesBuilder(page: Page, fx: Fixtures) {
  await page.goto(fx.builderCyclesPath, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("operational-cycles-panel")).toBeVisible({ timeout: 20_000 });
}

async function fillCreateDraft(
  page: Page,
  fields: {
    label: string;
    cycleType: string;
    startLocal: string;
    endLocal: string;
    mealType?: string;
    displaySequence?: number;
    expectedMilestones?: string;
  },
) {
  const form = page.getByTestId("create-cycle-form");
  await expect(form).toBeVisible({ timeout: 15_000 });

  await form.getByLabel(/^Label$/i).fill(fields.label);
  await form.locator('select[name="cycleType"]').selectOption(fields.cycleType);
  await form.getByLabel(/Start \(HH:mm\)/i).fill(fields.startLocal);
  await form.getByLabel(/End \(HH:mm\)/i).fill(fields.endLocal);
  if (fields.displaySequence != null) {
    await form.getByLabel(/^Sequence$/i).fill(String(fields.displaySequence));
  }
  if (fields.mealType) {
    await form.locator('select[name="mealType"]').selectOption(fields.mealType);
  } else {
    await form.locator('select[name="mealType"]').selectOption({ index: 0 });
  }
  if (fields.expectedMilestones != null) {
    await form.getByLabel(/Expected milestones/i).fill(fields.expectedMilestones);
  }
  // Location defaults (UNIT_TYPES + SERVERY,KITCHEN) are already set in the panel.
  await form.getByRole("button", { name: /Create draft/i }).click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("operational-cycles-panel")).toBeVisible({ timeout: 20_000 });
}

async function publishDraftByLabel(page: Page, label: RegExp | string) {
  const row = page.getByTestId("cycle-row").filter({ hasText: label }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const publish = row.getByRole("button", { name: /^Publish$/i });
  await expect(publish).toBeEnabled({ timeout: 10_000 });
  await publish.click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("operational-cycles-panel")).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: "default" });

test("builder open @ci-gate: manager opens Department Builder cycles tab", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("builder-open");
  try {
    await loginPassword(page, fx.managerEmail);
    await gotoCyclesBuilder(page, fx);
    await expect(page.getByRole("heading", { name: /Operational Cycles/i })).toBeVisible();
    await expect(page.getByTestId("create-cycle-form")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("draft create @ci-gate: manager creates Morning Prep and meal SERVICE drafts", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("draft-create");
  try {
    await loginPassword(page, fx.managerEmail);
    await gotoCyclesBuilder(page, fx);

    await fillCreateDraft(page, {
      label: "Morning Preparation",
      cycleType: "PREPARATION",
      startLocal: "05:30",
      endLocal: "07:00",
      displaySequence: 10,
      mealType: "BREAKFAST",
    });
    await expect(page.getByTestId("cycle-row").filter({ hasText: /Morning Preparation/i })).toBeVisible({
      timeout: 15_000,
    });

    await fillCreateDraft(page, {
      label: "Breakfast Service",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 20,
      mealType: "BREAKFAST",
      expectedMilestones: "READY,SERVICE_STARTED",
    });
    await expect(page.getByTestId("cycle-row").filter({ hasText: /Breakfast Service/i })).toBeVisible();

    await fillCreateDraft(page, {
      label: "Lunch Service",
      cycleType: "SERVICE",
      startLocal: "11:30",
      endLocal: "13:30",
      displaySequence: 50,
      mealType: "LUNCH",
      expectedMilestones: "READY,SERVICE_STARTED",
    });
    await expect(page.getByTestId("cycle-row").filter({ hasText: /Lunch Service/i })).toBeVisible();

    await fillCreateDraft(page, {
      label: "Dinner Service",
      cycleType: "SERVICE",
      startLocal: "17:00",
      endLocal: "19:00",
      displaySequence: 80,
      mealType: "DINNER",
      expectedMilestones: "READY,SERVICE_STARTED",
    });
    await expect(page.getByTestId("cycle-row").filter({ hasText: /Dinner Service/i })).toBeVisible();

    await expect(page.getByTestId("cycle-day-preview")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("draft hidden @ci-gate: employee does not see draft cycle labels on unit workspace", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("draft-hidden");
  try {
    await loginPassword(page, fx.staffEmail);
    await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
    const cycle = page.getByTestId("unit-cycle-context");
    await expect(cycle).toBeVisible({ timeout: 20_000 });
    await expect(cycle).toContainText(/not configured|Operational cycle/i);
    await expect(cycle).not.toContainText(/Morning Preparation|Breakfast Service|DRAFT/i);
  } finally {
    await context.close();
  }
});

test("publish runtime @ci-gate: manager publishes; employee sees cycle context; assignment stays separate", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("publish");
  try {
    await loginPassword(page, fx.managerEmail);
    await gotoCyclesBuilder(page, fx);

    const ensureDraft = async (spec: {
      label: string;
      cycleType: string;
      startLocal: string;
      endLocal: string;
      displaySequence: number;
      mealType?: string;
      expectedMilestones?: string;
    }) => {
      const row = page.getByTestId("cycle-row").filter({ hasText: new RegExp(spec.label, "i") });
      if ((await row.count()) === 0) {
        await fillCreateDraft(page, spec);
      }
    };

    await ensureDraft({
      label: "Morning Preparation",
      cycleType: "PREPARATION",
      startLocal: "05:30",
      endLocal: "07:00",
      displaySequence: 10,
      mealType: "BREAKFAST",
    });
    await ensureDraft({
      label: "Breakfast Service",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "09:00",
      displaySequence: 20,
      mealType: "BREAKFAST",
      expectedMilestones: "READY,SERVICE_STARTED",
    });
    await ensureDraft({
      label: "Lunch Service",
      cycleType: "SERVICE",
      startLocal: "11:30",
      endLocal: "13:30",
      displaySequence: 50,
      mealType: "LUNCH",
      expectedMilestones: "READY,SERVICE_STARTED",
    });
    await ensureDraft({
      label: "Dinner Service",
      cycleType: "SERVICE",
      startLocal: "17:00",
      endLocal: "19:00",
      displaySequence: 80,
      mealType: "DINNER",
      expectedMilestones: "READY,SERVICE_STARTED",
    });

    for (const label of [
      /Morning Preparation/i,
      /Breakfast Service/i,
      /Lunch Service/i,
      /Dinner Service/i,
    ]) {
      const row = page.getByTestId("cycle-row").filter({ hasText: label }).first();
      const publishBtn = row.getByRole("button", { name: /^Publish$/i });
      if ((await publishBtn.count()) > 0 && (await publishBtn.isEnabled())) {
        await publishDraftByLabel(page, label);
      }
    }

    await page.goto(fx.builderCyclesPath, { waitUntil: "domcontentloaded" });
    const preview = page.getByTestId("cycle-day-preview");
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview).not.toContainText(/No published cycles/i);
  } finally {
    await context.close();
  }

  const { context: staffCtx, page: staffPage } = await openPersistent("publish-staff");
  try {
    await loginPassword(staffPage, fx.staffEmail);
    await staffPage.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });

    const cycle = staffPage.getByTestId("unit-cycle-context");
    await expect(cycle).toBeVisible({ timeout: 20_000 });
    await expect(cycle).not.toContainText(/not configured/i);
    await expect(cycle).toContainText(
      /Morning Preparation|Breakfast Service|Lunch Service|Dinner Service|Next cycle|Meal/i,
    );

    const assignment = staffPage.getByTestId("my-assignment-panel");
    await expect(assignment).toBeVisible({ timeout: 20_000 });
    await expect(assignment).toContainText(/Server/i);
  } finally {
    await staffCtx.close();
  }
});

test("supervisor overview @ci-gate: /staffing/cycles lists multiple serverys", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("supervisor-overview");
  try {
    await loginPassword(page, fx.supervisorEmail);
    await page.goto(fx.supervisorCyclesPath, { waitUntil: "domcontentloaded" });
    const overview = page.getByTestId("supervisor-cycle-overview");
    await expect(overview).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Cycle overview/i })).toBeVisible();
    const rows = page.getByTestId("supervisor-cycle-row");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(Math.min(8, fx.serveryCount));
  } finally {
    await context.close();
  }
});

test("role denial @ci-gate: STAFF and FA without Dietary cannot manage cycles", async () => {
  const fx = loadFixtures();

  const { context: staffCtx, page: staffPage } = await openPersistent("deny-staff");
  try {
    await loginPassword(staffPage, fx.staffEmail);
    await staffPage.goto(fx.builderCyclesPath, { waitUntil: "domcontentloaded" });
    await expect(staffPage.getByTestId("create-cycle-form")).toHaveCount(0);
    await expect(staffPage.getByTestId("operational-cycles-panel")).toHaveCount(0);
  } finally {
    await staffCtx.close();
  }

  const { context: faCtx, page: faPage } = await openPersistent("deny-fa");
  try {
    await loginPassword(faPage, fx.faWithoutDietaryEmail);
    await faPage.goto(fx.builderCyclesPath, { waitUntil: "domcontentloaded" });
    // FA may reach the route shell; manage controls must be absent (or panel denied).
    await expect(faPage.getByTestId("create-cycle-form")).toHaveCount(0);
    const panel = faPage.getByTestId("operational-cycles-panel");
    if ((await panel.count()) > 0) {
      await expect(
        panel.getByRole("button", { name: /Create draft|Publish|Generate Dietary/i }),
      ).toHaveCount(0);
    }
  } finally {
    await faCtx.close();
  }
});
