import assert from "node:assert/strict";
import test from "node:test";

import { getTodayWindow } from "@/lib/operations-center/get-today-window";

test("getTodayWindow returns facility-local midnight through next midnight", () => {
  const reference = new Date("2026-07-08T15:30:00.000Z");
  const { start, end } = getTodayWindow(reference, "UTC");

  assert.equal(start.toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-09T00:00:00.000Z");
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test("getTodayWindow defaults missing timezone to America/New_York", () => {
  // 03:30 UTC on Jul 9 is still Jul 8 evening in New York.
  const reference = new Date("2026-07-09T03:30:00.000Z");
  const { start } = getTodayWindow(reference);
  assert.equal(start.toISOString(), "2026-07-08T04:00:00.000Z");
});
