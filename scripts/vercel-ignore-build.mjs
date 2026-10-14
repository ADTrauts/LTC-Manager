#!/usr/bin/env node
/**
 * Vercel Ignored Build Step.
 * Exit 0 = skip the build (do not create another Function Storage copy).
 * Exit 1 = build.
 *
 * Hobby Function Storage is filled by retained deployments, not users.
 * Skip when the commit only touches documentation / agent notes.
 */
import { execSync } from "node:child_process";

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function shouldSkipPath(path) {
  return (
    path === "docs" ||
    path.startsWith("docs/") ||
    path === ".agents" ||
    path.startsWith(".agents/") ||
    path === ".codex" ||
    path.startsWith(".codex/") ||
    path.endsWith(".md")
  );
}

function previousSha() {
  const fromVercel = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (fromVercel) return fromVercel;
  try {
    git("rev-parse --verify HEAD^");
    return "HEAD^";
  } catch {
    return null;
  }
}

try {
  git("rev-parse --verify HEAD");
} catch {
  process.exit(1);
}

const compare = previousSha();
if (!compare) {
  process.exit(1);
}

const changed = git(`diff --name-only ${compare} HEAD`)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (changed.length === 0 || changed.every(shouldSkipPath)) {
  console.log("vercel-ignore-build: docs-only change, skip");
  process.exit(0);
}

console.log("vercel-ignore-build: app files changed, build");
process.exit(1);
