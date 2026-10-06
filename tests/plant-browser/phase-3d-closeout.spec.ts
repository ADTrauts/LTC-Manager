import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  dietaryDepartmentId: string;
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
  const dir = `${profileDir}-3d-${suffix}-${Date.now()}`;
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

test.describe("Phase 3D work order closeout @phase-3d @ci-gate", () => {
  test("required Record blocks complete until satisfied; Issue and Asset stay explicit", async () => {
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

      const template = await db.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facilityId,
          departmentId: fx.plantDepartmentId,
          name: `Post-repair inspection ${suffix}`,
          purposeType: "INSPECTION",
          status: "PUBLISHED",
          version: 1,
          stableKey: `sk-${cuidLike()}`,
          allowAdHoc: true,
          publishedAt: new Date(),
        },
      });

      const issue = await db.assetIssue.create({
        data: {
          id: cuidLike(),
          issueCode: `AI-3D-${suffix}`,
          facilityId: fx.facilityId,
          departmentId: fx.plantDepartmentId,
          unitId: oos.unitId,
          assetId: oos.id,
          summary: `Closeout inspection ${suffix}`,
          description: "Phase 3D browser cert",
          status: "TRIAGED",
          observedAt: new Date(),
        },
        select: { id: true },
      });

      const workOrder = await db.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `R-3D${suffix}`,
          title: `Closeout WO ${suffix}`,
          description: "Phase 3D closeout",
          unitId: oos.unitId,
          assetId: oos.id,
          status: "ASSIGNED",
          assignedEmployeeId: fx.techEmployeeId,
          responsibleDepartmentId: fx.plantDepartmentId,
          issueId: issue.id,
        },
        select: { id: true },
      });

      const request = await db.operationalRequest.create({
        data: {
          id: cuidLike(),
          requestCode: `OR-3D-${suffix}`,
          facilityId: fx.facilityId,
          requestingDepartmentId: fx.dietaryDepartmentId,
          responsibleDepartmentId: fx.plantDepartmentId,
          unitId: oos.unitId,
          assetId: oos.id,
          relatedAssetIssueId: issue.id,
          workOrderId: workOrder.id,
          summary: `Need closeout ${suffix}`,
          description: "Linked request",
          status: "UNDER_REVIEW",
          observedAt: new Date(),
          requesterVisibleStatusSummary: "Accepted",
        },
      });

      const supervisor = await openPersistent("supervisor");
      try {
        await loginPassword(supervisor.page, fx.users.supervisor.email, password);
        await supervisor.page.goto(`/repairs/${workOrder.id}`);
        await expect(supervisor.page.getByTestId("work-order-closeout")).toBeVisible({
          timeout: 20_000,
        });
        await supervisor.page.getByTestId("wo-requirement-template").selectOption(template.id);
        await supervisor.page.getByTestId("wo-requirement-add").click();
        await expect(supervisor.page.getByTestId("wo-required-evidence")).toContainText(
          "Post-repair inspection",
          { timeout: 15_000 },
        );
      } finally {
        await supervisor.context.close();
      }

      const tech = await openPersistent("tech");
      try {
        await loginPassword(tech.page, fx.users.staff.email, password);
        await tech.page.goto("/repairs");
        await expect(tech.page.getByRole("heading", { name: "My Work", exact: true })).toBeVisible();
        await tech.page.goto(`/repairs/${workOrder.id}`);
        await expect(tech.page.getByTestId("work-order-closeout")).toBeVisible();

        await tech.page.getByTestId("wo-labor-minutes").fill("45");
        await tech.page.getByTestId("wo-labor-save").click();
        await expect(tech.page.getByTestId("wo-labor-total")).toContainText("45", { timeout: 15_000 });

        await tech.page.getByTestId("wo-part-description").fill("Drive belt B-38");
        await tech.page.getByTestId("wo-part-number").fill("B-38");
        await tech.page.getByTestId("wo-part-quantity").fill("1");
        await tech.page.getByTestId("wo-part-cost").fill("42.50");
        await tech.page.getByTestId("wo-part-add").click();
        await expect(tech.page.getByTestId("wo-parts-list")).toContainText("Drive belt B-38", {
          timeout: 15_000,
        });

        await tech.page.getByTestId("wo-work-performed").fill("Replaced drive belt");
        await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
        await tech.page.getByTestId("wo-complete").click();
        await expect(tech.page.getByTestId("wo-closeout-error")).toContainText(
          "Cannot complete Work Order",
          { timeout: 15_000 },
        );
        await expect(tech.page.getByTestId("wo-closeout-error")).toContainText("Post-repair inspection");

        const record = await db.operationalEvidenceRecord.create({
          data: {
            id: cuidLike(),
            facilityId: fx.facilityId,
            departmentId: fx.plantDepartmentId,
            templateId: template.id,
            templateStableKey: template.stableKey,
            templateVersion: template.version,
            templateName: template.name,
            purposeType: "INSPECTION",
            requirementKey: `req-${suffix}`,
            operationalDate: new Date(),
            scheduleKind: "AD_HOC",
            occurredAt: new Date(),
            templateSnapshotJson: { fields: [] },
            unitId: oos.unitId,
            assetId: oos.id,
            status: "COMPLETED",
          },
        });
        await tech.page.getByTestId("wo-satisfy-record-id").fill(record.id);
        await tech.page.getByTestId("wo-satisfy-record").click();
        await expect(tech.page.getByTestId("wo-requirement-status")).toContainText("Satisfied", {
          timeout: 15_000,
        });

        await tech.page.getByTestId("wo-work-performed").fill("Replaced drive belt");
        await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
        await tech.page.getByTestId("wo-complete").click();
        await expect(tech.page.getByTestId("wo-post-completion")).toBeVisible({ timeout: 20_000 });
        await expect(tech.page.getByTestId("wo-post-completion")).toContainText("Still OPEN");
        await expect(tech.page.getByTestId("wo-labor-total")).toContainText("45");
        await expect(tech.page.getByTestId("wo-parts-list")).toContainText("Drive belt B-38");
        await expect(tech.page.getByTestId("wo-recorded-expense")).toContainText("42.50");
      } finally {
        await tech.context.close();
      }

      const after = await db.repair.findUniqueOrThrow({
        where: { id: workOrder.id },
        include: { recordRequirements: true, laborEntries: true, partsUsed: true },
      });
      const issueAfter = await db.assetIssue.findUniqueOrThrow({
        where: { id: issue.id },
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
      expect(after.status).toBe("COMPLETED");
      expect(after.recordRequirements[0]?.status).toBe("SATISFIED");
      expect(after.laborEntries.length).toBeGreaterThan(0);
      expect(after.partsUsed.length).toBeGreaterThan(0);
      expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(issueAfter.status);
      expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(requestAfter.status);
      expect(assetAfter.status).toBe("OUT_OF_SERVICE");
      expect(after.assetConditionReview).toBe("NO_CHANGE");
    } finally {
      await db.$disconnect();
    }
  });
});
