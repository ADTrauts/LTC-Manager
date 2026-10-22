import assert from "node:assert/strict";
import test from "node:test";

import {
  maintainerChangeNeedsAcceptance,
  repairCompanyAudience,
  vendorRepairCostIsPrivate,
} from "./asset-maintainers";

test("naming your own organization as maintainer applies immediately", () => {
  assert.equal(
    maintainerChangeNeedsAcceptance({
      proposerOrganizationId: "metz",
      proposedOrganizationId: "metz",
    }),
    false,
  );
  assert.equal(
    maintainerChangeNeedsAcceptance({
      proposerOrganizationId: "metz",
      proposedOrganizationId: null,
    }),
    false,
  );
});

test("naming the other party waits for that party to accept", () => {
  assert.equal(
    maintainerChangeNeedsAcceptance({
      proposerOrganizationId: "metz",
      proposedOrganizationId: "ecmc",
    }),
    true,
  );
});

test("a vendor team sees only its repair companies, and the facility sees its own", () => {
  assert.equal(repairCompanyAudience({
    enforcementEnabled: false,
    seesFacilityCompanies: false,
    facilityOrganizationId: "ecmc",
    vendorOrganizationIds: ["metz"],
  }).kind, "all");
  assert.deepEqual(
    repairCompanyAudience({
      enforcementEnabled: true,
      seesFacilityCompanies: false,
      facilityOrganizationId: "ecmc",
      vendorOrganizationIds: ["metz"],
    }),
    { kind: "vendor", organizationIds: ["metz"] },
  );
  assert.equal(
    repairCompanyAudience({
      enforcementEnabled: true,
      seesFacilityCompanies: true,
      facilityOrganizationId: "ecmc",
      vendorOrganizationIds: ["metz"],
    }).kind,
    "facility",
  );
});

test("a vendor-paid repair cost stays with the vendor's team", () => {
  assert.equal(
    vendorRepairCostIsPrivate({
      enforcementEnabled: true,
      payerIsVendor: true,
      viewerIsVendorTeam: false,
    }),
    true,
  );
  assert.equal(
    vendorRepairCostIsPrivate({
      enforcementEnabled: true,
      payerIsVendor: true,
      viewerIsVendorTeam: true,
    }),
    false,
  );
  assert.equal(
    vendorRepairCostIsPrivate({
      enforcementEnabled: false,
      payerIsVendor: true,
      viewerIsVendorTeam: false,
    }),
    false,
  );
});
