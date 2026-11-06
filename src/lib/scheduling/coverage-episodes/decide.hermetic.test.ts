import assert from "node:assert/strict";
import test from "node:test";

import { decideCoverageEpisodeTransition } from "./decide";

test("coverage episode transitions follow the derived answer", () => {
  assert.equal(decideCoverageEpisodeTransition("COVERED", "AT_RISK").action, "open");
  assert.equal(decideCoverageEpisodeTransition("COVERED", "UNCOVERED").action, "open");
  assert.equal(decideCoverageEpisodeTransition("NOT_YET_ASSIGNED", "UNCOVERED").action, "open");
  assert.equal(decideCoverageEpisodeTransition("NOT_CONFIRMED", "AT_RISK").action, "open");
  assert.equal(decideCoverageEpisodeTransition(null, "UNCOVERED").action, "open");

  const worsened = decideCoverageEpisodeTransition("AT_RISK", "UNCOVERED");
  assert.equal(worsened.action, "continue");
  if (worsened.action === "continue") assert.equal(worsened.eventType, "coverage.became_uncovered");
  const eased = decideCoverageEpisodeTransition("UNCOVERED", "AT_RISK");
  assert.equal(eased.action, "continue");

  assert.equal(decideCoverageEpisodeTransition("COVERED", "COVERED").action, "none");
  assert.equal(decideCoverageEpisodeTransition("UNCOVERED", "UNCOVERED").action, "none");
  assert.equal(decideCoverageEpisodeTransition("AT_RISK", "AT_RISK").action, "none");
  assert.equal(decideCoverageEpisodeTransition("NOT_YET_ASSIGNED", "NOT_CONFIRMED").action, "none");
  assert.equal(decideCoverageEpisodeTransition("NOT_APPLICABLE", "COVERED").action, "none");

  const restored = decideCoverageEpisodeTransition("UNCOVERED", "COVERED");
  assert.deepEqual(restored, {
    action: "close",
    closeReason: "RESTORED",
    toState: "COVERED",
    eventType: "coverage.restored",
  });
  assert.equal(decideCoverageEpisodeTransition("AT_RISK", "COVERED").action, "close");

  const removed = decideCoverageEpisodeTransition("UNCOVERED", null);
  assert.equal(removed.action, "close");
  if (removed.action === "close") {
    assert.equal(removed.closeReason, "REQUIREMENT_REMOVED");
    assert.equal(removed.eventType, null);
  }
  const ended = decideCoverageEpisodeTransition("AT_RISK", "WINDOW_ENDED");
  assert.equal(ended.action, "close");
  if (ended.action === "close") {
    assert.equal(ended.closeReason, "SERVICE_WINDOW_ENDED");
    assert.equal(ended.eventType, null);
  }
  assert.equal(decideCoverageEpisodeTransition("COVERED", "WINDOW_ENDED").action, "none");
});
