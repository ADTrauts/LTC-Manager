import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILD_HUB_DESCRIPTIONS,
  BUILD_HUB_HOME_HREF,
  buildHubCards,
  buildPageIntro,
  buildSidebarNavItems,
} from "@/lib/build-hub";
import type { ModeNavItem } from "@/lib/product-mode";

const ITEMS: ModeNavItem[] = [
  { label: "Build Home", href: "/build" },
  { label: "Facility Builder", href: "/admin/facility/builder" },
  { label: "Department Builder", href: "/admin/departments" },
  { label: "Employee Builder", href: "/employees" },
  { label: "Asset Builder", href: "/assets/builder" },
  { label: "Operational Templates", href: "/staffing/templates" },
];

test("build-hub — drops the hub's own home link and keeps every other surface in order", () => {
  const cards = buildHubCards(ITEMS);
  assert.deepEqual(
    cards.map((card) => card.href),
    [
      "/admin/facility/builder",
      "/admin/departments",
      "/employees",
      "/assets/builder",
      "/staffing/templates",
    ],
  );
});

test("build-hub — Asset Builder is a navigation-driven card (not a hardcoded second authority)", () => {
  // Asset Builder appears only because the BUILD nav projection carried it in — remove it from the
  // (already role/department-filtered) items and no Asset Builder card is produced.
  const withAsset = buildHubCards(ITEMS);
  const asset = withAsset.find((card) => card.href === "/assets/builder");
  assert.equal(asset?.label, "Asset Builder");
  assert.equal(asset?.description, BUILD_HUB_DESCRIPTIONS["/assets/builder"]);

  const withoutAsset = buildHubCards(ITEMS.filter((item) => item.href !== "/assets/builder"));
  assert.equal(
    withoutAsset.some((card) => card.href === "/assets/builder"),
    false,
  );
});

test("build-hub — carries the product-facing label and description for known surfaces", () => {
  const cards = buildHubCards(ITEMS);
  const facility = cards.find((card) => card.href === "/admin/facility/builder");
  assert.equal(facility?.label, "Facility Builder");
  assert.equal(facility?.description, BUILD_HUB_DESCRIPTIONS["/admin/facility/builder"]);
});

test("build-hub — unknown surfaces fall back to a generic description rather than blank", () => {
  const cards = buildHubCards([{ label: "Something New", href: "/build/experimental" }]);
  assert.equal(cards.length, 1);
  assert.ok((cards[0]?.description.length ?? 0) > 0);
});

test("build-hub — an empty BUILD group yields no cards (frontline Run-only)", () => {
  assert.deepEqual(buildHubCards([]), []);
});

test("build sidebar — keeps Build Home first and mirrors hub builders in registry order", () => {
  const nav = buildSidebarNavItems(ITEMS);
  assert.equal(nav[0]?.href, BUILD_HUB_HOME_HREF);
  assert.deepEqual(
    nav.map((item) => item.href),
    [
      "/build",
      "/admin/facility/builder",
      "/admin/departments",
      "/employees",
      "/assets/builder",
      "/staffing/templates",
    ],
  );
  // Sidebar membership is the hub set plus home — not a second catalog.
  assert.deepEqual(
    nav.slice(1).map((item) => item.href),
    buildHubCards(ITEMS).map((card) => card.href),
  );
});

test("build sidebar — omits Build Home when the filtered group has no hub link", () => {
  const withoutHome = buildSidebarNavItems(ITEMS.filter((item) => item.href !== BUILD_HUB_HOME_HREF));
  assert.equal(withoutHome.some((item) => item.href === BUILD_HUB_HOME_HREF), false);
  assert.equal(withoutHome[0]?.href, "/admin/facility/builder");
});

test("build-hub — Logs card is install then place, not an Admin door", () => {
  const cards = buildHubCards([
    ...ITEMS,
    { label: "Logs", href: "/build/logs" },
  ]);
  const logs = cards.find((card) => card.href === "/build/logs");
  assert.ok(logs);
  assert.match(logs.description, /Install published logs/);
  assert.match(logs.description, /place them/);
  assert.doesNotMatch(logs.description, /Attach Logs from/);
});

test("build page intros — stay concise for permanent page chrome", () => {
  const intro = buildPageIntro("/assets/builder");
  assert.ok(intro.length > 0);
  assert.ok(intro.length < 120, `intro too long for permanent chrome: ${intro}`);
  assert.match(intro, /equipment/i);
});
