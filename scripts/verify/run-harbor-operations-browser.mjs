#!/usr/bin/env node
// Fresh loopback database per journey; reuse one production build. Never pulls hosted configuration.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { createServer } from "node:net";
import { PrismaClient, RoleKey } from "@prisma/client";
import { runAdminSql, dropDisposableDatabase } from "./admin-database.mjs";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const specs = ["harbor-operations.spec.ts", "invite-handoff.spec.ts", "assisted-setup.spec.ts", "implementation-request-replay.spec.ts", "today-implementation.spec.ts"];
const selected = process.argv.slice(2).length ? process.argv.slice(2) : specs;
if (selected.some((name) => !specs.includes(name))) throw new Error("Choose an approved Harbor journey spec");
const source = process.env.VERIFY_DATABASE_URL;
assertDisposableDatabaseUrl(source);
const base = new URL(source);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Harbor browser verification is loopback-only");
const admin = new URL(process.env.VERIFY_DATABASE_ADMIN_URL || base);
if (!process.env.VERIFY_DATABASE_ADMIN_URL) admin.pathname = "/postgres";
if (admin.host !== base.host || admin.pathname !== "/postgres") throw new Error("Use the same loopback cluster's postgres maintenance database");
mkdirSync("tmp/harbor-operations-browser", { recursive: true });

function run(args, env) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Verification command failed (${result.status ?? "signal"})`);
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function ready(origin, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error("Local application exited before readiness");
    try { if ((await fetch(`${origin}/console/login`)).ok) return; } catch { /* wait for local startup */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local application readiness timed out");
}

for (const spec of selected) {
  const databaseName = `ltc_verify_harbor_browser_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const target = new URL(base); target.pathname = `/${databaseName}`;
  const env = {
    ...process.env, TZ: "America/New_York", DATABASE_URL: String(target), DIRECT_URL: String(target),
    VERIFY_DATABASE_URL: String(target), ONBOARDING_TEST_DATABASE_URL: String(target),
    AUTH_SECRET: randomUUID() + randomUUID(),
    POSTMARK_SERVER_TOKEN: "", STRIPE_SECRET_KEY: "", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
    SUPPORT_SCANNER_URL: "", SUPPORT_SCANNER_BEARER_TOKEN: "", BLOB_READ_WRITE_TOKEN: "", VERCEL_OIDC_TOKEN: "",
    HARBOR_STAFF_LIFECYCLE_MODE: "", VERCEL: "", CANONICAL_LOGS_ENABLED: "true",
  };
  delete env.NODE_ENV;
  let created = false, child = null, descriptor = null;
  try {
    await runAdminSql(String(admin), `CREATE DATABASE "${databaseName}"`, "create fresh Harbor browser database");
    created = true;
    run(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
    const db = new PrismaClient({ datasourceUrl: String(target) });
    try { for (const key of Object.values(RoleKey)) await db.role.upsert({ where: { key }, create: { key, name: key }, update: {} }); }
    finally { await db.$disconnect(); }
    const dist = env.NEXT_DIST_DIR || ".next";
    if (!existsSync(`${dist}/BUILD_ID`)) run(["scripts/verify/verify-build.mjs"], env);
    const port = await freePort();
    env.ONBOARDING_BROWSER_BASE_URL = `http://127.0.0.1:${port}`;
    descriptor = openSync(`tmp/harbor-operations-browser/${spec}.server.log`, "w");
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { env, stdio: ["ignore", descriptor, descriptor] });
    await ready(env.ONBOARDING_BROWSER_BASE_URL, child);
    console.log(`Harbor browser: ${spec} on a fresh loopback database`);
    run(["node_modules/@playwright/test/cli.js", "test", "-c", "tests/playwright.onboarding.config.ts", spec], env);
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
    }
    if (descriptor !== null) closeSync(descriptor);
    if (created) await dropDisposableDatabase(String(admin), databaseName);
  }
}
console.log(`Harbor browser: PASS (${selected.length} isolated journey specifications)`);
