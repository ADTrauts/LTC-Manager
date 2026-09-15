import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAssetLocationAriaLabel,
  formatAssetLocationLabel,
  resolveSpaceIdForUnitChange,
} from "./location-label";
import {
  presentAssetLifecycleAndCondition,
  runConditionSelectValues,
} from "./lifecycle-presentation";

test("location label — unit only", () => {
  assert.equal(
    formatAssetLocationLabel({ unitName: "Main Kitchen" }),
    "Main Kitchen",
  );
});

test("location label — unit + room", () => {
  assert.equal(
    formatAssetLocationLabel({ unitName: "Naval Park", spaceName: "Servery" }),
    "Naval Park → Servery",
  );
});

test("location aria uses room term", () => {
  assert.equal(
    formatAssetLocationAriaLabel({
      unitName: "Naval Park",
      spaceName: "Servery",
      roomTerm: "Room",
    }),
    "Naval Park, Room Servery",
  );
});

test("changing unit clears invalid room", () => {
  assert.equal(
    resolveSpaceIdForUnitChange({
      nextUnitId: "u2",
      currentSpaceId: "s1",
      eligibleSpaceIds: ["s2"],
    }),
    null,
  );
  assert.equal(
    resolveSpaceIdForUnitChange({
      nextUnitId: "u2",
      currentSpaceId: "s2",
      eligibleSpaceIds: ["s2"],
    }),
    "s2",
  );
});

test("lifecycle presentation — ACTIVE legacy maps to Operational condition", () => {
  const p = presentAssetLifecycleAndCondition("ACTIVE");
  assert.equal(p.lifecycle, "ACTIVE");
  assert.equal(p.lifecycleLabel, "Active");
  assert.equal(p.condition, "OPERATIONAL");
  assert.equal(p.conditionLabel, "Operational");
  assert.equal(p.summaryLabel, "Operational");
});

test("lifecycle presentation — Degraded and Out of Service stay Active lifecycle", () => {
  const degraded = presentAssetLifecycleAndCondition("DEGRADED");
  assert.equal(degraded.lifecycle, "ACTIVE");
  assert.equal(degraded.conditionLabel, "Degraded");
  assert.equal(degraded.summaryLabel, "Degraded");

  const oos = presentAssetLifecycleAndCondition("OUT_OF_SERVICE");
  assert.equal(oos.lifecycle, "ACTIVE");
  assert.equal(oos.conditionLabel, "Out of Service");
  assert.equal(oos.conditionTone, "critical");
});

test("lifecycle presentation — Retired is not shown as a temporary condition", () => {
  const p = presentAssetLifecycleAndCondition("RETIRED");
  assert.equal(p.lifecycle, "RETIRED");
  assert.equal(p.condition, null);
  assert.equal(p.conditionLabel, null);
  assert.equal(p.summaryLabel, "Retired");
  assert.deepEqual(runConditionSelectValues("RETIRED"), []);
});

test("RUN condition select excludes Retired for active assets", () => {
  assert.deepEqual(runConditionSelectValues("OPERATIONAL"), [
    "OPERATIONAL",
    "DEGRADED",
    "OUT_OF_SERVICE",
  ]);
});
