import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { createIssueFromRecord } from "@/lib/asset-operations";
import { civilDateToUtcMidnight, facilityCivilToday } from "@/lib/preventive-maintenance/civil-date";
import { generatePmForFacility } from "@/lib/preventive-maintenance/generator";
import {
  createPmPlanWithDraft,
  publishPmPlanVersion,
} from "@/lib/preventive-maintenance/plan-service";
import { addCivilDays, addMonthsClamped } from "@/lib/preventive-maintenance/schedule";
import { formatProjectedDateLabel } from "@/lib/preventive-maintenance/presentation";

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  assets: Array<{ id: string; assetCode: string; name: string; status: string }>;
  users: {
    manager: { email: string; password: string };
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

function asSession(
  user: { id: string; email: string; displayName: string; facilityId: string; primaryDepartmentId: string | null },
  role: AppJwtPayload["role"],
): AppJwtPayload {
  return {
    uid: user.id,
    authKind: "user",
    authMethod: "PASSWORD",
    role,
    name: user.displayName,
    email: user.email,
    facilityId: user.facilityId,
    primaryDepartmentId: user.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-4d-${suffix}-${Date.now()}`;
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

test.describe("Phase 4D preventive maintenance Run @phase-4d @ci-gate", () => {
  test("overdue board, My Work corrective+preventive, PM context, closeout, Issue stays OPEN", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const asset =
      fx.assets.find((row) => row.status !== "OUT_OF_SERVICE" && row.status !== "RETIRED") ??
      fx.assets[0];
    expect(asset).toBeTruthy();

    const facility = await db.facility.findUniqueOrThrow({
      where: { id: fx.facilityId },
      select: { timezone: true },
    });
    const today = facilityCivilToday(facility.timezone);
    const dueSoonDate = addCivilDays(today, 4);
    const overdueDate = addCivilDays(today, -8);
    const managerUser = await db.user.findFirstOrThrow({
      where: { email: fx.users.manager.email },
    });
    const supervisorUser = await db.user.findFirstOrThrow({
      where: { email: fx.users.supervisor.email },
    });
    const mgr = asSession(managerUser, "MANAGER");
    const supervisor = asSession(supervisorUser, "SUPERVISOR");
    const assetRow = await db.asset.findUniqueOrThrow({
      where: { id: asset!.id },
      select: { id: true, unitId: true, name: true, assetCode: true },
    });

    const article = await db.knowledgeArticle.create({
      data: {
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        title: `Quarterly Dishwasher SOP ${suffix}`,
        summary: "PM procedure",
        body: "Inspect spray arms and drain.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
        publishedAt: new Date(),
        versions: {
          create: {
            id: cuidLike(),
            version: 1,
            status: "PUBLISHED",
            title: `Quarterly Dishwasher SOP ${suffix}`,
            summary: "PM procedure",
            body: "Inspect spray arms and drain.",
            publishedAt: new Date(),
          },
        },
      },
      include: { versions: true },
    });
    const procedure = article.versions[0]!;
    const template = await db.operationalTemplate.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        name: `PM Inspection ${suffix}`,
        purposeType: "INSPECTION",
        status: "PUBLISHED",
        version: 1,
        stableKey: `pm-4d-${suffix.toLowerCase()}`,
        allowAdHoc: true,
        publishedAt: new Date(),
      },
    });
    const category = await db.maintenanceCategory.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        key: `pm4d-${suffix.toLowerCase()}`,
        label: "Kitchen",
      },
    });

    const planName = `Quarterly Dishwasher PM ${suffix}`;
    const created = await createPmPlanWithDraft(mgr, {
      facilityId: fx.facilityId,
      departmentId: fx.plantDepartmentId,
      assetId: assetRow.id,
      draft: {
        name: planName,
        instructions: "Inspect spray arms.",
        anchorDate: dueSoonDate,
        intervalMonths: 12,
        generationLeadDays: 14,
        maintenanceCategoryId: category.id,
        procedureVersionId: procedure.id,
        defaultAssignedEmployeeId: fx.techEmployeeId,
        recordRequirements: [{ templateId: template.id }],
        priority: "HIGH",
      },
      client: db,
    });
    const published = await publishPmPlanVersion(mgr, {
      facilityId: fx.facilityId,
      departmentId: fx.plantDepartmentId,
      planId: created.id,
      client: db,
    });

    await generatePmForFacility(db, { facilityId: fx.facilityId, now: new Date() });
    const dueSoonOcc = await db.preventiveMaintenanceOccurrence.findFirstOrThrow({
      where: { planId: published.planId, scheduledDate: civilDateToUtcMidnight(dueSoonDate) },
    });
    const preventiveWo = await db.repair.findFirstOrThrow({
      where: { pmOccurrenceId: dueSoonOcc.id, status: { notIn: ["CANCELLED"] } },
    });

    const overdueOcc = await db.preventiveMaintenanceOccurrence.create({
      data: {
        id: cuidLike(),
        planId: published.planId,
        planVersionId: published.id,
        scheduledDate: civilDateToUtcMidnight(overdueDate),
        status: "OPEN",
      },
    });
    const overdueWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-OV${suffix}`,
        title: planName,
        description: `Preventive Maintenance\nScheduled ${formatProjectedDateLabel(overdueDate, { includeYear: true })}`,
        unitId: assetRow.unitId,
        assetId: assetRow.id,
        status: "ASSIGNED",
        assignedEmployeeId: fx.techEmployeeId,
        responsibleDepartmentId: fx.plantDepartmentId,
        workOrderKind: "PREVENTIVE",
        pmOccurrenceId: overdueOcc.id,
        priority: "HIGH",
        procedureVersionId: procedure.id,
        maintenanceCategoryId: category.id,
      },
    });

    const correctiveWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-C${suffix}`,
        title: `Corrective leak ${suffix}`,
        description: "Standing water under dishwasher.",
        unitId: assetRow.unitId,
        assetId: assetRow.id,
        status: "ASSIGNED",
        assignedEmployeeId: fx.techEmployeeId,
        responsibleDepartmentId: fx.plantDepartmentId,
        workOrderKind: "CORRECTIVE",
        priority: "MEDIUM",
      },
    });

    const manager = await openPersistent("manager-run");
    try {
      await loginPassword(manager.page, fx.users.manager.email, password);
      await manager.page.goto("/preventive-maintenance");
      await expect(manager.page.getByTestId("pm-run-page")).toBeVisible({ timeout: 30_000 });
      await expect(manager.page.getByRole("link", { name: "Preventive", exact: true })).toBeVisible();
      await expect(manager.page.getByTestId("pm-run-overdue")).toBeVisible();
      await expect(manager.page.getByTestId("pm-run-overdue")).toContainText("Overdue");
      await expect(manager.page.getByTestId("pm-run-overdue")).toContainText(planName);
      await expect(manager.page.getByTestId("pm-run-overdue")).toContainText(
        formatProjectedDateLabel(overdueDate, { includeYear: true }),
      );
      await expect(manager.page.getByTestId("pm-run-overdue")).toContainText(overdueWo.repairCode);
      await expect(manager.page.getByTestId("pm-count-overdue")).not.toHaveText("0");
      await expect(manager.page.getByTestId("pm-run-due-soon")).toContainText(planName);
    } finally {
      await manager.context.close();
    }

    const tech = await openPersistent("tech-run");
    try {
      await loginPassword(tech.page, fx.users.staff.email, password);
      await tech.page.goto("/preventive-maintenance");
      await expect(tech.page.getByTestId("pm-run-page")).toHaveCount(0);
      await expect(tech.page).not.toHaveURL(/\/preventive-maintenance/);

      await tech.page.goto("/repairs");
      await expect(tech.page.getByRole("heading", { name: "My Work", exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(tech.page.getByTestId("repairs-queue")).toContainText(planName);
      await expect(tech.page.getByTestId("repairs-queue")).toContainText(`Corrective leak ${suffix}`);
      await expect(tech.page.getByTestId("repairs-queue")).toContainText("Preventive");
      await expect(tech.page.getByTestId("repairs-queue")).toContainText("Corrective");
      await expect(tech.page.getByTestId("repairs-queue")).toContainText("Preventive Maintenance");
      await expect(tech.page.getByTestId("repairs-queue")).toContainText(
        formatProjectedDateLabel(dueSoonDate, { includeYear: true }),
      );

      await tech.page.goto(`/repairs/${preventiveWo.id}`);
      await expect(tech.page.getByTestId("pm-work-order-context")).toBeVisible({ timeout: 20_000 });
      await expect(tech.page.getByTestId("pm-context-plan")).toContainText(planName);
      await expect(tech.page.getByTestId("pm-context-scheduled")).toContainText(
        formatProjectedDateLabel(dueSoonDate, { includeYear: true }),
      );
      await expect(tech.page.getByTestId("pm-context-procedure")).toContainText("v1");
      await expect(tech.page.getByTestId("pm-context-requirements")).toContainText("PM Inspection");
      await expect(tech.page.getByTestId("work-order-closeout")).toBeVisible();

      await tech.page.getByTestId("wo-labor-minutes").fill("30");
      await tech.page.getByTestId("wo-labor-save").click();
      await expect(tech.page.getByTestId("wo-labor-total")).toContainText("30", { timeout: 15_000 });
      await tech.page.getByTestId("wo-work-performed").fill("Completed quarterly dishwasher PM");
      await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
      await tech.page.getByTestId("wo-complete").click();
      await expect(tech.page.getByTestId("wo-closeout-error")).toContainText("Cannot complete Work Order", {
        timeout: 15_000,
      });

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
          unitId: assetRow.unitId,
          assetId: assetRow.id,
          status: "COMPLETED_WITH_CORRECTIVE_ACTION",
          outOfStandard: true,
        },
      });
      await tech.page.getByTestId("wo-satisfy-record-id").fill(record.id);
      await tech.page.getByTestId("wo-satisfy-record").click();
      await expect(tech.page.getByTestId("wo-requirement-status")).toContainText("Satisfied", {
        timeout: 15_000,
      });

      const fromRecord = await createIssueFromRecord(supervisor, {
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        evidenceRecordId: record.id,
        client: db,
      });

      await tech.page.getByTestId("wo-work-performed").fill("Completed quarterly dishwasher PM");
      await tech.page.getByTestId("wo-asset-review-NO_CHANGE").check();
      await tech.page.getByTestId("wo-complete").click();
      await expect(tech.page.getByTestId("wo-post-completion")).toBeVisible({ timeout: 20_000 });

      const occAfter = await db.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: dueSoonOcc.id },
      });
      const woAfter = await db.repair.findUniqueOrThrow({ where: { id: preventiveWo.id } });
      const issueAfter = await db.assetIssue.findUniqueOrThrow({
        where: { id: fromRecord.issue.id },
        select: { status: true },
      });
      expect(occAfter.status).toBe("COMPLETED");
      expect(woAfter.status).toBe("COMPLETED");
      expect(issueAfter.status).not.toBe("RESOLVED");
      expect(correctiveWo.workOrderKind).toBe("CORRECTIVE");
    } finally {
      await tech.context.close();
      await db.$disconnect();
    }

    const managerAfter = await openPersistent("manager-after");
    const dbAfter = prisma();
    try {
      await loginPassword(managerAfter.page, fx.users.manager.email, password);
      await managerAfter.page.goto("/preventive-maintenance?view=completed");
      await expect(managerAfter.page.getByTestId("pm-run-completed")).toContainText(planName, {
        timeout: 20_000,
      });
      await managerAfter.page.goto("/preventive-maintenance");
      await expect(managerAfter.page.getByTestId(`pm-run-row-${dueSoonOcc.id}`)).toHaveCount(0);
    } finally {
      await managerAfter.context.close();
      await dbAfter.$disconnect();
    }
  });

  test("supervisor skip requires a reason, is blocked by an active Work Order, and does not move cadence", async () => {
    const fx = loadFixtures();
    const db = prisma();
    const password = demoPassword();
    const suffix = cuidLike().slice(-6).toUpperCase();
    const asset =
      fx.assets.find((row) => row.status !== "OUT_OF_SERVICE" && row.status !== "RETIRED") ??
      fx.assets[0];
    const facility = await db.facility.findUniqueOrThrow({
      where: { id: fx.facilityId },
      select: { timezone: true },
    });
    const today = facilityCivilToday(facility.timezone);
    const skipDate = addCivilDays(today, 3);
    const nextDate = addMonthsClamped(skipDate, 3);
    const managerUser = await db.user.findFirstOrThrow({
      where: { email: fx.users.manager.email },
    });
    const mgr = asSession(managerUser, "MANAGER");
    const article = await db.knowledgeArticle.create({
      data: {
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        title: `Skip SOP ${suffix}`,
        summary: "PM procedure",
        body: "Inspect.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
        publishedAt: new Date(),
        versions: {
          create: {
            id: cuidLike(),
            version: 1,
            status: "PUBLISHED",
            title: `Skip SOP ${suffix}`,
            summary: "PM procedure",
            body: "Inspect.",
            publishedAt: new Date(),
          },
        },
      },
      include: { versions: true },
    });
    const template = await db.operationalTemplate.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        departmentId: fx.plantDepartmentId,
        name: `Skip inspection ${suffix}`,
        purposeType: "INSPECTION",
        status: "PUBLISHED",
        version: 1,
        stableKey: `pm-skip-${suffix.toLowerCase()}`,
        allowAdHoc: true,
        publishedAt: new Date(),
      },
    });
    const category = await db.maintenanceCategory.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        key: `skip-${suffix.toLowerCase()}`,
        label: "Kitchen",
      },
    });
    const planName = `Skip cadence PM ${suffix}`;
    const created = await createPmPlanWithDraft(mgr, {
      facilityId: fx.facilityId,
      departmentId: fx.plantDepartmentId,
      assetId: asset!.id,
      draft: {
        name: planName,
        anchorDate: skipDate,
        intervalMonths: 3,
        generationLeadDays: 14,
        maintenanceCategoryId: category.id,
        procedureVersionId: article.versions[0]!.id,
        recordRequirements: [{ templateId: template.id }],
        priority: "MEDIUM",
      },
      client: db,
    });
    const published = await publishPmPlanVersion(mgr, {
      facilityId: fx.facilityId,
      departmentId: fx.plantDepartmentId,
      planId: created.id,
      client: db,
    });
    await generatePmForFacility(db, { facilityId: fx.facilityId, now: new Date() });
    const withWo = await db.preventiveMaintenanceOccurrence.findFirstOrThrow({
      where: { planId: published.planId, scheduledDate: civilDateToUtcMidnight(skipDate) },
    });
    const skipOnly = await db.preventiveMaintenanceOccurrence.create({
      data: {
        id: cuidLike(),
        planId: published.planId,
        planVersionId: published.id,
        scheduledDate: civilDateToUtcMidnight(addCivilDays(today, 6)),
        status: "OPEN",
      },
    });

    const supervisor = await openPersistent("skip");
    try {
      await loginPassword(supervisor.page, fx.users.supervisor.email, password);
      await supervisor.page.goto(`/preventive-maintenance/${withWo.id}`);
      await expect(supervisor.page.getByTestId("pm-occurrence-detail")).toBeVisible({
        timeout: 20_000,
      });
      await expect(supervisor.page.getByTestId("pm-skip-blocked")).toContainText(
        "Cancel or complete the active Work Order first.",
      );

      await supervisor.page.goto(`/preventive-maintenance/${skipOnly.id}`);
      await expect(supervisor.page.getByTestId("pm-skip-form")).toBeVisible();
      await expect(supervisor.page.getByTestId("pm-skip-reason")).toHaveAttribute("required", "");
      await supervisor.page.getByTestId("pm-skip-reason").fill("Vendor already completed this cycle.");
      await supervisor.page.getByTestId("pm-skip-confirm").click();
      await expect(supervisor.page.getByTestId("pm-skip-record")).toBeVisible({ timeout: 20_000 });
      await expect(supervisor.page.getByTestId("pm-skip-record")).toContainText(
        "Vendor already completed this cycle.",
      );

      await supervisor.page.goto("/preventive-maintenance?view=skipped");
      await expect(supervisor.page.getByTestId("pm-run-skipped")).toContainText(planName);
      await supervisor.page.goto("/preventive-maintenance?view=projected");
      await expect(supervisor.page.getByTestId("pm-run-projected")).toContainText(
        formatProjectedDateLabel(nextDate, { includeYear: true }),
      );
    } finally {
      await supervisor.context.close();
      await db.$disconnect();
    }
  });
});
