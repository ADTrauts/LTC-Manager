import assert from "node:assert/strict";
import test from "node:test";

import { recordDashboardSettle } from "@/app/(protected)/dashboard/settle-action";

import { dashboardSettleElapsedMs } from "./settle";

test("a fresh Dashboard load counts from navigation start", () => {
  assert.equal(dashboardSettleElapsedMs({ nowMs: 1480.4, mountedAtMs: 620 }), 1480);
});

test("a later lens change counts from when that view mounted", () => {
  assert.equal(dashboardSettleElapsedMs({ nowMs: 90_000, mountedAtMs: 88_200 }), 1800);
});

test("settle is skipped when there is no facility session", async () => {
  await recordDashboardSettle({ elapsedMs: 1200, cardCount: 4, scope: "department:dept" });
});
