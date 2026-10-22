import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

import { DEPARTMENT_OWNER_KINDS } from "./owners";
import { WRITE_MANIFEST, WRITE_MANIFEST_MODE, type WriteClass } from "./write-manifest";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function toRepoPath(abs: string): string {
  return relative(ROOT, abs).split(sep).join("/");
}

/** Exported server actions and write route handlers, as `file → export names`. */
function discoverWrites(): Map<string, Set<string>> {
  const writes = new Map<string, Set<string>>();
  for (const abs of walk(join(ROOT, "src"), [])) {
    const source = readFileSync(abs, "utf8");
    const file = toRepoPath(abs);
    const names = new Set<string>();
    if (/^["']use server["'];?\s*$/m.test(source)) {
      for (const match of source.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*=\s*async\b/gm)) {
        names.add((match[1] ?? match[2])!);
      }
    }
    if (/\/route\.tsx?$/.test(file)) {
      for (const match of source.matchAll(/^export (?:async )?(?:function|const) (\w+)\b/gm)) {
        if (WRITE_METHODS.includes(match[1]!)) names.add(match[1]!);
      }
    }
    if (names.size > 0) writes.set(file, names);
  }
  return writes;
}

test("write manifest: every listed write exists, and Department rows name an owner resolver", () => {
  const discovered = discoverWrites();
  const stale: string[] = [];
  const badOwners: string[] = [];
  for (const [file, exports] of Object.entries(WRITE_MANIFEST)) {
    for (const [name, entry] of Object.entries(exports)) {
      if (!discovered.get(file)?.has(name)) stale.push(`${file}#${name}`);
      if ("owner" in entry && entry.owner && !DEPARTMENT_OWNER_KINDS.includes(entry.owner)) {
        badOwners.push(`${file}#${name} → ${entry.owner}`);
      }
      if (entry.class === "DEPARTMENT" && !("owner" in entry && entry.owner)) {
        badOwners.push(`${file}#${name} → missing owner`);
      }
    }
  }
  assert.deepEqual(stale, [], "manifest rows without a matching export");
  assert.deepEqual(badOwners, []);
});

test(`write manifest (${WRITE_MANIFEST_MODE} mode)`, (t) => {
  const discovered = discoverWrites();
  const unlisted: string[] = [];
  const byClass = new Map<WriteClass, number>();
  let total = 0;
  for (const [file, names] of discovered) {
    for (const name of names) {
      total += 1;
      const entry = WRITE_MANIFEST[file]?.[name];
      if (!entry) {
        unlisted.push(`${file}#${name}`);
        continue;
      }
      byClass.set(entry.class, (byClass.get(entry.class) ?? 0) + 1);
    }
  }

  const departmentFiles = Object.entries(WRITE_MANIFEST)
    .filter(([, exports]) => Object.values(exports).some((entry) => entry.class === "DEPARTMENT"))
    .map(([file]) => file);
  const guardedFiles = departmentFiles.filter((file) =>
    /\b(requireDepartmentManage|resolveDepartmentAccess(Map)?)\b/.test(readFileSync(join(ROOT, file), "utf8")),
  );

  t.diagnostic(`writes discovered: ${total}`);
  for (const [writeClass, count] of [...byClass].sort(([a], [b]) => a.localeCompare(b))) {
    t.diagnostic(`  ${writeClass}: ${count}`);
  }
  t.diagnostic(`unlisted: ${unlisted.length}`);
  for (const entry of unlisted) t.diagnostic(`  unlisted ${entry}`);
  t.diagnostic(`Department files calling the resolver: ${guardedFiles.length} of ${departmentFiles.length}`);

  assert.ok(total > 0, "discovery found writes");
  if (WRITE_MANIFEST_MODE === "enforce") {
    assert.deepEqual(unlisted, [], "every write is classified");
  }
});
