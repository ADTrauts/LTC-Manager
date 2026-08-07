import { defineConfig, devices } from "@playwright/test";

const artifactDir =
  process.env.PLANT_BROWSER_ARTIFACT_DIR || "tmp/plant-browser-artifacts";

export default defineConfig({
  testDir: "tests/plant-browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["list"],
    ["json", { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.PLANT_BROWSER_BASE_URL || "http://127.0.0.1:3000",
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
