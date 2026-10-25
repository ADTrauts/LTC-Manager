import assert from "node:assert/strict";
import test from "node:test";

import { partnerMaySetUpDepartment } from "./partner-setup";

test("partner setup is the accepted head or a Partner Manager", () => {
  assert.equal(
    partnerMaySetUpDepartment({ mode: "MANAGE", isHead: true, effectiveRole: "PARTNER_MANAGER" }),
    true,
  );
  assert.equal(
    partnerMaySetUpDepartment({ mode: "MANAGE", isHead: false, effectiveRole: "PARTNER_MANAGER" }),
    true,
  );
  assert.equal(
    partnerMaySetUpDepartment({ mode: "MANAGE", isHead: false, effectiveRole: "PARTNER_OPERATOR" }),
    false,
  );
  assert.equal(
    partnerMaySetUpDepartment({ mode: "VIEW", isHead: true, effectiveRole: "PARTNER_MANAGER" }),
    false,
  );
});
