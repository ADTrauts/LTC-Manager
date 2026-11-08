import assert from "node:assert/strict";
import test from "node:test";

import { isOnCallCoverageRole, onCallCoverageRoleKey } from "./on-call-coverage";
import { isSupervisoryResponsibilityRole } from "./on-duty-supervisor";

test("on-call coverage is a department assignment role, not supervision or a job", () => {
  assert.equal(onCallCoverageRoleKey("DIETARY"), "DIETARY_ON_CALL_COVERAGE");
  assert.equal(onCallCoverageRoleKey("EVS"), "EVS_ON_CALL_COVERAGE");
  assert.equal(onCallCoverageRoleKey("PLANT"), "ON_CALL_COVERAGE");
  assert.equal(onCallCoverageRoleKey("FUTURE"), null);

  assert.equal(isOnCallCoverageRole("ON_CALL_COVERAGE"), true);
  assert.equal(isOnCallCoverageRole("DIETARY_SUPERVISOR_ROUNDING"), false);
  assert.equal(isOnCallCoverageRole("WORK_ORDER_RESPONSE"), false);
  assert.equal(isSupervisoryResponsibilityRole("ON_CALL_COVERAGE"), false);
  assert.equal(isSupervisoryResponsibilityRole("DIETARY_ON_CALL_COVERAGE"), false);
});
