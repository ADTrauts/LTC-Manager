/**
 * RUN surface rationalization — canonical IA + workspace-menu authority contract.
 *
 * Locks the product decisions from the 2026-08-09 RUN surface rationalization:
 *   - Operations Center is no longer a peer RUN destination (no primary-nav entry).
 *   - Its legacy routes stay reachable and resolve to RUN so they can redirect safely.
 *   - Run / Build / Admin switching is NOT in the permanent RUN top bar.
 *   - Build / Admin appear in the context menu only for sessions already entitled to those surfaces
 *     (derived from route authority, never role labels), and Quick PIN frontline gets neither.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { applyMaintenanceNavRewrite } from "@/lib/asset-operations/maintenance-nav";
import {
  groupNavItemsByMode,
  headerNavItemsForMode,
  resolveProductModeForPath,
} from "@/lib/product-mode";
import { platformNavItemsForRole, roleMayAccessRoute } from "@/lib/route-registry";

const FLAGS = {
  todaysWorkEnabled: true,
  dietaryOperationalEvidenceEnabled: true,
  dietaryWorkPlansEnabled: true,
};

function runHeaderItemsForRole(role: AppRole) {
  const nav = applyMaintenanceNavRewrite(platformNavItemsForRole(role, FLAGS), {
    canViewAssets: hasAtLeastRole(role, "SUPERVISOR"),
  });
  const groups = groupNavItemsByMode(nav);
  const runGroup = groups.find((group) => group.mode === "RUN");
  return headerNavItemsForMode("RUN", runGroup?.items ?? []);
}

test("Operations Center is not a peer RUN destination", () => {
  for (const role of ["MANAGER", "FACILITY_ADMINISTRATOR"] as const) {
    const items = runHeaderItemsForRole(role);
    assert.ok(
      !items.some((i) => i.label.toLowerCase().includes("operations center")),
      `${role} RUN nav must not label an Operations Center peer`,
    );
    assert.ok(
      !items.some((i) => i.href === "/dashboard" || i.href === "/operations"),
      `${role} RUN nav must not link the retired Operations Center routes`,
    );
  }
});

test("retired Operations Center routes stay reachable and resolve to RUN (safe redirect targets)", () => {
  // Still RUN so the shell chrome reads correctly during the redirect, and reachable by every role
  // (including frontline) so bookmarks / internal 'home' fallbacks never dead-end.
  for (const path of ["/dashboard", "/operations"]) {
    assert.equal(resolveProductModeForPath(path), "RUN", path);
    for (const role of ["STAFF", "SUPERVISOR", "MANAGER", "FACILITY_ADMINISTRATOR"] as const) {
      assert.equal(roleMayAccessRoute(path, role, FLAGS), true, `${role} ${path}`);
    }
  }
});

test("canonical RUN destinations are present and unclipped for a manager", () => {
  const items = runHeaderItemsForRole("MANAGER");
  const hrefs = items.map((i) => i.href);
  for (const href of ["/workspace", "/today", "/units", "/staffing", "/assets"]) {
    assert.ok(hrefs.includes(href), `RUN nav should include ${href}`);
  }
  // Dashboard is the canonical overview label for /workspace.
  assert.equal(items.find((i) => i.href === "/workspace")?.label, "Dashboard");
  // No empty / clipped labels or orphaned icon-only entries.
  for (const item of items) {
    assert.ok(item.label.trim().length > 0, `nav item ${item.href} must have a visible label`);
  }
});

test("Assets and Repairs compose under one RUN Maintenance destination", () => {
  const items = runHeaderItemsForRole("MANAGER");
  assert.equal(items.find((i) => i.href === "/assets")?.label, "Maintenance");
  assert.equal(
    items.some((i) => i.href === "/repairs"),
    false,
    "Repairs must not be a peer RUN nav item",
  );
});

test("Log Book remains an explicit canonical RUN destination (not a clipped orphan)", () => {
  const items = runHeaderItemsForRole("MANAGER");
  const logBook = items.find((i) => i.href === "/staffing/log-book");
  assert.ok(logBook, "Log Book should render as a RUN destination");
  assert.equal(logBook?.label, "Log Book");
});

test("Run / Build / Admin are not permanent RUN top-bar items", () => {
  const runItems = runHeaderItemsForRole("FACILITY_ADMINISTRATOR");
  assert.ok(!runItems.some((i) => i.href === "/build" || i.href === "/admin"));
  assert.ok(
    !runItems.some((i) => ["run", "build", "admin"].includes(i.label.toLowerCase())),
  );

  // BUILD navigation lives in its dedicated left rail; ADMIN is menu-only.
  const nav = platformNavItemsForRole("FACILITY_ADMINISTRATOR", FLAGS);
  const groups = groupNavItemsByMode(nav);
  const buildGroup = groups.find((g) => g.mode === "BUILD");
  const adminGroup = groups.find((g) => g.mode === "ADMIN");
  assert.deepEqual(
    headerNavItemsForMode("BUILD", buildGroup?.items ?? []).map((i) => i.href),
    [],
  );
  assert.deepEqual(headerNavItemsForMode("ADMIN", adminGroup?.items ?? []), []);
});

test("context-menu Build/Admin visibility derives from route authority, not role labels", () => {
  // Quick PIN / frontline: RUN-only — neither Build nor Admin.
  assert.equal(roleMayAccessRoute("/build", "STAFF", FLAGS), false);
  assert.equal(roleMayAccessRoute("/admin", "STAFF", FLAGS), false);

  // Build-authorized manager: Build yes, Admin no.
  assert.equal(roleMayAccessRoute("/build", "MANAGER", FLAGS), true);
  assert.equal(roleMayAccessRoute("/admin", "MANAGER", FLAGS), false);

  // Governance-authorized FA: Build and Admin.
  assert.equal(roleMayAccessRoute("/build", "FACILITY_ADMINISTRATOR", FLAGS), true);
  assert.equal(roleMayAccessRoute("/admin", "FACILITY_ADMINISTRATOR", FLAGS), true);
});
