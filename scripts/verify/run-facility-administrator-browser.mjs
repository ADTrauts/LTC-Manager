#!/usr/bin/env node
/**
 * CDA-02 Facility Administrator transfer and recovery, and CDA-03 Facility Administrator view,
 * browser certification orchestrator.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const LABEL = "test:facility-administrator-browser";
const ARTIFACT_DIR = join(ROOT, "tmp", "facility-administrator-browser-artifacts");
const PROFILE_DIR = join(ROOT, "tmp", "facility-administrator-browser-profile");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const DIST_DIR =
  process.env.FACILITY_ADMINISTRATOR_BROWSER_DIST_DIR || ".next-facility-administrator-browser";

function fail(message) {
  console.error(`${LABEL}: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`${LABEL}: ${label}`);
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

  console.log(`${LABEL}: target ${target.databaseName} @ ${target.host}`);
  console.log(`${LABEL}: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "facility-administrator-browser-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "FacilityAdministratorBrowserSeed!ChangeMe";
  }
  process.env.ALLOW_DEMO_SEED_PASSWORD = "1";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  rmSync(PROFILE_DIR, { recursive: true, force: true });

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
    NEXT_DIST_DIR: DIST_DIR,
    // An empty value outranks .env.production.local, so invitations to synthetic addresses never send.
    POSTMARK_SERVER_TOKEN: "",
    // CDA-03 opens Work, Log Book, preventive maintenance and Plant requests.
    PLANT_OPERATIONS_ENABLED: "true",
    DIETARY_JOB_FLOW_ENABLED: "true",
    DIETARY_OPERATIONAL_CYCLES_ENABLED: "true",
    DIETARY_OPERATIONAL_EVIDENCE_ENABLED: "true",
    DIETARY_ASSET_OPERATIONS_ENABLED: "true",
    DIETARY_WORK_PLANS_ENABLED: "true",
    OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
    TASK_SYNC_ENABLED: "",
    OPERATION_ENGINE_ENABLED: "",
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      console.log(`${LABEL}: admin ${redactDatabaseUrl(adminUrl)}`);
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }

    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");
    run(
      "node",
      ["--import", "tsx", "scripts/verify/facility-administrator-browser-fixtures.mjs"],
      { ...baseEnv, FACILITY_ADMINISTRATOR_BROWSER_FIXTURE_PATH: FIXTURE_PATH },
      "facility administrator fixtures",
    );
    if (!existsSync(FIXTURE_PATH)) fail(`fixtures missing at ${FIXTURE_PATH}`);

    if (process.env.FACILITY_ADMINISTRATOR_BROWSER_SKIP_BUILD !== "1") {
      console.log(`${LABEL}: production build → ${DIST_DIR}`);
      const buildEnv = { ...baseEnv };
      delete buildEnv.NODE_ENV;
      run("npx", ["next", "build", "--webpack"], buildEnv, "production build");
    } else if (!existsSync(join(ROOT, DIST_DIR, "BUILD_ID"))) {
      fail(`FACILITY_ADMINISTRATOR_BROWSER_SKIP_BUILD=1 but ${DIST_DIR}/BUILD_ID is missing`);
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);

    console.log(`${LABEL}: starting next start on ${baseUrl} (distDir=${DIST_DIR})`);
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: { ...baseEnv, NODE_ENV: "production", PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const serverLog = join(ARTIFACT_DIR, "server.log");
    serverChild.stdout?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));
    serverChild.stderr?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));

    await waitForReady(`${baseUrl}/login`);

    const pw = spawnSync(
      "npx",
      ["playwright", "test", "-c", "tests/playwright.facility-administrator.config.ts", "--grep", "@ci-gate"],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          NODE_ENV: "production",
          FACILITY_ADMINISTRATOR_BROWSER_BASE_URL: baseUrl,
          FACILITY_ADMINISTRATOR_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
          FACILITY_ADMINISTRATOR_BROWSER_PROFILE_DIR: PROFILE_DIR,
          FACILITY_ADMINISTRATOR_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
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
    try {
      for (const name of readdirSync(join(ROOT, "tmp"))) {
        if (name.startsWith("facility-administrator-browser-profile")) {
          rmSync(join(ROOT, "tmp", name), { recursive: true, force: true });
        }
      }
    } catch {
      // ignore
    }
    if (created && manage) {
      try {
        await dropDisposableDatabase(process.env.VERIFY_DATABASE_ADMIN_URL, target.databaseName);
        console.log(`${LABEL}: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`${LABEL}: drop failed — ${String(err?.message || err)}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
  console.log(`${LABEL}: PASS`);
}

main();
