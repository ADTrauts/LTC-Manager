#!/usr/bin/env node
/**
 * DSH-02 Dashboard persona check. The flag is on only for this process.
 * Uses the dev server so the check does not replace the app's production build.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertDisposableDatabaseUrl, redactDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LABEL = "test:dashboard-browser";
const ARTIFACT_DIR = join(ROOT, "tmp", "dashboard-browser-artifacts");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const DIST_DIR = process.env.DASHBOARD_BROWSER_DIST_DIR || ".next-dashboard-browser";

function fail(message) {
  console.error(`${LABEL}: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`${LABEL}: ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit", shell: false });
  if (result.status !== 0) fail(`${label} exited ${result.status ?? 1}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("could not allocate port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForReady(url, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`server not ready at ${url} within ${timeoutMs}ms`);
}

async function main() {
  process.env.TZ = "America/New_York";
  delete process.env.NODE_ENV;

  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  let target;
  try {
    target = assertDisposableDatabaseUrl(url);
  } catch (err) {
    fail(String(err?.message || err));
  }

  console.log(`${LABEL}: target ${target.databaseName} @ ${target.host}`);
  console.log(`${LABEL}: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "dashboard-browser-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "DashboardBrowserSeed!ChangeMe";
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  rmSync(FIXTURE_PATH, { force: true });

  const baseEnv = {
    ...process.env,
    TZ: "America/New_York",
    DATABASE_URL: url,
    DIRECT_URL: url,
    VERIFY_DATABASE_URL: url,
    AUTH_SECRET: process.env.AUTH_SECRET,
    SEED_DEMO_PASSWORD: process.env.SEED_DEMO_PASSWORD,
    ALLOW_DEMO_SEED_PASSWORD: "1",
    NEXT_DIST_DIR: DIST_DIR,
    POSTMARK_SERVER_TOKEN: "",
    DASHBOARD_V2_ENABLED: "true",
    DASHBOARD_FAULT_INJECTION: "true",
    PLANT_OPERATIONS_ENABLED: "true",
    CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED: "true",
  };

  let serverChild = null;
  let exitCode = 0;
  try {
    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run(
      "node",
      ["--import", "tsx", "scripts/verify/dashboard-browser-fixtures.mjs"],
      { ...baseEnv, DASHBOARD_BROWSER_FIXTURE_PATH: FIXTURE_PATH },
      "dashboard fixtures",
    );

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);
    console.log(`${LABEL}: starting next dev on ${baseUrl}`);
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: { ...baseEnv, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const serverLog = join(ARTIFACT_DIR, "server.log");
    serverChild.stdout?.on("data", (chunk) => writeFileSync(serverLog, chunk, { flag: "a" }));
    serverChild.stderr?.on("data", (chunk) => writeFileSync(serverLog, chunk, { flag: "a" }));

    await waitForReady(`${baseUrl}/login`);

    const pw = spawnSync(
      "npx",
      ["playwright", "test", "-c", "tests/playwright.dashboard.config.ts", "--grep", "@ci-gate"],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          DASHBOARD_BROWSER_BASE_URL: baseUrl,
          DASHBOARD_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
          DASHBOARD_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
        },
        stdio: "inherit",
        shell: false,
      },
    );
    exitCode = pw.status ?? 1;
  } catch (err) {
    console.error(`${LABEL}: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild && !serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (!serverChild.killed) serverChild.kill("SIGKILL");
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
  console.log(`${LABEL}: PASS`);
}

main();
