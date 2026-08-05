import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression: Phase 6A browser certification found SignOutControls did not invoke
 * clearForSignOut / clearAllOfflineData before session cookies were cleared.
 */
test("SignOutControls wires IndexedDB clearance on standard and full logout", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/sign-out-controls.tsx"),
    "utf8",
  );
  assert.match(source, /clearForSignOut/);
  assert.match(source, /clearAllOfflineData/);
  assert.match(source, /prepareStandardSignOut/);
  assert.match(source, /prepareFullSignOut/);
});

test("OfflineConflictReview exposes Apply as correction resolution", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/offline/offline-conflict-review.tsx"),
    "utf8",
  );
  assert.match(source, /APPLIED_AS_CORRECTION/);
  assert.match(source, /Apply as correction/);
});

test("sync engine and OfflineServeryControls listen for browser offline events", () => {
  const engine = readFileSync(join(process.cwd(), "src/lib/offline/sync-engine.ts"), "utf8");
  const controls = readFileSync(
    join(process.cwd(), "src/components/offline/offline-servery-controls.tsx"),
    "utf8",
  );
  assert.match(engine, /addEventListener\("offline"/);
  assert.match(controls, /addEventListener\("offline"/);
});

test("sync engine does not dynamically import local-store for enqueue (offline-safe)", () => {
  const engine = readFileSync(join(process.cwd(), "src/lib/offline/sync-engine.ts"), "utf8");
  assert.doesNotMatch(engine, /import\(["'].\/local-store["']\)/);
  assert.match(engine, /enqueueCommand/);
});

test("local-store wraps sealed commands with clientCommandId for IndexedDB keyPath", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/offline/local-store.ts"), "utf8");
  assert.match(source, /SealedCommandRow/);
  assert.match(source, /clientCommandId: command\.clientCommandId/);
  assert.match(source, /sealed/);
});
