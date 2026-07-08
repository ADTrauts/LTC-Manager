import assert from "node:assert/strict";
import test from "node:test";

import { getTodayWindow } from "@/lib/operations-center/get-today-window";

test("getTodayWindow returns local midnight through next midnight", () => {
  const reference = new Date("2026-07-08T15:30:00");
  const { start, end } = getTodayWindow(reference);

  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 6);
  assert.equal(start.getDate(), 8);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);

  assert.equal(end.getDate(), 9);
  assert.equal(end.getHours(), 0);
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});
