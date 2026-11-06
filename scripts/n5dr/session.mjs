/** Disable, sign out, and confirm a later outage does not send. */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

function load(path) {
  const into = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    into[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return into;
}

const file = load(".env.n5dr");
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") process.exit(2);
const origin = "http://127.0.0.1:4173";
const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
const context = await chromium.launchPersistentContext("/tmp/n5dr-chrome-profile", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  console.log("start", new URL(page.url()).pathname);
  page.on("pageerror", (error) => console.log("pageerror", error.message.slice(0, 180)));
  const state = page.getByTestId("browser-alerts-state");
  await state.waitFor({ timeout: 15000 });
  for (let attempt = 0; attempt < 2 && (await state.innerText()).includes("Checking"); attempt += 1) {
    await page.waitForTimeout(2000);
    if ((await state.innerText()).includes("Checking")) await page.reload({ waitUntil: "domcontentloaded" });
  }
  console.log("state before", await state.innerText());
  const swState = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return { regs: regs.length, controller: Boolean(navigator.serviceWorker.controller), permission: Notification.permission };
  });
  console.log("sw", JSON.stringify(swState));
  const enable = page.getByTestId("browser-alerts-enable");
  if (await enable.isVisible()) {
    await enable.click();
    await page.getByText("Enabled on this device").waitFor({ timeout: 20000 });
    console.log("re-enabled");
  }
  const disable = page.getByTestId("browser-alerts-disable");
  await disable.waitFor({ timeout: 15000 });
  await disable.click();
  await page.getByText("Not enabled").waitFor({ timeout: 15000 });
  const local = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.getSubscription();
    return { subscribed: Boolean(subscription) };
  });
  const revoked = await db.pushSubscription.findFirst({
    where: { userId: file.N5DR_USER_ID },
    orderBy: { createdAt: "desc" },
    select: { revokedAt: true, revokedReason: true },
  });
  console.log("local subscribed", local.subscribed, "server revoked", Boolean(revoked?.revokedAt), "reason", revoked?.revokedReason);

  const signedOut = await page.evaluate(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    return { status: response.status, location: response.headers.get("location") || response.url };
  });
  console.log("logout", signedOut.status);
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  console.log("after logout", new URL(page.url()).pathname);
  const active = await db.pushSubscription.count({ where: { userId: file.N5DR_USER_ID, revokedAt: null } });
  console.log("active subscriptions", active);

  const before = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
  const child = spawn("node", ["--import", "tsx", "scripts/n5dr/second-outage.ts"], { stdio: "inherit" });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  const after = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
  const queued = await db.pushDispatch.count({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: { in: ["QUEUED", "SENDING"] } },
  });
  console.log("second outage exit", code, "sent before", before, "sent after", after, "still queued", queued);

  const password = `N5dr-${Math.random().toString(36).slice(2)}A1`;
  const email = `n5dr-b-${Date.now().toString(36)}@example.test`;
  const userB = await db.user.create({
    data: {
      email,
      displayName: "N5DR Second",
      facilityId: file.N5DR_FACILITY_ID,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      primaryDepartmentId: file.N5DR_DEPARTMENT_ID,
    },
  });
  const access = await db.userFacilityAccess.create({
    data: { userId: userB.id, facilityId: file.N5DR_FACILITY_ID, isActive: true },
  });
  await db.userFacilityRolePeriod.create({
    data: { userFacilityAccessId: access.id, roleKey: "MANAGER", startsAt: new Date("2026-01-01T00:00:00.000Z") },
  });
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  const label = await page.getByTestId("browser-alerts-state").innerText();
  const owned = await db.pushSubscription.count({ where: { userId: userB.id, revokedAt: null } });
  console.log("user b state", label, "active rows", owned);
  await db.user.delete({ where: { id: userB.id } });
} finally {
  await db.$disconnect();
  await context.close();
}
