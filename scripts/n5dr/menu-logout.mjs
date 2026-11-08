/**
 * Sign out through the account menu, then confirm no later send.
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
const context = await chromium.launchPersistentContext("/tmp/n5dr2-chrome", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(file.N5DR_EMAIL);
  await page.locator("#password").fill(file.N5DR_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.locator("form button[type=submit]").click(),
  ]);
  await page.getByTestId("global-user-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();
  await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 20000 });
  const local = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return { subscribed: Boolean(subscription) };
  });
  console.log("menu logout path", new URL(page.url()).pathname, "browser subscribed", local.subscribed);
  const child = spawn("node", ["--import", "tsx", "scripts/n5dr/controls.ts", "after-logout"], { stdio: "inherit" });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  console.log("after-logout exit", code);
} finally {
  await context.close();
}
