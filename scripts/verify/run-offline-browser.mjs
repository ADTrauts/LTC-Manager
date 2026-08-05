#!/usr/bin/env node
/**
 * Phase 6A offline Runtime browser certification orchestrator.
 *
 * - Requires an explicitly disposable database (refuses ltc_manager)
 * - Migrates + seeds + synthetic fixtures
 * - Builds and starts Next in production mode
 * - Runs Playwright Chromium scenarios
 * - Always stops the server, removes the browser profile, and drops a managed DB
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const ARTIFACT_DIR = join(ROOT, "tmp", "offline-browser-artifacts");
const PROFILE_DIR = join(ROOT, "tmp", "offline-browser-profile");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");

function fail(message) {
  console.error(`test:offline-browser: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`test:offline-browser: ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    fail(`${label} exited ${result.status ?? 1}`);
  }
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
  fail(`server not ready at ${url} within ${timeoutMs}ms`);
}

function loadPinsEnv() {
  const path = join(ARTIFACT_DIR, "pins.env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i === -1) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

async function main() {
  process.env.TZ = "America/New_York";
  delete process.env.NODE_ENV;

  const manage = process.env.VERIFY_MANAGE_DATABASE === "1";
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");

  let target;
  try {
    target = assertDisposableDatabaseUrl(url);
  } catch (err) {
    fail(String(err?.message || err));
  }

  console.log(`test:offline-browser: target ${target.databaseName} @ ${target.host}`);
  console.log(`test:offline-browser: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "offline-browser-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "OfflineBrowserSeed!ChangeMe";
  }
  process.env.ALLOW_DEMO_SEED_PASSWORD = "1";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  rmSync(PROFILE_DIR, { recursive: true, force: true });
  mkdirSync(PROFILE_DIR, { recursive: true });

  let created = false;
  let serverChild = null;
  let exitCode = 0;

  const baseEnv = {
    ...process.env,
    TZ: "America/New_York",
    DATABASE_URL: url,
    DIRECT_URL: url,
    VERIFY_DATABASE_URL: url,
    AUTH_SECRET: process.env.AUTH_SECRET,
    SEED_DEMO_PASSWORD: process.env.SEED_DEMO_PASSWORD,
    ALLOW_DEMO_SEED_PASSWORD: "1",
    // Pilot path: legacy Unit Workspace with offline controls.
    PROJECTION_UNIT_WORKSPACE_ENABLED: "",
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      console.log(`test:offline-browser: admin ${redactDatabaseUrl(adminUrl)}`);
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }

    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");
    run(
      "node",
      ["scripts/verify/offline-browser-fixtures.mjs"],
      {
        ...baseEnv,
        OFFLINE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
      },
      "browser fixtures",
    );

    if (process.env.OFFLINE_BROWSER_SKIP_BUILD !== "1") {
      run("node", ["scripts/verify/verify-build.mjs"], baseEnv, "production build");
    } else if (!existsSync(join(ROOT, ".next"))) {
      fail("OFFLINE_BROWSER_SKIP_BUILD=1 but .next is missing");
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);

    console.log(`test:offline-browser: starting next start on ${baseUrl}`);
    serverChild = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: ROOT,
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const serverLog = join(ARTIFACT_DIR, "server.log");
    const logStream = { write: (chunk) => writeFileSync(serverLog, chunk, { flag: "a" }) };
    serverChild.stdout?.on("data", (d) => logStream.write(d));
    serverChild.stderr?.on("data", (d) => logStream.write(d));

    await waitForReady(`${baseUrl}/login`);

    const pins = loadPinsEnv();
    const grep =
      process.env.OFFLINE_BROWSER_GREP ||
      (process.env.OFFLINE_BROWSER_CI_GATE === "1" ? "@ci-gate" : undefined);
    const pwArgs = [
      "playwright",
      "test",
      "-c",
      "playwright.offline.config.ts",
      ...(grep ? ["--grep", grep] : []),
    ];

    const pw = spawnSync("npx", pwArgs, {
      cwd: ROOT,
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        OFFLINE_BROWSER_BASE_URL: baseUrl,
        OFFLINE_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
        OFFLINE_BROWSER_PROFILE_DIR: PROFILE_DIR,
        OFFLINE_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
        ...pins,
      },
      stdio: "inherit",
      shell: false,
    });
    exitCode = pw.status ?? 1;
  } catch (err) {
    console.error(`test:offline-browser: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild && !serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      if (!serverChild.killed) serverChild.kill("SIGKILL");
    }
    rmSync(PROFILE_DIR, { recursive: true, force: true });
    if (created && process.env.VERIFY_DATABASE_ADMIN_URL) {
      try {
        await dropDisposableDatabase(process.env.VERIFY_DATABASE_ADMIN_URL, target.databaseName);
        console.log(`test:offline-browser: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`test:offline-browser: drop failed — ${String(err?.message || err)}`);
        exitCode = exitCode || 1;
      }
    }
  }

  if (exitCode !== 0) {
    fail(`Playwright exited ${exitCode}`);
  }
  console.log("test:offline-browser: PASS");
}

main();
