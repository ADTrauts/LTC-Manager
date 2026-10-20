import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "onboarding-certification-browser", workers: 1, retries: 0, timeout: 180000,
  expect: { timeout: 20000 }, forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["json", { outputFile: "../tmp/onb07-verification/whole-journey.json" }]],
  outputDir: "../tmp/onb07-verification/whole-journey-output",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.ONBOARDING_BROWSER_BASE_URL || "http://127.0.0.1:55479", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
