import assert from "node:assert/strict";
import test from "node:test";

import {
  workforceOperatorKey,
  workforceRecordMustSplit,
  type WorkforceOperatorFact,
} from "./workforce-records";

const facility = "org-facility";
const vendor = "org-vendor";

const contracted: WorkforceOperatorFact = {
  operatingModel: "CONTRACTED",
  operatorOrganizationId: vendor,
};
const selfOperated: WorkforceOperatorFact = {
  operatingModel: "FACILITY_OPERATED",
  operatorOrganizationId: facility,
};

test("a facility Department and a vendor-run Department need two workforce records", () => {
  const keys = [
    workforceOperatorKey(selfOperated, facility),
    workforceOperatorKey(contracted, facility),
  ];
  assert.equal(workforceRecordMustSplit(keys), true);
});

test("two facility Departments share one workforce record", () => {
  const keys = [
    workforceOperatorKey(selfOperated, facility),
    workforceOperatorKey(undefined, facility),
  ];
  assert.equal(workforceRecordMustSplit(keys), false);
  assert.equal(workforceOperatorKey(contracted, facility), `vendor:${vendor}`);
});
