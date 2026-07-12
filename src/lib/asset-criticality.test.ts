import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_CRITICALITY_OPTIONS,
  normalizeAssetCriticality,
  assetCriticalityLabel,
} from "@/lib/asset-criticality";

test("asset criticality options expose operator-facing labels", () => {
  assert.equal(ASSET_CRITICALITY_OPTIONS.length, 3);
  assert.equal(assetCriticalityLabel("CRITICAL"), "Critical");
  assert.equal(normalizeAssetCriticality(null), "ROUTINE");
});
