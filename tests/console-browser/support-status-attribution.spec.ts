import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";

import { createSupportTicket } from "../../src/lib/support/ticket-service";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

test("Support ticket history shows the Facility from the manual status change", async ({ browser, baseURL }) => {
  const databaseUrl = process.env.CONSOLE_BROWSER_DATABASE_URL;
  test.skip(!databaseUrl, "Requires a disposable PostgreSQL browser build.");
  if (assertDisposableDatabaseUrl(databaseUrl).host !== "127.0.0.1" ||
      !baseURL || new URL(baseURL).hostname !== "127.0.0.1") {
    throw new Error("Use the disposable loopback build.");
  }
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const key = randomUUID();
  const password = randomUUID();
  const staffBrowser = await browser.newContext({ baseURL });
  const customerBrowser = await browser.newContext({ baseURL });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const org = await db.organization.create({ data: { name: key } });
    const [oldFacility, newFacility] = await Promise.all([
      db.facility.create({ data: { organizationId: org.id, displayName: `Original Facility ${key}`, onboardingCompletedAt: new Date() } }),
      db.facility.create({ data: { organizationId: org.id, displayName: `Reassigned Facility ${key}`, onboardingCompletedAt: new Date() } }),
    ]);
    const staff = await db.platformStaff.create({
      data: { email: `harbor-${key}@example.invalid`, displayName: "Synthetic Support staff", passwordHash, role: "MEMBER" },
    });
    const role = await db.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {},
      create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" },
    });
    const customer = await db.user.create({ data: {
      facilityId: oldFacility.id, roleId: role.id, displayName: "Synthetic customer",
      email: `customer-${key}@example.invalid`, passwordHash, emailVerifiedAt: new Date(),
      facilityAccesses: { create: { facilityId: oldFacility.id, rolePeriods: { create: {
        startsAt: new Date("2020-01-01Z"), roleKey: "FACILITY_ADMINISTRATOR",
      } } } },
    } });
    const subject = `Facility attribution ${key}`;
    const ticket = await createSupportTicket(db, {
      actorStaffId: staff.id, requesterEmail: customer.email, subject, facilityId: oldFacility.id,
    });
    const legacyCanary = randomUUID();
    await db.supportTicketEvent.create({ data: {
      ticketId: ticket.id, type: "STATUS_CHANGED", actorStaffId: staff.id, fromValue: "NEW", toValue: "OPEN",
      metadata: { source: "LEGACY_FIXTURE", privateNote: legacyCanary },
    } });

    const path = `/console/tickets/${ticket.id}`;
    const customerPage = await customerBrowser.newPage();
    await customerPage.goto("/login");
    await customerPage.getByLabel("Email").fill(customer.email);
    await customerPage.getByLabel("Password").fill(password);
    await customerPage.getByRole("button", { name: "Continue", exact: true }).click();
    await customerPage.waitForURL((url) => url.pathname !== "/login");
    await customerPage.goto(path);
    await expect(customerPage).toHaveURL(/\/console\/login/);
    await expect(customerPage.getByText(subject)).toHaveCount(0);
    expect(await db.supportTicketEvent.count({ where: { ticketId: ticket.id, type: "STATUS_CHANGED" } })).toBe(1);

    const page = await staffBrowser.newPage();
    await page.goto("/console/login");
    await page.getByLabel("Email").fill(staff.email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname !== "/console/login");
    await page.goto(path);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await page.getByLabel("New status").selectOption("RESOLVED");
    await page.getByRole("button", { name: "Change status", exact: true }).click();

    const event = page.getByRole("listitem").filter({ hasText: "Status changed from Open to Resolved" });
    await expect(event).toContainText(`Facility at status change: ${oldFacility.displayName}`);
    await expect(event).toContainText(staff.displayName);
    await expect(event).not.toContainText(oldFacility.id);
    expect(await db.supportTicket.findUnique({ where: { id: ticket.id }, select: { status: true } })).toEqual({ status: "RESOLVED" });

    await page.locator('select[name="facilityId"]').selectOption(newFacility.id, { timeout: 15000 });
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(page.getByRole("link", { name: newFacility.displayName, exact: true })).toBeVisible();
    await expect(event).toContainText(`Facility at status change: ${oldFacility.displayName}`);
    const legacy = page.getByRole("listitem").filter({ hasText: "Status changed from New to Open" });
    await expect(legacy).toBeVisible();
    await expect(legacy).not.toContainText("Facility at status change");
    await expect(page.locator("body")).not.toContainText(legacyCanary);
  } finally {
    await Promise.allSettled([staffBrowser.close(), customerBrowser.close()]);
    await db.$disconnect();
  }
});
