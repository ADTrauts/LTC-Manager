import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductAreaLabel, resolveProductModeForPath } from "@/lib/product-mode";

test("legacy /issues path labels as Maintenance (Repair façade), not Issues", () => {
  assert.equal(resolveProductModeForPath("/issues/abc"), "RUN");
  assert.equal(resolveProductAreaLabel("/issues/abc"), "Maintenance");
});

test("Asset Issues and Repairs share the RUN Maintenance category", () => {
  assert.equal(resolveProductAreaLabel("/asset-issues/abc"), "Maintenance");
  assert.equal(resolveProductAreaLabel("/repairs"), "Maintenance");
  assert.equal(resolveProductAreaLabel("/assets"), "Maintenance");
});
