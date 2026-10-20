import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { SignJWT } from "jose";
import { test, expect } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires migrated disposable database and local production server.");
const db = new PrismaClient({ datasources: { db: { url } } });
const baseURL = process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55473";
test.afterAll(async () => db.$disconnect());
async function fixture(roleKey: RoleKey = "FACILITY_ADMINISTRATOR") {
  const id = randomUUID();
  const role = await db.role.upsert({ where: { key: roleKey }, create: { key: roleKey, name: roleKey }, update: {} });
  const org = await db.organization.create({ data: { name: `ONB02 browser ${id}` } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: "Onboarding Transition Test", timezone: "America/New_York", onboardingCurrentStep: "locations" } });
  const actor = await db.user.create({ data: { email: `${id}@example.com`, displayName: "Setup Administrator", facilityId: facility.id, roleId: role.id } });
  await db.userFacilityAccess.create({ data: { userId: actor.id, facilityId: facility.id, rolePeriods: { create: { roleKey, startsAt: new Date("2020-01-01") } } } });
  const token = await new SignJWT({ uid: actor.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: roleKey, facilityId: facility.id, name: actor.displayName, email: actor.email, sessionVersion: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { facility, token };
}
for (const width of [1280, 768]) test(`journey acknowledgement grants no operation at ${width}px`, async ({ page, context }) => {
  const f = await fixture(); await page.setViewportSize({ width, height: 1024 });
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Site setup workspace" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Licensing and installation" })).toContainText("A saved card grants no license");
  await mkdir("tmp/onb02-browser", { recursive: true });
  await page.screenshot({ path: `tmp/onb02-browser/setup-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Acknowledge guided setup", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guided setup acknowledged. No license" })).toBeVisible();
  const before = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  expect(before.onboardingCompletedAt).not.toBeNull();
  const replay = await context.request.patch("/api/onboarding/state", { data: { completeOnboarding: true, step: "billing" } });
  expect(replay.ok()).toBe(true);
  const after = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  expect(after.onboardingCompletedAt).toEqual(before.onboardingCompletedAt); expect(after.onboardingCurrentStep).toBe("complete");
  const state = await (await context.request.get("/api/onboarding/state")).json();
  expect(state.commercialStatus).toBe("NOT_LICENSED"); expect(state.catalog.every((item: { operable: boolean }) => !item.operable)).toBe(true);
  expect(await db.department.count({ where: { facilityId: f.facility.id } })).toBe(0);
  expect(await db.facilityBilling.count({ where: { facilityId: f.facility.id } })).toBe(0);
  expect(errors).toEqual([]);
});

test("unfinished Facility retains billing recovery access; unauthorized role cannot finish", async ({ page, context, browser }) => {
  const f = await fixture();
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/admin/billing"); await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  expect((await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } })).onboardingCompletedAt).toBeNull();
  const staff = await fixture("STAFF"), other = await browser.newContext({ baseURL });
  await other.addCookies([{ name: "ltc_session", value: staff.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const response = await other.request.post("/api/onboarding/locations", { data: { locations: [] } });
  expect(response.status()).toBe(403);
  expect((await db.facility.findUniqueOrThrow({ where: { id: staff.facility.id } })).onboardingCompletedAt).toBeNull();
  await other.close();
});

test("unpaid Department direct Build access stays blocked while billing and data remain available", async ({ page, context }) => {
  const f = await fixture();
  await db.facility.update({ where: { id: f.facility.id }, data: { onboardingCompletedAt: new Date() } });
  const department = await db.department.create({ data: { facilityId: f.facility.id, key: "PLANT", name: "Preserved Plant", isActive: true, showInEmployeeApp: true } });
  await db.facilityBilling.create({ data: { facilityId: f.facility.id, status: "UNPAID", entitlements: { create: { facilityId: f.facility.id, departmentKey: "PLANT", departmentId: department.id, status: "ACTIVE" } } } });
  await context.addCookies([{ name: "ltc_session", value: f.token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`/build/departments/${department.id}`);
  await expect(page).toHaveURL(/admin\/departments/);
  const state = await (await context.request.get("/api/onboarding/state")).json();
  expect(state.catalog.every((item: { operable: boolean }) => !item.operable)).toBe(true);
  await page.goto("/admin/billing"); await expect(page.getByText("Licensed Department operation is suspended.", { exact: false })).toBeVisible();
  expect(await db.department.findUnique({ where: { id: department.id } })).not.toBeNull();
});

test("Console describes setup acknowledgement separately from licensing and installation", async ({ page, context }) => {
  const f = await fixture();
  await db.facility.update({ where: { id: f.facility.id }, data: { onboardingCompletedAt: new Date() } });
  const id = randomUUID();
  const staff = await db.platformStaff.create({ data: { email: `staff-${id}@example.com`, displayName: "Onboarding Support", passwordHash: "unused-disposable-test", role: "OWNER" } });
  const token = await new SignJWT({ uid: staff.id, tokenUse: "harbor", email: staff.email, name: staff.displayName, staffRole: "OWNER", sessionVersion: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  await context.addCookies([{ name: "harbor_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`/console/customers/${f.facility.id}`);
  await expect(page.getByText("Guided setup acknowledged", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Not licensed · Not installed · Disabled · Customer operation unavailable").first()).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "tmp/onb02-browser/console-status.png", fullPage: true });
});
