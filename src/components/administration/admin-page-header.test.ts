import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ADMINISTRATION_HUB_HREF,
  ADMINISTRATION_ROOT_LABEL,
  BACK_TO_ADMINISTRATION_LABEL,
} from "@/components/administration/admin-page-header";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("Administration chrome constants point at /admin", () => {
  assert.equal(ADMINISTRATION_HUB_HREF, "/admin");
  assert.equal(ADMINISTRATION_ROOT_LABEL, "Administration");
  assert.equal(BACK_TO_ADMINISTRATION_LABEL, "Back to Administration");
});

test("admin hub page uses Administration title and Facility Administrators wording", () => {
  const source = readSrc("app/(protected)/admin/page.tsx");
  assert.match(source, />Administration</);
  assert.match(source, /Facility Administrators only/);
  assert.doesNotMatch(source, /General Managers only/);
  assert.doesNotMatch(source, /admin-hub-link-organization.facilities|organization\/facilities/);
  assert.match(source, /ADMIN_HUB_SECTIONS/);
});

test("admin child pages use shared AdminPageHeader or AdminBreadcrumbs", () => {
  const pages = [
    "app/(protected)/admin/facility/builder/page.tsx",
    "app/(protected)/admin/departments/page.tsx",
    "app/(protected)/admin/permissions/page.tsx",
    "app/(protected)/admin/inspections/page.tsx",
    "app/(protected)/admin/knowledge/page.tsx",
    "app/(protected)/admin/organization/page.tsx",
    "app/(protected)/admin/organization/facilities/page.tsx",
    "app/(protected)/admin/departments/[departmentId]/page.tsx",
  ];
  for (const page of pages) {
    const source = readSrc(page);
    assert.match(
      source,
      /AdminPageHeader|AdminBreadcrumbs/,
      `${page} should use shared Administration chrome`,
    );
    assert.doesNotMatch(source, /Admin home/, `${page} must not use Admin home`);
    assert.doesNotMatch(
      source,
      />Admin</,
      `${page} must not use bare Admin breadcrumb root`,
    );
  }
});

test("presentation titles and nesting appear in page sources", () => {
  assert.match(readSrc("app/(protected)/admin/facility/builder/page.tsx"), /Facility Structure/);
  assert.match(readSrc("app/(protected)/admin/permissions/page.tsx"), /Roles & Permissions/);
  assert.match(readSrc("app/(protected)/admin/knowledge/page.tsx"), /Procedures & Resources/);
  assert.match(readSrc("app/(protected)/admin/organization/page.tsx"), /Organization Settings/);
  assert.match(
    readSrc("app/(protected)/admin/organization/page.tsx"),
    /Facilities &amp; User Access|Facilities & User Access/,
  );
  assert.match(
    readSrc("app/(protected)/admin/organization/facilities/page.tsx"),
    /Facilities & User Access/,
  );
});

test("permissions manager user-facing copy uses Roles not Jobs", () => {
  const source = readSrc("app/(protected)/admin/permissions/permissions-manager.tsx");
  assert.match(source, />Roles</);
  assert.match(source, /Add role/);
  assert.match(source, /per role/);
  assert.doesNotMatch(source, />Jobs</);
  assert.doesNotMatch(source, /Add job/);
  assert.doesNotMatch(source, /per job/);
});

test("department visibility copy does not imply licensing", () => {
  const form = readSrc("app/(protected)/admin/departments/department-visibility-form.tsx");
  const page = readSrc("app/(protected)/admin/departments/page.tsx");
  assert.match(form, /Show in employee application/);
  assert.match(form, /not a\s+subscription or license setting/);
  assert.doesNotMatch(form, /purchased|entitlement|licensed module/i);
  assert.doesNotMatch(page, /Turn departments on or off|purchased departments|licensed modules/i);
});

test("knowledge page clarifies resources do not assign departments to rooms", () => {
  const source = readSrc("app/(protected)/admin/knowledge/page.tsx");
  assert.match(source, /do not assign departments to rooms/i);
});
