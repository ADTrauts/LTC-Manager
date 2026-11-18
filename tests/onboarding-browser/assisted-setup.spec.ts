import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires disposable PostgreSQL and a local application build.");
const db = new PrismaClient({ datasourceUrl: url });
test.afterAll(() => db.$disconnect());

test("assisted setup resumes across browsers and starts only with an explicit Implementation request", async ({ page, browser }) => {
  const password = randomUUID();
  const email = `assisted-setup-${randomUUID()}@example.invalid`;
  const passwordHash = await bcrypt.hash(password, 10);
  const f = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
    organization: { mode: "create", facilityName: "Synthetic assisted setup" },
    facility: { displayName: "Synthetic assisted setup", billingEmail: email, timezone: "America/New_York" },
    administrator: { mode: "create", email, displayName: "Synthetic Administrator", passwordHash, emailVerifiedAt: new Date() },
  }));
  // A returning Administrator can already have confirmed the site, so the
  // fresh-browser fallback is Products rather than the first setup question.
  await db.facility.update({ where: { id: f.facility.id }, data: { onboardingEntryConfirmedAt: new Date() } });
  async function signIn(target: Page) {
    await target.goto("/login");
    await target.getByLabel("Email", { exact: true }).fill(email);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(target).toHaveURL(/\/dashboard/);
  }
  await signIn(page);
  await page.goto("/setup?review=choice");
  await page.getByRole("button", { name: /Vssyl setup/ }).click();
  await expect(page.getByRole("heading", { name: "Start the lists" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toHaveCount(3);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).first().click();
  expect((await downloadPromise).suggestedFilename()).toBe("facility-builder.csv");
  await expect(page.getByRole("link", { name: "Open the facility", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("button", { name: "I'll set it up myself", exact: true })).toBeVisible();
  expect(await db.implementationEngagement.count({ where: { facilityId: f.facility.id } })).toBe(0);
  expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(0);
  expect((await db.facilityBilling.findUniqueOrThrow({ where: { facilityId: f.facility.id } })).setupPath).toBe("ASSISTED");

  const fresh = await browser.newContext({ baseURL: process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55473" });
  try {
    const returning = await fresh.newPage();
    await signIn(returning);
    await returning.goto("/setup");
    await expect(returning.getByRole("heading", { name: "Start the lists" })).toBeVisible();
    await returning.getByRole("link", { name: "Request help with setup", exact: true }).click();
    await expect(returning).toHaveURL(/\/admin\/billing\/implementation$/);
    await expect(returning.getByTestId("implementation-workspace")).toBeVisible();
    expect(await db.implementationEngagement.count({ where: { facilityId: f.facility.id } })).toBe(0);
    const submit = returning.getByRole("button", { name: "Request assisted engagement", exact: true });
    const form = submit.locator("..");
    await form.getByLabel("Facility Plant Operations", { exact: true }).check();
    await form.getByLabel("Deliverables, one per line", { exact: true }).fill("Help map the synthetic Facility structure and prepare setup lists.");
    await submit.click();
    await expect(returning).toHaveURL(/engagement=/);
    const engagementId = new URL(returning.url()).searchParams.get("engagement")!;
    const engagement = await db.implementationEngagement.findUniqueOrThrow({
      where: { id: engagementId },
      include: { participants: true, events: true, orders: true },
    });
    expect(engagement.facilityId).toBe(f.facility.id);
    expect(engagement.requesterUserId).toBe(f.user.id);
    expect(engagement.participants.map(p => p.userId)).toEqual([f.user.id]);
    expect(engagement.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "REQUESTED", actorUserId: f.user.id })]));
    expect(engagement.orders).toHaveLength(0);
    await expect(returning.getByText("Awaiting staff assignment", { exact: false })).toBeVisible();
    await returning.getByRole("link", { name: "Return to setup", exact: true }).click();
    await expect(returning.getByRole("heading", { name: "Start the lists" })).toBeVisible();

    // An explicit review must show the choice even with a stored preference.
    await returning.goto("/setup?review=choice");
    await expect(returning.getByRole("heading", { name: "How do you want to set up?" })).toBeVisible();
    await returning.getByRole("button", { name: /Self setup/ }).click();
    await expect(returning.getByRole("heading", { name: "Which Products should this facility run?" })).toBeVisible();
    await returning.goto("/setup?review=choice");
    await returning.getByRole("button", { name: /Vssyl setup/ }).click();
    await expect(returning.getByRole("heading", { name: "Start the lists" })).toBeVisible();
    // Checkout return takes priority over both the saved and in-tab preference.
    await returning.goto("/setup?checkout=canceled");
    await expect(returning.getByRole("heading", { name: "Which Products should this facility run?" })).toBeVisible();
    await expect(returning).toHaveURL(/\/setup$/);
    await returning.reload();
    await expect(returning.getByRole("heading", { name: "Which Products should this facility run?" })).toBeVisible();
    await returning.goto("/setup?checkout=success");
    await expect(returning.getByRole("heading", { name: "Map the building now?" })).toBeVisible();
    expect(await db.implementationEngagement.count({ where: { facilityId: f.facility.id } })).toBe(1);
    expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(1);
    expect(await db.department.count({ where: { facilityId: f.facility.id } })).toBe(0);
    const billing = await db.facilityBilling.findUniqueOrThrow({ where: { facilityId: f.facility.id }, include: { entitlements: true } });
    expect(billing.status).toBe("UNMANAGED");
    expect(billing.stripeSubscriptionId).toBeNull();
    expect(billing.entitlements).toHaveLength(0);
  } finally { await fresh.close(); }
});
