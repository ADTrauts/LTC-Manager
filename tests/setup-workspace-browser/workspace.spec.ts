import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { SignJWT } from "jose";
import { test, expect, type BrowserContext } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
import { applyFacilitySubscription } from "../../src/lib/billing/apply-stripe-event";
import { issueSetupManagerInvitation, deliverSetupManagerInvitation } from "../../src/lib/onboarding/manager-invitations";
import type { FacilitySession } from "../../src/lib/auth";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires a migrated disposable database and local production build.");
const db = new PrismaClient({ datasources: { db: { url } } });
const baseURL = process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55474";
test.afterAll(async () => db.$disconnect());
async function fixture(roleKey: RoleKey = "FACILITY_ADMINISTRATOR") {
  const id = randomUUID();
  const role = await db.role.upsert({ where: { key: roleKey }, create: { key: roleKey, name: roleKey }, update: {} });
  await db.role.upsert({ where: { key: "MANAGER" }, create: { key: "MANAGER", name: "Manager" }, update: {} });
  const org = await db.organization.create({ data: { name: `Known Organization ${id}`, organizationType: "LONG_TERM_CARE" } });
  const facility = await db.facility.create({ data: { displayName: "Known Facility", organizationId: org.id, timezone: "America/Chicago", vocabularyProfile: "ltc" } });
  const user = await db.user.create({ data: { displayName: "Known Administrator", email: `admin-${id}@example.com`, roleId: role.id, facilityId: facility.id, passwordHash: "not-used-for-browser-cookie", emailVerifiedAt: new Date() } });
  await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: facility.id, rolePeriods: { create: { roleKey, startsAt: new Date("2020-01-01") } } } });
  const session = { uid: user.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: roleKey, facilityId: facility.id, name: user.displayName, email: user.email, sessionVersion: 0 } as FacilitySession;
  const token = await new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { facility, user, org, session, token };
}
async function login(context: BrowserContext, token: string) { await context.addCookies([{ name: "ltc_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]); }
async function confirmSite(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox", { name: /I confirm this is the timezone/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Which Products should this facility run?" })).toBeVisible();
}
async function skipTo(page: import("@playwright/test").Page, heading: string) {
  for (let attempt = 0; attempt < 6 && !(await page.getByRole("heading", { name: heading }).isVisible()); attempt += 1) {
    const none = page.getByRole("button", { name: "Continue with no Products", exact: true });
    const notNow = page.getByRole("button", { name: "Not now", exact: true });
    const cont = page.getByRole("button", { name: "Continue", exact: true });
    if (await none.isVisible()) await none.click();
    else if (await notNow.isVisible()) await notNow.click();
    else await cont.click();
  }
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

for (const width of [1280, 768]) test(`prefilled zero-Department entry and canonical Facility Builder intake at ${width}px`, async ({ page, context }) => {
  const f = await fixture(); await login(context, f.token); await page.setViewportSize({ width, height: 1024 });
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Set up your Vssyl" })).toBeVisible();
  await expect(page.getByLabel("Vssyl name", { exact: true })).toHaveValue("Known Facility");
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("America/Chicago");
  await expect(page.getByText(`Administrator: ${f.user.displayName} (${f.user.email})`)).toBeVisible();
  await confirmSite(page);
  await page.getByRole("button", { name: "Continue with no Products", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Map the building now?" })).toBeVisible();
  await expect(page.getByText("0 active structure locations", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Equipment", exact: true })).toHaveCount(0);
  await mkdir("tmp/onb03-browser", { recursive: true });
  await page.screenshot({ path: `tmp/onb03-browser/workspace-${width}.png`, fullPage: true });
  const before = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  expect(before.onboardingEntryConfirmedAt).not.toBeNull(); expect(before.onboardingCompletedAt).toBeNull();
  await page.getByRole("link", { name: "Map the building" }).click();
  await expect(page.getByTestId("facility-builder-page")).toBeVisible();
  await expect(page.getByTestId("workspace-shell-header")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Build Home" })).toHaveCount(0);
  await page.getByTestId(width < 1024 ? "facility-bulk-import-empty" : "facility-bulk-import-empty-editor").click();
  await expect(page.getByTestId("facility-bulk-import-panel")).toBeVisible();
  await page.getByRole("link", { name: "Back to setup" }).click();
  await expect(page.getByRole("heading", { name: "Add equipment now?" })).toBeVisible();
  expect(await db.facility.count({ where: { organizationId: f.org.id } })).toBe(1);
  expect(await db.department.count({ where: { facilityId: f.facility.id } })).toBe(0);
  const retired = await context.request.post("/api/onboarding/locations", { data: { locations: [{ name: "Must not be created" }] } });
  expect(retired.status()).toBe(410); expect(await db.unit.count({ where: { facilityId: f.facility.id } })).toBe(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("link", { name: "Map the building" }).click();
  await page.getByTestId(width < 1024 ? "add-floor-empty" : "add-floor-editor-empty").click();
  await page.getByTestId("create-floor-form").locator('input[name="name"]').fill("Setup first floor");
  await page.getByTestId("create-floor-submit").click();
  await expect.poll(() => db.unit.count({ where: { facilityId: f.facility.id, name: "Setup first floor" } })).toBe(1);
  await page.getByRole("link", { name: "Back to setup" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText(/1 active structure locations/)).toBeVisible();
  const saved = await context.request.get("/api/onboarding/state");
  expect((await saved.json()).structure.firstConfigurationAt).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByText("does not license a Product")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge guided setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(errors).toEqual([]);
});

test("two AVAILABLE selections persist through back/reload; each licensed Department names its head", async ({ page, context }) => {
  const f = await fixture(); await login(context, f.token); await page.goto("/setup");
  await confirmSite(page);
  await page.getByRole("checkbox", { name: /Food and Nutrition/ }).check();
  await page.getByRole("checkbox", { name: /Facility Plant Operations/ }).check();
  await expect(page.getByText("Environmental Services", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Food and Nutrition/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Facility Plant Operations/ })).toBeChecked();
  expect(await db.department.count({ where: { facilityId: f.facility.id } })).toBe(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Facility Plant Operations/ })).toBeChecked();
  await applyFacilitySubscription({ facilityId: f.facility.id, status: "ACTIVE", departmentKeys: ["DIETARY", "PLANT"] }, db);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who runs Food and Nutrition?" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh saved configuration and access" }).click();
  await expect(page.getByRole("heading", { name: "Operating company" })).toBeVisible();
  await expect(page.getByTestId("department-builder")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who runs Facility Plant Operations?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invite a manager now?" })).toBeVisible();
  expect(await db.department.count({ where: { facilityId: f.facility.id } })).toBe(2);
  expect(await db.departmentOperationalProfile.count({ where: { facilityId: f.facility.id, status: "ACTIVE" } })).toBe(0);
});

test("switching Facility isolates drafts and blocks submissions from a stale workspace tab", async ({ page, context }) => {
  const f = await fixture(); await login(context, f.token);
  const second = await db.facility.create({ data: { organizationId: f.org.id, displayName: "Second Facility", timezone: "UTC" } });
  await db.userFacilityAccess.create({ data: { userId: f.user.id, facilityId: second.id, rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: new Date("2020-01-01") } } } });
  await page.goto("/setup");
  await confirmSite(page);
  await page.getByRole("checkbox", { name: /Facility Plant Operations/ }).check();
  const oldTab = await context.newPage(); await oldTab.goto("/setup");
  await page.getByRole("link", { name: "Switch Facility", exact: true }).click();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Second Facility", exact: true }) }).getByRole("button", { name: "Open", exact: true }).click();
  await page.goto("/setup"); await expect(page.getByLabel("Vssyl name", { exact: true })).toHaveValue("Second Facility");
  await expect(page.getByRole("checkbox", { name: /Facility Plant Operations/ })).toHaveCount(0);
  await oldTab.getByRole("checkbox", { name: /I confirm this is the timezone/ }).check();
  await oldTab.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(oldTab.getByTestId("setup-workspace").getByRole("alert")).toContainText("Facility changed");
  expect((await db.facility.findUniqueOrThrow({ where: { id: second.id } })).onboardingCompletedAt).toBeNull();
  await page.getByRole("link", { name: "Switch Facility", exact: true }).click();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Known Facility", exact: true }) }).getByRole("button", { name: "Open", exact: true }).click();
  await page.goto("/setup"); await expect(page.getByText("Known Facility ·", { exact: false })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Facility Plant Operations/ })).toBeChecked();
});

test("manager invitation exposes unconfigured delivery and retry; recipient accepts an actual delivered token", async ({ page, context, browser }) => {
  const f = await fixture();   await login(context, f.token); await page.goto("/setup");
  await confirmSite(page);
  await skipTo(page, "Invite a manager now?");
  const email = `manager-${randomUUID()}@example.com`;
  await page.getByLabel("Manager email addresses").fill(email); await page.getByRole("button", { name: "Send manager invitations" }).click();
  await expect(page.getByRole("list", { name: "Manager invitations", exact: true })).toContainText("delivery not configured");
  expect(await db.user.count({ where: { email } })).toBe(0);
  const first = await db.onboardingManagerInvite.findFirstOrThrow({ where: { facilityId: f.facility.id, email } });
  await page.getByRole("button", { name: `Retry invitation for ${email}` }).click();
  await expect.poll(async () => (await db.onboardingManagerInvite.findUniqueOrThrow({ where: { id: first.id } })).tokenHash).not.toBe(first.tokenHash);
  await expect(page.getByRole("button", { name: `Retry invitation for ${email}` })).toBeEnabled();
  // Use the same production delivery owner with a captured transactional-email transport.
  const issued = await issueSetupManagerInvitation(db, f.session, { expectedFacilityId: f.facility.id, email, retry: true });
  let invitationUrl = "";
  await deliverSetupManagerInvitation(db, { ...issued, origin: baseURL }, { configured: () => true, send: async (input) => { invitationUrl = input.inviteUrl; return { sent: true, messageId: "captured-browser-transport" }; } });
  const recipient = await browser.newContext({ baseURL }); const invitePage = await recipient.newPage();
  await invitePage.goto(invitationUrl);
  await invitePage.getByLabel("First name", { exact: true }).fill("Casey"); await invitePage.getByLabel("Last name", { exact: true }).fill("Manager");
  await invitePage.getByLabel("Work arrangement").selectOption("PART_TIME");
  await invitePage.getByLabel("Password", { exact: true }).fill("onb03-canonical-password"); await invitePage.getByLabel("Confirm password", { exact: true }).fill("onb03-canonical-password");
  await invitePage.getByRole("button", { name: "Accept Manager invitation" }).click();
  await expect(invitePage).not.toHaveURL(/accept-invite/);
  const accepted = await db.onboardingManagerInvite.findUniqueOrThrow({ where: { id: issued.id } });
  expect(accepted.grantAcceptedAt).not.toBeNull(); expect(accepted.acceptedByUserId).not.toBeNull();
  expect(await db.employee.count({ where: { facilityId: f.facility.id, userId: accepted.acceptedByUserId } })).toBe(1);
  await page.reload(); await expect(page.getByRole("list", { name: "Manager invitations", exact: true })).toContainText("accepted");
  await recipient.close();
});

test("denied roles and existing completed customers retain the correct boundaries", async ({ page, context, browser }) => {
  const f = await fixture(); const completed = new Date("2025-01-01");
  await db.facility.update({ where: { id: f.facility.id }, data: { onboardingCompletedAt: completed, onboardingCurrentStep: "complete" } });
  await login(context, f.token); await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Set up your Vssyl" })).toBeVisible();
  await expect(page.getByText("Guided setup acknowledged.", { exact: false })).toBeVisible();
  await page.goto("/admin/facility/builder"); await expect(page.getByTestId("facility-builder-page")).toBeVisible();
  expect((await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } })).onboardingCompletedAt).toEqual(completed);
  const staff = await fixture("STAFF"), other = await browser.newContext({ baseURL }); await login(other, staff.token);
  const denied = await other.request.get("/api/onboarding/state"); expect(denied.status()).toBe(403);
  const invite = await other.request.post("/api/onboarding/managers", { data: { expectedFacilityId: staff.facility.id, emails: ["manager@example.com"] } }); expect(invite.status()).toBe(403);
  await other.close();
});


test("failed entry can be retried without losing prefilled facts or inventing progress", async ({ page, context }) => {
  const f = await fixture(); await login(context, f.token); await page.goto("/setup");
  const invalid = await context.request.patch("/api/onboarding/state", { data: { expectedFacilityId: f.facility.id, facilityName: "Known Facility", timezone: "Invalid/Timezone", confirmEntry: true } });
  expect(invalid.status()).toBe(400);
  await page.getByLabel("Vssyl name", { exact: true }).fill("Retryable Site");
  await page.getByLabel("Timezone", { exact: true }).selectOption("America/Denver");
  await page.route("**/api/onboarding/state", async (route) => {
    if (route.request().method() === "PATCH") await route.abort("failed"); else await route.continue();
  });
  await page.getByRole("checkbox", { name: /I confirm this is the timezone/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("setup-workspace").getByRole("alert")).toContainText("Check your connection and retry");
  expect((await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } })).onboardingEntryConfirmedAt).toBeNull();
  await expect(page.getByLabel("Vssyl name", { exact: true })).toHaveValue("Retryable Site");
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("America/Denver");
  await expect(page.getByRole("checkbox", { name: /I confirm this is the timezone/ })).toBeChecked();
  await page.unroute("**/api/onboarding/state");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Which Products should this facility run?" })).toBeVisible();
  expect((await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } })).displayName).toBe("Retryable Site");
});
