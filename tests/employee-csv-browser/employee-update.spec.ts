import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { test, expect } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const url = process.env.BULK_IMPORT_TEST_DATABASE_URL;
const baseURL = process.env.EMPLOYEE_CSV_BROWSER_BASE_URL || "http://127.0.0.1:55472";
test.skip(!url, "Requires a disposable migrated BULK_IMPORT_TEST_DATABASE_URL and local server.");
if (url) assertDisposableDatabaseUrl(url);
const db = new PrismaClient({ datasources: { db: { url } } });
test.afterAll(async () => db.$disconnect());

async function setup() {
  const id = randomUUID();
  const role = await db.role.upsert({ where: { key: "MANAGER" }, create: { key: "MANAGER", name: "Manager" }, update: {} });
  const org = await db.organization.create({ data: { name: `CSV browser ${id}` } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: "Roster Update Test", timezone: "America/New_York", onboardingCompletedAt: new Date() } });
  const actor = await db.user.create({ data: { email: `csv-browser-${id}@example.com`, displayName: "Roster Manager", facilityId: facility.id, roleId: role.id } });
  await db.userFacilityAccess.create({ data: { userId: actor.id, facilityId: facility.id, rolePeriods: { create: { roleKey: "MANAGER", startsAt: new Date("2020-01-01") } } } });
  const employee = await db.employee.create({ data: { facilityId: facility.id, firstName: "Jane", lastName: "Doe", roleType: "STAFF", status: "OFF", phone: "555-1234", unionMember: true, pinDigest: `browser-${id}`, sessionVersion: 5, workStations: { create: { station: "COOK" } } } });
  const unchanged = await db.employee.create({ data: { facilityId: facility.id, firstName: "John", lastName: "Doe", roleType: "STAFF", phone: "555-2000" } });
  const blocked = await db.employee.create({ data: { facilityId: facility.id, firstName: "Pat", lastName: "Green", roleType: "STAFF", phone: "555-3000" } });
  const token = await new SignJWT({ uid: actor.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "MANAGER", facilityId: facility.id, name: actor.displayName, email: actor.email, sessionVersion: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { actor, facility, employee, unchanged, blocked, token };
}

for (const width of [1280, 768]) test(`preview, cancel, confirm and per-row outcomes at ${width}px`, async ({ page, context }) => {
  const f = await setup();
  await page.setViewportSize({ width, height: 1024 });
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/employees/import");
  await expect(page.getByRole("heading", { name: "Update employees (CSV)" })).toBeVisible();
  const csv = `employeeId,phone,workStations,status\n${f.employee.id},__CLEAR__,__CLEAR__,\n${f.unchanged.id},555-2000,,\n${f.blocked.id},555-3000,,TERMINATED`;
  await page.getByLabel("File (.csv)").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  const preview = page.getByRole("region", { name: "Employee update preview" });
  await expect(preview).toContainText("1 row(s) with changes, 1 unchanged, 1 blocked");
  await expect(preview).toContainText("explicit clear");
  await expect(preview).toContainText("Before: 555-1234");
  expect((await db.employee.findUniqueOrThrow({ where: { id: f.employee.id } })).phone).toBe("555-1234");
  expect(await db.employeeHrAuditLog.count({ where: { facilityId: f.facility.id } })).toBe(0);
  await page.getByRole("button", { name: "Cancel preview" }).click();
  await expect(preview).toHaveCount(0);
  expect((await db.employee.findUniqueOrThrow({ where: { id: f.employee.id } })).phone).toBe("555-1234");
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(preview).toBeVisible();
  await mkdir("tmp/onb01-browser", { recursive: true });
  await page.screenshot({ path: `tmp/onb01-browser/preview-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Confirm reviewed updates" }).click();
  await expect(page.getByRole("status", { name: "Employee update results" })).toContainText("Committed 1, unchanged 1, blocked 1, failed 0");
  const after = await db.employee.findUniqueOrThrow({ where: { id: f.employee.id }, include: { workStations: true } });
  expect(after.phone).toBe(null); expect(after.workStations).toEqual([]); expect(after.status).toBe("OFF"); expect(after.unionMember).toBe(true); expect(after.sessionVersion).toBe(5); expect(after.pinDigest).toBe(f.employee.pinDigest);
  expect((await db.employee.findUniqueOrThrow({ where: { id: f.blocked.id } })).status).toBe("ACTIVE");
  await page.screenshot({ path: `tmp/onb01-browser/results-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("stale review is blocked through the actual server action", async ({ page, context }) => {
  const f = await setup();
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/employees/import");
  await page.getByLabel("File (.csv)").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(`employeeId,phone\n${f.employee.id},555-9999`) });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByRole("heading", { name: "Review changes" })).toBeVisible();
  await db.employee.update({ where: { id: f.employee.id }, data: { phone: "newer edit" } });
  await page.getByRole("button", { name: "Confirm reviewed updates" }).click();
  await expect(page.getByRole("status", { name: "Employee update results" })).toContainText("Committed 0, unchanged 0, blocked 1, failed 0");
  expect((await db.employee.findUniqueOrThrow({ where: { id: f.employee.id } })).phone).toBe("newer edit");
  expect(await db.employeeHrAuditLog.count({ where: { facilityId: f.facility.id } })).toBe(0);
});

test("expected header errors remain actionable and never mutate the roster", async ({ page, context }) => {
  const f = await setup();
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/employees/import");
  await page.getByLabel("File (.csv)").setInputFiles({ name: "unsupported.csv", mimeType: "text/csv", buffer: Buffer.from(`employeeId,password\n${f.employee.id},forbidden`) });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByTestId("employee-csv-import").getByRole("alert")).toContainText("Unknown or blank header");
  await expect(page.getByRole("button", { name: "Confirm reviewed updates" })).toHaveCount(0);
  expect((await db.employee.findUniqueOrThrow({ where: { id: f.employee.id } })).phone).toBe("555-1234");
  expect(await db.employeeHrAuditLog.count({ where: { facilityId: f.facility.id } })).toBe(0);
});
