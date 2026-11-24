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
    assert.ok(missing.some((plan) => plan.stableKey === "evening_closeout"));
    assert.ok(missing.some((plan) => plan.stableKey === "morning_routine_area_ready"));
    assert.ok(!missing.some((plan) => /breakfast|lunch|dinner/i.test(plan.label)));
  });

  it("uses Key Points and does not target a Location Function", () => {
    const plans = buildEvsDefaultCyclePlans();
    const opened = plans.filter((plan) => plan.stableKey.endsWith("_shift_opened"));
    const ready = plans.filter((plan) => plan.stableKey.endsWith("_area_ready"));
    assert.equal(opened.length, 3);
    assert.equal(ready.length, 3);
    assert.ok(opened.every((plan) => plan.occurrenceTracking === "NONE" && plan.keyPointGrain === "DEPARTMENT"));
    assert.ok(ready.every((plan) => plan.occurrenceTracking === "REQUIRED" && plan.keyPointGrain === "LOCATION"));
    assert.ok(plans.every((plan) => !("applicableOperationalTypeKeys" in plan)));
  });
});
