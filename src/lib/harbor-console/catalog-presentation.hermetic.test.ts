import assert from "node:assert/strict";
import test from "node:test";

import { slugCatalogToken } from "@/lib/canonical-logs/catalog-service";
import { catalogLineStatusLabel, catalogStatusLabel } from "@/lib/harbor-console/catalog-presentation";

test("catalog slugs are stable keys, not display names", () => {
  assert.equal(slugCatalogToken("Cooler Temperature Log"), "cooler_temperature_log");
  assert.equal(slugCatalogToken("  Freezer #2  "), "freezer_2");
  assert.equal(slugCatalogToken(""), "untitled");
});

test("catalog line status prefers published plus an open draft", () => {
  assert.equal(
    catalogLineStatusLabel([
      { version: 2, status: "DRAFT" },
      { version: 1, status: "PUBLISHED" },
    ]),
    "Published v1 · Draft v2",
  );
  assert.equal(catalogLineStatusLabel([{ version: 1, status: "PUBLISHED" }]), "Published v1");
  assert.equal(catalogLineStatusLabel([{ version: 3, status: "DRAFT" }]), "Draft v3");
  assert.equal(catalogLineStatusLabel([{ version: 1, status: "RETIRED" }]), "Retired v1");
});

test("catalog status labels stay short", () => {
  assert.equal(catalogStatusLabel("PUBLISHED"), "Published");
  assert.equal(catalogStatusLabel("DRAFT"), "Draft");
});
