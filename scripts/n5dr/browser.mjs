/**
 * Desktop Chrome certification against the isolated production server.
 * Prints statuses and notification text. Does not print endpoints or keys.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

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
const origin = process.argv[2] || "http://127.0.0.1:4173";
const parsed = new URL(file.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/ltc_verify_n1a") {
  throw new Error("refusing browser run against a non-disposable database");
}

const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
const context = await chromium.launchPersistentContext("/tmp/n5dr-chrome-profile", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
page.on("console", (msg) => {
  const text = msg.text();
  if (/endpoint|p256|auth|vapid|bearer|token/i.test(text)) return;
  console.log("browser", msg.type(), text.slice(0, 180));
});

try {
  const version = context.browser()?.version() ?? "unknown";
  console.log("chrome", version);
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  console.log("title", await page.title());
  await page.locator("#email").fill(file.N5DR_EMAIL);
  await page.locator("#password").fill(file.N5DR_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  console.log("signed-in path", new URL(page.url()).pathname);

  await page.goto(`${origin}/account/notifications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const worker = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const ready = await navigator.serviceWorker.ready;
    return {
      secure: window.isSecureContext,
      push: typeof PushManager,
      permission: Notification.permission,
      controller: Boolean(navigator.serviceWorker.controller),
      scope: ready.scope,
      script: ready.active ? ready.active.scriptURL : null,
      registrations: regs.length,
    };
  });
  console.log("worker", JSON.stringify(worker));
  if (!worker.controller) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  }
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  console.log("controlled after reload", controlled);

  const enable = page.getByTestId("browser-alerts-enable");
  await enable.waitFor({ timeout: 15000 });
  await enable.click();
  const enabled = page.getByText("Enabled on this device");
  const message = page.getByTestId("browser-alerts-message");
  const result = await Promise.race([
    enabled.waitFor({ timeout: 25000 }).then(() => "enabled"),
    message.waitFor({ timeout: 25000 }).then(async () => `message:${await message.innerText()}`),
  ]);
  console.log("enable result", result);
  if (result !== "enabled") throw new Error(result);

  const row = await db.pushSubscription.findFirst({
    where: { userId: file.N5DR_USER_ID, revokedAt: null },
    select: { id: true, userId: true, authorizedUntil: true, authorizedSessionVersion: true, revokedAt: true },
  });
  console.log(
    "subscription",
    row
      ? `present lease=${row.authorizedUntil && row.authorizedUntil > new Date() ? "future" : "missing"} version=${row.authorizedSessionVersion != null}`
      : "missing",
  );
  const ui = await page.locator("body").innerText();
  console.log("ui leaks endpoint", /https:\/\/.*push|p256dh|auth key/i.test(ui));

  const trigger = spawn("node", ["--import", "tsx", "scripts/n5dr/trigger.ts"], { stdio: "inherit" });
  const code = await new Promise((resolve) => trigger.on("exit", resolve));
  console.log("trigger exit", code);

  const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null));
  let shown = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!sw) break;
    shown = await sw.evaluate(async () => {
      const notes = await self.registration.getNotifications();
      return notes.map((note) => ({ title: note.title, body: note.body, tag: note.tag }));
    });
    if (shown.length > 0) break;
    await page.waitForTimeout(1500);
  }
  console.log("displayed", JSON.stringify(shown));

  const sent = await db.pushDispatch.findMany({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
    select: { status: true, attemptCount: true, lastErrorCode: true },
  });
  console.log("dispatch rows", sent.map((row) => `${row.status}:${row.attemptCount}:${row.lastErrorCode ?? "none"}`).join(" | ") || "none");

  if (shown.length > 0 && sw) {
    const clicked = await sw.evaluate(async () => {
      const notes = await self.registration.getNotifications();
      const note = notes[0];
      if (!note) return "missing";
      note.dispatchEvent(new Event("click"));
      return "dispatched";
    }).catch((error) => `click-eval-failed ${error instanceof Error ? error.message : "error"}`);
    console.log("notification click attempt", clicked);
    await page.waitForTimeout(2000);
    console.log("after click path", new URL(page.url()).pathname + new URL(page.url()).search);
  }
} finally {
  await db.$disconnect();
  await context.close();
}
