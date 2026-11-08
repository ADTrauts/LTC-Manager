/**
 * Snooze and Quiet Hours in the signed-in Chrome profile, then sign-out.
 * Prints UI state only.
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
    const child = spawn("node", ["--import", "tsx", "scripts/n5dr/controls.ts", mode], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code));
  });
}

const context = await chromium.launchPersistentContext("/tmp/n5dr2-chrome", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
try {
  await page.goto(`${origin}/notifications`, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.locator("#email").fill(file.N5DR_EMAIL);
    await page.locator("#password").fill(file.N5DR_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    await page.goto(`${origin}/notifications`, { waitUntil: "domcontentloaded" });
  }
  const bellBefore = await page.getByTestId("attention-count").innerText().catch(() => "none");
  const items = page.getByTestId("attention-item");
  const count = await items.count();
  console.log("attention items", count, "bell", bellBefore);
  const first = items.first();
  const firstId = await first.getAttribute("data-attention-id");
  await first.getByTestId("attention-snooze").locator("summary").click();
  await first.getByRole("button", { name: "30 minutes" }).click();
  await first.getByTestId("attention-snooze-paused").waitFor({ timeout: 15000 });
  const paused = await first.getByTestId("attention-snooze-paused").innerText();
  const stillThere = await page.locator(`[data-attention-id="${firstId}"]`).count();
  const bellAfter = await page.getByTestId("attention-count").innerText().catch(() => "none");
  console.log("snooze paused", paused.replace(/\s+/g, " "));
  console.log("item remains", stillThere, "bell after", bellAfter);
  if (count > 1) {
    const second = items.nth(1);
    await second.getByTestId("attention-snooze").locator("summary").click();
    await second.getByRole("button", { name: "1 hour" }).click();
    await second.getByTestId("attention-snooze-paused").waitFor({ timeout: 15000 });
    await second.getByRole("button", { name: "Resume browser alerts" }).click();
    await second.getByTestId("attention-snooze").waitFor({ timeout: 15000 });
    console.log("second item resumed");
  }
  console.log("snooze-eval", await run("snooze"));

  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  const facilityLine = await page.getByTestId("quiet-hours").innerText();
  console.log("quiet scope", facilityLine.split("\n").find((line) => line.includes("belong")) ?? "missing");
  await page.locator('input[name="quietEnabled"]').check();
  await page.locator('input[name="quietStart"]').fill("22:00");
  await page.locator('input[name="quietEnd"]').fill("07:00");
  await page.getByRole("button", { name: "Save Quiet Hours" }).click();
  await page.getByText("Quiet Hours saved").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const overnight = {
    enabled: await page.locator('input[name="quietEnabled"]').isChecked(),
    from: await page.locator('input[name="quietStart"]').inputValue(),
    until: await page.locator('input[name="quietEnd"]').inputValue(),
  };
  console.log("quiet overnight reloaded", JSON.stringify(overnight));
  await page.locator('input[name="quietStart"]').fill("00:00");
  await page.locator('input[name="quietEnd"]').fill("23:59");
  await page.getByRole("button", { name: "Save Quiet Hours" }).click();
  await page.getByText("Quiet Hours saved").waitFor({ timeout: 15000 });
  console.log("quiet-eval", await run("quiet"));

  const logout = await page.request.post(`${origin}/api/auth/logout`, { maxRedirects: 0 });
  console.log("logout", logout.status());
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  console.log("after logout", new URL(page.url()).pathname);
  console.log("after-logout", await run("after-logout"));
} finally {
  await context.close();
}
