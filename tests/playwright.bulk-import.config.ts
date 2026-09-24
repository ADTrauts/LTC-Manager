import { defineConfig, devices } from "@playwright/test";

const artifactDir =
  process.env.BULK_IMPORT_BROWSER_ARTIFACT_DIR || "../tmp/bulk-import-browser-artifacts";

export default defineConfig({
  testDir: "bulk-import-browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["json", { outputFile: `${artifactDir}/results.json` }]],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.BULK_IMPORT_BROWSER_BASE_URL || "http://127.0.0.1:3000",
    trace: "off",
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
      },
    },
  ],
});
