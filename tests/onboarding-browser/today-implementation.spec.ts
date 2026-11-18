import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { bootstrapFacilityCustomer } from "../../src/lib/facility-provisioning/bootstrap";
import { HARBOR_WORK_CLEANUP_PATH } from "../../src/lib/harbor-console/session";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires disposable PostgreSQL and a matching local application.");
const db = new PrismaClient({ datasourceUrl: url });
test.afterAll(() => db.$disconnect());

test("Member claims intake and returns through My assigned work; retired context preserves the other queues", async ({ page, browser, baseURL }) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !baseURL) throw new Error("Provide the disposable local server secret and origin.");
  const customerPassword = randomUUID(), staffPassword = randomUUID();
  const customerHash = await bcrypt.hash(customerPassword, 10), staffHash = await bcrypt.hash(staffPassword, 10);
  const email = `today-customer-${randomUUID()}@example.invalid`;
  const f = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
    organization: { mode: "create", facilityName: "Synthetic Today Facility", organizationName: "Synthetic Today Organization" },
    facility: { displayName: "Synthetic Today Facility", billingEmail: email, timezone: "America/New_York" },
    administrator: { mode: "create", email, displayName: "Synthetic Administrator", passwordHash: customerHash, emailVerifiedAt: new Date() },
  }));
  const staff = await db.platformStaff.create({ data: {
    email: `today-member-${randomUUID()}@example.invalid`, displayName: "Synthetic Today Member", role: "MEMBER", passwordHash: staffHash,
  } });
  async function login(target: Page, kind: "customer" | "staff", loginEmail: string, password: string) {
    const path = kind === "staff" ? "/console/login" : "/login";
    await target.goto(path);
    await target.getByLabel("Email", { exact: true }).fill(loginEmail);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: kind === "staff" ? "Sign in" : "Continue", exact: true }).click();
    await expect(target).not.toHaveURL(new RegExp(`${path}$`));
  }
  await login(page, "customer", email, customerPassword);
  await page.goto("/admin/billing/implementation");
  const scopeText = "PRIVATE SYNTHETIC SETUP SCOPE";
  const submit = page.getByRole("button", { name: "Request assisted engagement", exact: true });
  const form = submit.locator("..");
  await form.getByLabel("Facility Plant Operations", { exact: true }).check();
  await form.getByLabel("Deliverables, one per line", { exact: true }).fill(scopeText);
  await submit.click();
  await expect(page).toHaveURL(/engagement=/);
  const engagementId = new URL(page.url()).searchParams.get("engagement")!;
  const staffContext = await browser.newContext({ baseURL });
  try {
    const consolePage = await staffContext.newPage();
    await login(consolePage, "staff", staff.email, staffPassword);
    await consolePage.goto("/console");
    const queue = consolePage.getByRole("region", { name: "Unassigned Implementation requests", exact: true });
    const mine = consolePage.getByRole("region", { name: "My assigned Implementation work", exact: true });
    await expect(mine).toContainText("Showing 0 of 0 requests assigned to you.");
    await expect(queue).toContainText("Showing 1 of 1 unassigned requests.");
    await expect(queue).toContainText(f.facility.displayName);
    await expect(queue).toContainText(f.organization.name);
    await expect(queue).toContainText("Requested");
    expect(await consolePage.content()).not.toContain(scopeText);
    const all = queue.getByRole("link", { name: "View unassigned work in Customers", exact: true });
    await expect(all).toHaveAttribute("href", "/console/customers?work=unassigned");
    await all.click();
    await expect(consolePage.getByRole("combobox", { name: "Implementation work", exact: true })).toHaveValue("unassigned");
    await expect(consolePage.getByRole("link", { name: f.facility.displayName, exact: true })).toBeVisible();
    await consolePage.goto("/console");
    const href = `/console/customers/${f.facility.id}/implementation?engagement=${engagementId}`;
    await queue.getByRole("link", { name: new RegExp(f.facility.displayName) }).click();
    await expect(consolePage).toHaveURL(new URL(href, baseURL).href);
    await expect(consolePage.getByTestId("implementation-workspace").getByRole("alert")).toContainText("Claim or obtain explicit participation");
    expect(await consolePage.content()).not.toContain(scopeText);
    await consolePage.getByRole("button", { name: "Assign responsible staff", exact: true }).click();
    await expect(consolePage.getByText("Responsible staff: Synthetic Today Member", { exact: true })).toBeVisible();
    await expect(consolePage.getByRole("textbox", { name: "Deliverables, one per line", exact: true })).toHaveValue(scopeText);
    const claimed = await db.implementationEngagement.findUniqueOrThrow({ where: { id: engagementId } });
    expect(claimed.responsibleStaffId).toBe(staff.id);
    expect(await db.implementationParticipant.count({ where: { engagementId, staffId: staff.id } })).toBe(1);
    expect(await db.implementationEvent.count({ where: { engagementId, kind: "ASSIGNED", actorStaffId: staff.id } })).toBe(1);
    await consolePage.goto("/console");
    await expect(queue).toContainText("No Implementation requests are awaiting staff assignment.");
    await expect(queue).toContainText("Showing 0 of 0 unassigned requests.");
    await expect(mine).toContainText("Showing 1 of 1 requests assigned to you.");
    expect(await consolePage.content()).not.toContain(scopeText);
    const myCustomers = mine.getByRole("link", { name: "View my assigned work in Customers", exact: true });
    await expect(myCustomers).toHaveAttribute("href", "/console/customers?work=assigned");
    await myCustomers.click();
    // A caller-supplied staff ID cannot select a different responsibility scope.
    await consolePage.goto(`/console/customers?work=assigned&staffId=${randomUUID()}`);
    await expect(consolePage.getByRole("combobox", { name: "Implementation work", exact: true })).toHaveValue("assigned");
    await consolePage.getByRole("searchbox", { name: "Search name or email", exact: true }).fill(f.facility.displayName);
    await consolePage.getByRole("combobox", { name: "Guided setup", exact: true }).selectOption("awaiting");
    await consolePage.getByRole("button", { name: "Search", exact: true }).click();
    await expect(consolePage).toHaveURL(/work=assigned/);
    await expect(consolePage).toHaveURL(/setup=awaiting/);
    await expect(consolePage.getByRole("link", { name: f.facility.displayName, exact: true })).toBeVisible();
    await consolePage.goto("/console");
    await mine.getByRole("link", { name: new RegExp(f.facility.displayName) }).click();
    await expect(consolePage).toHaveURL(new URL(href, baseURL).href);
    await expect(consolePage.getByRole("textbox", { name: "Deliverables, one per line", exact: true })).toHaveValue(scopeText);
    expect(await db.implementationEvent.count({ where: { engagementId, kind: "ASSIGNED" } })).toBe(1);

    const retired = await new SignJWT({ tokenUse: "harbor_work", staffId: staff.id, facilityId: f.facility.id })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(secret));
    await staffContext.addCookies([{ name: "harbor_work", value: retired, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
    await consolePage.goto("/console");
    await expect(consolePage.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(queue).toContainText("unavailable while a retired Facility work context is present");
    await expect(queue).not.toContainText("Showing 0 of 0");
    await expect(mine).toContainText("unavailable while a retired Facility work context is present");
    await expect(mine).not.toContainText("Showing 1 of 1");
    for (const title of ["New tickets", "Guided setup follow-up", "Payment problems"]) {
      await expect(consolePage.getByRole("region", { name: title, exact: true })).toBeVisible();
    }
    const cleanup = queue.getByRole("link", { name: "Clear retired Facility context", exact: true });
    await expect(cleanup).toHaveAttribute("href", HARBOR_WORK_CLEANUP_PATH);
    await cleanup.click();
    await consolePage.getByRole("button", { name: "Clear old work session", exact: true }).click();
    await expect(consolePage).toHaveURL(/\/console\/customers$/);
    await consolePage.goto("/console");
    await expect(queue).toContainText("Showing 0 of 0 unassigned requests.");
    await expect(mine).toContainText("Showing 1 of 1 requests assigned to you.");
    expect((await staffContext.cookies()).some(c => c.name === "harbor_work")).toBe(false);
  } finally { await staffContext.close(); }
});
