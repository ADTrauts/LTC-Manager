import assert from "node:assert/strict";
import test from "node:test";

import { catalogFormIsVisible, mayAuthorFacilityCatalogForm } from "./catalog-forms";

test("the head and an allowed manager can build a facility form", () => {
  assert.equal(
    mayAuthorFacilityCatalogForm({
      mode: "MANAGE",
      operatingModel: "FACILITY_OPERATED",
      isHead: true,
      isAllowedManager: false,
    }),
    true,
  );
  assert.equal(
    mayAuthorFacilityCatalogForm({
      mode: "MANAGE",
      operatingModel: "FACILITY_OPERATED",
      isHead: false,
      isAllowedManager: true,
    }),
    true,
  );
});

test("a vendor Department and a viewer cannot build a facility form", () => {
  assert.equal(
    mayAuthorFacilityCatalogForm({
      mode: "MANAGE",
      operatingModel: "CONTRACTED",
      isHead: true,
      isAllowedManager: false,
    }),
    false,
  );
  assert.equal(
    mayAuthorFacilityCatalogForm({
      mode: "VIEW",
      operatingModel: "FACILITY_OPERATED",
      isHead: false,
      isAllowedManager: false,
    }),
    false,
  );
});

test("a facility form is visible only at its facility", () => {
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
      ownerFacilityId: "terrace",
      ownerOrganizationId: null,
      facilityId: "other",
      allowedOrganizationIds: [],
    }),
    false,
  );
});
