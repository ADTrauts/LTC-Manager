import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { applyFacilitySubscription } from "../../src/lib/billing/apply-stripe-event";
import { deliverImportActivation } from "../../src/lib/setup-imports/activation";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
import type { FacilitySession } from "../../src/lib/auth";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Explicit disposable database and local opt-in server required.");
const db = new PrismaClient({ datasources: { db: { url } } });
const baseURL = process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55479";
const output = "tmp/onb07-verification";
test.afterAll(() => db.$disconnect());

function add(workbook: ExcelJS.Workbook, sheet: string, values: Record<string, string>) {
  const target = workbook.getWorksheet(sheet)!;
  target.addRow((target.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(header => values[String(header)] ?? ""));
}
async function csv(page: Page, dataset: string, value: string) {
  await page.goto("/employees/bulk-setup");
  await page.getByLabel("CSV dataset").selectOption(dataset);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: `${dataset}.csv`, mimeType: "text/csv", buffer: Buffer.from(value) });
  await page.getByRole("button", { name: "Preview CSV — no mutations" }).click();
  await expect(page.getByRole("heading", { name: /^Review / })).toBeVisible();
  await page.getByRole("button", { name: "Confirm reviewed import (up to 25 rows)", exact: true }).click();
  await expect(page.getByTestId("setup-import-results").getByLabel("Outcome counts")).toContainText("committed: 1");
}
async function activate(browser: Browser, session: FacilitySession, email: string) {
  const employee = await db.employee.findFirstOrThrow({ where: { facilityId: session.facilityId, email } });
  const receipt = await db.setupImportResult.findFirstOrThrow({ where: { phase: "IMPORT", status: "committed", targetIds: { path: ["employeeId"], equals: employee.id }, batch: { dataset: "workforce", facilityId: session.facilityId } } });
  let invitation = "";
  await deliverImportActivation(db, session, { batchId: receipt.batchId, row: receipt.rowNumber, origin: baseURL }, { configured: () => true, send: async args => { invitation = args.inviteUrl; return { sent: true, messageId: "captured-local-only" }; } });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(invitation);
  await page.getByLabel("Password", { exact: true }).fill("Onb07-Local-Password!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Onb07-Local-Password!");
  await page.getByRole("button", { name: "Create password and continue" }).click();
  await expect.poll(async () => Boolean((await db.user.findUniqueOrThrow({ where: { email } })).passwordHash)).toBe(true);
  // Use the real password login owner after acceptance, not a manufactured staff JWT.
  const login = await context.request.post("/api/auth/login", { data: { email, password: "Onb07-Local-Password!" } });
  expect(login.ok(), await login.text()).toBe(true);
  return { context, page, employee };
}

for (const width of [1280, 768]) test(`operator provision → two Products → XLSX/CSV → customer publication → actual Run at ${width}px`, async ({ page, context, browser }) => {
  await mkdir(output, { recursive: true });
  const id = randomUUID(), email = `admin-${id}@example.com`, managerEmail = `manager-${id}@example.com`, workerEmail = `worker-${id}@example.com`;
  const administratorPasswordHash = await bcrypt.hash("Onb07-Local-Password!", 4);
  const provision = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
    organization: { mode: "create", facilityName: `ONB07 synthetic ${id}` },
    facility: { displayName: `Certification ${width}`, billingEmail: email, timezone: "America/New_York" },
    administrator: { mode: "create", email, displayName: "Certification Owner", passwordHash: administratorPasswordHash, emailVerifiedAt: new Date() },
  }));
  const session = { uid: provision.user.id, facilityId: provision.facility.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "FACILITY_ADMINISTRATOR", name: provision.user.displayName, email, sessionVersion: 0 } as FacilitySession;
  const adminLogin = await context.request.post("/api/auth/login", { data: { email, password: "Onb07-Local-Password!" } });
  expect(adminLogin.ok(), await adminLogin.text()).toBe(true);
  await page.setViewportSize({ width, height: 1024 });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/setup");
  await page.getByRole("checkbox", { name: /I confirm this is the timezone/ }).check();
  await page.getByRole("button", { name: "Confirm site and enter setup" }).click();
  await expect(page.getByText("No Departments chosen.", { exact: false })).toBeVisible();
  expect(await db.department.count({ where: { facilityId: session.facilityId } })).toBe(0);
  await page.getByRole("button", { name: "Choose Products", exact: true }).click();
  for (const name of [/Healthcare Food & Nutrition/, /Facility Plant Operations/]) await page.getByRole("checkbox", { name }).check();
  expect(await db.department.count({ where: { facilityId: session.facilityId } })).toBe(0);
  // Controlled provider boundary: no live subscription or money. Canonical billing/install owner.
  await applyFacilitySubscription({ facilityId: session.facilityId, status: "ACTIVE", departmentKeys: ["DIETARY", "PLANT"] }, db);
  const dietary = await db.department.findUniqueOrThrow({ where: { facilityId_key: { facilityId: session.facilityId, key: "DIETARY" } } });
  const plant = await db.department.findUniqueOrThrow({ where: { facilityId_key: { facilityId: session.facilityId, key: "PLANT" } } });
  await page.goto("/employees/bulk-setup?mode=workbook");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download Facility workbook", exact: true }).click();
  const file = await download, path = `${output}/whole-${width}.xlsx`; await file.saveAs(path);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await readFile(path) as unknown as ExcelJS.Buffer);
  add(workbook, "Locations", { rowRef: "wing", floor: "Floor 1", neighborhood: "Shared Wing" });
  add(workbook, "Locations", { rowRef: "room", floor: "Floor 1", neighborhood: "Shared Wing", locationName: "Shared Room", locationType: "Resident Room", roomNumber: "001" });
  add(workbook, "People", { rowRef: "manager", email: managerEmail, firstName: "Customer", lastName: "Manager", roleType: "MANAGER", employmentType: "FULL_TIME", primaryDepartment: "DIETARY" });
  for (const department of ["DIETARY", "PLANT"]) {
    add(workbook, "Department Locations", { rowRef: `wing-${department}`, department, locationType: "UNIT", locationId: "ref:wing", kind: department === "DIETARY" ? "PRIMARY" : "SUPPORT" });
    add(workbook, "Department Locations", { rowRef: `room-${department}`, department, locationType: "ROOM", locationId: "ref:room" });
  }
  await page.getByLabel("Completed XLSX workbook").setInputFiles({ name: "setup.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  await page.getByRole("button", { name: "Preview all sheets — no mutations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Complete workbook review", exact: true })).toBeVisible();
  expect(await db.unitSpace.count({ where: { facilityId: session.facilityId } })).toBe(0);
  await page.getByRole("button", { name: "Confirm reviewed workbook (up to 25 rows)", exact: true }).click();
  await expect(page.getByTestId("workbook-results").getByLabel("Workbook outcome counts")).toContainText("committed: 7");
  const unit = await db.unit.findFirstOrThrow({ where: { facilityId: session.facilityId, name: "Shared Wing" } });
  const room = await db.unitSpace.findFirstOrThrow({ where: { facilityId: session.facilityId } });
  expect(await db.unitSpaceResponsibility.count({ where: { spaceId: room.id } })).toBe(2);
  await csv(page, "workforce", `email,firstName,lastName,roleType,employmentType,primaryDepartment\n${workerEmail},Actual,Worker,STAFF,FULL_TIME,DIETARY\n`);
  const manager = await activate(browser, session, managerEmail), worker = await activate(browser, session, workerEmail);
  try {
    await manager.page.setViewportSize({ width, height: 1024 }); await worker.page.setViewportSize({ width, height: 1024 });
    await manager.page.goto("/staffing/work-plans");
    await expect(manager.page.getByTestId("work-plan-builder")).toBeVisible();
    await manager.page.getByTestId("create-work-plan").click();
    await expect(manager.page.getByTestId("work-plan-name")).toHaveValue("New Work Plan");
    await manager.page.getByTestId("work-plan-name").fill("Customer first useful workflow");
    await manager.page.getByTestId("work-plan-item-label-0").fill("Check shared room supplies");
    await manager.page.getByTestId("work-plan-applies-to-kind").selectOption("SPECIFIC_UNIT");
    await manager.page.getByTestId("work-plan-applies-to-unit").selectOption(unit.id);
    await manager.page.getByTestId("work-plan-save-draft").click();
    await expect(manager.page.getByTestId("work-plan-message")).toContainText(/saved/i);
    expect(await db.departmentWorkPlan.count({ where: { facilityId: session.facilityId, status: "PUBLISHED" } })).toBe(0);
    await manager.page.getByTestId("publish-work-plan").click();
    await expect(manager.page.getByTestId("work-plan-message")).toContainText(/Published/);
    const published = await db.departmentWorkPlan.findFirstOrThrow({ where: { facilityId: session.facilityId, status: "PUBLISHED" } });
    // B remains unprepared; A can deliberately publish and run independently.
    expect(await db.departmentWorkPlan.count({ where: { departmentId: plant.id } })).toBe(0);
    expect(await db.departmentOperationalProfile.count({ where: { departmentId: plant.id } })).toBe(0);
    await worker.page.goto(`/unit/${unit.id}`);
    await expect(worker.page.getByTestId("employee-runtime-assignment")).toContainText("No confirmed assignment");
    await manager.page.goto("/staffing/assignments");
    const form = manager.page.locator("form").filter({ has: manager.page.getByRole("button", { name: "Create Assignment", exact: true }) });
    await form.locator('select[name="employeeId"]').selectOption(worker.employee.id);
    await form.locator('select[name="roleKey"]').selectOption("SERVER");
    await form.locator('select[name="unitId"]').selectOption(unit.id);
    await form.getByRole("button", { name: "Create Assignment", exact: true }).click();
    await expect.poll(() => db.operationalAssignment.count({ where: { employeeId: worker.employee.id } })).toBe(1);
    await manager.page.reload();
    const confirm = manager.page.locator("form").filter({ has: manager.page.getByRole("button", { name: "Confirm plan", exact: true }) });
    const ack = confirm.locator('input[name="acknowledgeCoverageGaps"]'); if (await ack.count()) await ack.check();
    await confirm.getByRole("button", { name: "Confirm plan", exact: true }).click();
    await expect.poll(async () => (await db.operationalAssignmentPlan.findFirstOrThrow({ where: { facilityId: session.facilityId, departmentId: dietary.id } })).status).toBe("CONFIRMED");
    await worker.page.reload();
    const work = worker.page.getByTestId("employee-runtime-work-item").filter({ hasText: "Check shared room supplies" });
    await expect(work).toBeVisible(); await work.getByRole("link").click();
    await worker.page.getByTestId("complete-work").click();
    await expect(worker.page.getByTestId("work-completion-notice")).toContainText(/confirmed|complete/i);
    const occurrences = await db.departmentWorkOccurrence.findMany({ where: { facilityId: session.facilityId, workPlanId: published.id } });
    expect(occurrences).toHaveLength(1); expect(occurrences[0]!.status).toBe("COMPLETED");
    await applyFacilitySubscription({ facilityId: session.facilityId, status: "UNPAID", departmentKeys: ["DIETARY", "PLANT"] }, db);
    await worker.page.reload(); await expect(worker.page.getByTestId("complete-work")).toHaveCount(0);
    await applyFacilitySubscription({ facilityId: session.facilityId, status: "ACTIVE", departmentKeys: ["DIETARY", "PLANT"] }, db);
    expect(await db.departmentWorkOccurrence.findMany({ where: { facilityId: session.facilityId, workPlanId: published.id } })).toEqual(occurrences);
    expect(await db.department.count({ where: { facilityId: session.facilityId } })).toBe(2);
    await worker.page.goto(`/unit/${unit.id}`); await expect(worker.page.getByTestId("employee-runtime-work-item").filter({ hasText: "Check shared room supplies" })).toContainText(/complete/i);
    expect(await worker.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await worker.page.screenshot({ path: `${output}/whole-run-${width}.png`, fullPage: true });
    await writeFile(`${output}/whole-${width}-facts.json`, JSON.stringify({ facilityId: session.facilityId, dietaryId: dietary.id, plantId: plant.id, publishedId: published.id, sharedRoomId: room.id, occurrenceId: occurrences[0]!.id, synthetic: true, liveProvider: false }, null, 2));
    expect(errors).toEqual([]);
  } finally { await manager.context.close(); await worker.context.close(); }
});

test("public signup launch-off denies writes; explicitly enabled local signup creates only minimal entry", async ({ browser }) => {
  const email = `signup-${randomUUID()}@example.com`, data = { facilityName: "Local signup certification", adminName: "Signup Owner", adminEmail: email, password: "Onb07-Local-Password!" };
  const off = await browser.newContext({ baseURL: process.env.ONBOARDING_CLOSED_SIGNUP_BASE_URL || "http://127.0.0.1:55478" });
  const enabled = await browser.newContext({ baseURL });
  try {
    expect((await off.request.get("/signup")).status()).toBe(404);
    expect((await off.request.post("/api/auth/signup", { data })).status()).toBe(404);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    const page = await enabled.newPage(); await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your Vssyl account" })).toBeVisible();
    await page.getByLabel("Facility Name").fill(data.facilityName); await page.getByLabel("Your Name (Admin)").fill(data.adminName);
    await page.getByLabel("Admin Email").fill(email); await page.getByLabel("Password", { exact: true }).fill(data.password);
    await page.getByRole("button", { name: "Create account and start setup" }).click();
    await expect(page).toHaveURL(/\/setup/);
    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true } });
    expect(user.role?.key).toBe("FACILITY_ADMINISTRATOR");
    expect(await db.department.count({ where: { facilityId: user.facilityId! } })).toBe(0);
    expect(await db.facilityBilling.count({ where: { facilityId: user.facilityId! } })).toBe(0);
    expect(await db.userFacilityAccess.count({ where: { userId: user.id, facilityId: user.facilityId!, isActive: true } })).toBe(1);
    // Mail is deliberately unconfigured here. Provider delivery and production launch remain pending.
    expect(user.emailVerifiedAt).not.toBeNull();
  } finally { await off.close(); await enabled.close(); }
});
