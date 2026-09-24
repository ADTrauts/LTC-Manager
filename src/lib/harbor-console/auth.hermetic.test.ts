import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "@/lib/auth";
import {
  createHarborSessionToken,
  HARBOR_TOKEN_USE,
  verifyHarborSessionToken,
} from "@/lib/harbor-console/session";

process.env.AUTH_SECRET ??= "harbor-session-hermetic-secret";

test("Harbor tokens are distinct from facility sessions", async () => {
  const harbor = await createHarborSessionToken({
    uid: "staff_1",
    email: "andrew.trautman@vssyl.com",
    name: "Andrew Trautman",
    staffRole: "OWNER",
    sessionVersion: 0,
  });
  const payload = await verifyHarborSessionToken(harbor);
  assert.equal(payload.tokenUse, HARBOR_TOKEN_USE);
  assert.equal(payload.staffRole, "OWNER");
  assert.equal(payload.email, "andrew.trautman@vssyl.com");

  const facility = await createSessionToken({
    uid: "user_1",
    role: "FACILITY_ADMINISTRATOR",
    name: "Admin",
    email: "admin@terraceview.local",
    facilityId: "fac_1",
    sessionVersion: 0,
  });
  await assert.rejects(() => verifyHarborSessionToken(facility), /Not a Harbor session/);
});
