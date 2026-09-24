import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "@/lib/auth";
import { composeHarborWorkAppSession } from "@/lib/harbor-console/work-payload";
import {
  createHarborSessionToken,
  createHarborWorkToken,
  HARBOR_TOKEN_USE,
  HARBOR_WORK_TOKEN_USE,
  verifyHarborSessionToken,
  verifyHarborWorkToken,
} from "@/lib/harbor-console/session";

process.env.AUTH_SECRET ??= "harbor-work-session-hermetic-secret";

test("work tokens are distinct from Harbor login and facility sessions", async () => {
  const harbor = await createHarborSessionToken({
    uid: "staff_1",
    email: "andrew.trautman@vssyl.com",
    name: "Andrew Trautman",
    staffRole: "OWNER",
    sessionVersion: 0,
  });
  const work = await createHarborWorkToken({ staffId: "staff_1", facilityId: "fac_1" });
  const harborPayload = await verifyHarborSessionToken(harbor);
  const workPayload = await verifyHarborWorkToken(work);

  assert.equal(harborPayload.tokenUse, HARBOR_TOKEN_USE);
  assert.equal(workPayload.tokenUse, HARBOR_WORK_TOKEN_USE);
  assert.equal(workPayload.staffId, "staff_1");
  assert.equal(workPayload.facilityId, "fac_1");

  await assert.rejects(() => verifyHarborWorkToken(harbor), /Not a Harbor work session/);
  await assert.rejects(() => verifyHarborSessionToken(work), /Not a Harbor session/);

  const facility = await createSessionToken({
    uid: "user_1",
    role: "FACILITY_ADMINISTRATOR",
    name: "Admin",
    email: "admin@terraceview.local",
    facilityId: "fac_1",
    sessionVersion: 0,
  });
  await assert.rejects(() => verifyHarborWorkToken(facility), /Not a Harbor work session/);
});

test("composed work session is Harbor staff, not a facility User", () => {
  const session = composeHarborWorkAppSession(
    {
      uid: "staff_1",
      tokenUse: HARBOR_TOKEN_USE,
      email: "andrew.trautman@vssyl.com",
      name: "Andrew Trautman",
      staffRole: "OWNER",
      sessionVersion: 4,
    },
    "fac_1",
  );
  assert.equal(session.authKind, "harbor_staff");
  assert.equal(session.uid, "staff_1");
  assert.equal(session.role, "FACILITY_ADMINISTRATOR");
  assert.equal(session.authMethod, "PASSWORD");
  assert.equal(session.facilityId, "fac_1");
  assert.equal(session.sessionVersion, 4);
});
