#!/usr/bin/env node
/**
 * Dietary V1 integrated pilot browser certification orchestrator.
 * Requires disposable VERIFY_DATABASE_URL. Refuses ltc_manager.
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
const ARTIFACT_DIR = join(ROOT, "tmp", "dietary-pilot-artifacts");
const PROFILE_DIR = join(ROOT, "tmp", "dietary-pilot-profile");
const FIXTURE_PATH = join(ARTIFACT_DIR, "fixtures.json");
const RESULT_PATH = join(ARTIFACT_DIR, "scenario-result.json");

function fail(message) {
  console.error(`test:dietary-pilot: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`test:dietary-pilot: ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
    shell: false,
  });
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

  console.log(`test:dietary-pilot: target ${target.databaseName} @ ${target.host}`);
  console.log(`test:dietary-pilot: connection ${redactDatabaseUrl(url)}`);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "dietary-pilot-auth-secret-not-for-production";
  }
  if (!process.env.SEED_DEMO_PASSWORD) {
    process.env.SEED_DEMO_PASSWORD = "DietaryPilotSeed!ChangeMe";
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
    OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
    OPERATION_ENGINE_ENABLED: "",
    DIETARY_JOB_FLOW_ENABLED: "",
    PROJECTION_UNIT_WORKSPACE_ENABLED: "",
  };

  try {
    if (manage) {
      const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL required when VERIFY_MANAGE_DATABASE=1");
      console.log(`test:dietary-pilot: admin ${redactDatabaseUrl(adminUrl)}`);
      await recreateDisposableDatabase(adminUrl, target.databaseName);
      created = true;
    }

    run("npx", ["prisma", "migrate", "deploy"], baseEnv, "migrate deploy");
    run("npx", ["prisma", "db", "seed"], baseEnv, "seed");
    run(
      "node",
      ["scripts/verify/dietary-pilot-fixtures.mjs"],
      { ...baseEnv, DIETARY_PILOT_FIXTURE_PATH: FIXTURE_PATH },
      "pilot fixtures",
    );

    if (process.env.DIETARY_PILOT_SKIP_BUILD !== "1") {
      run("node", ["scripts/verify/verify-build.mjs"], baseEnv, "production build");
    } else if (!existsSync(join(ROOT, ".next"))) {
      fail("DIETARY_PILOT_SKIP_BUILD=1 but .next is missing");
    }

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    writeFileSync(join(ARTIFACT_DIR, "base-url.txt"), baseUrl);

    console.log(`test:dietary-pilot: starting next start on ${baseUrl}`);
    serverChild = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
      {
        cwd: ROOT,
        env: {
          ...baseEnv,
          NODE_ENV: "production",
          PORT: String(port),
          OPERATIONAL_ASSIGNMENTS_ENABLED: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const serverLog = join(ARTIFACT_DIR, "server.log");
    serverChild.stdout?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));
    serverChild.stderr?.on("data", (d) => writeFileSync(serverLog, d, { flag: "a" }));

    await waitForReady(`${baseUrl}/login`);

    const pins = loadPinsEnv();
    const grep =
      process.env.DIETARY_PILOT_GREP ||
      (process.env.DIETARY_PILOT_CI_GATE === "1" ? "@ci-gate" : undefined);
    const pwArgs = [
      "playwright",
      "test",
      "-c",
      "playwright.dietary-pilot.config.ts",
      ...(grep ? ["--grep", grep] : []),
    ];

    const pw = spawnSync("npx", pwArgs, {
      cwd: ROOT,
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        DIETARY_PILOT_BASE_URL: baseUrl,
        DIETARY_PILOT_FIXTURE_PATH: FIXTURE_PATH,
        DIETARY_PILOT_PROFILE_DIR: PROFILE_DIR,
        DIETARY_PILOT_ARTIFACT_DIR: ARTIFACT_DIR,
        ...pins,
      },
      stdio: "inherit",
      shell: false,
    });
    exitCode = pw.status ?? 1;

    writeFileSync(
      RESULT_PATH,
      JSON.stringify(
        {
          conclusion: exitCode === 0 ? "PASS" : "FAIL",
          exitCode,
          completedAt: new Date().toISOString(),
          database: target.databaseName,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(`test:dietary-pilot: ERROR — ${String(err?.message || err)}`);
    exitCode = 1;
  } finally {
    if (serverChild && !serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (!serverChild.killed) serverChild.kill("SIGKILL");
    }
    try {
      for (const name of readdirSync(join(ROOT, "tmp"))) {
        if (name.startsWith("dietary-pilot-profile")) {
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
        console.log(`test:dietary-pilot: dropped ${target.databaseName}`);
      } catch (err) {
        console.error(`test:dietary-pilot: drop failed — ${String(err?.message || err)}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  if (exitCode !== 0) process.exit(exitCode);
  console.log("test:dietary-pilot: PASS");
}

main();
