#!/usr/bin/env node
/**
 * Phase 9B Dietary Job Flow / Supervisor Operations Board browser certification orchestrator.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const ARTIFACT_DIR = join(ROOT, "tmp", "job-flow-browser-artifacts");
const PROFILE_DIR = join(ROOT, "tmp", "job-flow-browser-profile");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

function fail(message) {
  console.error(`test:job-flow-browser: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`test:job-flow-browser: ${label}`);
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

  console.log(`test:job-flow-browser: target ${target.databaseName} @ ${target.host}`);
  console.log(`test:job-flow-browser: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "job-flow-browser-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "JobFlowBrowserSeed!ChangeMe";
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
    DIETARY_JOB_FLOW_ENABLED: "true",
    DIETARY_OPERATIONAL_CYCLES_ENABLED: "true",
    OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
    OPERATION_ENGINE_ENABLED: "",
    DEPARTMENT_OPERATIONAL_PROFILES_ENABLED: "false",
    PROJECTION_UNIT_WORKSPACE_ENABLED: "",
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      console.log(`test:job-flow-browser: admin ${redactDatabaseUrl(adminUrl)}`);
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }

    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");
    run(
      "node",
      ["scripts/verify/job-flow-browser-fixtures.mjs"],
      {
        ...baseEnv,
        JOB_FLOW_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
      },
      "job flow fixtures",
    );

    if (process.env.JOB_FLOW_BROWSER_SKIP_BUILD !== "1") {
      run("node", ["scripts/verify/verify-build.mjs"], baseEnv, "production build");
    } else if (!existsSync(join(ROOT, ".next"))) {
      fail("JOB_FLOW_BROWSER_SKIP_BUILD=1 but .next is missing");
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);

    console.log(`test:job-flow-browser: starting next start on ${baseUrl}`);
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          NODE_ENV: "production",
          PORT: String(port),
          DIETARY_JOB_FLOW_ENABLED: "true",
          DIETARY_OPERATIONAL_CYCLES_ENABLED: "true",
          OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
          OPERATION_ENGINE_ENABLED: "",
          DEPARTMENT_OPERATIONAL_PROFILES_ENABLED: "false",
        },
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
      [
        "playwright",
        "test",
        "-c",
        "playwright.job-flow.config.ts",
        "--grep",
        "@ci-gate",
      ],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          ...pins,
          NODE_ENV: "production",
          JOB_FLOW_BROWSER_BASE_URL: baseUrl,
          JOB_FLOW_BROWSER_FIXTURE_PATH: FIXTURE_PATH,
          JOB_FLOW_BROWSER_PROFILE_DIR: PROFILE_DIR,
          JOB_FLOW_BROWSER_ARTIFACT_DIR: ARTIFACT_DIR,
        },
        stdio: "inherit",
        shell: false,
      },
    );
    exitCode = pw.status ?? 1;
  } catch (err) {
    console.error(`test:job-flow-browser: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild && !serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (!serverChild.killed) serverChild.kill("SIGKILL");
    }
    try {
      for (const name of readdirSync(join(ROOT, "tmp"))) {
        if (name.startsWith("job-flow-browser-profile")) {
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
        console.log(`test:job-flow-browser: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`test:job-flow-browser: drop failed — ${String(err?.message || err)}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
  console.log("test:job-flow-browser: PASS");
}

main();
