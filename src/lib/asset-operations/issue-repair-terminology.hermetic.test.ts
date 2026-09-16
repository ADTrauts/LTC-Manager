import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductAreaLabel, resolveProductModeForPath } from "@/lib/product-mode";

test("legacy /issues path labels as Repairs (Repair façade), not Issues", () => {
  assert.equal(resolveProductModeForPath("/issues/abc"), "RUN");
  assert.equal(resolveProductAreaLabel("/issues/abc"), "Repairs");
});

test("Asset Issues path stays distinct from Repairs", () => {
  assert.equal(resolveProductAreaLabel("/asset-issues/abc"), "Asset Issues");
  assert.equal(resolveProductAreaLabel("/repairs"), "Repairs");
});
