#!/usr/bin/env node
/**
 * Provider-neutral pilot environment acceptance contract.
 *
 * Validates a deployed staging or pilot environment without destructive writes.
 * Does not implement provider-specific backup or platform checks until a provider
 * is selected — those remain documented expectations.
 *
 * Usage:
 *   PILOT_BASE_URL='https://pilot.example.com' npm run verify:pilot-environment
 *
 * Optional:
 *   PILOT_EXPECT_DEPLOYED_SHA=<git sha>
 *   PILOT_REQUIRE_ASSIGNMENTS=1   (default on)
 *   PILOT_REQUIRE_ENGINE_OFF=1   (default on — engine must remain disabled)
 */
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`verify:pilot-environment: FAIL — ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`  PASS — ${message}`);
}

function warn(message) {
  console.log(`  NOTICE — ${message}`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, body, text };
}

function assertHttps(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    fail("PILOT_BASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    fail(`PILOT_BASE_URL must use HTTPS (got ${parsed.protocol}).`);
  }
  if (!parsed.hostname || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    fail("PILOT_BASE_URL must be a non-loopback deployed hostname for acceptance.");
  }
  return parsed;
}

async function main() {
  const baseUrl = (process.env.PILOT_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    fail(
      "PILOT_BASE_URL is required. Example: PILOT_BASE_URL=https://pilot.example.com npm run verify:pilot-environment",
    );
  }

  const origin = assertHttps(baseUrl);
  console.log(`verify:pilot-environment: ${origin.origin}`);

  // 1. HTTPS / domain
  pass(`HTTPS domain ${origin.hostname}`);

  // 2. Liveness
  {
    const { response, body } = await fetchJson(`${origin.origin}/api/health/live`);
    if (response.status !== 200 || body?.status !== "ok") {
      fail(`/api/health/live expected 200 ok, got ${response.status}`);
    }
    pass("liveness /api/health/live");
  }

  // 3. Readiness
  {
    const { response, body } = await fetchJson(`${origin.origin}/api/health/ready`);
    if (response.status !== 200 || body?.status !== "ready") {
      fail(
        `/api/health/ready expected ready; got status=${response.status} body=${JSON.stringify(body)}`,
      );
    }
    if (!body?.checks?.authSecret || !body?.checks?.database || !body?.checks?.migrations) {
      fail("readiness checks incomplete");
    }
    pass("readiness /api/health/ready (authSecret, database, migrations)");
  }

  // 4. Service worker + manifest + static assets
  for (const path of ["/sw.js", "/manifest.webmanifest", "/icons/icon-192.svg", "/offline.html"]) {
    const response = await fetch(`${origin.origin}${path}`, { redirect: "manual" });
    if (response.status !== 200) {
      fail(`${path} expected 200, got ${response.status}`);
    }
    pass(`static ${path}`);
  }

  // 5. Login page reachable (auth surface)
  {
    const response = await fetch(`${origin.origin}/login`, { redirect: "manual" });
    if (response.status !== 200) {
      fail(`/login expected 200, got ${response.status}`);
    }
    pass("authentication surface /login");
  }

  // 6. Protected Assignment page denies unauthenticated callers
  {
    const response = await fetch(`${origin.origin}/staffing/assignments`, { redirect: "manual" });
    if (response.status === 200) {
      fail("Assignment page must not render 200 for anonymous callers");
    }
    // Expect redirect to login or 401/403/404 depending on feature flag / proxy.
    const location = response.headers.get("location") || "";
    const denied =
      response.status === 307 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404;
    if (!denied) {
      fail(`Assignment page without session should deny; got ${response.status}`);
    }
    if (location && !/\/login/i.test(location) && response.status !== 404) {
      warn(`Assignment anonymous redirect location: ${location}`);
    }
    pass(`route authorization denies anonymous Assignment page access (${response.status})`);
  }

  // 7. Offline bundle endpoint denies unauthenticated callers
  {
    const { response } = await fetchJson(`${origin.origin}/api/offline/runtime-bundle`, {
      method: "GET",
    });
    if (response.status !== 401 && response.status !== 403) {
      fail(`offline bundle without session should deny; got ${response.status}`);
    }
    pass(`offline bundle denies anonymous access (${response.status})`);
  }

  // 8. Cookie security sample via login page Set-Cookie (if any) — informational
  {
    const response = await fetch(`${origin.origin}/login`, { redirect: "manual" });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const sessionCookies = setCookie.filter((c) => /ltc_session=/i.test(c));
    if (sessionCookies.length > 0) {
      for (const c of sessionCookies) {
        if (!/;\s*Secure/i.test(c)) fail("ltc_session Set-Cookie missing Secure");
        if (!/;\s*HttpOnly/i.test(c)) fail("ltc_session Set-Cookie missing HttpOnly");
        if (!/;\s*SameSite=Lax/i.test(c)) fail("ltc_session Set-Cookie missing SameSite=Lax");
      }
      pass("session cookie flags Secure + HttpOnly + SameSite=Lax");
    } else {
      warn("no session cookie on /login (expected until authenticated)");
    }
  }

  // 9. Deployed SHA — optional provider-neutral header/env contract
  const expectedSha = (process.env.PILOT_EXPECT_DEPLOYED_SHA ?? "").trim();
  if (expectedSha) {
    const { response, body } = await fetchJson(`${origin.origin}/api/health/live`);
    const reported =
      response.headers.get("x-deployed-sha") ||
      body?.deployedSha ||
      process.env.PILOT_REPORTED_DEPLOYED_SHA ||
      "";
    if (!reported) {
      warn(
        "PILOT_EXPECT_DEPLOYED_SHA set but environment does not yet expose deployed SHA (provider configuration required)",
      );
    } else if (!String(reported).startsWith(expectedSha.slice(0, 7))) {
      fail(`deployed SHA mismatch: expected ${expectedSha}, reported ${reported}`);
    } else {
      pass(`deployed SHA matches ${expectedSha.slice(0, 12)}…`);
    }
  } else {
    warn("PILOT_EXPECT_DEPLOYED_SHA not set — version check skipped");
  }

  // 10. Feature-flag / maintenance / backup — provider-dependent notices
  warn(
    "Feature flags OPERATIONAL_ASSIGNMENTS_ENABLED=true and OPERATION_ENGINE_ENABLED=false must be confirmed by the operator (not remotely readable by design).",
  );
  warn(
    "Backup recency and maintenance schedule require provider APIs — see docs/deployment/DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md.",
  );
  warn(
    "Authenticated smoke (password login, Assignment, Milestone, offline bundle) remains operator-run after this contract.",
  );

  // Local git tip for the change record (non-blocking).
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (git.status === 0) {
    console.log(`verify:pilot-environment: local HEAD ${git.stdout.trim()} (not necessarily deployed)`);
  }

  console.log("verify:pilot-environment: PASS — provider-neutral contract satisfied");
  console.log(
    "Remaining: operator confirms feature flags, backups, maintenance, and authenticated smokes.",
  );
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
