import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEPARTMENT_ADMIN_TABS,
  departmentAdminHref,
  departmentAdminTabsForFlags,
  isDepartmentAdminTabId,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
  selectWorkingProfileId,
  type ProfileListItem,
} from "@/lib/department-administration";

describe("Department Administration local navigation", () => {
  it("exposes the required local tabs in stable order", () => {
    assert.deepEqual(
      DEPARTMENT_ADMIN_TABS.map((tab) => tab.id),
      [
        "overview",
        "areas",
        "archetypes",
        "rooms",
        "diagnostics",
        "versions",
        "cycles",
        "settings",
      ],
    );
  });

  it("resolves tab query params with overview default", () => {
    assert.equal(resolveDepartmentAdminTab(undefined), "overview");
    assert.equal(resolveDepartmentAdminTab("rooms"), "rooms");
    assert.equal(resolveDepartmentAdminTab("cycles"), "cycles");
    assert.equal(resolveDepartmentAdminTab("not-a-tab"), "overview");
    assert.equal(isDepartmentAdminTabId("areas"), true);
    assert.equal(isDepartmentAdminTabId("cycles"), true);
    assert.equal(isDepartmentAdminTabId("projection"), false);
  });

  it("filters tabs by feature flags and falls back when cycles-only", () => {
    assert.deepEqual(
      departmentAdminTabsForFlags({ profilesEnabled: false, cyclesEnabled: true }).map(
        (t) => t.id,
      ),
      ["cycles"],
    );
    assert.equal(
      resolveDepartmentAdminTab("overview", {
        availableTabIds: ["cycles"],
        fallback: "cycles",
      }),
      "cycles",
    );
  });

  it("builds local hrefs without leaking into global nav paths", () => {
    assert.equal(
      departmentAdminHref("dept1", "overview"),
      "/admin/departments/dept1",
    );
    assert.equal(
      departmentAdminHref("dept1", "areas", "prof1"),
      "/admin/departments/dept1?tab=areas&profile=prof1",
    );
    assert.ok(!departmentAdminHref("dept1", "overview").includes("/sidebar"));
    assert.ok(!departmentAdminHref("dept1", "rooms").includes("/units"));
  });

  it("maps profile status to StatusBadge variants", () => {
    assert.equal(profileStatusBadgeVariant("DRAFT"), "neutral");
    assert.equal(profileStatusBadgeVariant("CERTIFIED"), "in_progress");
    assert.equal(profileStatusBadgeVariant("ACTIVE"), "success");
    assert.equal(profileStatusBadgeVariant("RETIRED"), "warning");
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
