import assert from "node:assert/strict";
import test from "node:test";

import {
  AppIcons,
  resolveLocationIcon,
  resolveLocationIconKey,
  resolveNavIcon,
  resolveNavIconKey,
} from "@/lib/design-system/icons";

test("resolveNavIconKey maps primary shell routes", () => {
  assert.equal(resolveNavIconKey("/dashboard"), "operationsCenter");
  assert.equal(resolveNavIconKey("/today"), "todaysWork");
  assert.equal(resolveNavIconKey("/reports"), "review");
  assert.equal(resolveNavIconKey("/admin"), "administration");
  assert.equal(resolveNavIconKey("/units"), "locations");
  assert.equal(resolveNavIconKey("/employees"), "employees");
  assert.equal(resolveNavIconKey("/logs"), "logs");
  assert.equal(resolveNavIconKey("/menus"), "menus");
  assert.equal(resolveNavIconKey("/assets"), "assets");
  assert.equal(resolveNavIconKey("/repairs"), "repairs");
  assert.equal(resolveNavIconKey("/issues"), "repairs");
  assert.equal(resolveNavIconKey("/issues/abc"), "repairs");
});

test("resolveNavIcon returns AppIcons component for known routes", () => {
  assert.equal(resolveNavIcon("/dashboard"), AppIcons.operationsCenter);
  assert.equal(resolveNavIcon("/employees/import"), AppIcons.employees);
  assert.equal(resolveNavIcon("/unknown"), undefined);
});

test("resolveLocationIcon maps unit types and laundry name hint", () => {
  assert.equal(
    resolveLocationIcon({ unitType: "KITCHEN", name: "Main Kitchen" }),
    AppIcons.locationKitchen,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "SERVERY", name: "4A Servery" }),
    AppIcons.locationServery,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "RETAIL", name: "Cafe" }),
    AppIcons.locationRetail,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "OFFICE", name: "Admin Office" }),
    AppIcons.locationOffice,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "STORAGE", name: "Dry Storage" }),
    AppIcons.locationStorage,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "OTHER", name: "Central Laundry" }),
    AppIcons.locationLaundry,
  );
  assert.equal(
    resolveLocationIcon({ unitType: "OTHER", name: "Misc" }),
    AppIcons.locationDefault,
  );
});

test("resolveLocationIconKey mirrors resolveLocationIcon keys", () => {
  assert.equal(resolveLocationIconKey({ unitType: "KITCHEN", name: "Main Kitchen" }), "locationKitchen");
  assert.equal(resolveLocationIconKey({ unitType: "SERVERY", name: "4A Servery" }), "locationServery");
  assert.equal(resolveLocationIconKey({ unitType: "OTHER", name: "Central Laundry" }), "locationLaundry");
  assert.equal(resolveLocationIconKey({ unitType: "OTHER", name: "Misc" }), "locationDefault");
});
