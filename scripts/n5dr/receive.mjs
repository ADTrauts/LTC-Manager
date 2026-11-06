/** Open the existing Chrome profile, deliver the queued dispatch, and print the shown notification. */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

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

const origin = "http://127.0.0.1:4173";
const file = load(".env.n5dr");
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") process.exit(2);

const context = await chromium.launchPersistentContext("/tmp/n5dr-chrome-profile", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
try {
  console.log("chrome", context.browser()?.version());
  await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const worker = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return {
      path: location.pathname,
      secure: window.isSecureContext,
      controller: Boolean(navigator.serviceWorker.controller),
      scope: ready.scope,
      script: ready.active ? new URL(ready.active.scriptURL).pathname : null,
      permission: Notification.permission,
    };
  });
  console.log("worker", JSON.stringify(worker));
  const child = spawn("node", ["--import", "tsx", "scripts/n5dr/deliver.ts"], { stdio: "inherit" });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  console.log("deliver exit", code);
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 10000 }));
  let shown = [];
  for (let attempt = 0; attempt < 25; attempt += 1) {
    shown = await sw.evaluate(async () => {
      const notes = await self.registration.getNotifications();
      return notes.map((note) => ({ title: note.title, body: note.body, tag: note.tag, dataKeys: note.data ? Object.keys(note.data) : [] }));
    });
    if (shown.length > 0) break;
    await page.waitForTimeout(1000);
  }
  console.log("displayed", JSON.stringify(shown));
  if (shown.length > 0) {
    console.log("holding for observation");
    await page.waitForTimeout(25000);
    const clicked = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const notes = await registration.getNotifications();
      return notes.length;
    });
    console.log("page visible count", clicked, "path", new URL(page.url()).pathname);
  }
} finally {
  await context.close();
}
