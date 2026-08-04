import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMINISTRATION_MENU_HREFS,
  buildAdministrationMenuSections,
  isAdministrationMenuActive,
  isAdministrationMenuHref,
  partitionTopNavItems,
} from "@/lib/administration-nav";
import type { NavRouteItem } from "@/lib/nav-zones";

function item(href: string, label: string, zone: NavRouteItem["zone"] = "ADMINISTRATION"): NavRouteItem {
  return { href, label, zone };
}

const fullNav: NavRouteItem[] = [
  item("/dashboard", "Operations Center", "OPERATIONS_CENTER"),
  item("/today", "Today's Work", "TODAYS_WORK"),
  item("/units", "Locations", "LOCATIONS"),
  item("/employees", "Employees"),
  item("/logs", "Logs"),
  item("/menus", "Menus"),
  item("/assets", "Assets"),
  item("/repairs", "Repairs"),
  item("/reports", "Review", "REVIEW"),
  item("/admin", "Administration"),
];

test("partitionTopNavItems moves management routes into Administration only", () => {
  const { primaryItems, administrationItems } = partitionTopNavItems(fullNav);

  assert.deepEqual(
    primaryItems.map((i) => i.href),
    ["/dashboard", "/today", "/units", "/reports"],
  );
  assert.deepEqual(
    administrationItems.map((i) => i.href),
    [...ADMINISTRATION_MENU_HREFS],
  );
});

test("isAdministrationMenuHref covers former top-level management destinations", () => {
  for (const href of ADMINISTRATION_MENU_HREFS) {
    assert.equal(isAdministrationMenuHref(href), true);
  }
  assert.equal(isAdministrationMenuHref("/units"), false);
  assert.equal(isAdministrationMenuHref("/dashboard"), false);
  assert.equal(isAdministrationMenuHref("/reports"), false);
});

test("buildAdministrationMenuSections preserves IA groups and omits empty sections", () => {
  const managerItems = [
    item("/employees", "Employees"),
    item("/logs", "Logs"),
    item("/menus", "Menus"),
    item("/assets", "Assets"),
    item("/repairs", "Repairs"),
  ];
  const sections = buildAdministrationMenuSections(managerItems);

  assert.deepEqual(
    sections.map((s) => s.id),
    ["people", "operational_setup", "facilities"],
  );
  assert.deepEqual(
    sections.map((s) => s.items.map((i) => i.href)),
    [["/employees"], ["/logs", "/menus"], ["/assets", "/repairs"]],
  );
});

test("buildAdministrationMenuSections only includes routes present in filtered nav", () => {
  const staffItems = [item("/logs", "Logs"), item("/repairs", "Repairs")];
  const sections = buildAdministrationMenuSections(staffItems);

  assert.deepEqual(
    sections.flatMap((s) => s.items.map((i) => i.href)),
    ["/logs", "/repairs"],
  );
  assert.equal(
    sections.some((s) => s.items.some((i) => i.href === "/admin")),
    false,
  );
  assert.equal(
    sections.some((s) => s.items.some((i) => i.href === "/employees")),
    false,
  );
});

test("buildAdministrationMenuSections includes platform Administration for facility admins", () => {
  const faItems = [
    item("/employees", "Employees"),
    item("/logs", "Logs"),
    item("/admin", "Administration"),
  ];
  const sections = buildAdministrationMenuSections(faItems);
  const platform = sections.find((s) => s.id === "platform");
  assert.ok(platform);
  assert.deepEqual(
    platform.items.map((i) => i.href),
    ["/admin"],
  );
});

test("isAdministrationMenuActive highlights trigger for any child route", () => {
  const items = [item("/employees", "Employees"), item("/logs", "Logs")];
  assert.equal(isAdministrationMenuActive("/employees/import", items), true);
  assert.equal(isAdministrationMenuActive("/logs", items), true);
  assert.equal(isAdministrationMenuActive("/dashboard", items), false);
  assert.equal(isAdministrationMenuActive(null, items), false);
});

test("Locations stays primary and is not duplicated in Administration", () => {
  const { primaryItems, administrationItems } = partitionTopNavItems(fullNav);
  assert.ok(primaryItems.some((i) => i.href === "/units"));
  assert.equal(
    administrationItems.some((i) => i.href === "/units"),
    false,
  );
});
