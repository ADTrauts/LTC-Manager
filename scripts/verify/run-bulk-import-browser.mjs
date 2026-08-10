#!/usr/bin/env node
/**
 * V1 Bulk Onboarding Imports browser certification orchestrator.
 * Disposable PostgreSQL only. OPERATION_ENGINE_ENABLED and TASK_SYNC_ENABLED remain false.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dropDisposableDatabase, recreateDisposableDatabase } from "./admin-database.mjs";
import { assertDisposableDatabaseUrl, redactDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_ID = process.env.BULK_IMPORT_BROWSER_RUN_ID || String(process.pid);
const ARTIFACT_DIR = join(
  ROOT,
  "tmp",
  process.env.BULK_IMPORT_BROWSER_ARTIFACT_DIR_NAME || `bulk-import-browser-artifacts-${RUN_ID}`,
);
const PROFILE_DIR = join(
  ROOT,
  "tmp",
  process.env.BULK_IMPORT_BROWSER_PROFILE_DIR_NAME || `bulk-import-browser-profile-${RUN_ID}`,
);
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");
const DIST_DIR =
  process.env.BULK_IMPORT_BROWSER_DIST_DIR || process.env.NEXT_DIST_DIR || ".next-bulk-import-browser";

function fail(message) {
  console.error(`test:bulk-import-browser: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`test:bulk-import-browser: ${label}`);
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
  fail(`server not ready at ${url} within ${timeoutMs}ms`);
}

function loadPinsEnv() {
  if (!existsSync(PINS_PATH)) return {};
  const out = {};
  for (const line of readFileSync(PINS_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
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

  console.log(`test:bulk-import-browser: target ${target.databaseName} @ ${target.host}`);
  console.log(`test:bulk-import-browser: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "bulk-import-browser-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "BulkImportBrowserSeed!ChangeMe";
  }
  process.env.ALLOW_DEMO_SEED_PASSWORD = "1";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  rmSync(PROFILE_DIR, { recursive: true, force: true });
  mkdirSync(PROFILE_DIR, { recursive: true });

  let created = false;
  let serverChild = null;
  let exitCode = 0;

  const featureEnv = {
    DIETARY_ASSET_OPERATIONS_ENABLED: "true",
    OPERATION_ENGINE_ENABLED: "",
    TASK_SYNC_ENABLED: "",
  };

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
    BULK_IMPORT_BROWSER_DIST_DIR: DIST_DIR,
    ...featureEnv,
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      console.log(`test:bulk-import-browser: admin ${redactDatabaseUrl(adminUrl)}`);
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }

    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");

    if (process.env.BULK_IMPORT_BROWSER_SKIP_BUILD !== "1") {
      console.log(`test:bulk-import-browser: production build → ${DIST_DIR}`);
      const buildEnv = { ...baseEnv };
      delete buildEnv.NODE_ENV;
      run("npx", ["next", "build", "--webpack"], buildEnv, "production build");
    } else if (!existsSync(join(ROOT, DIST_DIR, "BUILD_ID"))) {
      fail(
        `BULK_IMPORT_BROWSER_SKIP_BUILD=1 but ${DIST_DIR}/BUILD_ID is missing — build with NEXT_DIST_DIR=${DIST_DIR}`,
      );
    }

    run(
      "node",
      ["scripts/verify/bulk-import-browser-fixtures.mjs"],
      {
        ...baseEnv,
        BULK_IMPORT_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
        BULK_IMPORT_BROWSER_ARTIFACT_DIR_NAME: ARTIFACT_DIR.split("/").pop(),
      },
      "bulk-import fixtures",
    );
    if (!existsSync(FIXTURE_PATH)) fail(`fixtures missing at ${FIXTURE_PATH}`);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);

    console.log(`test:bulk-import-browser: starting next start on ${baseUrl} (distDir=${DIST_DIR})`);
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: { ...baseEnv, NODE_ENV: "production", PORT: String(port), NEXT_DIST_DIR: DIST_DIR },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const serverLog = join(ARTIFACT_DIR, "server.log");
    serverChild.stdout?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));
    serverChild.stderr?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));

    await waitForReady(`${baseUrl}/login`);

    const pins = loadPinsEnv();

    const pw = spawnSync(
      "npx",
      ["playwright", "test", "-c", "playwright.bulk-import.config.ts", "--grep", "@ci-gate"],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          ...pins,
          NODE_ENV: "production",
          BULK_IMPORT_BROWSER_BASE_URL: baseUrl,
          BULK_IMPORT_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
          BULK_IMPORT_BROWSER_PROFILE_DIR: PROFILE_DIR,
          BULK_IMPORT_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
        },
        stdio: "inherit",
        shell: false,
      },
    );
    exitCode = pw.status ?? 1;
  } catch (err) {
    console.error(`test:bulk-import-browser: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild && !serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (!serverChild.killed) serverChild.kill("SIGKILL");
    }
    try {
      for (const name of readdirSync(join(ROOT, "tmp"))) {
        if (name.startsWith("bulk-import-browser-profile")) {
          rmSync(join(ROOT, "tmp", name), { recursive: true, force: true });
        }
      }
    } catch {
      // ignore
    }
    if (created && manage) {
      try {
        const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
        await dropDisposableDatabase(adminUrl, target.databaseName);
        console.log(`test:bulk-import-browser: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`test:bulk-import-browser: drop failed — ${String(err?.message || err)}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
  console.log("test:bulk-import-browser: PASS");
}

main();
