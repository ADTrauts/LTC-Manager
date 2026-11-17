import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { decodeJwt } from "jose";

import { createCatalogDefinition, HARBOR_CATALOG_WRITE } from "../../src/lib/canonical-logs/catalog-service";
import { harborLoginIdentity } from "../../src/lib/harbor-console/login-receipt";
import { HARBOR_SESSION_COOKIE, verifyHarborSessionToken } from "../../src/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

async function signIn(page: Page, email: string, password: string, staff: boolean) {
  const path = staff ? "/console/login" : "/login";
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: staff ? "Sign in" : "Continue", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== path);
}

test("Harbor logout revokes one login, including across a concurrent Catalog publish", async ({ browser, baseURL }) => {
  const databaseUrl = process.env.CONSOLE_BROWSER_DATABASE_URL;
  test.skip(!databaseUrl, "Requires the disposable PostgreSQL browser build.");
  if (assertDisposableDatabaseUrl(databaseUrl).host !== "127.0.0.1" || !baseURL ||
      new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Use the disposable loopback build.");

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  const tag = randomUUID();
  const password = randomUUID();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = await db.platformStaff.create({ data: {
      email: `harbor-owner-${tag}@example.invalid`, displayName: "Synthetic Harbor owner", passwordHash, role: "OWNER",
    } });
    const org = await db.organization.create({ data: { name: tag } });
    const facility = await db.facility.create({ data: {
      organizationId: org.id, displayName: "Synthetic Facility", onboardingCompletedAt: new Date(),
    } });
    const role = await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {},
      create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" } });
    const customer = await db.user.create({ data: {
      facilityId: facility.id, roleId: role.id, displayName: "Synthetic customer",
      email: `customer-${tag}@example.invalid`, passwordHash, emailVerifiedAt: new Date(),
      facilityAccesses: { create: { facilityId: facility.id, rolePeriods: { create: {
        startsAt: new Date("2020-01-01Z"), roleKey: "FACILITY_ADMINISTRATOR",
      } } } },
    } });
    const draft = await createCatalogDefinition(db, {
      name: `Phase 1C ${tag}`, purposeType: "LOG", category: "OTHER",
      fields: [{ fieldKey: "result", label: "Result", fieldType: "YES_NO" }],
    }, HARBOR_CATALOG_WRITE);

    const primary = await first.newPage();
    const independent = await second.newPage();
    await signIn(primary, customer.email, password, false);
    await signIn(primary, owner.email, password, true);
    await signIn(independent, owner.email, password, true);
    const cookie = (await first.cookies()).find(({ name }) => name === HARBOR_SESSION_COOKIE);
    const otherCookie = (await second.cookies()).find(({ name }) => name === HARBOR_SESSION_COOKIE);
    if (!cookie || !otherCookie) throw new Error("Expected two Harbor logins.");
    expect(decodeJwt(cookie.value).jti !== decodeJwt(otherCookie.value).jti).toBe(true);
    const login = harborLoginIdentity(await verifyHarborSessionToken(cookie.value));
    if (!login) throw new Error("The ordinary login has no receipt identity.");
    expect(login.assistance).toBe(false);

    const signOutPage = await first.newPage();
    await signOutPage.goto("/console");
    await primary.goto(`/console/catalog/${draft.stableKey}`);
    const publish = primary.getByRole("button", { name: "Publish", exact: true });
    const signOut = signOutPage.getByRole("button", { name: "Sign out", exact: true });
    const waiting = async (fragment: string) => (await db.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE ${fragment}) AS waiting
    `)[0].waiting;
    // Hold the Catalog row after the publication action has acquired its staff lock.
    let publishClick: Promise<void> | undefined;
    let logoutClick: Promise<void> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CatalogLogDefinition" WHERE id = ${draft.id} FOR UPDATE`;
      publishClick = publish.click();
      await expect.poll(() => waiting('%FROM "CatalogLogDefinition"%FOR UPDATE%'), { timeout: 3000 }).toBe(true);
      logoutClick = signOut.click();
      await expect.poll(() => waiting('%FROM "PlatformStaff"%FOR NO KEY UPDATE%'), { timeout: 3000 }).toBe(true);
    }, { timeout: 10_000 });
    await Promise.all([publishClick, logoutClick]);
    await signOutPage.waitForURL(/\/console\/login$/);
    expect((await db.catalogLogDefinition.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PUBLISHED");
    const firstPublication = await db.harborAuditEvent.findFirstOrThrow({
      where: { staffId: owner.id, action: "CATALOG_PUBLISH" },
      select: { catalogPublication: { select: { definitionId: true, stableKey: true, version: true } } },
    });
    expect(firstPublication.catalogPublication).toEqual({
      definitionId: draft.id, stableKey: draft.stableKey, version: draft.version,
    });
    const receipt = await db.harborAssistanceLoginReceipt.findUnique({ where: { loginKey: login.key } });
    expect(receipt?.retainUntil.toISOString()).toBe(login.retainUntil.toISOString());
    expect((await first.cookies()).some(({ name }) => name === HARBOR_SESSION_COOKIE)).toBe(false);

    // Reuse the exact signed cookie in the browser to prove server revocation after logout.
    await first.addCookies([cookie]);
    expect((await primary.goto("/api/console/support-attachments/nonexistent"))?.status()).toBe(401);
    await first.addCookies([cookie]);
    await primary.goto("/console/catalog");
    await expect(primary).toHaveURL(/\/console\/login$/);
    await primary.goto("/admin/facility/builder");
    await expect(primary.getByTestId("facility-builder-page")).toBeVisible();
    await independent.goto(`/console/catalog/${draft.stableKey}`);
    await expect(independent).toHaveURL(/\/console\/catalog/);
    await independent.getByRole("button", { name: "New version", exact: true }).click();
    await expect(independent.getByTestId("record-draft-version")).toHaveText("v2");
    await independent.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(independent.getByTestId("record-published-version")).toHaveText("v2");
    const successor = await db.catalogLogDefinition.findUniqueOrThrow({
      where: { stableKey_version: { stableKey: draft.stableKey, version: 2 } },
      select: { id: true },
    });
    const publishedEvents = await db.harborAuditEvent.findMany({
      where: { staffId: owner.id, action: "CATALOG_PUBLISH" },
      orderBy: { createdAt: "asc" },
      select: { catalogPublication: { select: { definitionId: true, stableKey: true, version: true } } },
    });
    expect(publishedEvents.map(({ catalogPublication }) => catalogPublication)).toEqual([
      { definitionId: draft.id, stableKey: draft.stableKey, version: 1 },
      { definitionId: successor.id, stableKey: draft.stableKey, version: 2 },
    ]);

    // The role-change fixture models the existing account-wide version invalidation.
    await signIn(signOutPage, owner.email, password, true);
    await db.platformStaff.update({ where: { id: owner.id }, data: {
      role: "MEMBER", sessionVersion: { increment: 1 },
    } });
    for (const page of [signOutPage, independent]) {
      await page.goto("/console/catalog");
      await expect(page).toHaveURL(/\/console\/login$/);
    }
    await primary.goto("/admin/facility/builder");
    await expect(primary.getByTestId("facility-builder-page")).toBeVisible();
  } finally {
    await Promise.all([first.close(), second.close()]);
    await db.$disconnect();
  }
});
