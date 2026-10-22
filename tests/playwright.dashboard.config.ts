import { defineConfig, devices } from "@playwright/test";

const artifactDir = process.env.DASHBOARD_BROWSER_ARTIFACT_DIR || "../tmp/dashboard-browser-artifacts";

export default defineConfig({
  testDir: "dashboard-browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.DASHBOARD_BROWSER_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
