/**
 * Walk the Terrace View acceptance pattern on the staging preview.
 * Reads the login file and a local Vercel OIDC token. Prints neither.
 */
import { readFileSync } from "node:fs";

import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.CDA07_BASE_URL || "https://ltc-manager-staging-be5pcnkza-adtrauts-projects.vercel.app";
const VIEW_REASON = "You can view this Department. Changes are made by its head and team.";

type Logins = {
  password: string;
  dietaryId: string;
  plantId: string;
  sodexoOrganizationId: string;
  partnershipId: string;
  fa: string;
  metzGm: string;
  sodexoAdmin: string;
};

function quoted(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}="(.*)"$`, "m"));
  if (!match) throw new Error(`missing ${key}`);
  return match[1].replace(/\\n/g, "\n");
}

async function signIn(context: BrowserContext, email: string, password: string): Promise<Page> {
  const page = await context.newPage();
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
    headers: { "content-type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(`login failed status=${response.status()} email=${email}`);
  }
  return page;
}

async function main() {
  const logins = JSON.parse(readFileSync("/tmp/cda07-terrace-logins.json", "utf8")) as Logins;
  const headers: Record<string, string> = {};
  if (BASE.includes(".vercel.app")) {
    headers["x-vercel-trusted-oidc-idp-token"] = quoted(
      readFileSync("/tmp/cda07-staging-link/.env.local", "utf8"),
      "VERCEL_OIDC_TOKEN",
    );
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE,
    extraHTTPHeaders: headers,
  });
  try {
    const fa = await signIn(context, logins.fa, logins.password);
    await fa.goto("/admin/departments", { waitUntil: "domcontentloaded" });
    await expect(fa.getByRole("heading", { name: "Departments", exact: true })).toBeVisible({ timeout: 60_000 });
    const food = fa.getByRole("listitem").filter({ hasText: "Food & Nutrition" });
    await expect(food).toContainText("You can open its compliance Records.");
    await expect(food.getByTestId("department-compliance-records")).toBeVisible();
    const plant = fa.getByRole("listitem").filter({ hasText: "Plant Operations" });
    await expect(plant).toContainText("Department Manager: Plant Head");
    await expect(plant.getByTestId("manage-department")).toBeVisible();
    await expect(fa.getByText("Environmental Services")).toHaveCount(0);

    await food.getByTestId("department-compliance-records").click();
    await fa.waitForURL(/\/staffing\/log-book/, { timeout: 30_000 });
    const logBook = fa.getByTestId("evidence-log-book");
    try {
      await expect(logBook).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const text = (await fa.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500);
      throw new Error(`log book missing at ${fa.url()} :: ${text}`, { cause: error });
    }
    await expect(fa.getByTestId("evidence-log-book")).toContainText("Sodexo cooler");
    await expect(fa.getByTestId("evidence-log-book")).toContainText("Metz cooler");

    await context.addCookies([
      { name: "ltc_active_department", value: logins.plantId, url: BASE },
    ]);
    await fa.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
    await expect(fa.getByTestId("department-view-notice")).toContainText(VIEW_REASON);

    await context.addCookies([
      { name: "ltc_active_department", value: logins.dietaryId, url: BASE },
    ]);
    await fa.goto("/staffing/work-plans", { waitUntil: "domcontentloaded" });
    await expect(fa.getByTestId("work-plan-builder-denied")).toBeVisible();
    await fa.close();

    const vendor = await signIn(context, logins.metzGm, logins.password);
    await vendor.goto("/access", { waitUntil: "domcontentloaded" });
    const openPartner = vendor
      .locator(`form:has([name="contextKey"][value="facility_partner:${logins.partnershipId}"])`)
      .getByRole("button", { name: "Open" });
    await Promise.all([
      vendor.waitForURL((url) => url.pathname === "/partner", { timeout: 45_000 }),
      openPartner.click(),
    ]);
    await vendor.goto("/partner/people", { waitUntil: "domcontentloaded" });
    await expect(vendor.getByTestId("vendor-people-page")).toBeVisible();
    await expect(vendor.getByTestId("vendor-person")).toHaveCount(1);
    await expect(vendor.getByTestId("vendor-person")).toContainText("Sara Metz");
    await expect(vendor.getByText("Mina Sodexo")).toHaveCount(0);
    await vendor.close();

    const sodexo = await signIn(context, logins.sodexoAdmin, logins.password);
    await sodexo.goto(`/organization/${logins.sodexoOrganizationId}/archive`, {
      waitUntil: "domcontentloaded",
    });
    const archive = sodexo.getByTestId("vendor-archive");
    await expect(archive).toBeVisible();
    await expect(archive).toContainText("Food & Nutrition");
    await expect(archive).toContainText("Terrace View");
    await expect(archive.getByText("Menus").locator("xpath=following-sibling::*[1]")).toHaveText("1");
    await expect(archive.getByText("People").locator("xpath=following-sibling::*[1]")).toHaveText("1");
    await expect(archive.getByText("Records").locator("xpath=following-sibling::*[1]")).toHaveText("1");
    await expect(archive).not.toContainText("The archive is not in effect.");
    console.log("cda07-terrace-walk: passed");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "walk failed";
  console.error(message.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"));
  process.exit(1);
});
