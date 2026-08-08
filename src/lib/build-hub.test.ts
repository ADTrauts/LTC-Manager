import assert from "node:assert/strict";
import test from "node:test";

import { BUILD_HUB_DESCRIPTIONS, buildHubCards } from "@/lib/build-hub";
import type { ModeNavItem } from "@/lib/product-mode";

const ITEMS: ModeNavItem[] = [
  { label: "Build Home", href: "/build" },
  { label: "Facility Builder", href: "/admin/facility/builder" },
  { label: "Department Builder", href: "/admin/departments" },
  { label: "Employee Builder", href: "/employees" },
  { label: "Operational Templates", href: "/staffing/templates" },
];

test("build-hub — drops the hub's own home link and keeps every other surface in order", () => {
  const cards = buildHubCards(ITEMS);
  assert.deepEqual(
    cards.map((card) => card.href),
    ["/admin/facility/builder", "/admin/departments", "/employees", "/staffing/templates"],
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
