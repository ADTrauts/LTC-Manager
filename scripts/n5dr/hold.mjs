/** Leave the certified Chrome profile open so a shown notification can be observed. */
import { chromium } from "@playwright/test";

const origin = "http://127.0.0.1:4173";
const context = await chromium.launchPersistentContext("/tmp/n5dr-chrome-profile", {
  channel: "chrome",
  headless: false,
  permissions: ["notifications"],
});
const page = context.pages()[0] || (await context.newPage());
await page.goto(`${origin}/account/notifications`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 10000 }));
const shown = await sw.evaluate(async () => {
  const notes = await self.registration.getNotifications();
  return notes.map((note) => ({ title: note.title, body: note.body, tag: note.tag }));
});
console.log("still-displayed", JSON.stringify(shown));
console.log("pid-hold");
await page.waitForTimeout(90000);
await context.close();
