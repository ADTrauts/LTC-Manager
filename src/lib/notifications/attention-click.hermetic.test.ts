import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { safeAttentionReturn } from "./attention-click";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("a notification click can return only to that attention item", () => {
  assert.equal(
    safeAttentionReturn("/notifications?attention=cm1234567890abcd"),
    "/notifications?attention=cm1234567890abcd",
  );
  assert.equal(safeAttentionReturn("/notifications?attention=short"), null);
  assert.equal(safeAttentionReturn("/notifications?attention=cm1234567890abcd&next=/admin"), null);
  assert.equal(safeAttentionReturn("https://evil.test/notifications?attention=cm1234567890abcd"), null);
  assert.equal(safeAttentionReturn("//evil.test/notifications?attention=cm1234567890abcd"), null);
  assert.equal(safeAttentionReturn("/access?attention=cm1234567890abcd"), null);
  assert.equal(safeAttentionReturn("/notifications?notice=unavailable"), null);
});

test("the click path focuses an item and does not acknowledge it", () => {
  const page = source("src/app/(protected)/notifications/page.tsx");
  const enter = source("src/app/access/enter/route.ts");
  const center = source("src/components/notifications/notification-center.tsx");
  const worker = source("public/sw.js");
  assert.match(page, /resolveAttentionClick/);
  assert.match(page, /AttentionFacilityEntry/);
  assert.doesNotMatch(page, /acknowledgeNotificationAction\(/);
  assert.match(enter, /safeAttentionReturn/);
  assert.match(center, /data-attention-id/);
  assert.match(center, /FocusedAttention/);
  assert.match(worker, /ltc-offline-shell-v4/);
  assert.match(worker, /\/icons\/apple-touch-icon\.png/);
});

test("installed icons include a PNG the Home Screen can use", () => {
  const manifest = source("public/manifest.webmanifest");
  const layout = source("src/app/layout.tsx");
  const png = readFileSync("public/icons/icon-192.png");
  const apple = readFileSync("public/icons/apple-touch-icon.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(apple.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.match(manifest, /\/icons\/icon-192\.png/);
  assert.match(manifest, /\/icons\/icon-512\.png/);
  assert.match(manifest, /"purpose": "any"/);
  assert.doesNotMatch(manifest, /maskable/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(manifest, /"name": "Vssyl"/);
});
