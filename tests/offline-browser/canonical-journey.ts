import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { loginPassword, prisma, ensureDeviceBoundAsAdmin } from "./helpers";

export type CanonicalOfflineFixture = {
  facilityId: string; departmentId: string; unitId: string; spaceId: string;
  /** Retired Location Function profile — null after Phase 2C R3. */
  profileId: string | null;
  cycleId: string; keyPointId: string;
  /** Primary ONE_OFF occurrence id (legacy field name retained for fixture consumers). */
  workPlanId: string; workLabel: string;
  /** All seeded ONE_OFF occurrence ids for this Space (used to size date-shift backfill). */
  oneOffOccurrenceIds?: string[];
  people: Record<"manager" | "worker" | "secondWorker", { userId: string; employeeId: string; email: string }>;
};

const WORK_INSTRUCTIONS =
  "Verify supplies for this exact Space before confirming completion.";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

/**
 * Disposable-test-only ONE_OFF rows for a facility-local service date.
 * Used when timezone-shift suites change the civil day relative to fixture prep.
 * Not a runtime authoring pathway.
 */
async function ensureOpenOneOffsForServiceDate(
  db: ReturnType<typeof prisma>,
  fx: CanonicalOfflineFixture,
  serviceDate: string,
) {
  const totalNeeded = Math.max(1, fx.oneOffOccurrenceIds?.length ?? 13);
  const operationalDate = new Date(`${serviceDate}T00:00:00.000Z`);
  const existingOpen = await db.departmentWorkOccurrence.findMany({
    where: {
      facilityId: fx.facilityId,
      departmentId: fx.departmentId,
      spaceId: fx.spaceId,
      sourceKind: "ONE_OFF",
      status: "OPEN",
      operationalDate,
    },
    select: { workItemLabelSnapshot: true },
  });
  const openLabels = new Set(existingOpen.map((row) => row.workItemLabelSnapshot));
  for (let i = 0; i < totalNeeded; i++) {
    const title = i === 0 ? fx.workLabel : `Certification Work ${i}`;
    if (openLabels.has(title)) continue;
    const nonce = cuidLike();
    const occurrenceKey = [
      "oneoff",
      serviceDate,
      fx.unitId,
      fx.spaceId,
      fx.people.worker.employeeId,
      nonce,
    ].join("|");
    await db.departmentWorkOccurrence.create({
      data: {
        id: cuidLike(),
        facilityId: fx.facilityId,
        departmentId: fx.departmentId,
        occurrenceKey,
        sourceKind: "ONE_OFF",
        operationalDate,
        workItemLabelSnapshot: title,
        instructionsSnapshot: WORK_INSTRUCTIONS,
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        unitId: fx.unitId,
        spaceId: fx.spaceId,
        status: "OPEN",
        assignedEmployeeId: fx.people.worker.employeeId,
        createdByUserId: fx.people.manager.userId,
        authenticationMethod: "PASSWORD",
      },
    });
  }
}

/** Real customer board actions create/confirm responsibility. Never raw-write a
 * confirmed plan or grant the administrative device binder operational access. */
export async function prepareCanonicalResponsibility(page: Page, fx: CanonicalOfflineFixture, serviceDate: string) {
  const db = prisma();
  try {
    await loginPassword(page, fx.people.manager.email);
    await page.goto(`/staffing/assignments?date=${serviceDate}`);
    for (const person of [fx.people.worker, fx.people.secondWorker]) {
      if (!await db.operationalAssignment.count({ where: { facilityId: fx.facilityId, employeeId: person.employeeId, serviceDate: new Date(`${serviceDate}T00:00:00Z`), unitId: fx.unitId, status: { in: ["PLANNED","ACTIVE"] } } })) {
        const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Assignment", exact: true }) });
        await form.locator('select[name="employeeId"]').selectOption(person.employeeId);
        await form.locator('select[name="roleKey"]').selectOption("SERVER");
        await form.locator('select[name="unitId"]').selectOption(fx.unitId);
        await form.locator('input[name="startsAt"]').fill("");
        await form.locator('input[name="endsAt"]').fill("");
        await form.getByRole("button", { name: "Create Assignment", exact: true }).click();
        await expect.poll(() => db.operationalAssignment.count({ where: { employeeId: person.employeeId, unitId: fx.unitId, serviceDate: new Date(`${serviceDate}T00:00:00Z`) } })).toBe(1);
        await page.reload();
      }
    }
    const plan = await db.operationalAssignmentPlan.findFirstOrThrow({ where: { facilityId: fx.facilityId, departmentId: fx.departmentId, serviceDate: new Date(`${serviceDate}T00:00:00Z`) } });
    if (plan.status !== "CONFIRMED") {
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Confirm plan", exact: true }) });
      const ack = form.locator('input[name="acknowledgeCoverageGaps"]');
      if (await ack.count()) await ack.check();
      await form.getByRole("button", { name: "Confirm plan", exact: true }).click();
      await expect.poll(async () => (await db.operationalAssignmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("CONFIRMED");
    }
    if (fx.profileId) {
      expect((await db.departmentOperationalProfile.findUniqueOrThrow({ where: { id: fx.profileId } })).status).toBe("ACTIVE");
    }
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.cycleId } })).status).toBe("PUBLISHED");
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.keyPointId } })).status).toBe("PUBLISHED");
    await ensureOpenOneOffsForServiceDate(db, fx, serviceDate);
  } finally { await db.$disconnect(); }
}

export async function openCanonicalSpaceWork(page: Page, fx: CanonicalOfflineFixture, email = fx.people.worker.email) {
  await loginPassword(page, email);
  await page.goto(`/unit/${fx.unitId}?space=${fx.spaceId}`);
  const runtime = page.getByTestId("employee-runtime-experience");
  await expect(runtime).toHaveAttribute("data-grain", "space");
  await expect(page.getByTestId("employee-runtime-assignment")).not.toContainText("No confirmed assignment");
  await expect(page.getByTestId("employee-runtime-operation")).not.toContainText("No active");
  // Same label can appear more than once after date-shift backfill recreates an OPEN
  // ONE_OFF while a completed historical row with that label remains visible.
  const work = page.getByTestId("employee-runtime-work-item").filter({ hasText: fx.workLabel }).first();
  await expect(work).toBeVisible();
  await work.getByRole("link").click();
  await expect(page.getByTestId("work-completion-panel")).toContainText(fx.workLabel);
}

export async function prepareCanonicalOfflineEntry(page: Page, fx: CanonicalOfflineFixture, adminEmail: string, serviceDate: string) {
  await prepareCanonicalResponsibility(page, fx, serviceDate);
  await ensureDeviceBoundAsAdmin(page, adminEmail, fx.unitId);
  await openCanonicalSpaceWork(page, fx);
  await expectCanonicalOfflinePreparation(page);
}

/** Exercise the customer action before queue assertions. A missing canonical
 * bundle remains a failed gate, never a synthetic API/IndexedDB substitute. */
export async function expectCanonicalOfflinePreparation(page: Page) {
  const response = page.waitForResponse(r => r.url().includes("/api/offline/runtime-bundle") && r.request().method() === "POST");
  await page.getByTestId("space-offline-prepare").click();
  const bundle = await response;
  expect(bundle.ok(), `Canonical SPACE Save on this tablet returned HTTP ${bundle.status()}: ${await bundle.text()}`).toBe(true);
  await expect(page.getByTestId("space-offline-status")).toContainText("Prepared on this tablet");
}
