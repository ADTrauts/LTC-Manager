import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { menuItemSlotWhere, normalizeMenuName, resolveMenuListDepartmentScope } from "@/lib/menu-authority";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

test("menu list scope uses the active department unless all-department nav is on", () => {
  assert.equal(
    resolveMenuListDepartmentScope({
      showAllDepartmentNav: false,
      activeDepartmentId: "dept_dietary",
      requestedDepartmentId: "dept_other",
    }),
    "dept_dietary",
  );
  assert.equal(
    resolveMenuListDepartmentScope({
      showAllDepartmentNav: true,
      activeDepartmentId: "dept_dietary",
      requestedDepartmentId: "dept_other",
    }),
    "dept_other",
  );
  assert.equal(
    resolveMenuListDepartmentScope({
      showAllDepartmentNav: true,
      activeDepartmentId: "dept_dietary",
      requestedDepartmentId: "",
    }),
    null,
  );
});

test("normalizeMenuName trims and collapses spaces without inventing uniqueness", () => {
  assert.equal(normalizeMenuName("  Summer Menu  "), "Summer Menu");
  assert.equal(normalizeMenuName("Summer    Menu"), "Summer Menu");
});

test("menu item saves are keyed by menuId plus cycle slot", () => {
  assert.deepEqual(
    menuItemSlotWhere({
      menuId: "menu_a",
      weekNumber: 1,
      dayIndex: 0,
      mealPeriodKey: "BREAKFAST",
      category: "Entrees",
    }),
    {
      menuId: "menu_a",
      weekNumber: 1,
      dayIndex: 0,
      mealPeriodKey: "BREAKFAST",
      category: "Entrees",
    },
  );
});

test("menu writes require an authorized Menu id and never upsert by facility singleton", () => {
  const actions = source("src/app/(protected)/menus/actions.ts");
  assert.match(actions, /createMenuAction/);
  assert.match(actions, /updateMenuAction/);
  assert.match(actions, /saveMenuApplicabilityAction/);
  assert.match(actions, /requireAuthorizedMenu/);
  assert.match(actions, /menuItemSlotWhere/);
  assert.match(actions, /where: \{ menuId: menu\.id \}/);
  assert.doesNotMatch(actions, /prisma\.menuSettings/);
  assert.doesNotMatch(actions, /where: \{ facilityId: session\.facilityId \}/);
  assert.match(actions, /revalidatePath\("\/menus"\)/);
  assert.match(actions, /revalidatePath\("\/logs"\)/);
  assert.doesNotMatch(actions, /revalidatePath\("\/dashboard"\)/);
  assert.doesNotMatch(actions, /revalidatePath\("\/unit\/\[unitId\]"/);
});

test("builder forms submit menuId instead of a facility singleton", () => {
  const day = source("src/components/menus/menu-day-builder.tsx");
  const settings = source("src/components/menus/menu-overview-form.tsx");
  assert.match(day, /name="menuId"/);
  assert.match(settings, /name="menuId"/);
});
