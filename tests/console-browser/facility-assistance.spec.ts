import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { decodeJwt } from "jose";
import { ASSISTANCE_AUDIT } from "../../src/lib/harbor-console/assistance-pilot";
import { HARBOR_JWT_CLOCK_TOLERANCE_SECONDS, HARBOR_SESSION_COOKIE } from "../../src/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const databaseUrl = process.env.CONSOLE_BROWSER_DATABASE_URL;
const setup = {
  org: "b3-browser-org", facility: "b3-browser-a",
  viewer: "b3-browser-viewer", owner: "b3-browser-owner", reviewer: "b3-browser-reviewer",
};

async function command(page: Page, path: string, body: object) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, url: response.url, body: await response.text() };
  }, { path, body });
}

async function signIn(page: Page, staff: boolean, email: string, password: string) {
  const pathname = staff ? "/console/login" : "/login";
  await page.goto(pathname);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: staff ? "Sign in" : "Continue", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== pathname);
}

test("an approved synthetic Facility structure is read-only and login-bound in Chromium", async ({ browser, baseURL }) => {
  test.skip(process.env.HARBOR_ASSISTANCE_BROWSER !== "1" || !databaseUrl, "Run only on the enabled disposable loopback build.");
  const target = assertDisposableDatabaseUrl(databaseUrl);
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1" || target.host !== "127.0.0.1") {
    throw new Error("Use loopback application and database for the assistance browser suite.");
  }
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await browser.newContext({ baseURL });
  const owner = await browser.newContext({ baseURL });
  const viewer = await browser.newContext({ baseURL });
  const reviewer = await browser.newContext({ baseURL });
  const replay = await browser.newContext({ baseURL });
  const guardedTables = ["HarborAuditEvent", "HarborAssistanceAuditDetail", "HarborAssistanceConsentAuditEvent",
    "HarborAssistanceLoginReceipt", "HarborFacilityGrant", "HarborAssistanceConsent", "HarborAssistanceSession",
    "User", "PlatformStaff", "Facility", "Unit", "UnitSpace", "FacilityRoomType", "AuthRateLimitBucket"];
  async function removeWriteGuard() {
    // Local disposable browser database only. Removing the function also removes its triggers.
    await db.$executeRaw`DROP FUNCTION IF EXISTS harbor_browser_forbid_audit_mutation() CASCADE`;
  }
  try {
    await db.organization.create({ data: { id: setup.org, name: "Synthetic Harbor browser organization" } });
    await db.facility.create({ data: {
      id: setup.facility, organizationId: setup.org, displayName: "Synthetic Harbor structure",
      onboardingCompletedAt: new Date(),
    } });
    const role = await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {},
      create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" } });
    const user = await db.user.create({ data: {
      facilityId: setup.facility, roleId: role.id, passwordHash, emailVerifiedAt: new Date(),
      displayName: "Synthetic Structure Administrator", email: "structure-administrator@example.invalid",
      facilityAccesses: { create: { facilityId: setup.facility, rolePeriods: { create: {
        startsAt: new Date("2020-01-01Z"), roleKey: "FACILITY_ADMINISTRATOR",
      } } } },
    } });
    await db.platformStaff.createMany({ data: [
      { id: setup.owner, displayName: "Synthetic Approver", email: "structure-owner@example.invalid", passwordHash, role: "OWNER" },
      { id: setup.viewer, displayName: "Synthetic Viewer", email: "structure-viewer@example.invalid", passwordHash, role: "MEMBER" },
      { id: setup.reviewer, displayName: "Synthetic Reviewer", email: "structure-reviewer@example.invalid", passwordHash, role: "MEMBER" },
    ] });
    const floor = await db.unit.create({ data: {
      facilityId: setup.facility, name: "Synthetic floor", hierarchyRole: "FLOOR", unitType: "OTHER",
    } });
    const room = await db.unitSpace.create({ data: {
      facilityId: setup.facility, unitId: floor.id, name: "Synthetic <storage>", spaceType: "STORAGE",
      roomNumber: "Hidden room number", code: "Hidden code", description: "Hidden description",
    } });
    const [customerPage, ownerPage, viewerPage] = await Promise.all([customer.newPage(), owner.newPage(), viewer.newPage()]);
    await Promise.all([
      signIn(customerPage, false, user.email, password),
      signIn(ownerPage, true, "structure-owner@example.invalid", password),
      signIn(viewerPage, true, "structure-viewer@example.invalid", password),
    ]);
    const reviewerPage = await reviewer.newPage();
    await signIn(reviewerPage, true, "structure-reviewer@example.invalid", password);
    const viewerLogin = (await viewer.cookies()).find(({ name }) => name === HARBOR_SESSION_COOKIE);
    if (!viewerLogin) throw new Error("Viewer login missing");
    const expiry = decodeJwt(viewerLogin.value).exp;
    if (!expiry) throw new Error("Viewer signed expiry missing");
    expect((await viewer.request.get(ASSISTANCE_AUDIT)).status()).toBe(404);
    const consentRequest = {
      action: "consent", facilityId: setup.facility, staffId: setup.viewer, minutes: 60, requestId: randomUUID(),
    };
    const consent = await command(customerPage, "/api/harbor-assistance/consent", consentRequest);
    expect(consent.status).toBe(201);
    const retry = await command(customerPage, "/api/harbor-assistance/consent", consentRequest);
    expect(retry.status).toBe(201);
    expect(JSON.parse(retry.body)).toEqual(JSON.parse(consent.body));
    const conflict = await command(customerPage, "/api/harbor-assistance/consent", { ...consentRequest, minutes: 61 });
    expect(conflict.status).toBe(404);
    const grant = await command(ownerPage, "/api/console/assistance", {
      action: "approve", facilityId: setup.facility, staffId: setup.viewer, consentId: JSON.parse(consent.body).consentId,
    });
    expect(grant.status).toBe(201);
    const requestId = randomUUID();
    const start = await command(viewerPage, "/api/console/assistance", {
      action: "start", facilityId: setup.facility, grantId: JSON.parse(grant.body).grantId, requestId,
    });
    expect(start.status).toBe(200);
    const viewUrl = `/console/assistance?context=${requestId}`;
    expect(new URL(start.url).pathname).toBe("/console/assistance");
    const customerCookie = (await customer.cookies()).find((cookie) => cookie.name === "ltc_session");
    expect(customerCookie).toBeDefined();
    await viewer.addCookies([customerCookie!]);
    const pageResponse = await viewerPage.goto(viewUrl);
    expect(pageResponse?.status()).toBe(200);
    expect(pageResponse?.headers()["cache-control"]).toContain("no-store");
    await expect(viewerPage.getByRole("heading", { name: "Facility structure" })).toBeVisible();
    await expect(viewerPage.getByText("Synthetic <storage>", { exact: false })).toBeVisible();
    const html = await viewerPage.content();
    for (const excluded of [floor.id, room.id, setup.facility, "Hidden room number", "Hidden code", "Hidden description"]) {
      expect(html).not.toContain(excluded);
    }
    // The structure document has a deny-all CSP. Probe methods from the ordinary Console.
    await viewerPage.getByRole("link", { name: "Vssyl Console" }).click();
    const denied = await viewerPage.evaluate(async (path) => {
      return await Promise.all([
        fetch(path, { method: "HEAD" }), fetch(path, { headers: { "Next-Router-Prefetch": "1" } }),
        fetch(path, { method: "POST" }),
      ].map(async (response) => (await response).status));
    }, viewUrl);
    expect(denied).toEqual([405, 404, 405]);
    expect((await db.unitSpace.findUniqueOrThrow({ where: { id: room.id } })).facilityRoomTypeId).toBeNull();
    await viewerPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await viewerPage.waitForURL(/\/console\/login$/);
    await viewerPage.goto(viewUrl);
    await expect(viewerPage.getByRole("heading", { name: "Facility structure", exact: true })).toHaveCount(0);
    expect((await viewer.cookies()).some((cookie) => cookie.name === "ltc_session")).toBe(true);
    expect(await db.harborAssistanceLoginReceipt.count()).toBeGreaterThan(0);

    const counters = () => Promise.all([
      db.harborAuditEvent.count(), db.harborAssistanceAuditDetail.count(),
      db.harborAssistanceConsentAuditEvent.count(), db.harborAssistanceLoginReceipt.count(),
    ]);
    const beforeReview = await counters();
    await db.$executeRaw`CREATE FUNCTION harbor_browser_forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Reviewer route attempted to write'; END $$`;
    for (const table of guardedTables) {
      await db.$executeRawUnsafe(`CREATE TRIGGER harbor_browser_no_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
        ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION harbor_browser_forbid_audit_mutation()`);
    }
    const audit = await reviewerPage.goto(ASSISTANCE_AUDIT);
    expect(audit?.status()).toBe(200);
    expect(audit?.headers()["cache-control"]).toContain("no-store");
    const body = await audit!.text();
    expect(!body.includes("loginKey") && !body.includes(viewerLogin.value)).toBe(true);
    const { events } = JSON.parse(body);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "ASSISTANCE_CONSENT_RECORDED", administratorId: user.id, facilityId: setup.facility }),
      expect.objectContaining({ action: "ASSISTANCE_GRANT_APPROVE", staffId: setup.owner, facilityId: setup.facility }),
      expect.objectContaining({
        action: "ASSISTANCE_LOGIN_END", staffId: setup.viewer,
        logoutReceipt: { exists: true, retainUntil: new Date((expiry + HARBOR_JWT_CLOCK_TOLERANCE_SECONDS) * 1000).toISOString() },
      }),
    ]));
    expect((await ownerPage.goto(ASSISTANCE_AUDIT))?.status()).toBe(404);
    expect((await customerPage.goto(ASSISTANCE_AUDIT))?.status()).toBe(401);
    expect((await reviewer.request.get(`${ASSISTANCE_AUDIT}?prune=true`)).status()).toBe(404);
    expect((await reviewer.request.delete(ASSISTANCE_AUDIT)).status()).toBe(405);
    expect(await counters()).toEqual(beforeReview);
    await removeWriteGuard();

    await replay.addCookies((await reviewer.cookies()).filter(({ name }) => name === HARBOR_SESSION_COOKIE));
    await reviewerPage.goto("/console");
    await reviewerPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await reviewerPage.waitForURL(/\/console\/login$/);
    expect((await reviewerPage.goto(ASSISTANCE_AUDIT))?.status()).toBe(401);
    expect((await (await replay.newPage()).goto(ASSISTANCE_AUDIT))?.status()).toBe(404);
  } finally {
    await Promise.all([customer.close(), owner.close(), viewer.close(), reviewer.close(), replay.close()]);
    await removeWriteGuard();
    await db.harborAssistanceSession.deleteMany({ where: { grant: { facilityId: setup.facility } } });
    await db.harborFacilityGrant.deleteMany({ where: { facilityId: setup.facility } });
    await db.harborAssistanceConsentAuditEvent.deleteMany({ where: { facilityId: setup.facility } });
    await db.harborAssistanceConsent.deleteMany({ where: { facilityId: setup.facility } });
    await db.platformStaff.deleteMany({ where: { id: { in: [setup.owner, setup.viewer, setup.reviewer] } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { facilityId: setup.facility } } });
    await db.userFacilityAccess.deleteMany({ where: { facilityId: setup.facility } });
    await db.user.deleteMany({ where: { facilityId: setup.facility } });
    await db.unit.deleteMany({ where: { facilityId: setup.facility } });
    await db.facility.deleteMany({ where: { id: setup.facility } });
    await db.organization.deleteMany({ where: { id: setup.org } });
    await db.$disconnect();
  }
});
