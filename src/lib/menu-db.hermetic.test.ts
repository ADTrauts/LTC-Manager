import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { listMenus, loadMenu } from "@/lib/menu-db";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function cycleSettings(overrides: Record<string, unknown> = {}) {
  return {
    cycleLengthWeeks: 4,
    weekStartsOn: "SUNDAY",
    cycleAnchorDate: new Date("2026-01-04"),
    periodConfigJson: null,
    ...overrides,
  };
}

function item(menuId: string, name: string) {
  return {
    weekNumber: 1,
    dayIndex: 0,
    mealPeriodKey: "BREAKFAST",
    category: "Entrees",
    itemName: name,
    portionValue: null,
    portionUnit: null,
    entryType: "FIXED",
    displayOrder: 1,
    menuId,
  };
}

function mockPrisma(input: {
  menus?: Array<Record<string, unknown>>;
  settings?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
}) {
  const menus = input.menus ?? [];
  const settings = input.settings ?? [];
  const items = input.items ?? [];
  return {
    menu: {
      findMany: async ({ where }: { where: { facilityId: string; status?: string; departmentId?: string } }) =>
        menus.filter((row) => {
          if (row.facilityId !== where.facilityId) return false;
          if (where.status && row.status !== where.status) return false;
          if (where.departmentId && row.departmentId !== where.departmentId) return false;
          return true;
        }),
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) =>
        menus.find((row) => row.id === where.id && row.facilityId === where.facilityId) ?? null,
      count: async ({ where }: { where: { facilityId: string } }) =>
        menus.filter((row) => row.facilityId === where.facilityId).length,
    },
    menuCycleSettings: {
      findFirst: async ({ where }: { where: { menuId?: string | null; facilityId?: string } }) =>
        settings.find((row) => {
          if (where.menuId !== undefined && row.menuId !== where.menuId) return false;
          if (where.facilityId && row.facilityId !== where.facilityId) return false;
          return true;
        }) ?? null,
    },
    menuItem: {
      findMany: async ({ where }: { where: { menuId?: string | null; facilityId?: string } }) =>
        items.filter((row) => {
          if (where.menuId !== undefined && row.menuId !== where.menuId) return false;
          if (where.facilityId && row.facilityId !== where.facilityId) return false;
          return true;
        }),
    },
  };
}

test("listMenus stays inside the requested facility and optional department", async () => {
  const prisma = mockPrisma({
    menus: [
      {
        id: "menu_a",
        facilityId: "fac_1",
        departmentId: "dept_1",
        name: "Cafe",
        status: "ACTIVE",
        updatedAt: new Date("2026-01-02"),
        department: { id: "dept_1", name: "Food & Nutrition" },
        cycleSettings: { cycleLengthWeeks: 3 },
      },
      {
        id: "menu_other_fac",
        facilityId: "fac_2",
        departmentId: "dept_9",
        name: "Other facility",
        status: "ACTIVE",
        updatedAt: new Date("2026-01-02"),
        department: { id: "dept_9", name: "Other" },
        cycleSettings: { cycleLengthWeeks: 4 },
      },
      {
        id: "menu_other_dept",
        facilityId: "fac_1",
        departmentId: "dept_2",
        name: "Picnic",
        status: "INACTIVE",
        updatedAt: new Date("2026-01-03"),
        department: { id: "dept_2", name: "Catering" },
        cycleSettings: null,
      },
    ],
  });

  const all = await listMenus(prisma as never, { facilityId: "fac_1" });
  assert.deepEqual(
    all.menus.map((row) => row.id),
    ["menu_a", "menu_other_dept"],
  );
  const scoped = await listMenus(prisma as never, { facilityId: "fac_1", departmentId: "dept_1" });
  assert.deepEqual(
    scoped.menus.map((row) => row.id),
    ["menu_a"],
  );
});

test("loadMenu returns only that menu's items and rejects another facility id", async () => {
  const prisma = mockPrisma({
    menus: [
      {
        id: "menu_a",
        facilityId: "fac_1",
        departmentId: "dept_1",
        name: "Cafe",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        department: { id: "dept_1", name: "Food & Nutrition", key: "DIETARY" },
      },
    ],
    settings: [cycleSettings({ menuId: "menu_a" })],
    items: [item("menu_a", "Soup"), item("menu_b", "Should not appear")],
  });

  const loaded = await loadMenu(prisma as never, { menuId: "menu_a", facilityId: "fac_1" });
  assert.equal(loaded.menu?.id, "menu_a");
  assert.deepEqual(
    loaded.menuItems.map((row) => row.itemName),
    ["Soup"],
  );

  const denied = await loadMenu(prisma as never, { menuId: "menu_a", facilityId: "fac_2" });
  assert.equal(denied.menu, null);
  assert.equal(denied.menuItems.length, 0);
});

test("builder pages use listMenus/loadMenu", () => {
  const list = source("src/app/(protected)/menus/page.tsx");
  const detail = source("src/app/(protected)/menus/[menuId]/page.tsx");
  const logs = source("src/app/(protected)/logs/page.tsx");
  assert.match(list, /listMenus/);
  assert.doesNotMatch(list, /loadFacilityMenuData/);
  assert.match(detail, /loadMenu/);
  assert.doesNotMatch(detail, /loadFacilityMenuData/);
  assert.doesNotMatch(logs, /loadFacilityMenuData/);
  assert.doesNotMatch(source("src/lib/menu-db.ts"), /loadFacilityMenuData/);
});
