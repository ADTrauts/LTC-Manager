import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvsDefaultCyclePlans } from "./defaults";
import { buildEvsStarterPreview, evsStarterPlansToCreate, evsStarterWouldCreateCount } from "./evs-starter";

describe("EVS cycle starter", () => {
  it("uses the existing Morning / Afternoon / Evening structure", () => {
    const preview = buildEvsStarterPreview();
    assert.deepEqual(
      preview.map((root) => root.label),
      ["Morning Operations", "Afternoon Operations", "Evening Operations"],
    );
    assert.equal(evsStarterWouldCreateCount(new Set()), buildEvsDefaultCyclePlans().length);
  });

  it("skips existing stable keys and does not invent extra periods", () => {
    const missing = evsStarterPlansToCreate(new Set(["morning_routine"]));
    assert.ok(!missing.some((plan) => plan.stableKey === "morning_routine"));
    assert.ok(missing.some((plan) => plan.stableKey === "day_cleaning"));
    assert.equal(missing.length, 2);
    assert.ok(!missing.some((plan) => /breakfast|lunch|dinner/i.test(plan.label)));
  });
});
