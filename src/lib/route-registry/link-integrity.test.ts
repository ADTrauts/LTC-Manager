import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { matchPlatformRoute } from "@/lib/route-registry/match";

const SRC_DIR = resolve(process.cwd(), "src");

/**
 * Literal internal paths written into the product: `href="/x"`, `redirect("/x")`, `router.push("/x")`.
 *
 * Only static literals are collected. Paths built from template strings carry a dynamic segment and
 * are covered by the dynamic-route entries in the registry instead.
 */
const LINK_PATTERNS = [
  /href="(\/[^"?#${}]*)"/g,
  /(?:redirect|permanentRedirect)\("(\/[^"?#${}]*)"\)/g,
  /router\.(?:push|replace)\("(\/[^"?#${}]*)"\)/g,
];

function collectLinks(dir: string): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [path, files] of collectLinks(full)) {
        found.set(path, [...(found.get(path) ?? []), ...files]);
      }
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;

    const source = readFileSync(full, "utf8");
    for (const pattern of LINK_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const path = match[1];
        if (!path) continue;
        found.set(path, [...(found.get(path) ?? []), full]);
      }
    }
  }

  return found;
}

test("link integrity — every literal internal link resolves to a registered route", () => {
  const links = collectLinks(SRC_DIR);
  assert.ok(links.size > 0, "expected to find internal links to check");

  const unregistered = [...links.entries()]
    .filter(([path]) => matchPlatformRoute(path) === null)
    .map(([path, files]) => `${path}  (${[...new Set(files)].join(", ")})`);

  assert.deepEqual(
    unregistered,
    [],
    `Links point at paths the platform registry does not classify, which now fail closed:\n${unregistered.join("\n")}`,
  );
});

test("link integrity — no link points at the deferred /evs area", () => {
  const links = collectLinks(SRC_DIR);
  const evs = [...links.keys()].filter((path) => path.startsWith("/evs"));
  assert.deepEqual(evs, []);
});
