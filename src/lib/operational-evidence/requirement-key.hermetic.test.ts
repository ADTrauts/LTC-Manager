import assert from "node:assert/strict";
import test from "node:test";

import { buildRequirementKey } from "./requirement-key";

test("buildRequirementKey joins segments deterministically", () => {
  const key = buildRequirementKey({
    templateStableKey: "cooler_temp",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKey: "morning_prep",
    windowStartLocal: "05:00",
    windowEndLocal: "07:00",
    unitId: "unit1",
    spaceId: null,
    assetId: "asset1",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(
    key,
    "cooler_temp|OPERATIONAL_CYCLE|morning_prep|05:00|07:00|unit1|-|asset1|2026-08-06",
  );
});

test("missing optional segments become dash placeholders", () => {
  const key = buildRequirementKey({
    templateStableKey: "opening",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(key, "opening|ONCE_PER_OPERATIONAL_DATE|-|-|-|-|-|-|2026-08-06");
});

test("same inputs always produce the same key", () => {
  const parts = {
    templateStableKey: "dishwasher",
    scheduleKind: "FIXED_DAILY_WINDOW" as const,
    windowStartLocal: "19:00",
    windowEndLocal: "21:00",
    operationalDateKey: "2026-08-06",
  };
  assert.equal(buildRequirementKey(parts), buildRequirementKey(parts));
});
