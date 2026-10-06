import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 3C browser certification.
 *
 * Facility password login is the RUN-surface mechanism. Harbor work sessions
 * stay on the builder allowlist and cannot open /staffing/operations, /repairs,
 * or /asset-issues. Plant-primary facility members keep Plant operational scope
 * even though DEVELOPMENT Plant is omitted from the customer picker.
 */

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  dietaryDepartmentId: string;
  floors: Array<{ id: string; name: string }>;
  serveryUnitId: string | null;
  oosAssetId: string;
  users: {
    supervisor: { email: string; password: string };
    staff: { email: string; password: string };
  };
  techEmployeeId: string;
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
  const dir = `${profileDir}-3c-${suffix}-${Date.now()}`;
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

test.describe("Phase 3C corrective maintenance @phase-3c @ci-gate", () => {
  test("supervisor triages Request to WO; technician completes; Issue and Asset stay open", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();

    try {
      const oos = await db.asset.update({
        where: { id: fx.oosAssetId },
        data: { status: "OUT_OF_SERVICE" },
        select: { id: true, unitId: true, assetCode: true, name: true },
      });

      const request = await db.operationalRequest.create({
        data: {
          id: cuidLike(),
          requestCode: `OR-3C-${suffix}`,
          facilityId: fx.facilityId,
          requestingDepartmentId: fx.dietaryDepartmentId,
          responsibleDepartmentId: fx.plantDepartmentId,
          unitId: oos.unitId,
          assetId: oos.id,
          relatedAssetIssueId: null,
          summary: `Dishwasher not heating ${suffix}`,
          description: "Phase 3C browser cert request",
          status: "UNDER_REVIEW",
          priority: "URGENT",
          operationalImpact: "SERVICE_AT_RISK",
          equipmentRemainsUsable: false,
          observedAt: new Date(),
          requesterVisibleStatusSummary: "Accepted",
        },
      });

      const supervisor = await openPersistent("supervisor");
      let issueId = "";
      let workOrderId = "";
      try {
        await loginPassword(supervisor.page, fx.users.supervisor.email, password);
        await supervisor.page.goto("/staffing/operations");
        await expect(supervisor.page.getByRole("heading", { name: /Operations Board/i })).toBeVisible({
          timeout: 30_000,
        });
        await expect(supervisor.page.getByTestId("plant-triage-panel")).toBeVisible();
        await expect(supervisor.page.getByTestId(`plant-request-${request.requestCode}`)).toBeVisible();
        await supervisor.page.getByTestId(`plant-request-${request.requestCode}`).click();
        await expect(supervisor.page.getByText(/Requester status:/i)).toBeVisible();
        await supervisor.page.getByTestId("plant-triage-assignee").selectOption(fx.techEmployeeId);
        await supervisor.page.getByTestId("plant-create-wo").click();

        await expect
          .poll(
            async () => {
              const row = await db.operationalRequest.findUnique({
                where: { id: request.id },
                select: { relatedAssetIssueId: true, workOrderId: true },
              });
              issueId = row?.relatedAssetIssueId ?? "";
              workOrderId = row?.workOrderId ?? "";
              return Boolean(issueId && workOrderId);
            },
            { timeout: 25_000 },
          )
          .toBeTruthy();

        await supervisor.page.goto("/asset-issues");
        await expect(supervisor.page.getByRole("heading", { name: "Issues", exact: true })).toBeVisible({
          timeout: 20_000,
        });
        await expect(supervisor.page.getByText(`Dishwasher heating failure ${suffix}`).or(
          supervisor.page.getByText(`Dishwasher not heating ${suffix}`),
        )).toBeVisible();

        await supervisor.page.goto(`/asset-issues/${issueId}`);
        await expect(supervisor.page.getByTestId("asset-issue-detail")).toBeVisible();
        await expect(supervisor.page.getByTestId("issue-linked-requests")).toBeVisible();
        await expect(supervisor.page.getByTestId("linked-work-order")).toBeVisible();
        await expect(supervisor.page.getByTestId("resolve-issue")).toBeVisible();

        await supervisor.page.goto("/repairs");
        await expect(supervisor.page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();
        await supervisor.page.goto(`/repairs/${workOrderId}`);
        await expect(supervisor.page.getByTestId("work-order-execution")).toBeVisible();
        await expect(supervisor.page.getByTestId("wo-assign")).toBeVisible();
      } finally {
        await supervisor.context.close();
      }

      const tech = await openPersistent("tech");
      try {
        await loginPassword(tech.page, fx.users.staff.email, password);
        await tech.page.goto("/staffing/operations");
        await expect(tech.page.getByTestId("plant-triage-panel")).toHaveCount(0);

        await tech.page.goto("/repairs");
        await expect(tech.page.getByRole("heading", { name: "My Work", exact: true })).toBeVisible();

        await tech.page.goto(`/asset-issues/${issueId}`);
        await expect(tech.page.getByTestId("resolve-issue")).toHaveCount(0);

        await tech.page.goto(`/repairs/${workOrderId}`);
        await expect(tech.page.getByTestId("wo-assign")).toHaveCount(0);
        await tech.page.getByTestId("wo-note").fill("Inspected heating element");
        await tech.page.getByTestId("wo-add-note").click();
        await expect(tech.page.getByTestId("repair-history")).toContainText("Inspected heating element", {
          timeout: 15_000,
        });
        await tech.page.getByTestId("wo-start").click();
        await expect
          .poll(
            async () => {
              const row = await db.repair.findUnique({
                where: { id: workOrderId },
                select: { status: true },
              });
              return row?.status ?? "";
            },
            { timeout: 15_000 },
          )
          .toBe("IN_PROGRESS");
        await expect(tech.page.getByText(/In progress/i).first()).toBeVisible({ timeout: 15_000 });
        await tech.page.getByTestId("wo-hold-reason").selectOption("WAITING_FOR_PART");
        await tech.page.getByTestId("wo-hold").click();
        await expect(tech.page.getByText(/On hold|Waiting for part/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await tech.page.getByTestId("wo-resume").click();
        await expect(tech.page.getByText(/In progress/i).first()).toBeVisible({ timeout: 15_000 });
        await tech.page.getByTestId("wo-labor-minutes").fill("45");
        await tech.page.getByTestId("wo-labor-save").click();
        await expect(tech.page.getByTestId("wo-labor-total")).toContainText("45", { timeout: 15_000 });
        await tech.page.getByTestId("wo-work-performed").fill("Element replaced");
        await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
        await tech.page.getByTestId("wo-note").fill("Element replaced");
        await tech.page.getByTestId("wo-complete").click();
        await expect(tech.page.getByTestId("wo-post-completion")).toBeVisible({ timeout: 20_000 });
        await expect(tech.page.getByTestId("wo-post-completion")).toContainText("Still OPEN");
        await expect(tech.page.getByTestId("wo-post-completion")).toContainText(
          /Out of service|OUT_OF_SERVICE/i,
        );
      } finally {
        await tech.context.close();
      }

      const afterComplete = await db.repair.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { status: true },
      });
      const issueAfter = await db.assetIssue.findUniqueOrThrow({
        where: { id: issueId },
        select: { status: true },
      });
      const requestAfter = await db.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { status: true },
      });
      const assetAfter = await db.asset.findUniqueOrThrow({
        where: { id: oos.id },
        select: { status: true },
      });
      expect(afterComplete.status).toBe("COMPLETED");
      expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(issueAfter.status);
      expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(requestAfter.status);
      expect(assetAfter.status).toBe("OUT_OF_SERVICE");

      const supervisor2 = await openPersistent("recover");
      try {
        await loginPassword(supervisor2.page, fx.users.supervisor.email, password);
        await supervisor2.page.goto(`/repairs/${workOrderId}`);
        await expect(supervisor2.page.getByTestId("wo-post-completion")).toContainText("Still OPEN");

        await supervisor2.page.goto(`/asset-issues/${issueId}`);
        await supervisor2.page.locator('input[name="resolutionReason"]').fill(
          "Heating restored. Condition resolved.",
        );
        await supervisor2.page.getByTestId("resolve-linked-requests").check();
        await supervisor2.page.getByTestId("resolve-issue").click();
        await expect
          .poll(
            async () => {
              const row = await db.assetIssue.findUnique({
                where: { id: issueId },
                select: { status: true },
              });
              return row?.status ?? "";
            },
            { timeout: 20_000 },
          )
          .toMatch(/RESOLVED|CLOSED/);

        await supervisor2.page.goto(`/assets/${oos.id}`);
        await expect(supervisor2.page.getByTestId("asset-condition-controls")).toBeVisible();
        await supervisor2.page.getByTestId("asset-status-select").selectOption("OPERATIONAL");
        await supervisor2.page.getByRole("button", { name: /Update condition/i }).click();
        await expect
          .poll(
            async () => {
              const row = await db.asset.findUnique({
                where: { id: oos.id },
                select: { status: true },
              });
              return row?.status ?? "";
            },
            { timeout: 20_000 },
          )
          .toBe("OPERATIONAL");

        await supervisor2.page.goto("/asset-issues");
        await supervisor2.page.getByTestId("direct-issue-create").locator("summary").click();
        await supervisor2.page.locator('input[name="summary"]').fill(`Ceiling leak ${suffix}`);
        await supervisor2.page
          .locator('textarea[name="description"]')
          .fill("Location-only leak. No Asset.");
        const leakUnit = fx.floors[0]?.id ?? fx.serveryUnitId;
        if (leakUnit) {
          await supervisor2.page.locator('select[name="unitId"]').selectOption(leakUnit);
        }
        await supervisor2.page.getByRole("button", { name: "Create Issue", exact: true }).click();
        await expect(supervisor2.page.getByText(`Ceiling leak ${suffix}`)).toBeVisible({
          timeout: 20_000,
        });
        await expect(supervisor2.page.getByText(/Location-only/i).first()).toBeVisible();
      } finally {
        await supervisor2.context.close();
      }
    } finally {
      await db.$disconnect();
    }
  });
});
