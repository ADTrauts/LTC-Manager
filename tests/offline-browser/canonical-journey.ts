import { expect, type Page } from "@playwright/test";
import { loginPassword, prisma, ensureDeviceBoundAsAdmin } from "./helpers";

export type CanonicalOfflineFixture = {
  facilityId: string; departmentId: string; unitId: string; spaceId: string;
  profileId: string; cycleId: string; keyPointId: string; workPlanId: string; workLabel: string;
  people: Record<"manager" | "worker" | "secondWorker", { userId: string; employeeId: string; email: string }>;
};

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
    expect((await db.departmentOperationalProfile.findUniqueOrThrow({ where: { id: fx.profileId } })).status).toBe("ACTIVE");
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.cycleId } })).status).toBe("PUBLISHED");
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.keyPointId } })).status).toBe("PUBLISHED");
  } finally { await db.$disconnect(); }
}

export async function openCanonicalSpaceWork(page: Page, fx: CanonicalOfflineFixture, email = fx.people.worker.email) {
  await loginPassword(page, email);
  await page.goto(`/unit/${fx.unitId}?space=${fx.spaceId}`);
  const runtime = page.getByTestId("employee-runtime-experience");
  await expect(runtime).toHaveAttribute("data-grain", "space");
  await expect(page.getByTestId("employee-runtime-assignment")).not.toContainText("No confirmed assignment");
  await expect(page.getByTestId("employee-runtime-operation")).not.toContainText("No active");
  const work = page.getByTestId("employee-runtime-work-item").filter({ hasText: fx.workLabel });
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
