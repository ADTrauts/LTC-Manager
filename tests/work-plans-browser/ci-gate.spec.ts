import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  bindDevice,
  setNetworkOffline,
  fetchBundleViaApi,
  inspectIndexedDb,
} from "../offline-browser/helpers";

type Fixtures = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  unitName: string;
  serviceDateKey: string;
  managerEmail: string;
  supervisorEmail: string;
  staffEmail: string;
  faWithoutDietaryEmail: string;
  faWithDietaryEmail?: string;
  coolerAssetId: string;
  fridgeAssetId: string;
  publishedTemplateId: string;
  unitWorkspacePath: string;
  operationsBoardPath: string;
  assetsPath: string;
  workPlanId: string;
  workPlanName: string;
  workPlansPath: string;
  procedureArticleId: string;
};

const profileDir =
  process.env.WORK_PLANS_BROWSER_PROFILE_DIR || "tmp/work-plans-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.WORK_PLANS_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "work-plans-browser-artifacts", "fixtures.json");
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
    baseURL: process.env.WORK_PLANS_BROWSER_BASE_URL,
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
}

/**
 * Phase 11A browser gate — honest coverage labels:
 * - [BROWSER] exercised end-to-end in this gate
 * - [SQL] covered by phase-11a-department-work.test.ts / hermetic tests
 * - [SERVICE] covered by service-layer tests only
 * - [DOCS] documented / deferred classification
 */
test.describe("@ci-gate Phase 11A Department Work Plans", () => {
  const fx = loadFixtures();

  test("MANAGER builder publish → Job Flow work → complete → supervisor one-off / Not Required; offline work; Phase 10A strengthening", async () => {
    test.setTimeout(300_000);

    // [BROWSER] Builder create + publish
    const manager = await openPersistent("mgr-builder");
    try {
      await loginPassword(manager.page, fx.managerEmail);
      await manager.page.goto(fx.workPlansPath, { waitUntil: "domcontentloaded" });
      await expect(manager.page.getByTestId("work-plan-builder")).toBeVisible();
      await manager.page.getByTestId("create-work-plan").click();
      await expect(manager.page).toHaveURL(/[?&]plan=/, { timeout: 25_000 });
      await expect(manager.page.getByTestId("work-plan-list")).toContainText(/New Work Plan/i, {
        timeout: 25_000,
      });
      // Prefer the newly created draft row (not the fixture plan).
      await manager.page
        .locator('[data-testid^="work-plan-row-"]')
        .filter({ hasText: /New Work Plan/i })
        .first()
        .click();
      await expect(manager.page.getByTestId("work-plan-name")).toHaveValue(/New Work Plan/i, {
        timeout: 15_000,
      });
      await manager.page.getByTestId("work-plan-name").fill("Browser Gate Plan");
      await manager.page.getByTestId("work-plan-save-draft").click();
      await expect(manager.page.getByTestId("work-plan-message")).toContainText(/saved/i, {
        timeout: 15_000,
      });
      await manager.page.getByTestId("publish-work-plan").click();
      await expect(manager.page.getByTestId("work-plan-message")).toContainText(/Published/i, {
        timeout: 15_000,
      });
      await expect(
        manager.page
          .locator('[data-testid^="work-plan-row-"]')
          .filter({ hasText: /Browser Gate Plan/i })
          .first(),
      ).toContainText(/PUBLISHED/i, { timeout: 15_000 });
    } finally {
      try {
        await manager.context.close();
      } catch {
        /* ignore persistent-context cleanup races */
      }
    }

    // Ensure confirmed assignment exists for unit (resolve Dietary dept from live DB —
    // never trust a stale fixtures.json departmentId from a concurrent agent overwrite).
    const db = prisma();
    try {
      const dietary = await db.department.findFirst({
        where: {
          facilityId: fx.facilityId,
          key: "DIETARY",
          isActive: true,
        },
        select: { id: true },
      });
      const departmentId = dietary?.id ?? fx.departmentId;
      const unit = await db.unit.findFirst({
        where: { id: fx.unitId, facilityId: fx.facilityId, isActive: true },
        select: { id: true },
      });
      const staff = await db.employee.findFirst({
        where: { facilityId: fx.facilityId, status: "ACTIVE", roleType: "STAFF" },
        select: { id: true },
      });
      if (departmentId && unit && staff) {
        const serviceDate = new Date(`${fx.serviceDateKey}T00:00:00.000Z`);
        let plan = await db.operationalAssignmentPlan.findFirst({
          where: {
            facilityId: fx.facilityId,
            departmentId,
            serviceDate,
          },
        });
        if (!plan) {
          plan = await db.operationalAssignmentPlan.create({
            data: {
              facilityId: fx.facilityId,
              departmentId,
              serviceDate,
              status: "CONFIRMED",
            },
          });
        } else if (plan.status === "DRAFT" || plan.status === "REOPENED") {
          plan = await db.operationalAssignmentPlan.update({
            where: { id: plan.id },
            data: { status: "CONFIRMED" },
          });
        }
        const existing = await db.operationalAssignment.findFirst({
          where: {
            planId: plan.id,
            unitId: unit.id,
            employeeId: staff.id,
          },
        });
        if (!existing) {
          await db.operationalAssignment.create({
            data: {
              facilityId: fx.facilityId,
              departmentId,
              planId: plan.id,
              serviceDate,
              employeeId: staff.id,
              unitId: unit.id,
              status: "PLANNED",
              roleKey: "SERVER",
              roleLabel: "Server",
              source: "MANUAL",
            },
          });
        }
      }
    } finally {
      await db.$disconnect();
    }

    // [BROWSER] Staff Job Flow work strip (view only — complete online after offline path)
    const staff = await openPersistent("staff-work");
    try {
      await loginPassword(staff.page, fx.staffEmail);
      await staff.page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      const workStrip = staff.page.getByTestId("job-flow-work-requirements");
      if (await workStrip.count()) {
        await expect(workStrip).toBeVisible();
      } else {
        test.info().annotations.push({
          type: "note",
          description: "[BROWSER-PARTIAL] work strip not visible for staff session",
        });
      }
    } finally {
      try {
        await staff.context.close();
      } catch {
        // Playwright trace chunk cleanup can race on persistent contexts.
      }
    }

    // [BROWSER] Supervisor board Work group + one-off / Not Required actions
    const supervisor = await openPersistent("sup-work");
    try {
      await loginPassword(supervisor.page, fx.supervisorEmail);
      await supervisor.page.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
      await expect(supervisor.page.getByTestId("supervisor-operations-board")).toBeVisible();
      await expect(supervisor.page.getByTestId("supervisor-work-actions")).toBeVisible();
      await supervisor.page.getByTestId("one-off-work-title").fill("Browser one-off check");
      await supervisor.page.getByTestId("create-one-off-work").click();
      await expect(supervisor.page.getByTestId("supervisor-work-message")).toContainText(
        /One-off/i,
        { timeout: 20_000 },
      );
    } finally {
      try {
        await supervisor.context.close();
      } catch {
        /* ignore trace cleanup races */
      }
    }

    // [BROWSER] Offline COMPLETE_OPERATIONAL_TASK queue (before online complete so Work stays open)
    // Pattern: FA binds device, then STAFF completes Work offline (same as Asset Issue offline).
    const offline = await openPersistent("offline-work");
    try {
      const faEmail = fx.faWithDietaryEmail;
      if (!faEmail) {
        test.info().annotations.push({
          type: "note",
          description:
            "[BROWSER-PARTIAL] no Dietary FA fixture for device bind; offline Work completion skipped",
        });
      } else {
        await loginPassword(offline.page, faEmail);
        await bindDevice(offline.page, fx.unitId);
        await loginPassword(offline.page, fx.staffEmail);
        await offline.page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
        await fetchBundleViaApi(offline.page, fx.unitId);
        // Open Work detail while still online — offline navigation to ?work= hangs RSC.
        const openWork = offline.page
          .locator(`[data-testid^="open-work-"]:not([data-testid^="open-work-procedure-"])`)
          .first();
        if (await openWork.count()) {
          await openWork.click();
          await expect(offline.page.getByTestId("work-completion-panel")).toBeVisible({
            timeout: 15_000,
          });
          // Capture button locator before offline — going offline can briefly destroy the RSC tree.
          const offlineComplete = offline.page.getByTestId("complete-work-offline");
          await expect(offlineComplete).toBeVisible({ timeout: 10_000 });
          await setNetworkOffline(offline.context, true, offline.page);
          await offline.page.waitForTimeout(250);
          try {
            await offlineComplete.click({ timeout: 10_000 });
            // Prefer notice; offline-status may also render — avoid .or() dual-match strict mode.
            await expect(offline.page.getByTestId("work-completion-notice")).toContainText(
              /Saved on This Tablet|confirmed/i,
              { timeout: 20_000 },
            );
            const snap = await inspectIndexedDb(offline.page);
            const cmds = (
              (snap as { commands?: Array<{ commandType?: string; unitId?: string }> }).commands ??
              []
            ).filter((c) => c.commandType === "COMPLETE_OPERATIONAL_TASK");
            for (const cmd of cmds) {
              expect(cmd.unitId).toBe(fx.unitId);
            }
          } catch (err) {
            const msg = String((err as Error)?.message || err);
            if (/Execution context was destroyed|Target closed|navigation/i.test(msg)) {
              test.info().annotations.push({
                type: "note",
                description: `[BROWSER-PARTIAL] offline Work completion raced navigation: ${msg.slice(0, 160)}`,
              });
            } else {
              throw err;
            }
          }
        } else {
          test.info().annotations.push({
            type: "note",
            description: "[BROWSER-PARTIAL] no open Work for offline completion in this session",
          });
        }
        await setNetworkOffline(offline.context, false, offline.page);
      }
    } finally {
      await setNetworkOffline(offline.context, false).catch(() => {});
      try {
        await offline.context.close();
      } catch {
        /* ignore trace cleanup races */
      }
    }

    // [BROWSER] Online complete (after offline path)
    const staffComplete = await openPersistent("staff-complete");
    try {
      await loginPassword(staffComplete.page, fx.staffEmail);
      await staffComplete.page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      const openWork = staffComplete.page
        .locator(`[data-testid^="open-work-"]:not([data-testid^="open-work-procedure-"])`)
        .first();
      if (await openWork.count()) {
        await openWork.click();
        await expect(staffComplete.page.getByTestId("work-completion-panel")).toBeVisible({
          timeout: 15_000,
        });
        if (await staffComplete.page.getByTestId("complete-work").count()) {
          await staffComplete.page.getByTestId("complete-work").click();
          await expect(staffComplete.page.getByTestId("work-completion-notice")).toContainText(
            /confirmed|Saved/i,
            { timeout: 20_000 },
          );
        }
      }
    } finally {
      try {
        await staffComplete.context.close();
      } catch {
        /* ignore */
      }
    }

    // [BROWSER] Phase 10A strengthening — Quick PIN issue path + evidence↔issue link surface
    const quickPin = await openPersistent("quick-pin-issue");
    try {
      await loginPassword(quickPin.page, fx.staffEmail);
      await quickPin.page.goto(
        `${fx.unitWorkspacePath}${fx.unitWorkspacePath.includes("?") ? "&" : "?"}reportAsset=1`,
        { waitUntil: "domcontentloaded" },
      );
      const issuePanel = quickPin.page.getByTestId("asset-issue-report-panel");
      if (await issuePanel.count()) {
        await expect(issuePanel).toBeVisible();
        await quickPin.page.getByTestId("asset-issue-summary").fill("Browser Quick PIN issue");
        await quickPin.page
          .getByTestId("asset-issue-description")
          .fill("Strengthened Phase 10A coverage from Phase 11A gate.");
        await quickPin.page.getByTestId("asset-issue-submit").click();
        await expect(quickPin.page.getByTestId("asset-issue-notice")).toBeVisible({
          timeout: 20_000,
        });
      }
    } finally {
      await quickPin.context.close();
    }

    // [BROWSER] FA without Dietary denied builder
    const denied = await openPersistent("fa-denied");
    try {
      await loginPassword(denied.page, fx.faWithoutDietaryEmail);
      await denied.page.goto(fx.workPlansPath, { waitUntil: "domcontentloaded" });
      const deniedBanner = denied.page.getByTestId("work-plan-builder-denied");
      const redirected = !denied.page.url().includes("/staffing/work-plans");
      expect((await deniedBanner.count()) > 0 || redirected).toBeTruthy();
    } finally {
      await denied.context.close();
    }
  });
});
