import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "employee-csv-browser", workers: 1, fullyParallel: false, retries: 0,
  timeout: 120_000, expect: { timeout: 30_000 }, forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["json", { outputFile: "../tmp/onb01-browser/results.json" }]],
  outputDir: "../tmp/onb01-browser/output",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.EMPLOYEE_CSV_BROWSER_BASE_URL || "http://127.0.0.1:55472", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
