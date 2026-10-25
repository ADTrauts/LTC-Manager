import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogFormServesRunningDepartment,
  catalogStableKeyForTemplate,
} from "./catalog-pin";

test("a preset template names its Catalog form", () => {
  assert.equal(
    catalogStableKeyForTemplate({
      stableKey: "tmpl_generator",
      name: "Generator weekly run log",
    }),
    "plant_generator_weekly_run_log",
  );
});

test("a template with no preset keeps its own key", () => {
  assert.equal(
    catalogStableKeyForTemplate({ stableKey: "plant_generator_inspection", name: "Generator inspection" }),
    "plant_generator_inspection",
  );
});

test("a vendor-run Department requires that vendor's forms", () => {
  assert.equal(
    catalogFormServesRunningDepartment({
      ownerKind: "ORGANIZATION",
      ownerFacilityId: null,
      ownerOrganizationId: "metz",
      facilityId: "terrace",
      contractedOrganizationId: "metz",
    }),
    true,
  );
  assert.equal(
    catalogFormServesRunningDepartment({
      ownerKind: "FACILITY",
      ownerFacilityId: "terrace",
      ownerOrganizationId: null,
      facilityId: "terrace",
      contractedOrganizationId: "metz",
    }),
    false,
  );
  assert.equal(
    catalogFormServesRunningDepartment({
      ownerKind: "VSSYL",
      ownerFacilityId: null,
      ownerOrganizationId: null,
      facilityId: "terrace",
      contractedOrganizationId: "metz",
    }),
    true,
  );
});

test("a self-operated Department requires the facility's forms", () => {
  assert.equal(
    catalogFormServesRunningDepartment({
      ownerKind: "FACILITY",
      ownerFacilityId: "terrace",
      ownerOrganizationId: null,
      facilityId: "terrace",
      contractedOrganizationId: null,
    }),
    true,
  );
  assert.equal(
    catalogFormServesRunningDepartment({
      ownerKind: "ORGANIZATION",
      ownerFacilityId: null,
      ownerOrganizationId: "metz",
      facilityId: "terrace",
      contractedOrganizationId: null,
    }),
    false,
  );
});
