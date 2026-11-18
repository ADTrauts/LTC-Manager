import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { implementationRequestStorageKey } from "../../src/lib/implementation/request-id";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires disposable PostgreSQL and the matching local application.");
const db = new PrismaClient({ datasourceUrl: url });
test.afterAll(() => db.$disconnect());

test("customer request survives a lost response and reload; separate same-scope work requires a new request", async ({ page }) => {
  const password = randomUUID(), email = `request-replay-${randomUUID()}@example.invalid`;
  const passwordHash = await bcrypt.hash(password, 10);
  const f = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
    organization: { mode: "create", facilityName: "Synthetic request replay" },
    facility: { displayName: "Synthetic request replay", billingEmail: email, timezone: "America/New_York" },
    administrator: { mode: "create", email, displayName: "Synthetic Administrator", passwordHash, emailVerifiedAt: new Date() },
  }));
  const storageKey = implementationRequestStorageKey(f.user.id, f.facility.id);
  const scopeText = "Prepare the synthetic Facility setup lists";
  const submit = page.getByRole("button", { name: "Request assisted engagement", exact: true });
  const form = submit.locator("..");
  async function fillScope(target: Page) {
    const requestForm = target.getByRole("button", { name: "Request assisted engagement", exact: true }).locator("..");
    await requestForm.getByLabel("Facility Plant Operations", { exact: true }).check();
    await requestForm.getByLabel("Deliverables, one per line", { exact: true }).fill(scopeText);
  }
  let loseNextResponse = false;
  await page.route("**/admin/billing/implementation*", async route => {
    if (loseNextResponse && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      loseNextResponse = false;
      // Complete the real server action, then lose only its browser response.
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/admin/billing/implementation");
  await fillScope(page);
  loseNextResponse = true;
  await submit.click();
  await expect(form.getByRole("alert")).toContainText("Response interrupted");
  const first = await db.implementationEngagement.findFirstOrThrow({ where: { facilityId: f.facility.id } });
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBe(first.id);
  await page.reload();
  await expect(page.getByRole("link", { name: "Check previous request", exact: true })).toHaveAttribute("href", `?engagement=${first.id}`);
  // Only the identifier is restored; customer scope text is not persisted.
  await expect(form.getByLabel("Deliverables, one per line", { exact: true })).toHaveValue("");
  await fillScope(page);
  await form.getByLabel("Deliverables, one per line", { exact: true }).fill("Different requested work");
  await submit.click();
  await expect(form.getByRole("alert")).toContainText("different request");
  expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(1);
  await fillScope(page);
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`engagement=${first.id}$`));
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(await db.implementationEngagement.count({ where: { facilityId: f.facility.id } })).toBe(1);

  await page.getByRole("link", { name: "Back to all engagements / request another", exact: true }).click();
  await fillScope(page);
  loseNextResponse = true;
  await submit.click();
  await expect(form.getByRole("alert")).toContainText("Response interrupted");
  const secondId = await page.evaluate(key => sessionStorage.getItem(key), storageKey);
  expect(secondId).not.toBe(first.id);
  expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(2);
  await page.getByRole("button", { name: "Start a new request", exact: true }).click();
  expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(2);
  await submit.click();
  await expect(page).toHaveURL(/engagement=/);
  const thirdId = new URL(page.url()).searchParams.get("engagement")!;
  expect([first.id, secondId]).not.toContain(thirdId);
  const rows = await db.implementationEngagement.findMany({
    where: { facilityId: f.facility.id }, include: { participants: true, events: true, orders: true },
  });
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.requesterUserId).toBe(f.user.id);
    expect(row.participants.map(p => p.userId)).toEqual([f.user.id]);
    expect(row.events.filter(e => e.kind === "REQUESTED")).toHaveLength(1);
    expect(row.orders).toHaveLength(0);
  }
  expect(await db.supportTicket.count({ where: { facilityId: f.facility.id } })).toBe(3);
  expect(await db.facilityBilling.count({ where: { facilityId: f.facility.id } })).toBe(0);
});
