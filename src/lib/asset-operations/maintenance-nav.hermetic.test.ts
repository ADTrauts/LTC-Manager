import assert from "node:assert/strict";
import test from "node:test";

import { platformNavItemsForRole } from "@/lib/route-registry";

import {
  applyMaintenanceNavRewrite,
  isRunMaintenancePath,
  maintenanceSubNavItems,
  resolveMaintenanceSubNavActiveId,
} from "./maintenance-nav";

test("RUN Maintenance rewrite keeps one destination at the Assets slot", () => {
  const items = applyMaintenanceNavRewrite([
    { href: "/workspace", label: "Dashboard" },
    { href: "/assets", label: "Assets" },
    { href: "/repairs", label: "Repairs" },
    { href: "/reports", label: "Review" },
  ]);
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/assets", label: "Maintenance" },
      { href: "/reports", label: "Review" },
    ],
  );
});

test("STAFF Maintenance rewrite lands on the repair queue", () => {
  const items = applyMaintenanceNavRewrite(
    [
      { href: "/logs", label: "Logs" },
      { href: "/repairs", label: "Repairs" },
    ],
    { canViewAssets: false },
  );
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: "/logs", label: "Logs" },
      { href: "/repairs", label: "Maintenance" },
    ],
  );
});

test("manager registry projection collapses Assets and Repairs after rewrite", () => {
  const items = applyMaintenanceNavRewrite(
    platformNavItemsForRole("MANAGER", {
      todaysWorkEnabled: true,
      canonicalLogsEnabled: true,
      dietaryOperationalEvidenceEnabled: true,
    }),
  );
  const hrefs = items.map((i) => i.href);
  assert.equal(hrefs.includes("/assets"), true);
  assert.equal(hrefs.includes("/repairs"), false);
  assert.equal(items.find((i) => i.href === "/assets")?.label, "Maintenance");
});

test("isRunMaintenancePath covers the operational loop and excludes Asset Builder", () => {
  assert.equal(isRunMaintenancePath("/assets"), true);
  assert.equal(isRunMaintenancePath("/assets/asset-1"), true);
  assert.equal(isRunMaintenancePath("/repairs"), true);
  assert.equal(isRunMaintenancePath("/repairs/r1"), true);
  assert.equal(isRunMaintenancePath("/issues/legacy"), true);
  assert.equal(isRunMaintenancePath("/asset-issues/i1"), true);
  assert.equal(isRunMaintenancePath("/assets/builder"), false);
  assert.equal(isRunMaintenancePath("/staffing"), false);
});

test("Maintenance sub-nav is supervisor composition, not a STAFF tab set", () => {
  assert.equal(maintenanceSubNavItems(false).length, 0);
  assert.deepEqual(
    maintenanceSubNavItems(true).map((i) => i.id),
    ["assets", "repairs", "vendors"],
  );
  assert.equal(resolveMaintenanceSubNavActiveId("/assets", undefined), "assets");
  assert.equal(resolveMaintenanceSubNavActiveId("/assets", "vendors"), "vendors");
  assert.equal(resolveMaintenanceSubNavActiveId("/repairs"), "repairs");
});
