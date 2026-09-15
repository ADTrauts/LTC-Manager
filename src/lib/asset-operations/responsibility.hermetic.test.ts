import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultResponsibleOrganizationNames,
  departmentDisplayLabel,
  preferredRepairProviderDisplayLabel,
  projectAssetResponsibility,
  resolvePreferredRepairProviderForAsset,
  responsibleOrganizationDisplayLabel,
} from "./responsibility";

test("default responsible orgs — facility name always included", () => {
  assert.deepEqual(
    defaultResponsibleOrganizationNames({
      facilityDisplayName: "Terrace View Long Term Care",
      managementCompanyName: null,
    }),
    ["Terrace View Long Term Care"],
  );
});

test("default responsible orgs — facility + distinct operating partner", () => {
  assert.deepEqual(
    defaultResponsibleOrganizationNames({
      facilityDisplayName: "  Terrace View Long Term Care ",
      managementCompanyName: " Metz Culinary Management ",
    }),
    ["Terrace View Long Term Care", "Metz Culinary Management"],
  );
});

test("default responsible orgs — duplicate partner name is not repeated", () => {
  assert.deepEqual(
    defaultResponsibleOrganizationNames({
      facilityDisplayName: "Metz Culinary Management",
      managementCompanyName: "metz culinary management",
    }),
    ["Metz Culinary Management"],
  );
});

test("projection — department only", () => {
  const p = projectAssetResponsibility({
    department: { id: "d1", name: "Dietary" },
  });
  assert.equal(departmentDisplayLabel(p.department), "Dietary");
  assert.equal(responsibleOrganizationDisplayLabel(p.responsibleOrganization), "Not assigned");
  assert.equal(preferredRepairProviderDisplayLabel(p.preferredRepairProvider), "No preferred vendor");
});

test("projection — department + org + provider", () => {
  const p = projectAssetResponsibility({
    department: { id: "d1", name: "Dietary" },
    responsibleOrganization: { id: "o1", name: "Metz Culinary Management", isActive: true },
    preferredRepairProvider: {
      id: "v1",
      name: "ABC Refrigeration",
      phone: "555-0100",
    },
  });
  assert.equal(p.responsibleOrganization?.name, "Metz Culinary Management");
  assert.equal(p.preferredRepairProvider?.name, "ABC Refrigeration");
  assert.equal(p.preferredRepairProvider?.phone, "555-0100");
});

test("repair provider defaulting — explicit wins over asset preferred", () => {
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: "v-user",
      assetPreferredVendorId: "v-asset",
    }),
    "v-user",
  );
});

test("repair provider defaulting — falls back to asset preferred", () => {
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: null,
      assetPreferredVendorId: "v-asset",
    }),
    "v-asset",
  );
});

test("repair provider defaulting — blank when neither set", () => {
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: "",
      assetPreferredVendorId: null,
    }),
    null,
  );
});

test("existing repair provider is never replaced by resolver when set", () => {
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: "already-set",
      assetPreferredVendorId: "should-not-win",
    }),
    "already-set",
  );
});
