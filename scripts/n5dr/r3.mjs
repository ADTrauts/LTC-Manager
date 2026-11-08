/**
 * Account-menu logout and Quiet Hours in desktop Chrome.
 * Prints statuses only.
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

function run(mode) {
  return new Promise((resolve) => {
    const child = spawn("node", ["--import", "tsx", "scripts/n5dr/r3-check.ts", mode], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code));
  });
}

const context = await chromium.launchPersistentContext("/tmp/n5dr3-chrome", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
page.on("dialog", (dialog) => dialog.dismiss());
try {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  const emailInstead = page.getByRole("button", { name: "Sign in with email instead" });
  if (await emailInstead.count()) await emailInstead.click();
  await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#email").evaluate((element, value) => {
    const prototype = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    prototype.set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, file.N5DR_EMAIL);
  await page.locator("#password").evaluate((element, value) => {
    const prototype = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    prototype.set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, file.N5DR_PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("browser-alerts-enable").click();
  await page.getByText("Enabled on this device").waitFor({ timeout: 20000 });
  console.log("enabled");
  console.log("status", await run("status"));
  console.log("outside", await run("assign"));
  console.log("banner-hold");
  await page.waitForTimeout(20000);
  console.log("after-banner path", new URL(page.url()).pathname);

  await page.locator('input[name="quietEnabled"]').check();
  await page.locator('input[name="quietStart"]').fill("00:00");
  await page.locator('input[name="quietEnd"]').fill("23:59");
  await page.getByRole("button", { name: "Save Quiet Hours" }).click();
  await page.getByText("Quiet Hours saved").waitFor({ timeout: 15000 });
  console.log("inside", await run("assign"));
  console.log("attention", await run("attention"));
  console.log("queue", await run("queue"));

  const logoutResponse = page.waitForResponse(
    (response) => response.url().includes("/api/auth/logout") && response.request().method() === "POST",
  );
  await page.getByTestId("global-user-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();
  const response = await logoutResponse;
  const body = await response.json().catch(() => null);
  console.log(
    "logout",
    response.request().method(),
    new URL(response.url()).pathname,
    response.status(),
    "cookie-sent",
    response.request().headers()["cookie"] ? "yes" : "no",
    "outcome",
    body?.outcome ?? "none",
  );
  await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 20000 });
  const local = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { subscribed: Boolean(await registration?.pushManager.getSubscription()) };
  });
  console.log("landed", new URL(page.url()).pathname, "browser subscribed", local.subscribed);
  console.log("revocation", await run("revocation"));
  console.log("deliver", await run("deliver-queued"));
  console.log("later", await run("after"));
} finally {
  await context.close();
}
