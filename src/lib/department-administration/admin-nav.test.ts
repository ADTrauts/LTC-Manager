import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEPARTMENT_ADMIN_DEFERRED_TABS,
  DEPARTMENT_ADMIN_LEGACY_TABS,
  DEPARTMENT_ADMIN_TABS,
  departmentAdminHref,
  departmentAdminTabsForFlags,
  isDepartmentAdminTabId,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
} from "@/lib/department-administration";
import {
  selectWorkingProfileId,
  type ProfileListItem,
} from "@/lib/department-administration/load-department-admin";

describe("Department Builder local navigation", () => {
  it("exposes Department Builder sections for the installed product", () => {
    assert.deepEqual(
      DEPARTMENT_ADMIN_TABS.map((tab) => tab.id),
      [
        "overview",
        "locations",
        "operating-rhythm",
        "work",
        "maintenance",
        "people",
        "records",
        "menus",
      ],
    );
    assert.equal(
      DEPARTMENT_ADMIN_TABS.some((t) => t.id === ("room-types" as string)),
      false,
    );
    assert.equal(
      DEPARTMENT_ADMIN_TABS.some((t) => t.id === ("coverage" as string)),
      false,
    );
    assert.equal(
      DEPARTMENT_ADMIN_TABS.some((t) => t.id === ("cycles" as string)),
      false,
    );
  });

  it("resolves tab query params with overview default", () => {
    assert.equal(resolveDepartmentAdminTab(undefined), "overview");
    assert.equal(resolveDepartmentAdminTab("locations"), "locations");
    assert.equal(resolveDepartmentAdminTab("people"), "people");
    assert.equal(resolveDepartmentAdminTab("teams"), "people");
    assert.equal(resolveDepartmentAdminTab("not-a-tab"), "overview");
    assert.equal(isDepartmentAdminTabId("locations"), true);
    assert.equal(isDepartmentAdminTabId("people"), true);
    assert.equal(isDepartmentAdminTabId("teams"), false);
    assert.equal(isDepartmentAdminTabId("coverage"), false);
    assert.equal(isDepartmentAdminTabId("cycles"), false);
    assert.equal(isDepartmentAdminTabId("projection"), false);
  });

  it("redirects every retired tab into primary IA", () => {
    assert.equal(resolveDepartmentAdminTab("coverage"), "people");
    assert.equal(resolveDepartmentAdminTab("cycles"), "operating-rhythm");
    assert.equal(resolveDepartmentAdminTab("teams"), "people");
    assert.equal(resolveDepartmentAdminTab("room-types"), "locations");
    assert.equal(resolveDepartmentAdminTab("areas"), "locations");
    assert.equal(resolveDepartmentAdminTab("archetypes"), "locations");
    assert.equal(resolveDepartmentAdminTab("rooms"), "locations");
    assert.equal(resolveDepartmentAdminTab("diagnostics"), "overview");
    assert.equal(resolveDepartmentAdminTab("versions"), "overview");
    assert.equal(resolveDepartmentAdminTab("settings"), "overview");
    assert.deepEqual([...DEPARTMENT_ADMIN_LEGACY_TABS], []);
    assert.deepEqual([...DEPARTMENT_ADMIN_DEFERRED_TABS], []);
  });

  it("keeps Operating Rhythm on the bar and omits Records and Menus until the product needs them", () => {
    const base = ["overview", "locations", "operating-rhythm", "work", "people"];
    assert.deepEqual(
      departmentAdminTabsForFlags({ profilesEnabled: false, cyclesEnabled: true }).map((t) => t.id),
      base,
    );
    assert.deepEqual(
      departmentAdminTabsForFlags({
        profilesEnabled: true,
        workEnabled: false,
        recordsEnabled: true,
        menusEnabled: true,
      }).map((t) => t.id),
      ["overview", "locations", "operating-rhythm", "people", "records", "menus"],
    );
    assert.deepEqual(
      departmentAdminTabsForFlags({
        profilesEnabled: true,
        workEnabled: false,
        maintenanceEnabled: true,
      }).map((t) => t.id),
      ["overview", "locations", "operating-rhythm", "maintenance", "people"],
    );
  });

  it("builds local hrefs without leaking into global nav paths", () => {
    assert.equal(
      departmentAdminHref("dept1", "overview"),
      "/build/departments/dept1",
    );
    assert.equal(
      departmentAdminHref("dept1", "locations", "prof1"),
      "/build/departments/dept1?tab=locations&profile=prof1",
    );
    assert.equal(
      departmentAdminHref("dept1", "people"),
      "/build/departments/dept1?tab=people",
    );
    assert.equal(
      departmentAdminHref("dept1", "cycles"),
      "/build/departments/dept1?tab=operating-rhythm",
    );
    assert.equal(
      departmentAdminHref("dept1", "maintenance"),
      "/build/departments/dept1/preventive-maintenance",
    );
    assert.ok(!departmentAdminHref("dept1", "overview").includes("/sidebar"));
    assert.ok(!departmentAdminHref("dept1", "locations").includes("/units"));
  });

  it("maps profile status to StatusBadge variants", () => {
    assert.equal(profileStatusBadgeVariant("DRAFT"), "neutral");
    assert.equal(profileStatusBadgeVariant("CERTIFIED"), "in_progress");
    assert.equal(profileStatusBadgeVariant("ACTIVE"), "success");
    assert.equal(profileStatusBadgeVariant("RETIRED"), "warning");
  });

  it("Overview is operational guidance only — no administrative ownership controls", () => {
    const overview = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/overview-panel.tsx",
      ),
      "utf8",
    );
    assert.match(overview, /This department/);
    assert.doesNotMatch(overview, /Department Manager/);
    assert.doesNotMatch(overview, /overview-advanced-settings/);
    assert.equal(/Ready to certify/.test(overview), false);
    assert.equal(/rooms mapped/.test(overview), false);
    assert.equal(/Department head/.test(overview), false);
    assert.equal(/tab: "room-types"/.test(overview), false);
  });

  it("hides leftover Areas / Archetypes / Room Types / Coverage / Cycles routes", () => {
    const page = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/page.tsx",
      ),
      "utf8",
    );
    assert.match(page, /isDepartmentAdminRetiredTabId/);
    assert.match(page, /DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT/);
    assert.doesNotMatch(page, /AreasPanel/);
    assert.doesNotMatch(page, /ArchetypesPanel/);
    assert.doesNotMatch(page, /RoomsPanel/);
  });

  it("Locations does not launch Room Type profile configuration", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
      ),
      "utf8",
    );
    assert.match(panel, /Room/);
    assert.match(panel, /LocationsProgrammingClient/);
    assert.match(panel, /\/admin\/facility\/builder/);
    assert.equal(/tab=room-types/.test(panel), false);
    assert.equal(/room-types/.test(panel), false);
  });
});

describe("working profile selection", () => {
  const base = {
    name: "Model",
    baselineKey: "DIETARY",
    certifiedAt: null,
    activatedAt: null,
    retiredAt: null,
    createdAt: new Date(),
  } satisfies Omit<ProfileListItem, "id" | "version" | "status">;

  it("prefers an explicit requested profile", () => {
    const profiles: ProfileListItem[] = [
      { ...base, id: "draft", version: 2, status: "DRAFT" },
      { ...base, id: "active", version: 1, status: "ACTIVE" },
    ];
    assert.equal(selectWorkingProfileId(profiles, "active"), "active");
  });

  it("prefers DRAFT over ACTIVE when no request", () => {
    const profiles: ProfileListItem[] = [
      { ...base, id: "active", version: 1, status: "ACTIVE" },
      { ...base, id: "draft", version: 2, status: "DRAFT" },
    ];
    assert.equal(selectWorkingProfileId(profiles, null), "draft");
  });

  it("falls back through ACTIVE → CERTIFIED → latest", () => {
    assert.equal(
      selectWorkingProfileId(
        [{ ...base, id: "a", version: 1, status: "ACTIVE" }],
        null,
      ),
      "a",
    );
    assert.equal(
      selectWorkingProfileId(
        [{ ...base, id: "c", version: 1, status: "CERTIFIED" }],
        null,
      ),
      "c",
    );
    assert.equal(selectWorkingProfileId([], null), null);
  });
});

describe("Department Administration barrel stays client-safe", () => {
  it("does not re-export server loaders or profile writes", () => {
    const barrel = readFileSync(
      join(process.cwd(), "src/lib/department-administration/index.ts"),
      "utf8",
    );
    assert.doesNotMatch(barrel, /from \"\.\/load-effective-location-program\"/);
    assert.doesNotMatch(barrel, /from \"\.\/load-location-program\"/);
    assert.doesNotMatch(barrel, /from \"\.\/profile-service\"/);
    assert.doesNotMatch(barrel, /loadDepartmentAdminView,/);
    assert.doesNotMatch(barrel, /next\/headers/);
    assert.doesNotMatch(barrel, /harbor-console/);
  });

  it("client Department Builder workspaces do not value-import the barrel", () => {
    const files = [
      "src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx",
      "src/app/(protected)/admin/departments/[departmentId]/coverage-workspace.tsx",
      "src/app/(protected)/admin/departments/[departmentId]/room-types-panel.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      assert.equal(
        /from \"@\/lib\/department-administration\"/.test(source),
        false,
        `${file} must not value-import the department-administration barrel`,
      );
    }
  });
});
