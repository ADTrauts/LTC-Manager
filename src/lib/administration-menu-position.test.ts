import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMINISTRATION_MENU_MIN_WIDTH_PX,
  computeFixedMenuPosition,
} from "@/lib/administration-menu-position";

test("computeFixedMenuPosition anchors below the trigger by default", () => {
  const pos = computeFixedMenuPosition({
    triggerRect: { top: 8, left: 100, right: 220, bottom: 48, width: 120, height: 40 },
    viewport: { width: 1440, height: 900 },
    menuSize: { width: 264, height: 320 },
    gapPx: 4,
  });

  assert.equal(pos.top, 52);
  assert.equal(pos.left, 100);
  assert.equal(pos.minWidth, ADMINISTRATION_MENU_MIN_WIDTH_PX);
});

test("computeFixedMenuPosition right-aligns when near the viewport edge", () => {
  const pos = computeFixedMenuPosition({
    triggerRect: { top: 8, left: 1300, right: 1420, bottom: 48, width: 120, height: 40 },
    viewport: { width: 1440, height: 900 },
    menuSize: { width: 264, height: 320 },
    paddingPx: 8,
  });

  assert.equal(pos.left, 1420 - 264);
  assert.ok(pos.left + 264 <= 1440 - 8);
});

test("computeFixedMenuPosition clamps into the viewport when trigger is flush right", () => {
  const pos = computeFixedMenuPosition({
    triggerRect: { top: 8, left: 1400, right: 1435, bottom: 48, width: 35, height: 40 },
    viewport: { width: 1440, height: 900 },
    menuSize: { width: 264, height: 200 },
    paddingPx: 8,
  });

  assert.equal(pos.left, 1440 - 264 - 8);
  assert.ok(pos.left >= 8);
});

test("computeFixedMenuPosition shifts up when there is not enough space below", () => {
  const pos = computeFixedMenuPosition({
    triggerRect: { top: 700, left: 100, right: 220, bottom: 740, width: 120, height: 40 },
    viewport: { width: 1440, height: 800 },
    menuSize: { width: 264, height: 320 },
    gapPx: 4,
    paddingPx: 8,
  });

  assert.equal(pos.top, 800 - 320 - 8);
  assert.ok(pos.top < 740);
});
