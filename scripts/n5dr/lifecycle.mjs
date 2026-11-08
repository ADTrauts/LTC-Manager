/**
 * Fresh Chrome subscription and the first canonical delivery.
 * Does not print endpoints, keys, or passwords.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const file = Object.fromEntries(
  readFileSync(".env.n5dr", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") process.exit(2);

const origin = "http://127.0.0.1:4173";
const logs = [];
const context = await chromium.launchPersistentContext("/tmp/n5dr2-chrome", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
context.on("serviceworker", (worker) => {
  worker.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("vssyl-click")) logs.push(text);
  });
});
const page = context.pages()[0] || (await context.newPage());
page.on("console", (message) => {
  const text = message.text();
  if (text.startsWith("vssyl-click")) logs.push(`page ${text}`);
});

try {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(file.N5DR_EMAIL);
  await page.locator("#password").fill(file.N5DR_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("browser-alerts-enable").click();
  await page.getByText("Enabled on this device").waitFor({ timeout: 20000 });
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    let host = "";
    try {
      host = subscription ? new URL(subscription.endpoint).host : "";
    } catch {
      host = "unreadable";
    }
    return {
      scope: registration?.scope ?? "",
      script: registration?.active?.scriptURL ?? "",
      controller: Boolean(navigator.serviceWorker.controller),
      permission: Notification.permission,
      host,
      keyBytes: subscription ? subscription.getKey("p256dh")?.byteLength ?? 0 : 0,
    };
  });
  console.log("worker", JSON.stringify(worker));
  const child = spawn("node", ["--import", "tsx", "scripts/n5dr/trigger.ts"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  console.log(output.trim());
  console.log("trigger exit", code);
  let shown = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    shown = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const notes = (await registration?.getNotifications()) ?? [];
      return notes.map((note) => ({
        title: note.title,
        body: note.body,
        tag: note.tag,
        dataKeys: Object.keys(note.data ?? {}),
      }));
    });
    if (shown.length) break;
    await page.waitForTimeout(1000);
  }
  console.log("shown", JSON.stringify(shown));
  console.log("click-log-before", logs.join(" | ") || "none");
  console.log("banner-ready");
  await page.waitForTimeout(45000);
  console.log("final-path", new URL(page.url()).pathname + new URL(page.url()).search);
  console.log("click-log", logs.join(" | ") || "none");
} finally {
  await context.close();
}
