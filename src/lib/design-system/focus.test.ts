import assert from "node:assert/strict";
import test from "node:test";

import { FOCUS_RING_CLASS, FOCUS_RING_INPUT_CLASS } from "@/lib/design-system/focus";

test("focus ring recipes are keyboard-visible zinc outlines", () => {
  assert.match(FOCUS_RING_CLASS, /focus-visible:outline/);
  assert.match(FOCUS_RING_CLASS, /zinc-900/);
  assert.match(FOCUS_RING_INPUT_CLASS, /focus-visible:ring-2/);
});
