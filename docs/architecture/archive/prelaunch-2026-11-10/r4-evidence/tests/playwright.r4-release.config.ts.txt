import { defineConfig, devices } from "@playwright/test";

const artifactDir =
  process.env.R4_RELEASE_BROWSER_ARTIFACT_DIR || "../tmp/r4-release-browser-artifacts";

export default defineConfig({
  testDir: "r4-release-browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.R4_RELEASE_BROWSER_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
