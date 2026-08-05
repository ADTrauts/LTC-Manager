import { defineConfig, devices } from "@playwright/test";

const artifactDir =
  process.env.DIETARY_PILOT_ARTIFACT_DIR || "tmp/dietary-pilot-artifacts";

export default defineConfig({
  testDir: "tests/dietary-pilot",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 25_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.DIETARY_PILOT_BASE_URL || "http://127.0.0.1:3000",
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
