import assert from "node:assert/strict";
import test from "node:test";
import { constrainOverlayPosition } from "./overlay-position";

test("long menus remain reachable in short, narrow and zoomed viewports", () => {
  for (const [viewportWidth, viewportHeight] of [[844, 390], [390, 844], [320, 320], [200, 150]]) {
    for (const [x, y] of [[-20, -40], [0, 0], [viewportWidth - 10, viewportHeight - 10], [800, 1200]]) {
      const box = constrainOverlayPosition({ x, y, width: 240, height: 480, viewportWidth, viewportHeight });
      assert.ok(box.left >= 8 && box.top >= 8, "the first action stays on screen");
      assert.ok(box.left + Math.min(240, box.maxWidth) <= viewportWidth - 8);
      assert.ok(box.top + Math.min(480, box.maxHeight) <= viewportHeight - 8);
    }
  }
});

test("a fitting menu stays at its trigger", () => {
  const box = constrainOverlayPosition({ x: 120, y: 80, width: 240, height: 200, viewportWidth: 1440, viewportHeight: 900 });
  assert.equal(box.left, 120);
  assert.equal(box.top, 80);
});
