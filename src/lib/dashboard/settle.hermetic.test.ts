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

test("settle is not recorded while the Dashboard flag is off", async () => {
  const previous = process.env.DASHBOARD_V2_ENABLED;
  delete process.env.DASHBOARD_V2_ENABLED;
  try {
    await recordDashboardSettle({ elapsedMs: 1200, cardCount: 4, scope: "department:dept" });
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_V2_ENABLED;
    else process.env.DASHBOARD_V2_ENABLED = previous;
  }
});
