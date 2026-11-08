/** Show one more push and leave Chrome open. */
import { readFileSync } from "node:fs";

import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";

const file = Object.fromEntries(
  readFileSync(".env.n5dr", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") process.exit(2);
const context = await chromium.launchPersistentContext("/tmp/n5dr-chrome-profile", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
await page.goto("http://127.0.0.1:4173/account/notifications", { waitUntil: "domcontentloaded" });
const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
await sw.evaluate(async () => {
  const notes = await self.registration.getNotifications();
  await Promise.all(notes.map((note) => note.close()));
});
const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
const row = await db.pushSubscription.findFirst({ where: { userId: file.N5DR_USER_ID, revokedAt: null } });
webpush.setVapidDetails(file.VAPID_SUBJECT, file.VAPID_PUBLIC_KEY, file.VAPID_PRIVATE_KEY);
const response = await webpush.sendNotification(
  { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
  JSON.stringify({ attentionId: "cmw277zuq0003xwrbl8ai5ku3", renotify: true }),
  { TTL: 60, timeout: 10000 },
);
console.log("provider", response.statusCode);
for (let attempt = 0; attempt < 30; attempt += 1) {
  const count = await sw.evaluate(async () => (await self.registration.getNotifications()).length);
  if (count > 0) {
    console.log("banner-ready");
    break;
  }
  await page.waitForTimeout(200);
}
await db.$disconnect();
await page.waitForTimeout(40000);
const path = new URL(page.url()).pathname + new URL(page.url()).search;
console.log("final-path", path);
await context.close();
