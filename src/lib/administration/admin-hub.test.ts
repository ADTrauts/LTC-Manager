import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_HUB_EXCLUDED_PRIMARY_HREFS,
  ADMIN_HUB_SECTIONS,
  adminHubPrimaryHrefs,
  flattenAdminHubLinks,
  visibleAdminHubSections,
} from "@/lib/administration/admin-hub";

test("admin hub is Organization and Access only", () => {
  assert.deepEqual(
    ADMIN_HUB_SECTIONS.map((s) => s.id),
    ["organization", "access"],
  );
  assert.deepEqual(
    ADMIN_HUB_SECTIONS.map((s) => s.title),
    ["Organization", "Access"],
  );
});

test("admin hub cards are Organization, Departments, Billing, and Access", () => {
  const byId = new Map(flattenAdminHubLinks().map((link) => [link.id, link]));

  assert.equal(byId.get("organization_settings")?.label, "Organization");
  assert.equal(byId.get("organization_settings")?.href, "/admin/organization");

  assert.equal(byId.get("departments")?.label, "Departments");
  assert.equal(byId.get("departments")?.href, "/admin/departments");
  assert.match(
    byId.get("departments")?.description ?? "",
    /Manage installed Department Products and add Departments to this facility/,
  );

  assert.equal(byId.get("billing")?.label, "Billing");
  assert.equal(byId.get("billing")?.href, "/admin/billing");

  assert.equal(byId.get("roles_permissions")?.label, "Access");
  assert.equal(byId.get("roles_permissions")?.href, "/admin/permissions");
  assert.equal(byId.has("account"), false);

  assert.deepEqual(
    flattenAdminHubLinks().map((link) => link.id),
    ["organization_settings", "departments", "billing", "roles_permissions"],
  );
});

test("builders are not primary admin hub cards", () => {
  const hrefs = adminHubPrimaryHrefs();
  for (const excluded of ADMIN_HUB_EXCLUDED_PRIMARY_HREFS) {
    assert.equal(hrefs.includes(excluded), false, excluded);
  }
  assert.deepEqual(
    [...hrefs],
    ["/admin/organization", "/admin/departments", "/admin/billing", "/admin/permissions"],
  );
});

test("visible admin hub matches the catalog", () => {
  assert.deepEqual(
    visibleAdminHubSections().flatMap((section) => section.links.map((link) => link.id)),
    flattenAdminHubLinks().map((link) => link.id),
  );
});

test("department and access hub copy does not imply licensing", () => {
  const text = flattenAdminHubLinks()
    .filter((link) => link.id === "roles_permissions")
    .map((l) => `${l.label} ${l.description}`)
    .join("\n")
    .toLowerCase();
  for (const banned of ["purchased", "license", "subscription", "entitlement", "stripe"]) {
    assert.equal(text.includes(banned), false, `hub copy must not include "${banned}"`);
  }
  assert.equal(text.includes("turn departments on or off"), false);
});
