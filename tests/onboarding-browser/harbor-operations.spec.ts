import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { createHarborOperationsFixture } from "../fixtures/harbor-operations";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "requires migrated disposable PostgreSQL and matching local application");
const db = new PrismaClient({ datasourceUrl: url });
test.afterAll(() => db.$disconnect());

test("Harbor operations and lifecycle connect normal role-scoped handling without customer writes", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  if (!baseURL || !process.env.AUTH_SECRET) throw new Error("Local application and secret required");
  const password = randomUUID();
  const f = await createHarborOperationsFixture(db, { bulk: 27, passwordHash: await bcrypt.hash(password, 10) });
  await db.user.update({ where: { id: f.b.user.id }, data: { passwordHash: null } });
  const snapshot = () => db.facility.findMany({ where: { id: { in: [f.a.facility.id, f.b.facility.id] } }, orderBy: { id: "asc" }, include: { billing: true, departments: true, units: true, unitSpaces: true } });
  const before = await snapshot();
  async function login(target: Page, email: string, staff = true) {
    await target.goto(staff ? "/console/login" : "/login");
    await target.getByLabel("Email", { exact: true }).fill(email);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: staff ? "Sign in" : "Continue", exact: true }).click();
    await expect(target).not.toHaveURL(staff ? /\/console\/login$/ : /\/login$/);
  }
  const ownerContext = await browser.newContext({ baseURL });
  const customerContext = await browser.newContext({ baseURL });
  const otherLoginContext = await browser.newContext({ baseURL });
  try {
    await login(page, f.member.row.email);
    await page.getByRole("navigation", { name: "Vssyl Console", exact: true }).getByRole("link", { name: "Operations", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
    await page.goto("/console/operations?queue=catalog");
    await expect(page.getByRole("region", { name: "Platform Catalog drafts", exact: true })).toContainText("An Owner must publish");
    expect(await page.content()).not.toContain("PRIVATE_RECORD_CANARY");
    await page.locator(`a[href="/console/catalog/${f.records[0].stableKey}"]`).click();
    await expect(page.getByRole("heading", { name: "Draft v1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
    await page.goto("/console/operations?queue=priority");
    await page.locator(`a[href="/console/tickets/${f.ticket.id}"]`).click();
    await expect(page.getByRole("heading", { name: "PRIVATE BODY AND SUBJECT CANARY", exact: true })).toBeVisible();
    await page.goto("/console/operations?queue=delivery");
    await page.locator(`a[href*="support-message-${f.messages.get("FAILED")}"]`).click();
    await expect(page.locator(`[id="support-message-${f.messages.get("FAILED")}"]`)).toBeVisible();
    await page.goto("/console/operations?queue=automation");
    await page.getByRole("link", { name: "Review this rule", exact: true }).click();
    await expect(page.getByRole("heading", { name: f.rule.name, exact: true })).toBeVisible();
    await page.goto("/console/operations?queue=licensing");
    await page.getByRole("link", { name: "Review licensing state", exact: true }).click();
    await expect(page.getByRole("region", { name: "Commercial and Department access", exact: true })).toBeVisible();
    await page.goto("/console/operations?queue=support&page=2");
    await expect(page.getByRole("navigation", { name: "Operations pagination" })).toContainText("Page 2 of 2");
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await page.goto("/console/operations?queue=pending");
    const pending = page.getByRole("region", { name: "Unconfirmed outgoing replies", exact: true });
    await expect(pending).toContainText("Send outcome not confirmed");
    await expect(pending).toContainText("Provider accepted; delivery outcome not recorded");
    await expect(pending).toContainText("since reply creation");
    expect(await page.content()).not.toMatch(/PRIVATE_(?:REPLY|BODY|SCOPE|STORAGE|FILENAME|RECORD)/);
    await pending.locator(`a[href*="support-message-${f.messages.get("PENDING")}"]`).click();
    await expect(page.locator(`[id="support-message-${f.messages.get("PENDING")}"]`)).toBeVisible();

    await page.goto("/console/operations?queue=scanning&scan=scheduled");
    await expect(page.getByRole("region", { name: "Attachment scan backlog", exact: true })).toContainText("Retry not yet eligible");
    await page.goto(`/console/operations/scans/${f.scans.get("failed")}`);
    await expect(page.getByRole("region", { name: "Recorded attempts", exact: true })).toContainText("Showing 10 of 11 attempts");
    expect(await page.content()).not.toMatch(/PRIVATE_(?:ORIGINAL|STORAGE|FILENAME|SCOPE)|scanLeaseToken|loginKey/);
    await page.getByRole("link", { name: "Review the participating Implementation engagement", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Deliverables, one per line", exact: true })).toHaveValue("PRIVATE_SCOPE_CANARY");

    const lifecycle = `/console/customers/${f.a.facility.id}/lifecycle`;
    await page.goto(lifecycle);
    await expect(page.getByRole("heading", { name: "Customer lifecycle and readiness", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Tenancy and Administrator", exact: true })).toContainText("Owner review required");
    await expect(page.getByRole("heading", { name: "My assigned participating work", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Continue request from/ }).click();
    await expect(page).toHaveURL(new RegExp(`engagement=${f.engagement.id}`));
    await page.goto(lifecycle);
    await page.getByRole("link", { name: "Review billing reconciliation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sync from Stripe", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Review lifecycle and operational pause", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${lifecycle}$`));

    const ownerPage = await ownerContext.newPage();
    await login(ownerPage, f.owner.row.email);
    await ownerPage.goto(`/console/catalog/${f.records[0].stableKey}`);
    await expect(ownerPage.getByRole("button", { name: /publish/i })).toBeVisible();
    await ownerPage.goto(`/console/customers/${f.b.facility.id}/lifecycle`);
    await ownerPage.getByRole("link", { name: "Review replacement invitation", exact: true }).click();
    await expect(ownerPage.getByRole("checkbox", { name: /I confirm a replacement invitation/ })).toBeVisible();
    await ownerPage.goto(`/console/customers/${f.b.facility.id}/lifecycle`);
    await expect(ownerPage.getByRole("heading", { name: "My assigned participating work", exact: true })).toHaveCount(0);

    const customerPage = await customerContext.newPage();
    await login(customerPage, f.a.user.email, false);
    const customerCookies = await customerContext.cookies();
    await page.context().addCookies(customerCookies.filter((cookie) => cookie.name === "ltc_session"));
    const retired = await new SignJWT({ tokenUse: "harbor_work", staffId: f.member.row.id, facilityId: f.a.facility.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await page.context().addCookies([{ name: "harbor_work", value: retired, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(lifecycle);
    await expect(page.getByRole("region", { name: "Service follow-up", exact: true })).toContainText("Unavailable while a retired Facility work cookie is present");
    await expect(page.getByRole("heading", { name: "My assigned participating work", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Clear retired work context", exact: true }).click();
    await page.getByRole("button", { name: "Clear old work session", exact: true }).click();
    expect((await page.context().cookies()).some((cookie) => cookie.name === "ltc_session")).toBe(true);
    for (const route of ["/console/operations", lifecycle, `/console/operations/scans/${f.scans.get("failed")}`]) {
      await customerPage.goto(route); await expect(customerPage).toHaveURL(/\/console\/login/);
    }

    await db.platformStaff.update({ where: { id: f.member.row.id }, data: { isActive: false } });
    await page.goto("/console/operations"); await expect(page).toHaveURL(/\/console\/login/);
    const otherPage = await otherLoginContext.newPage();
    await login(otherPage, f.owner.row.email);
    await ownerPage.getByRole("button", { name: "Sign out", exact: true }).click();
    for (const route of ["/console/operations", lifecycle, `/console/operations/scans/${f.scans.get("failed")}`]) {
      await ownerPage.goto(route); await expect(ownerPage).toHaveURL(/\/console\/login/);
    }
    await otherPage.goto("/console/operations"); await expect(otherPage.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
    await customerPage.goto("/setup"); await expect(customerPage).not.toHaveURL(/\/login$/);
    expect(await snapshot()).toEqual(before);
    expect(await db.unitSpace.count({ where: { facilityId: { in: [f.a.facility.id, f.b.facility.id] }, unitId: null, facilityRoomTypeId: null } })).toBe(2);
  } finally {
    await ownerContext.close(); await customerContext.close(); await otherLoginContext.close();
  }
});
