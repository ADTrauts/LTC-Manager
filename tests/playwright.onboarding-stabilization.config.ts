import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "onboarding-stabilization-browser", workers: 1, retries: 0, timeout: 60000,
  expect: { timeout: 15000 }, forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["json", { outputFile: "../tmp/onb07-stabilization/ui-results.json" }]],
  outputDir: "../tmp/onb07-stabilization/ui-output",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55478", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
