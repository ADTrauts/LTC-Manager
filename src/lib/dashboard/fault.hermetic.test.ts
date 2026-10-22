import assert from "node:assert/strict";
import test from "node:test";

import { dashboardFaultCardId } from "./fault";

test("a fault query does nothing unless the browser check turns injection on", () => {
  const previous = process.env.DASHBOARD_FAULT_INJECTION;
  delete process.env.DASHBOARD_FAULT_INJECTION;
  try {
    assert.equal(dashboardFaultCardId("timeline"), null);
    process.env.DASHBOARD_FAULT_INJECTION = "true";
    assert.equal(dashboardFaultCardId("timeline"), "timeline");
    assert.equal(dashboardFaultCardId("  "), null);
    assert.equal(dashboardFaultCardId(undefined), null);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_FAULT_INJECTION;
    else process.env.DASHBOARD_FAULT_INJECTION = previous;
  }
});
