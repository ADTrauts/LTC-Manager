import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_HUB_EXCLUDED_PRIMARY_HREFS,
  ADMIN_HUB_SECTIONS,
  adminHubPrimaryHrefs,
  flattenAdminHubLinks,
  visibleAdminHubSections,
} from "@/lib/administration/admin-hub";

test("admin hub has three grouped sections in Option A order", () => {
  assert.deepEqual(
    ADMIN_HUB_SECTIONS.map((s) => s.id),
    ["facility_organization", "departments_access", "operational_configuration"],
  );
  assert.deepEqual(
    ADMIN_HUB_SECTIONS.map((s) => s.title),
    ["Facility & Organization", "Departments & Access", "Operational Configuration"],
  );
});

test("admin hub labels and routes match presentation rename", () => {
  const byId = new Map(flattenAdminHubLinks().map((link) => [link.id, link]));

  assert.equal(byId.get("facility_structure")?.label, "Facility Structure");
  assert.equal(byId.get("facility_structure")?.href, "/admin/facility/builder");

  assert.equal(byId.get("organization_settings")?.label, "Organization Settings");
  assert.equal(byId.get("organization_settings")?.href, "/admin/organization");

  assert.equal(byId.get("billing")?.label, "Billing");
  assert.equal(byId.get("billing")?.href, "/admin/billing");

  assert.equal(byId.get("departments")?.label, "Departments");
  assert.equal(byId.get("departments")?.href, "/admin/departments");

  assert.equal(byId.get("roles_permissions")?.label, "Roles & Permissions");
  assert.equal(byId.get("roles_permissions")?.href, "/admin/permissions");

  assert.equal(byId.get("logs")?.label, "Logs");
  assert.equal(byId.get("logs")?.href, "/logs");

  assert.equal(byId.get("inspections")?.label, "Inspections");
  assert.equal(byId.get("inspections")?.href, "/admin/inspections");

  assert.equal(byId.get("procedures_resources")?.label, "Procedures & Resources");
  assert.equal(byId.get("procedures_resources")?.href, "/admin/knowledge");
});

test("Organization Facilities is not a primary admin hub card", () => {
  const hrefs = adminHubPrimaryHrefs();
  for (const excluded of ADMIN_HUB_EXCLUDED_PRIMARY_HREFS) {
    assert.equal(hrefs.includes(excluded), false);
  }
  assert.equal(hrefs.includes("/admin/organization/facilities"), false);
});

test("Logs and Inspections appear together under Operational Configuration", () => {
  const operational = ADMIN_HUB_SECTIONS.find((s) => s.id === "operational_configuration");
  assert.ok(operational);
  assert.deepEqual(
    operational.links.map((l) => l.id),
    ["logs", "inspections", "procedures_resources"],
  );
  assert.notEqual(operational.links[0]?.href, operational.links[1]?.href);

  const visibleOperational = visibleAdminHubSections().find((s) => s.id === "operational_configuration");
  assert.ok(visibleOperational);
  assert.deepEqual(
    visibleOperational.links.map((l) => l.id),
    ["logs", "inspections"],
  );
});

test("Procedures & Resources stays in the catalog but is parked from the hub", () => {
  const hrefs = adminHubPrimaryHrefs();
  assert.equal(hrefs.includes("/admin/knowledge"), false);
  assert.equal(
    flattenAdminHubLinks().some((link) => link.id === "procedures_resources"),
    true,
  );
});

test("department and permissions hub copy does not imply licensing", () => {
  const text = flattenAdminHubLinks()
    .filter((link) => link.id === "departments" || link.id === "roles_permissions")
    .map((l) => `${l.label} ${l.description}`)
    .join("\n")
    .toLowerCase();
  for (const banned of ["purchased", "license", "subscription", "entitlement", "stripe"]) {
    assert.equal(text.includes(banned), false, `hub copy must not include "${banned}"`);
  }
  assert.equal(text.includes("turn departments on or off"), false);
});

test("admin hub includes Billing under Facility & Organization", () => {
  const facility = ADMIN_HUB_SECTIONS.find((section) => section.id === "facility_organization");
  assert.ok(facility);
  assert.deepEqual(
    facility.links.map((link) => link.id),
    ["facility_structure", "organization_settings", "billing"],
  );
});

test("facility structure copy does not claim workflow creation", () => {
  const facility = flattenAdminHubLinks().find((l) => l.id === "facility_structure");
  assert.ok(facility);
  const lower = facility.description.toLowerCase();
  assert.match(lower, /assign responsible departments/);
  assert.equal(lower.includes("create logs"), false);
  assert.equal(lower.includes("create tasks"), false);
});
