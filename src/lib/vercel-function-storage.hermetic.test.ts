import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("next config excludes docs and tests from function traces", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /outputFileTracingExcludes/);
  // Next 16 automatically externalizes @prisma/client; no redundant override.
  assert.match(config, /docs\/\*\*/);
  assert.match(config, /tests\/\*\*/);
  assert.match(config, /\*\*\/\*\.test\.ts/);
});

test("ignored build step skips documentation-only commits", () => {
  const script = readFileSync(join(root, "scripts/vercel-ignore-build.mjs"), "utf8");
  assert.match(script, /Exit 0 = skip/);
  assert.match(script, /docs-only change, skip/);
  assert.match(script, /path\.startsWith\("docs\/"\)/);
  assert.match(script, /path\.endsWith\("\.md"\)/);
});

test("vercel upload ignore list keeps docs and tests off the deployment", () => {
  const ignore = readFileSync(join(root, ".vercelignore"), "utf8");
  assert.match(ignore, /^docs$/m);
  assert.match(ignore, /^tests$/m);
  assert.doesNotMatch(ignore, /^scripts$/m);
  assert.doesNotMatch(ignore, /^src$/m);
  assert.doesNotMatch(ignore, /^prisma$/m);
});
