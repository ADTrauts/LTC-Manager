import assert from "node:assert/strict";
import test from "node:test";

import { catalogFormIsVisible } from "./catalog-forms";

test("Vssyl forms are visible, and a vendor form only to that vendor", () => {
  assert.equal(
    catalogFormIsVisible({
      ownerKind: "VSSYL",
      ownerFacilityId: null,
      ownerOrganizationId: null,
      facilityId: "terrace",
      allowedOrganizationIds: [],
    }),
    true,
  );
  assert.equal(
    catalogFormIsVisible({
      ownerKind: "ORGANIZATION",
      ownerFacilityId: null,
      ownerOrganizationId: "metz",
      facilityId: "terrace",
      allowedOrganizationIds: ["metz"],
    }),
    true,
  );
  assert.equal(
    catalogFormIsVisible({
      ownerKind: "ORGANIZATION",
      ownerFacilityId: null,
      ownerOrganizationId: "metz",
      facilityId: "terrace",
      allowedOrganizationIds: [],
    }),
    false,
  );
  assert.equal(
    catalogFormIsVisible({
      ownerKind: "FACILITY",
      ownerFacilityId: "terrace",
      ownerOrganizationId: null,
      facilityId: "terrace",
      allowedOrganizationIds: [],
    }),
    true,
  );
  assert.equal(
    catalogFormIsVisible({
      ownerKind: "FACILITY",
      ownerFacilityId: "other",
      ownerOrganizationId: null,
      facilityId: "terrace",
      allowedOrganizationIds: ["metz"],
    }),
    false,
  );
});
