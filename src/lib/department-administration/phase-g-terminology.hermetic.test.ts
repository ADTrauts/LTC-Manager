import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { presentRecordForm } from "@/lib/canonical-logs/record-engine";
import { DEPARTMENT_ADMIN_TABS } from "@/lib/department-administration/admin-nav";
import { NAV_ZONE_LABELS } from "@/lib/nav-zones";
import { catalogPurposeForResolve } from "@/lib/operational-review/review-fact-maps";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Phase G manager terminology", () => {
  it("names Location Functions, Operating Rhythm, Work, Records, and People & Coverage", () => {
    const labels = DEPARTMENT_ADMIN_TABS.map((tab) => tab.label).join("\n");
    assert.match(labels, /^Locations$/m);
    assert.match(labels, /Operating Rhythm/);
    assert.match(labels, /^Work$/m);
    assert.match(labels, /People & Coverage/);
    assert.match(labels, /^Records$/m);
    assert.doesNotMatch(labels, /Operational Type|Evidence|^Teams$/m);
    const locations = source(
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    );
    assert.match(locations, /Location Functions/);
    assert.doesNotMatch(locations, /Operational Type|Archetype/);
  });

  it("uses Audit / Reports as the primary reports label", () => {
    assert.equal(NAV_ZONE_LABELS.REVIEW, "Audit / Reports");
    const routes = source("src/lib/route-registry/platform-routes.ts");
    assert.match(routes, /pattern: "\/reports"[\s\S]*?nav: \{ label: "Audit \/ Reports"/);
    assert.doesNotMatch(routes, /nav: \{ label: "Review"/);
  });

  it("keeps Inspection as Inspection through the shared purpose mapper", () => {
    assert.equal(catalogPurposeForResolve("INSPECTION"), "INSPECTION");
    assert.equal(catalogPurposeForResolve("CHECKLIST"), "CHECKLIST");
    assert.equal(catalogPurposeForResolve("LOG"), "LOG");
    assert.equal(catalogPurposeForResolve("PROCEDURE"), "PROCEDURE");
    assert.equal(presentRecordForm({ purposeType: "INSPECTION" }), "INSPECTION");
  });

  it("calls cycle checkpoints Key Points on the builder", () => {
    const controls = source(
      "src/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls.tsx",
    );
    assert.match(controls, /Key Point/);
    assert.match(controls, /Location Functions/);
    assert.doesNotMatch(controls, /Key Time|Operational Type/);
  });
});
