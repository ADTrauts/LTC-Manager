import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";

type Fixtures = {
  facilityId: string;
  facilityName: string;
  dietaryDepartmentId: string;
  managerEmail: string;
  faEmail: string;
  staffEmail: string;
  pinEmployeeEmail: string;
  facilityBuilderPath: string;
  assetBuilderPath: string;
};

const profileDir =
  process.env.BULK_IMPORT_BROWSER_PROFILE_DIR || "tmp/bulk-import-browser-profile";
const artifactDir =
  process.env.BULK_IMPORT_BROWSER_ARTIFACT_DIR || "tmp/bulk-import-browser-artifacts";

function loadFixtures(): Fixtures {
  const path =
    process.env.BULK_IMPORT_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "bulk-import-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

type Viewport = { width: number; height: number };
const DESKTOP: Viewport = { width: 1360, height: 900 };
const TABLET_LANDSCAPE: Viewport = { width: 1024, height: 768 };
const TABLET_PORTRAIT: Viewport = { width: 820, height: 1180 };

async function openPersistent(
  suffix: string,
  viewport: Viewport = DESKTOP,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(`${profileDir}-${suffix}`, {
    headless: true,
    viewport,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
}

function facilityCsv(prefix: string): string {
  return [
    "floor,neighborhood,space,spaceType,roomNumber,code,description,department,customTypeLabel",
    `${prefix} Floor 1,${prefix} 1A,Room 101,Resident Room,101,,,Dietary,`,
    `${prefix} Floor 1,${prefix} 1A,Room 102,Resident Room,102,,,Dietary,`,
    `${prefix} Floor 1,${prefix} 1A,Servery,Servery,,,,Dietary,`,
    `${prefix} Floor 1,${prefix} 1B,Servery,Servery,,,,Dietary,`,
    `${prefix} Floor 2,${prefix} 2A,Room 201,Resident Room,201,,,Dietary,`,
  ].join("\n");
}

function invalidFacilityCsv(): string {
  return [
    "floor,neighborhood,space,spaceType",
    ",Missing Floor Parent,Room 1,Resident Room",
    "Floor X,Unit Y,Room Z,NotARealType",
  ].join("\n");
}

function assetCsv(prefix: string): string {
  return [
    "name,equipmentType,floor,neighborhood,space,assetCode,manufacturer,model,serialNumber,facilityAssetNumber,status,department,criticality,notes,description",
    `Cooler ${prefix},Refrigerator,${prefix} Floor 1,${prefix} 1A,Servery,BI-${prefix}-001,True,T49,SN-${prefix}-1,,OPERATIONAL,Dietary,CRITICAL,,`,
    `Ice ${prefix},Ice Maker,${prefix} Floor 1,${prefix} 1A,Servery,BI-${prefix}-002,Scotsman,,SN-${prefix}-2,,OPERATIONAL,Dietary,IMPORTANT,,`,
  ].join("\n");
}

function writeTempCsv(name: string, contents: string): string {
  const path = join(artifactDir, name);
  writeFileSync(path, contents);
  return path;
}

test.describe("@ci-gate V1 Bulk Onboarding Imports", () => {
  const fx = loadFixtures();
  const prefix = `BI${Date.now().toString(36).slice(-6)}`;

  test("facility + asset import happy path, invalid errors, cancel, authority, responsive", async () => {
    test.setTimeout(300_000);

    // FA — Facility Builder is registry FA-gated; Asset Builder uses same FA with Dietary primary.
    const mgr = await openPersistent("fa");
    try {
      await loginPassword(mgr.page, fx.faEmail);
      await mgr.page.goto(fx.facilityBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(mgr.page.getByTestId("facility-builder")).toBeVisible({ timeout: 30_000 });

      await mgr.page.getByTestId("facility-bulk-import-open").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-wizard")).toBeVisible();
      await expect(mgr.page.getByTestId("facility-bulk-import-download-template")).toBeVisible();
      await mgr.page.getByTestId("facility-bulk-import-continue-upload").click();

      const validPath = writeTempCsv(`facility-valid-${prefix}.csv`, facilityCsv(prefix));
      await mgr.page.getByTestId("facility-bulk-import-file-input").setInputFiles(validPath);
      await mgr.page.getByTestId("facility-bulk-import-validate").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-step-preview")).toBeVisible({
        timeout: 30_000,
      });
      await expect(mgr.page.getByTestId("facility-bulk-import-hierarchy-preview")).toBeVisible();
      await expect(mgr.page.getByTestId("facility-bulk-import-confirm")).toBeEnabled();

      // Cancel makes no changes
      await mgr.page.getByTestId("facility-bulk-import-cancel").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-step-upload")).toBeVisible();

      // Re-validate and confirm
      await mgr.page.getByTestId("facility-bulk-import-file-input").setInputFiles(validPath);
      await mgr.page.getByTestId("facility-bulk-import-validate").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-confirm")).toBeEnabled({
        timeout: 30_000,
      });
      await mgr.page.getByTestId("facility-bulk-import-confirm").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-complete")).toBeVisible({
        timeout: 60_000,
      });
      await mgr.page.getByTestId("facility-bulk-import-done").click();

      // Hierarchy should show imported floor name after refresh
      await mgr.page.goto(fx.facilityBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(mgr.page.getByText(`${prefix} Floor 1`).first()).toBeVisible({
        timeout: 30_000,
      });

      // Invalid fixture
      await mgr.page.getByTestId("facility-bulk-import-open").click();
      await mgr.page.getByTestId("facility-bulk-import-continue-upload").click();
      const invalidPath = writeTempCsv(`facility-invalid-${prefix}.csv`, invalidFacilityCsv());
      await mgr.page.getByTestId("facility-bulk-import-file-input").setInputFiles(invalidPath);
      await mgr.page.getByTestId("facility-bulk-import-validate").click();
      await expect(mgr.page.getByTestId("facility-bulk-import-issues")).toBeVisible({
        timeout: 30_000,
      });
      await expect(mgr.page.getByTestId("facility-bulk-import-confirm")).toBeDisabled();
      await expect(mgr.page.getByTestId("facility-bulk-import-download-errors")).toBeVisible();
      await mgr.page.getByTestId("facility-bulk-import-close").click();

      // Asset Builder bulk import
      await mgr.page.goto(fx.assetBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(mgr.page.getByTestId("asset-builder-page")).toBeVisible({ timeout: 30_000 });
      await mgr.page.getByTestId("asset-bulk-import-open").click();
      await expect(mgr.page.getByTestId("asset-bulk-import-wizard")).toBeVisible();
      await expect(mgr.page.getByTestId("asset-bulk-import-download-template")).toBeVisible();
      await mgr.page.getByTestId("asset-bulk-import-continue-upload").click();
      const assetsPath = writeTempCsv(`assets-valid-${prefix}.csv`, assetCsv(prefix));
      await mgr.page.getByTestId("asset-bulk-import-file-input").setInputFiles(assetsPath);
      await mgr.page.getByTestId("asset-bulk-import-validate").click();
      await expect(mgr.page.getByTestId("asset-bulk-import-step-preview")).toBeVisible({
        timeout: 30_000,
      });
      await expect(mgr.page.getByTestId("asset-bulk-import-confirm")).toBeEnabled();
      await mgr.page.getByTestId("asset-bulk-import-confirm").click();
      await expect(mgr.page.getByTestId("asset-bulk-import-complete")).toBeVisible({
        timeout: 60_000,
      });

      await mgr.page.goto(fx.assetBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(mgr.page.getByTestId("asset-registry")).toContainText(`BI-${prefix}-001`, {
        timeout: 30_000,
      });

      // Duplicate / skip on replay
      await mgr.page.getByTestId("asset-bulk-import-open").click();
      await mgr.page.getByTestId("asset-bulk-import-continue-upload").click();
      await mgr.page.getByTestId("asset-bulk-import-file-input").setInputFiles(assetsPath);
      await mgr.page.getByTestId("asset-bulk-import-validate").click();
      await expect(mgr.page.getByTestId("asset-bulk-import-counts")).toContainText(/Skip/i, {
        timeout: 30_000,
      });

      // Responsive — preview has no unusable horizontal overflow
      for (const [label, viewport] of [
        ["desktop", DESKTOP],
        ["tablet-landscape", TABLET_LANDSCAPE],
        ["tablet-portrait", TABLET_PORTRAIT],
      ] as const) {
        await mgr.page.setViewportSize(viewport);
        await expect(mgr.page.getByTestId("asset-bulk-import-step-preview")).toBeVisible();
        const overflow = await mgr.page.evaluate(() => {
          const el = document.querySelector('[data-testid="asset-bulk-import-step-preview"]');
          if (!el) return { scrollWidth: 0, clientWidth: 0 };
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
        });
        expect(
          overflow.scrollWidth <= overflow.clientWidth + 24,
          `${label} preview overflow ${overflow.scrollWidth}>${overflow.clientWidth}`,
        ).toBeTruthy();
      }
    } finally {
      await mgr.context.close();
    }

    // Frontline STAFF denied Facility Builder / bulk import
    const staff = await openPersistent("staff");
    try {
      await loginPassword(staff.page, fx.staffEmail);
      await staff.page.goto(fx.facilityBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(staff.page.getByTestId("facility-bulk-import-open")).toHaveCount(0);
      await staff.page.goto(fx.assetBuilderPath, { waitUntil: "domcontentloaded" });
      await expect(staff.page.getByTestId("asset-bulk-import-open")).toHaveCount(0);
    } finally {
      await staff.context.close();
    }
  });
});
