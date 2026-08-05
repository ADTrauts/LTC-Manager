import { defineConfig, devices } from "@playwright/test";

const artifactDir =
  process.env.OFFLINE_BROWSER_ARTIFACT_DIR || "tmp/offline-browser-artifacts";

/**
 * Chromium is the Phase 6A primary certification browser (shared-tablet pilot).
 * Firefox/WebKit are not required for Phase 6A closeout.
 */
export default defineConfig({
  testDir: "tests/offline-browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.OFFLINE_BROWSER_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: undefined,
        serviceWorkers: "allow",
      },
    },
  ],
});
