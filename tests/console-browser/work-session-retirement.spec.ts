import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const databaseUrl = process.env.CONSOLE_BROWSER_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

async function login(page: Page, kind: "customer" | "staff", email: string, password: string) {
  const path = kind === "staff" ? "/console/login" : "/login";
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: kind === "staff" ? "Sign in" : "Continue", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== path);
}

test("live staff and old work cookies never enter a Facility or inherit ambient customer authority", async ({ browser, baseURL }) => {
  test.skip(!databaseUrl, "Requires a disposable database and matching local build.");
  assertDisposableDatabaseUrl(databaseUrl);
  const secret = process.env.AUTH_SECRET;
  if (!secret || !baseURL) throw new Error("The disposable browser build must supply its test session secret and origin.");

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const tag = randomUUID();
  const password = randomUUID();
  const ordinary = await browser.newContext({ baseURL });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const organization = await db.organization.create({ data: { name: `Synthetic retirement ${tag}` } });
    const facility = await db.facility.create({ data: {
      organizationId: organization.id, displayName: `Synthetic Facility ${tag}`, timezone: "America/New_York",
      onboardingCompletedAt: new Date(),
    } });
    const role = await db.role.upsert({
      where: { key: "FACILITY_ADMINISTRATOR" },
      update: {},
      create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
    });
    const customer = await db.user.create({ data: {
      email: `customer-${tag}@example.invalid`, displayName: "Synthetic Administrator", facilityId: facility.id,
      roleId: role.id, passwordHash, emailVerifiedAt: new Date(),
    } });
    await db.userFacilityAccess.create({ data: {
      userId: customer.id, facilityId: facility.id,
      rolePeriods: { create: { startsAt: new Date("2020-01-01Z"), roleKey: "FACILITY_ADMINISTRATOR" } },
    } });
    const customerPage = await ordinary.newPage();
    await login(customerPage, "customer", customer.email, password);
    await customerPage.goto("/admin/facility/builder");
    await expect(customerPage.getByTestId("facility-builder-page")).toBeVisible();
    const customerCookie = (await ordinary.cookies()).find((cookie) => cookie.name === "ltc_session");
    expect(customerCookie).toBeDefined();

    for (const role of ["OWNER", "MEMBER"] as const) {
      const staff = await db.platformStaff.create({ data: {
        displayName: `Synthetic ${role}`, email: `${role.toLowerCase()}-${tag}@example.invalid`, passwordHash, role,
      } });
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        await login(page, "staff", staff.email, password);
        await page.goto("/console/catalog");
        await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
        await page.goto(`/console/customers/${facility.id}`);
        await expect(page.getByText("Staff Facility workspace access is paused.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Open facility" })).toHaveCount(0);
        const start = await context.request.post("/api/console/work-session", { form: { facilityId: facility.id } });
        expect(start.status()).toBe(410);
        expect((await context.cookies()).some((cookie) => cookie.name === "harbor_work")).toBe(false);

        // Simulate a browser carrying an unexpired cookie from the previous release.
        const oldToken = await new SignJWT({ tokenUse: "harbor_work", staffId: staff.id, facilityId: facility.id })
          .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
          .sign(new TextEncoder().encode(secret));
        const legacyCookie = { name: "harbor_work", value: oldToken, url: baseURL, httpOnly: true, sameSite: "Lax" } as const;
        await context.addCookies([legacyCookie]);
        expect((await context.request.get("/api/auth/session")).status()).toBe(403);
        await context.addCookies([customerCookie!]);
        await page.goto("/admin/facility/builder");
        await expect(page).toHaveURL(/\/console\/work-session-ended$/);
        await expect(page.getByTestId("facility-builder-page")).toHaveCount(0);
        expect((await context.request.get("/api/auth/session")).status()).toBe(403);
        await page.getByRole("button", { name: "Clear old work session" }).click();
        await expect(page).toHaveURL(/\/console\/customers$/);
        expect((await context.cookies()).some((cookie) => cookie.name === "harbor_work")).toBe(false);
        expect((await context.request.get("/api/auth/session")).status()).toBe(200);
        await page.goto("/admin/facility/builder");
        await expect(page.getByTestId("facility-builder-page")).toBeVisible();
        await page.goto("/console/tickets");
        await expect(page.getByRole("link", { name: "Tickets", exact: true }).first()).toBeVisible();

        await context.addCookies([legacyCookie]);
        expect((await context.request.get("/api/auth/session")).status()).toBe(403);
        await page.getByRole("button", { name: "Sign out" }).click();
        await expect(page).toHaveURL(/\/console\/login$/);
        expect((await context.cookies()).filter((cookie) => ["harbor_session", "harbor_work"].includes(cookie.name))).toHaveLength(0);
      } finally {
        await context.close();
      }
    }
  } finally {
    await ordinary.close();
    await db.$disconnect();
  }
});
