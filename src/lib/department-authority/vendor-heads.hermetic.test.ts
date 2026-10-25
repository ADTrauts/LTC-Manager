import assert from "node:assert/strict";
import test from "node:test";

import { vendorHeadNavItems } from "./vendor-nav";
import { vendorAccountIsHead, vendorHeadAcceptedForPeriod } from "./vendor-heads";

test("acceptance counts only for the operator period in force", () => {
  const accepted = { operatorRelationshipId: "period_metz", assigneeUserId: "user_gm" };
  assert.equal(vendorHeadAcceptedForPeriod(accepted, "period_metz"), true);
  assert.equal(vendorHeadAcceptedForPeriod(accepted, "period_earlier"), false);
  assert.equal(vendorHeadAcceptedForPeriod(undefined, "period_metz"), false);
});

test("the vendor head's navigation stays off until they run the Department", () => {
  assert.deepEqual(
    vendorHeadNavItems({ people: false, coverage: false, rhythm: false, work: false, menus: false }),
    [],
  );
  assert.deepEqual(
    vendorHeadNavItems({ people: true, coverage: true, rhythm: true, work: true, menus: true }).map(
      (item) => item.href,
    ),
    [
      "/partner/people",
      "/partner/coverage",
      "/partner/rhythm",
      "/partner/work",
      "/partner/menus",
      "/partner/department",
    ],
  );
});

test("the accepted vendor account is the head", () => {
  assert.equal(
    vendorAccountIsHead({
      sessionKind: "vendor",
      sessionUserId: "user_gm",
      vendorHeadAccepted: true,
      assigneeUserId: "user_gm",
    }),
    true,
  );
  assert.equal(
    vendorAccountIsHead({
      sessionKind: "internal",
      sessionUserId: "user_gm",
      vendorHeadAccepted: true,
      assigneeUserId: "user_gm",
    }),
    false,
  );
  assert.equal(
    vendorAccountIsHead({
      sessionKind: "vendor",
      sessionUserId: "user_other",
      vendorHeadAccepted: true,
      assigneeUserId: "user_gm",
    }),
    false,
  );
});
