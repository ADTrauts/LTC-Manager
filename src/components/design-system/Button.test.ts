import assert from "node:assert/strict";
import test from "node:test";

import { Button } from "@/components/design-system/Button";

test("Button exports a callable primary control component", () => {
  assert.equal(typeof Button, "function");
});
