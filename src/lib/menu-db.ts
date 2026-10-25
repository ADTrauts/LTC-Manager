import { Prisma } from "@prisma/client";
import {
  facilityWorkforcePeriodWhere,
  operationPeriodWhere,
  withOperatorPeriod,
} from "@/lib/department-authority/operator-period";
import type { MenuCycleSettings, MenuItem, MenuStatus, PrismaClient } from "@prisma/client";

export type MenuItemCycleRow = Pick<
  MenuItem,
  | "weekNumber"
  | "dayIndex"
  | "mealPeriodKey"
  | "category"
  | "itemName"
  | "portionValue"
  | "portionUnit"
  | "entryType"
  | "displayOrder"
>;

export type MenuCycleSettingsRow = Pick<
  MenuCycleSettings,
  "cycleLengthWeeks" | "weekStartsOn" | "cycleAnchorDate" | "periodConfigJson"
>;

export type MenuListItem = {
  id: string;
  name: string;
  status: MenuStatus;
  updatedAt: Date;
  department: { id: string; name: string };
  cycleLengthWeeks: number | null;
};

export type LoadedMenuRecord = {
  id: string;
  facilityId: string;
  departmentId: string;
  name: string;
  status: MenuStatus;
  createdAt: Date;
  updatedAt: Date;
  department: { id: string; name: string; key: string };
};

export type LoadedMenu = {
  menu: LoadedMenuRecord | null;
  settingsRaw: MenuCycleSettingsRow | null;
  menuItems: MenuItemCycleRow[];
  unavailableReason: string | null;
};

const MENU_ITEM_SELECT = {
  weekNumber: true,
  dayIndex: true,
  mealPeriodKey: true,
  category: true,
  itemName: true,
  portionValue: true,
  portionUnit: true,
  entryType: true,
  displayOrder: true,
} satisfies Prisma.MenuItemSelect;

const CYCLE_SETTINGS_SELECT = {
  cycleLengthWeeks: true,
  weekStartsOn: true,
  cycleAnchorDate: true,
  periodConfigJson: true,
} satisfies Prisma.MenuCycleSettingsSelect;

function prismaMenuDelegatesAvailable(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, unknown | undefined>;
  const menu = c.menu;
  const settings = c.menuCycleSettings;
  const items = c.menuItem;
  return (
    menu != null &&
    typeof menu === "object" &&
    typeof (menu as { findMany?: unknown }).findMany === "function" &&
    settings != null &&
    typeof settings === "object" &&
    typeof (settings as { findFirst?: unknown }).findFirst === "function" &&
    items != null &&
    typeof items === "object" &&
    typeof (items as { findMany?: unknown }).findMany === "function"
  );
}

export function isMenuInfrastructureUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021") return true;
  }
  return false;
}

export function assertPrismaMenuReady(prisma: PrismaClient): void {
  if (!prismaMenuDelegatesAvailable(prisma)) {
    throw new Error(
      "Menu feature is offline: the running app does not have menu models on the Prisma client. Run `npx prisma generate` and restart the Next.js dev server.",
    );
  }
}

export async function listMenus(
  prisma: PrismaClient,
  input: { facilityId: string; departmentId?: string | null },
): Promise<{ menus: MenuListItem[]; unavailableReason: string | null }> {
  if (!prismaMenuDelegatesAvailable(prisma)) {
    return {
      menus: [],
      unavailableReason:
        "Menu data is unavailable: Prisma client is missing menu models. Run `npx prisma generate` and restart the dev server.",
    };
  }

  try {
    const period = input.departmentId
      ? await operationPeriodWhere(prisma, { facilityId: input.facilityId, departmentId: input.departmentId })
      : await facilityWorkforcePeriodWhere(prisma, input.facilityId);
    const rows = await prisma.menu.findMany({
      where: withOperatorPeriod(
        {
          facilityId: input.facilityId,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        },
        period,
      ),
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        department: { select: { id: true, name: true } },
        cycleSettings: { select: { cycleLengthWeeks: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    return {
      menus: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        department: row.department,
        cycleLengthWeeks: row.cycleSettings?.cycleLengthWeeks ?? null,
      })),
      unavailableReason: null,
    };
  } catch (error) {
    if (isMenuInfrastructureUnavailableError(error)) {
      return {
        menus: [],
        unavailableReason:
          "Menu tables are not in this database yet. Apply pending migrations to enable menus (this does not require resetting your database).",
      };
    }
    throw error;
  }
}

export async function loadMenu(
  prisma: PrismaClient,
  input: {
    menuId: string;
    facilityId: string;
    menuItemsOrderBy?: Prisma.MenuItemOrderByWithRelationInput[];
  },
): Promise<LoadedMenu> {
  if (!prismaMenuDelegatesAvailable(prisma)) {
    return {
      menu: null,
      settingsRaw: null,
      menuItems: [],
      unavailableReason:
        "Menu data is unavailable: Prisma client is missing menu models. Run `npx prisma generate` and restart the dev server.",
    };
  }

  try {
    const menu = await prisma.menu.findFirst({
      where: { id: input.menuId, facilityId: input.facilityId },
      select: {
        id: true,
        facilityId: true,
        departmentId: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true, key: true } },
      },
    });
    if (!menu) {
      return { menu: null, settingsRaw: null, menuItems: [], unavailableReason: null };
    }

    const [settingsRaw, menuItems] = await Promise.all([
      prisma.menuCycleSettings.findFirst({
        where: { menuId: menu.id },
        select: CYCLE_SETTINGS_SELECT,
      }),
      prisma.menuItem.findMany({
        where: { menuId: menu.id },
        select: MENU_ITEM_SELECT,
        ...(input.menuItemsOrderBy ? { orderBy: input.menuItemsOrderBy } : {}),
      }),
    ]);

    return { menu, settingsRaw, menuItems, unavailableReason: null };
  } catch (error) {
    if (isMenuInfrastructureUnavailableError(error)) {
      return {
        menu: null,
        settingsRaw: null,
        menuItems: [],
        unavailableReason:
          "Menu tables are not in this database yet. Apply pending migrations to enable menus (this does not require resetting your database).",
      };
    }
    throw error;
  }
}
