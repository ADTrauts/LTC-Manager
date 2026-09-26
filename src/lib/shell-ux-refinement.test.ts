import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildHubCards } from "@/lib/build-hub";
import { groupNavItemsByMode } from "@/lib/product-mode";
import { platformNavItemsForRole } from "@/lib/route-registry";

const FLAGS = {
  todaysWorkEnabled: true,
  dietaryOperationalEvidenceEnabled: true,
  dietaryWorkPlansEnabled: true,
};

function buildHubHrefsForRole(role: Parameters<typeof platformNavItemsForRole>[0]): string[] {
  const items = platformNavItemsForRole(role, FLAGS);
  const buildGroup = groupNavItemsByMode(items).find((group) => group.mode === "BUILD");
  return buildHubCards(buildGroup?.items ?? []).map((card) => card.href);
}

test("V1 refinement — Build Hub contains Asset Builder for an eligible SUPERVISOR", () => {
  const hrefs = buildHubHrefsForRole("SUPERVISOR");
  assert.equal(hrefs.includes("/assets/builder"), true);
});

test("V1 refinement — Build Hub is navigation-driven; frontline STAFF gets no cards", () => {
  // STAFF is Run-only below the SUPERVISOR floor: the BUILD group is empty, so there are no cards
  // and Asset Builder is not reachable via the hub either.
  const hrefs = buildHubHrefsForRole("STAFF");
  assert.deepEqual(hrefs, []);
});

test("V1 refinement — the canonical Build Home card set is present for a Facility Administrator", () => {
  const hrefs = buildHubHrefsForRole("FACILITY_ADMINISTRATOR");
  for (const href of [
    "/admin/facility/builder",
    "/build/departments",
    "/employees",
    "/assets/builder",
    "/staffing/templates",
    "/staffing/work-plans",
    "/build/knowledge",
  ]) {
    assert.equal(hrefs.includes(href), true, `expected Build Home card for ${href}`);
  }
  // The hub never lists its own home link as a card.
  assert.equal(hrefs.includes("/build"), false);
  assert.equal(hrefs.includes("/admin/knowledge"), false);
});

test("V1 refinement — the account menu contains Change password and Sign out", () => {
  const source = readFileSync(join(process.cwd(), "src/components/sign-out-controls.tsx"), "utf8");
  assert.match(source, /account-menu-change-password/);
  assert.match(source, /account-menu-sign-out/);
  assert.match(source, /Change password/);
  assert.match(source, /Sign out/);
});

test("V1 refinement — Change password and individual builders are not permanent header buttons", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  // The shell composes the account menu (holding Change password) rather than a top-level button.
  assert.match(shell, /AccountMenu/);
  // Facility/Department Builder links are never hardcoded into the global header.
  assert.doesNotMatch(shell, /href="\/admin\/facility\/builder"/);
  assert.doesNotMatch(shell, /href="\/admin\/departments"/);
});

test("V1 refinement — RUN uses Harbor teal and BUILD uses orange shell chrome", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  assert.match(css, /\[data-product-mode="RUN"\] \[data-shell-region="header"\]/);
  assert.match(css, /\[data-product-mode="RUN"\] \[data-shell-region="mode-indicator"\]/);
  assert.match(css, /\[data-product-mode="RUN"\] \[data-shell-region="sidebar"\]/);
  assert.match(css, /\[data-product-mode="BUILD"\] \[data-shell-region="header"\]/);
  assert.match(css, /\[data-product-mode="BUILD"\] \[data-shell-region="mode-indicator"\]/);
  assert.match(css, /\[data-product-mode="BUILD"\] \[data-shell-region="sidebar"\]/);
  assert.match(css, /--run-surface:\s*#e8f4f2/);
  assert.match(css, /--run-aside:\s*#0b3d3a/);
  assert.match(css, /--build-surface:\s*#fff4eb/);

  const frame = readFileSync(join(process.cwd(), "src/components/shell-mode-frame.tsx"), "utf8");
  // The treatment derives from the single product-mode classifier, not duplicated detection.
  assert.match(frame, /resolveProductModeForPath/);
  assert.match(frame, /data-product-mode/);

  const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  assert.match(shell, /ProductModeBanner/);
  assert.match(shell, /ShellModeCue/);
});

test("V1 refinement — AppShell switches the left rail via ShellSidebar (Build vs Locations)", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  assert.match(shell, /ShellSidebar/);
  assert.match(shell, /buildSidebarNavItems/);
  assert.match(shell, /buildNavItems/);
  // Builders are not hardcoded into the shell; they come from the BUILD nav projection.
  assert.doesNotMatch(shell, /href="\/admin\/facility\/builder"/);
});

test("V1 refinement — BuildPageHeader is title chrome only (shell owns Build / area trail)", () => {
  const header = readFileSync(join(process.cwd(), "src/components/build/build-breadcrumb.tsx"), "utf8");
  assert.match(header, /export function BuildPageHeader/);
  assert.doesNotMatch(header, /BuildBreadcrumb|build-breadcrumb|BackToBuildHomeLink/);
});
