import { expect, type Page } from "@playwright/test";
import { loginPassword, prisma, ensureDeviceBoundAsAdmin } from "./helpers";

export type CanonicalOfflineFixture = {
  facilityId: string; departmentId: string; unitId: string; spaceId: string;
  cycleId: string; keyPointId: string;
  people: Record<"manager" | "worker" | "secondWorker", { userId: string; employeeId: string; email: string }>;
};

export const ASSIGNMENT_INSTRUCTIONS =
  "Verify supplies for this exact Space before confirming completion.";

/** Real customer board actions create/confirm responsibility. Never raw-write a
 * confirmed plan or grant the administrative device binder operational access. */
export async function prepareCanonicalResponsibility(page: Page, fx: CanonicalOfflineFixture, serviceDate: string) {
  const db = prisma();
  try {
    const space = await db.unitSpace.findUniqueOrThrow({ where: { id: fx.spaceId }, select: { name: true } });
    await loginPassword(page, fx.people.manager.email);
    await page.goto(`/staffing/assignments?department=${fx.departmentId}&date=${serviceDate}`);
    for (const person of [fx.people.worker, fx.people.secondWorker]) {
      const completed = await db.operationalAssignment.findFirst({ where: {
        facilityId: fx.facilityId, employeeId: person.employeeId, serviceDate: new Date(`${serviceDate}T00:00:00Z`),
        locations: { some: { unitSpaceId: fx.spaceId } }, status: "COMPLETED",
      } });
      if (completed) {
        const history = page.getByTestId("assignment-completed-list");
        if (!(await history.getAttribute("open"))) await history.locator("summary").click();
        const row = page.getByTestId(`completed-assignment-${completed.id}`);
        await row.getByLabel("Reason to reopen Assignment").fill("Start the next isolated offline scenario.");
        await row.getByRole("button", { name: "Reopen Assignment", exact: true }).click();
        await expect.poll(async () => (await db.operationalAssignment.findUniqueOrThrow({ where: { id: completed.id } })).status).toBe("ACTIVE");
        await page.reload();
      }
      if (!await db.operationalAssignment.count({ where: { facilityId: fx.facilityId, employeeId: person.employeeId, serviceDate: new Date(`${serviceDate}T00:00:00Z`), locations: { some: { unitSpaceId: fx.spaceId } }, status: { in: ["PLANNED","ACTIVE","COMPLETED"] } } })) {
        const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Assignment", exact: true }) });
        await form.getByLabel("Operational role", { exact: true }).selectOption("SERVER");
        await form.getByLabel("Employee", { exact: true }).selectOption(person.employeeId);
        await form.getByTestId("assignment-space-scope-picker").getByRole("checkbox", { name: space.name, exact: false }).check();
        await form.getByLabel("Assignment instructions").fill(ASSIGNMENT_INSTRUCTIONS);
        await form.locator('input[name="startsAt"]').fill("");
        await form.locator('input[name="endsAt"]').fill("");
        await form.getByRole("button", { name: "Create Assignment", exact: true }).click();
        await expect.poll(() => db.operationalAssignment.count({ where: { employeeId: person.employeeId, locations: { some: { unitSpaceId: fx.spaceId } }, serviceDate: new Date(`${serviceDate}T00:00:00Z`) } })).toBe(1);
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
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.cycleId } })).status).toBe("PUBLISHED");
    expect((await db.departmentOperationalCycle.findUniqueOrThrow({ where: { id: fx.keyPointId } })).status).toBe("PUBLISHED");
  } finally { await db.$disconnect(); }
}

export async function openCanonicalSpace(page: Page, fx: CanonicalOfflineFixture, email = fx.people.worker.email) {
  await loginPassword(page, email);
  await page.goto(`/unit/${fx.unitId}?space=${fx.spaceId}`);
  const runtime = page.getByTestId("employee-runtime-experience");
  await expect(runtime).toHaveAttribute("data-grain", "space");
  await expect(page.getByTestId("employee-runtime-assignment")).not.toContainText("No confirmed assignment");
  await expect(page.getByTestId("employee-runtime-operation")).not.toContainText("No active");

}

export async function prepareCanonicalOfflineEntry(page: Page, fx: CanonicalOfflineFixture, adminEmail: string, serviceDate: string, email = fx.people.worker.email) {
  await prepareCanonicalResponsibility(page, fx, serviceDate);
  await ensureDeviceBoundAsAdmin(page, adminEmail, fx.unitId);
  await openCanonicalSpace(page, fx, email);
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
