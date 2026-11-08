/**
 * Account-menu Sign out against the already signed-in Chrome profile.
 * Prints statuses only.
 */
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

const context = await chromium.launchPersistentContext("/tmp/n5dr3-chrome", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
page.on("dialog", async (dialog) => {
  console.log("dialog", dialog.message());
  await dialog.dismiss();
});
page.on("request", (request) => {
  if (!request.url().includes("/api/auth/logout")) return;
  console.log(
    "request",
    request.method(),
    new URL(request.url()).pathname,
    "cookie-sent",
    request.headers()["cookie"] ? "yes" : "no",
    "json",
    (request.headers()["content-type"] ?? "").includes("application/json") ? "yes" : "no",
  );
});
page.on("response", async (response) => {
  if (!response.url().includes("/api/auth/logout")) return;
  const body = await response.json().catch(() => null);
  const headers = await response.allHeaders();
  const setCookie = headers["set-cookie"] ?? "";
  const flags = ["ltc_session", "max-age=0", "secure", "samesite=lax", "httponly", "path=/"].filter((flag) =>
    setCookie.toLowerCase().includes(flag),
  );
  console.log("response", response.status(), "outcome", body?.outcome ?? "none", "set-cookie", flags.join(",") || "none");
});
try {
  await page.goto(`${origin}/account/notifications`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname.startsWith("/login")) {
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
  }
  console.log("page", new URL(page.url()).pathname);
  const localBefore = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { subscribed: Boolean(await registration?.pushManager.getSubscription()) };
  });
  console.log("before subscribed", localBefore.subscribed);
  const accountTrigger = page.getByTestId("account-menu-trigger");
  const globalTrigger = page.getByTestId("global-user-menu-trigger");
  const trigger = (await accountTrigger.count()) ? accountTrigger : globalTrigger;
  console.log("account-menu", await accountTrigger.count(), "global-menu", await globalTrigger.count());
  await trigger.click();
  const signOut = page.getByTestId("account-menu-sign-out");
  await signOut.waitFor({ state: "visible", timeout: 10000 });
  await signOut.click();
  await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 20000 });
  const local = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { subscribed: Boolean(await registration?.pushManager.getSubscription()) };
  });
  console.log("landed", new URL(page.url()).pathname, "browser subscribed", local.subscribed);
} finally {
  await context.close();
}
