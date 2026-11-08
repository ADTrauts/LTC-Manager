/**
 * Reopen the subscribed Chrome profile, send a second outage, and record a click.
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
try {
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.locator("#email").fill(file.N5DR_EMAIL);
    await page.locator("#password").fill(file.N5DR_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(1500);
  const child = spawn("node", ["--import", "tsx", "scripts/n5dr/second-outage.ts"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  console.log(output.trim());
  console.log("second exit", code);
  let shown = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    shown = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const notes = (await registration?.getNotifications()) ?? [];
      return notes.map((note) => ({ title: note.title, body: note.body, tag: note.tag }));
    });
    if (shown.length) break;
    await page.waitForTimeout(1000);
  }
  console.log("shown", JSON.stringify(shown));
  console.log("banner-ready");
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 70000) {
    const path = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
    if (path !== last) {
      console.log("path", path);
      last = path;
    }
    await page.waitForTimeout(1000);
  }
  console.log("click-log", logs.join(" | ") || "none");
} finally {
  await context.close();
}
