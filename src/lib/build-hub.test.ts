import assert from "node:assert/strict";
import test from "node:test";

import { BUILD_HUB_DESCRIPTIONS, buildHubCards } from "@/lib/build-hub";
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
