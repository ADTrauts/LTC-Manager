import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { issueAccountInviteToken } from "../../src/lib/account-invite/tokens";
import { savePersonalDashboardLayout } from "../../src/lib/dashboard/layouts/store";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const databaseUrl = process.env.ONBOARDING_TEST_DATABASE_URL;
const baseURL = process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55473";
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
test.skip(!databaseUrl, "Requires migrated disposable PostgreSQL and a local application server.");
const db = new PrismaClient({ datasourceUrl: databaseUrl });
test.afterAll(() => db.$disconnect());

async function provision() {
  const email = `invite-handoff-${randomUUID()}@example.invalid`;
  const facilityName = "Synthetic invitation handoff";
  return db.$transaction((tx) => bootstrapFacilityCustomer(tx, {
    organization: { mode: "create", facilityName },
    facility: { displayName: facilityName, billingEmail: email, timezone: "America/New_York" },
    administrator: { mode: "create", email, displayName: "Synthetic Administrator", passwordHash: null, emailVerifiedAt: null },
  }));
}

test("Facility Administrator account invitation opens and resumes guided setup", async ({ page, context, browser }) => {
  const password = randomUUID();
  const pending = await provision();
  const invitation = await issueAccountInviteToken(db, pending.user.id);
  await page.goto(`/accept-invite?token=${encodeURIComponent(invitation.rawToken)}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create password and continue" }).click();
  await page.waitForURL((url) => url.pathname === "/setup");
  await expect(page.getByRole("heading", { name: "Set up your Vssyl" })).toBeVisible();

  const login = await context.request.post("/api/auth/login", { data: { email: pending.user.email, password } });
  expect(login.ok()).toBe(true);
  expect((await login.json()).redirectPath).toBe("/dashboard");
  await page.goto("/dashboard");
  const dashboard = page.getByTestId("dashboard-v2");
  const resume = dashboard.getByRole("link", { name: "Continue guided setup", exact: true });
  await expect(dashboard.getByTestId("dashboard-card-facility_setup").locator('a[href="/setup"]')).toBeVisible();
  await expect(resume).toHaveCount(0);

  await savePersonalDashboardLayout(db, {
    facilityId: pending.facility.id,
    owner: { kind: "USER", userId: pending.user.id },
    scopeKind: "FACILITY",
    items: [],
  });
  await page.reload();
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByRole("heading", { name: "Set up your Vssyl" })).toBeVisible();
  await page.getByRole("checkbox", { name: /I confirm this is the timezone/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue with no Products", exact: true }).click();
  for (let step = 0; step < 3; step++) {
    await page.getByRole("button", { name: "Not now", exact: true }).click();
  }
  await page.getByRole("button", { name: "Acknowledge guided setup", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(dashboard).toBeVisible();
  await expect(resume).toHaveCount(0);
  expect((await db.facility.findUniqueOrThrow({ where: { id: pending.facility.id } })).onboardingCompletedAt).not.toBeNull();
  expect(await db.facilityBilling.count({ where: { facilityId: pending.facility.id } })).toBe(0);
  expect(await db.department.count({ where: { facilityId: pending.facility.id } })).toBe(0);

  const completed = await provision();
  await db.facility.update({ where: { id: completed.facility.id }, data: { onboardingCompletedAt: new Date() } });
  const unavailable = await provision();
  await db.userFacilityAccess.update({
    where: { userId_facilityId: { userId: unavailable.user.id, facilityId: unavailable.facility.id } },
    data: { isActive: false, revokedAt: new Date() },
  });
  const manager = await db.user.create({ data: {
    email: `invite-handoff-manager-${randomUUID()}@example.invalid`,
    displayName: "Synthetic Manager",
    facilityId: unavailable.facility.id,
    facilityAccesses: { create: {
      facilityId: unavailable.facility.id,
      rolePeriods: { create: { roleKey: "MANAGER", startsAt: new Date() } },
    } },
  } });
  for (const [userId, nextPath] of [
    [completed.user.id, "/dashboard"], [manager.id, "/dashboard"], [unavailable.user.id, "/access"],
  ] as const) {
    const setupContext = await browser.newContext({ baseURL });
    try {
      const { rawToken } = await issueAccountInviteToken(db, userId);
      const response = await setupContext.request.post("/api/auth/account-invite/confirm", {
        data: { token: rawToken, password, confirmPassword: password, role: "FACILITY_ADMINISTRATOR", facilityId: pending.facility.id },
      });
      expect(response.ok()).toBe(true);
      expect((await response.json()).nextPath).toBe(nextPath);
      if (userId === manager.id) {
        const managerPage = await setupContext.newPage();
        await managerPage.goto(nextPath);
        await expect(managerPage.getByText("Your Dashboard needs a Department.")).toBeVisible();
        await expect(managerPage.getByRole("link", { name: "Continue guided setup", exact: true })).toHaveCount(0);
      }
    } finally {
      await setupContext.close();
    }
  }
});
