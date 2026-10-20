import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";
import { postmarkInboundPayload } from "../../src/lib/support/fixtures/postmark-inbound";
import { parsePostmarkInbound } from "../../src/lib/support/inbound-email";
import { processInboundSupportEmail } from "../../src/lib/support/inbound-service";

const url = process.env.VERIFY_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
test.skip(!url, "Requires an isolated database and matching local server");
const db = new PrismaClient({ datasources: { db: { url } } });
test.afterAll(() => db.$disconnect());
async function ticket(tag: string) {
  const parsed = parsePostmarkInbound(postmarkInboundPayload({ messageId: tag, fromEmail: `${tag}@example.test`, subject: `Synthetic support ${tag}`, textBody: "Local verification only", attachments: false }));
  if (!parsed.ok) throw new Error("Invalid synthetic inbound fixture");
  const result = await processInboundSupportEmail(db, parsed.email);
  if (result.result === "ignored") throw new Error("Synthetic fixture unexpectedly ignored");
  return result.ticketId;
}
for (const width of [1280, 768]) {
  test(`support draft, refresh and notification recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const tag = randomUUID();
    const password = "Onb07-Synthetic-Staff!";
    const staff = await db.platformStaff.create({ data: { email: `ui-${tag}@example.test`, displayName: "Synthetic release verifier", role: "OWNER", passwordHash: await bcrypt.hash(password, 4) } });
    const first = await ticket(`first-${tag}`), second = await ticket(`second-${tag}`);
    const login = await page.request.post("/api/console/auth/login", { data: { email: staff.email, password } });
    expect(login.ok(), await login.text()).toBe(true);
    await page.goto(`/console/tickets/${first}`);
    const body = page.getByRole("textbox", { name: "Reply to customer", exact: true });
    await body.fill("Draft A — retain 00123 and customer review notes");
    const status = page.getByRole("combobox", { name: /Status after reply/ });
    await status.selectOption({ index: 1 });
    const selectedStatus = await status.inputValue();
    await page.reload();
    await expect(body).toHaveValue("Draft A — retain 00123 and customer review notes");
    await expect(status).toHaveValue(selectedStatus);
    await page.goto(`/console/tickets/${second}`);
    await expect(body).toHaveValue("");
    await body.fill("Draft B stays on ticket B");
    await page.goto(`/console/tickets/${first}`);
    await expect(body).toHaveValue("Draft A — retain 00123 and customer review notes");
    await page.getByRole("button", { name: /Support notifications/ }).click();
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await expect.poll(() => db.supportStaffNotification.count({ where: { staffId: staff.id, isRead: false } })).toBe(0);
    await ticket(`third-${tag}`);
    await page.reload();
    await expect(page.getByRole("button", { name: "Support notifications, 1 unread", exact: true })).toBeVisible();
    await expect(body).toHaveValue("Draft A — retain 00123 and customer review notes");
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.screenshot({ path: `tmp/onb07-stabilization/support-${width}.png`, fullPage: true });
  });
  test(`verification failure recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let posts = 0;
    page.on("request", (request) => { if (request.url().includes("/email-verification/confirm") && request.method() === "POST") posts++; });
    await page.goto("/verify-email");
    await expect(page.locator("p[role=alert]")).toContainText("missing a token");
    expect(posts).toBe(0);
    const response = page.waitForResponse((r) => r.url().includes("/email-verification/confirm") && r.request().method() === "POST");
    await page.goto("/verify-email?token=invalid-local-token");
    expect((await response).ok()).toBe(false);
    await expect(page.locator("p[role=alert]")).toContainText(/invalid|expired|verify/i);
    await expect(page.getByRole("link", { name: "Resend verification email" })).toHaveAttribute("href", "/check-email");
  });
}
test("tablet navigation drawer closes and restores focus after reopen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  const fixture = JSON.parse(readFileSync("tmp/assignment-browser-artifacts/fixtures.json", "utf8")) as { supervisorEmail: string };
  const login = await page.request.post("/api/auth/login", { data: { email: fixture.supervisorEmail, password: process.env.SEED_DEMO_PASSWORD } });
  expect(login.ok(), await login.text()).toBe(true);
  await page.goto("/today");
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(drawer.getByTestId("drawer-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(60); // The shared drawer deliberately arms its backdrop after 50ms.
  await drawer.getByTestId("drawer-backdrop").click({ position: { x: 740, y: 500 } });
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
