import { expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

type BoardFixture = {
  facilityId: string;
  departmentId: string;
  serviceDateKey: string;
  staffEmployeeId: string;
  assignmentRoom: { id: string; unitId: string; name: string };
};

export function boardHref(fx: Pick<BoardFixture, "departmentId" | "serviceDateKey">) {
  return `/staffing/assignments?department=${fx.departmentId}&date=${fx.serviceDateKey}`;
}

export function roomHref(fx: Pick<BoardFixture, "assignmentRoom">) {
  return `/unit/${fx.assignmentRoom.unitId}?space=${fx.assignmentRoom.id}`;
}

export async function createAndConfirmAssignment(page: Page, db: PrismaClient, fx: BoardFixture) {
  const planKey = {
    facilityId: fx.facilityId,
    departmentId: fx.departmentId,
    serviceDate: new Date(`${fx.serviceDateKey}T00:00:00Z`),
  };
  const assignmentKey = { ...planKey, employeeId: fx.staffEmployeeId };
  // A second browser project can reuse the same synthetic day.
  await db.operationalAssignment.deleteMany({ where: assignmentKey });
  await db.operationalAssignmentPlan.updateMany({
    where: planKey, data: { status: "DRAFT", confirmedAt: null },
  });

  await page.goto(boardHref(fx), { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create Assignment", exact: true }),
  });
  await form.getByLabel("Operational role", { exact: true }).selectOption("SERVER");
  await form.getByLabel("Employee", { exact: true }).selectOption(fx.staffEmployeeId);
  await form.getByTestId("assignment-space-scope-picker")
    .getByRole("checkbox", { name: fx.assignmentRoom.name, exact: false }).check();
  await form.locator('input[name="startsAt"]').fill("");
  await form.locator('input[name="endsAt"]').fill("");
  await form.getByLabel("Assignment instructions").fill("Check the supplies in the assigned Room.");
  await form.getByRole("button", { name: "Create Assignment", exact: true }).click();
  await expect.poll(() => db.operationalAssignment.count({
    where: { ...assignmentKey, roleKey: "SERVER", locations: { some: { unitSpaceId: fx.assignmentRoom.id } } },
  })).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Plan: DRAFT", { exact: true })).toBeVisible();
  const confirm = page.locator("form").filter({ has: page.getByRole("button", { name: "Confirm plan", exact: true }) });
  const acknowledge = confirm.locator('input[name="acknowledgeCoverageGaps"]');
  if (await acknowledge.count()) await acknowledge.check();
  await confirm.getByRole("button", { name: "Confirm plan", exact: true }).click();
  await expect.poll(async () => (await db.operationalAssignmentPlan.findFirstOrThrow({ where: planKey })).status)
    .toBe("CONFIRMED");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Plan: CONFIRMED", { exact: true })).toBeVisible();
  const assignment = await db.operationalAssignment.findFirstOrThrow({
    where: assignmentKey, include: { locations: true },
  });
  expect(assignment.roleKey).toBe("SERVER");
  expect(assignment.locations.map(({ unitSpaceId }) => unitSpaceId)).toEqual([fx.assignmentRoom.id]);
  return assignment;
}
