#!/usr/bin/env node
/**
 * Lightweight repository hygiene — no external scanning product.
 *
 * Detects tracked secrets/generated artifacts that must not ship. Placeholders that are
 * deliberately documented (seed demo password, .env.example) are allowlisted narrowly.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function fail(message) {
  console.error(`repository-hygiene: FAIL — ${message}`);
  process.exit(1);
}

function gitTracked() {
  return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Paths that may mention nonproduction demo credentials by design. */
const ALLOWLISTED_DEMO_PATHS = new Set([
  "prisma/seed.mjs",
  "docs/engineering/CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md",
  "docs/engineering/CONTINUOUS_VERIFICATION_PHASE_5_REMEDIATION_2026-08-05.md",
  "docs/engineering/MIGRATION_HISTORY_EXCEPTIONS.md",
  "docs/security/AUTHORIZATION_INTEGRITY_PHASE_4_2026-08-05.md",
  "docs/security/RUNTIME_HARDENING_PHASE_3_2026-08-04.md",
  "docs/security/AUTHORIZATION_HARDENING_PHASE_2_2026-08-04.md",
  "docs/security/AUTHENTICATION_HARDENING_PHASE_1_2026-08-04.md",
]);

const FORBIDDEN_TRACKED = [
  // Any dotenv-style file except the approved template.
  /^\.env($|\.)/,
  /^\.next\//,
  /^node_modules\//,
  /\.sql\.gz$/,
  /\.dump$/,
  /\.pem$/,
  /\.p12$/,
];

// Real-looking private key / token patterns (not seed placeholders).
const SECRET_PATTERNS = [
  { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-pat", re: /ghp_[A-Za-z0-9]{36,}/ },
  {
    name: "postgres-url-with-password",
    // Placeholders like USER:PASSWORD or user:pass are documentation, not credentials.
    re: /postgres(?:ql)?:\/\/(?!USER:PASSWORD|user:pass|USER:PASS)[^:\s/\n]+:[^@\s/\n]{4,}@/i,
  },
];

function main() {
  const tracked = gitTracked();
  const findings = [];

  for (const path of tracked) {
    for (const re of FORBIDDEN_TRACKED) {
      if (re.test(path)) {
        // .env.example is the one approved dotenv template.
        if (path === ".env.example") continue;
        findings.push(`forbidden tracked path: ${path}`);
      }
    }
  }

  // Also refuse dotenv files that are staged but not yet in HEAD (pre-commit style).
  try {
    const staged = execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const path of staged) {
      if (/^\.env($|\.)/.test(path) && path !== ".env.example") {
        findings.push(`staged forbidden dotenv path: ${path}`);
      }
    }
  } catch {
    // ignore if not a git repo
  }

  // Working-tree generated dirs must not be present as tracked content (already covered)
  // and must not exist as accidental commits of dumps at repo root.
  for (const name of [".next", "node_modules"]) {
    // existence is fine locally; tracking is not
    if (tracked.some((p) => p === name || p.startsWith(`${name}/`))) {
      findings.push(`generated directory is tracked: ${name}`);
    }
  }

  // Scan text-ish tracked files for credential patterns (skip lockfiles and large binaries).
  const scanExt = /\.(md|mjs|js|ts|tsx|json|yml|yaml|toml|env|sh|txt|prisma)$/;
  for (const path of tracked) {
    if (!scanExt.test(path)) continue;
    if (path === "package-lock.json") continue;
    let content;
    try {
      content = readFileSync(join(ROOT, path), "utf8");
    } catch {
      continue;
    }
    if (content.length > 1_500_000) continue;

    for (const { name, re } of SECRET_PATTERNS) {
      if (!re.test(content)) continue;
      if (
        name === "postgres-url-with-password" &&
        (ALLOWLISTED_DEMO_PATHS.has(path) ||
          path.startsWith("scripts/verify/") ||
          path.startsWith("scripts/maintenance/") ||
          path.startsWith(".github/workflows/") ||
          path.includes(".test."))
      ) {
        // Workflows may include an intentional ltc_manager URL only inside a negative safety test.
        // Documentation and fixtures may mention the name. A real local .env must never be tracked.
        continue;
      }
      if (ALLOWLISTED_DEMO_PATHS.has(path) && name === "postgres-url-with-password") {
        continue;
      }
      findings.push(`possible ${name} in tracked file ${path}`);
    }
  }

  // Explicit: no tracked .env except .env.example
  if (tracked.includes(".env")) {
    findings.push("tracked .env file");
  }

  // seed demo password must be marked nonproduction if present
  if (existsSync(join(ROOT, "prisma/seed.mjs"))) {
    const seed = readFileSync(join(ROOT, "prisma/seed.mjs"), "utf8");
    if (/passwordHash|bcrypt\.hash|password\s*[:=]/.test(seed)) {
      if (!/nonproduction|demo|local development|Terrace View seed/i.test(seed)) {
        findings.push("prisma/seed.mjs appears to set a password without a nonproduction marker");
      }
    }
  }

  if (findings.length > 0) {
    for (const f of findings) console.error(`  - ${f}`);
    fail(`${findings.length} hygiene finding(s)`);
  }

  console.log("repository-hygiene: PASS");
  console.log(`  tracked files scanned: ${tracked.length}`);
}

main();
