import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "onboarding-browser", workers: 1, retries: 0, timeout: 120_000,
  expect: { timeout: 30_000 }, forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["json", { outputFile: "../tmp/onb02-browser/results.json" }]],
  outputDir: "../tmp/onb02-browser/output",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55473", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
