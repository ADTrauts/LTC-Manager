#!/usr/bin/env node
/**
 * Phase 2C R4 focused online browser + HTTP auth certification.
 * Disposable VERIFY_DATABASE_URL only.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dropDisposableDatabase,
  recreateDisposableDatabase,
} from "./admin-database.mjs";
import {
  assertDisposableDatabaseUrl,
  redactDatabaseUrl,
} from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "tmp", "r4-release-browser-artifacts");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const AUTH_REPORT = join(ARTIFACT_DIR, "auth-http.json");

function fail(message) {
  console.error(`test:r4-release-browser: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`test:r4-release-browser: ${label}`);
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

async function waitForReady(url, timeoutMs = 120_000) {
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
  fail(`server not ready at ${url}`);
}

function runAuthChecks(env, baseUrl) {
  console.log("test:r4-release-browser: auth + HTTP checks");
  run(
    "npx",
    ["tsx", "scripts/verify/r4-auth-checks.ts"],
    {
      ...env,
      R4_RELEASE_BROWSER_BASE_URL: baseUrl,
      R4_RELEASE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
      R4_AUTH_REPORT_PATH: AUTH_REPORT,
    },
    "auth checks",
  );
  console.log(`test:r4-release-browser: auth report ${AUTH_REPORT}`);
}

async function main() {
  process.env.TZ = "America/New_York";
  delete process.env.NODE_ENV;

  const manage = process.env.VERIFY_MANAGE_DATABASE === "1";
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`test:r4-release-browser: target ${target.databaseName} @ ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "r4-release-auth-secret-not-for-production";
  if (!process.env.SEED_DEMO_PASSWORD) process.env.SEED_DEMO_PASSWORD = "OfflineBrowserSeed!ChangeMe";
  process.env.ALLOW_DEMO_SEED_PASSWORD = "1";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  let created = false;
  let serverChild = null;
  let exitCode = 0;

  const baseEnv = {
    ...process.env,
    TZ: "America/New_York",
    DATABASE_URL: url,
    DIRECT_URL: url,
    VERIFY_DATABASE_URL: url,
    DIETARY_JOB_FLOW_ENABLED: "true",
    OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
    ALLOW_DEMO_SEED_PASSWORD: "1",
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }
    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");
    run(
      "node",
      ["--import", "tsx", "scripts/verify/offline-browser-fixtures.mjs"],
      { ...baseEnv, OFFLINE_BROWSER_FIXTURE_PATH: FIXTURE_PATH },
      "canonical fixtures",
    );

    if (process.env.R4_RELEASE_BROWSER_SKIP_BUILD !== "1") {
      run("node", ["scripts/verify/verify-build.mjs"], baseEnv, "production build");
    } else if (!existsSync(join(ROOT, ".next"))) {
      fail("R4_RELEASE_BROWSER_SKIP_BUILD=1 but .next missing");
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: { ...baseEnv, NODE_ENV: "production", PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitForReady(`${baseUrl}/login`);

    runAuthChecks(baseEnv, baseUrl);

    const pw = spawnSync(
      "npx",
      ["playwright", "test", "-c", "tests/playwright.r4-release.config.ts", "--grep", "@r4-gate"],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          NODE_ENV: "production",
          R4_RELEASE_BROWSER_BASE_URL: baseUrl,
          R4_RELEASE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
          R4_RELEASE_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
          OFFLINE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
        },
        stdio: "inherit",
        shell: false,
      },
    );
    exitCode = pw.status ?? 1;
  } catch (err) {
    console.error(`test:r4-release-browser: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild?.pid) {
      try { process.kill(serverChild.pid, "SIGTERM"); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 1000));
      try { process.kill(serverChild.pid, "SIGKILL"); } catch { /* ignore */ }
    }
    if (created && process.env.VERIFY_DATABASE_ADMIN_URL) {
      try {
        await dropDisposableDatabase(process.env.VERIFY_DATABASE_ADMIN_URL, target.databaseName);
        console.log(`test:r4-release-browser: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`test:r4-release-browser: drop failed — ${String(err?.message || err)}`);
      }
    }
  }
  if (exitCode !== 0) fail(`Playwright exited ${exitCode}`);
  console.log("test:r4-release-browser: PASS");
}

main();
